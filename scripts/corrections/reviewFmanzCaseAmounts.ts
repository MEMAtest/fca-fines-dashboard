import fs from "node:fs";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import {
  completeFmanzRepairTransaction,
  FmanzRehearsalRollback,
  requireFmanzRepairDbPins,
} from "./fmanzUnsupportedAmountHelpers.js";
import {
  assertFmanzReviewProjectionPreserved,
  assertSameFmanzSnapshot,
  fmanzCaseAmountReviewReason,
  sha256StableJson,
  validateFmanzCaseAmountReviewContract,
  verifyFmanzCaseReviewPublicIds,
  verifyFmanzCaseReviewRows,
  verifyFmanzCaseReviewPublicRows,
  verifyFmanzCaseReviewSourceRows,
  verifyFmanzRawCorpus,
  type FmanzCaseAmountReviewContract,
  type FmanzCaseReviewStoredSource,
} from "./fmanzCaseAmountReviewHelpers.js";

export const FMANZ_CASE_AMOUNT_REVIEW_TARGET = "reviewed-fmanz-case-amounts-v1";
const manifestUrl = new URL("../scraper/data/fmanzCaseAmountReviews20261021.json", import.meta.url);
export const FMANZ_CASE_AMOUNT_REVIEW = JSON.parse(
  fs.readFileSync(fileURLToPath(manifestUrl), "utf8"),
) as FmanzCaseAmountReviewContract;

function requiredTargetPins(env: NodeJS.ProcessEnv = process.env) {
  if (!env.REGACTIONS_EXPECTED_DB_HOST?.trim() || !env.REGACTIONS_EXPECTED_DB_NAME?.trim()) {
    throw new Error("FMANZ case-amount review requires both non-empty REGACTIONS_EXPECTED_DB_HOST and REGACTIONS_EXPECTED_DB_NAME pins.");
  }
}

function verifyPinnedInputArtifacts() {
  for (const input of FMANZ_CASE_AMOUNT_REVIEW.inputs) {
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(input.path);
    } catch {
      throw new Error(`Pinned FMANZ ${input.role} artifact is unavailable; refusing to continue.`);
    }
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== input.sha256) {
      throw new Error(`Pinned FMANZ ${input.role} artifact hash changed; refusing to continue.`);
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rehearse = process.argv.includes("--rehearse");
  const dryRun = process.argv.includes("--dry-run");
  const unknown = process.argv.slice(2).filter((arg) => !["--apply", "--rehearse", "--dry-run"].includes(arg));
  const writeMode = apply || rehearse;
  if (unknown.length || [apply, rehearse, dryRun].filter(Boolean).length > 1) {
    throw new Error("Usage: reviewFmanzCaseAmounts.ts [--dry-run | --apply | --rehearse]");
  }
  if (writeMode && process.env.FMANZ_CASE_AMOUNT_REVIEW_APPROVED !== "true") {
    throw new Error("Refusing write mode without FMANZ_CASE_AMOUNT_REVIEW_APPROVED=true after independent review.");
  }
  if (writeMode && process.env.FMANZ_CASE_AMOUNT_REVIEW_TARGET !== FMANZ_CASE_AMOUNT_REVIEW_TARGET) {
    throw new Error(`Refusing write mode without exact target ${FMANZ_CASE_AMOUNT_REVIEW_TARGET}.`);
  }
  validateFmanzCaseAmountReviewContract(FMANZ_CASE_AMOUNT_REVIEW);
  verifyPinnedInputArtifacts();
  requiredTargetPins();
  requireFmanzRepairDbPins();
  requireExpectedDbTarget("fmanz-case-amount-review");
  const connection = resolveConnectionString();
  if (!connection) throw new Error("Database connection required for FMANZ case-amount review preflight.");
  const sql = postgres(connection, {
    max: 1,
    ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      if (!writeMode) await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL lock_timeout='30s'");
      await tx.unsafe("SET LOCAL statement_timeout='180s'");
      if (writeMode) {
        await tx.unsafe("SELECT pg_advisory_xact_lock(72140331)");
        await tx.unsafe("LOCK TABLE public.regulatory_case_amount_reviews IN SHARE ROW EXCLUSIVE MODE");
        await tx.unsafe("LOCK TABLE public.eu_fines IN SHARE MODE");
        await tx.unsafe("LOCK TABLE public.regulatory_amount_overrides IN SHARE MODE");
      }

      const rawRows = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT id::text AS id, content_hash, firm_individual, date_issued::text AS date_issued,
                source_url, final_notice_url, amount::text AS amount, amount_gbp::text AS amount_gbp,
                currency,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
                raw_payload
           FROM public.eu_fines WHERE regulator = 'FMANZ' ORDER BY id`,
      );
      const rawDigest = verifyFmanzRawCorpus(rawRows, FMANZ_CASE_AMOUNT_REVIEW);
      const targetIds = FMANZ_CASE_AMOUNT_REVIEW.heldRows.map((row) => row.rawId);
      const targetSourceRows = await tx.unsafe<FmanzCaseReviewStoredSource[]>(
        `SELECT id::text, content_hash, regulator, firm_individual,
                to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
                source_url, final_notice_url, amount::text AS amount, currency
           FROM public.eu_fines WHERE id = ANY($1::uuid[])
           ${writeMode ? "FOR UPDATE" : ""}`,
        [targetIds],
      );
      verifyFmanzCaseReviewSourceRows(targetSourceRows, FMANZ_CASE_AMOUNT_REVIEW);

      const publicIdsBefore = await tx.unsafe<Array<{ public_case_id: string }>>(
        `SELECT public_case_id FROM public.all_regulatory_fines_trusted
          WHERE upper(regulator) = 'FMANZ' ORDER BY public_case_id`,
      );
      verifyFmanzCaseReviewPublicIds(publicIdsBefore, FMANZ_CASE_AMOUNT_REVIEW);
      const targetPublicIds = FMANZ_CASE_AMOUNT_REVIEW.heldRows.map((row) => row.publicCaseId);
      const allPublicProjectionBefore = await tx.unsafe<Array<{
        regulator: string; source_row_id: string; public_case_id: string; row: Record<string, unknown>;
      }>>(
        `SELECT regulator, id::text AS source_row_id, public_case_id,
                CASE WHEN upper(regulator) = 'FMANZ' AND public_case_id = ANY($1::text[])
                  THEN to_jsonb(fines)
                  ELSE jsonb_build_object('fullRowSha256', encode(sha256(convert_to(to_jsonb(fines)::text, 'UTF8')), 'hex'))
                END AS row
           FROM public.all_regulatory_fines_trusted AS fines
          ORDER BY regulator, public_case_id, id`,
        [targetPublicIds],
      );
      if (allPublicProjectionBefore.length !== FMANZ_CASE_AMOUNT_REVIEW.candidate.beforeGlobalPublicRows) {
        throw new Error(`All-regulator trusted public row count differs from the pinned baseline: ${allPublicProjectionBefore.length}.`);
      }
      const reviewRowsBefore = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT to_jsonb(review) AS row FROM public.regulatory_case_amount_reviews AS review ORDER BY source_row_id`,
      );
      const targetReviewsBefore = await tx.unsafe<Array<{
        source_row_id: string; review_status: string; reason: string; evidence_url: string;
      }>>(
        `SELECT source_row_id, review_status, reason, evidence_url
           FROM public.regulatory_case_amount_reviews WHERE source_row_id = ANY($1::text[])
          ORDER BY source_row_id`,
        [targetIds],
      );
      const reviewState = verifyFmanzCaseReviewRows(targetReviewsBefore, FMANZ_CASE_AMOUNT_REVIEW);
      const beforeTargetRows = allPublicProjectionBefore
        .filter((row) => row.regulator.toUpperCase() === "FMANZ" && targetPublicIds.includes(row.public_case_id))
        .map((row) => row.row);
      if (beforeTargetRows.length !== FMANZ_CASE_AMOUNT_REVIEW.expectedExistingPublicIds.length) {
        throw new Error(`Expected exactly ${FMANZ_CASE_AMOUNT_REVIEW.expectedExistingPublicIds.length} currently public held rows; found ${beforeTargetRows.length}.`);
      }
      verifyFmanzCaseReviewPublicRows(beforeTargetRows, FMANZ_CASE_AMOUNT_REVIEW, reviewState === "already-exact");

      const overrideRowsBefore = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT to_jsonb(override) AS row FROM public.regulatory_amount_overrides AS override ORDER BY regulator, evidence_url`,
      );
      const targetOverrideUrls = [...new Set(FMANZ_CASE_AMOUNT_REVIEW.heldRows.map((target) =>
        target.noticeUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase(),
      ))];
      const targetOverrideRowsBefore = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT regulator, evidence_url, amount_original::text AS amount_original, currency,
                amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur,
                verification_url, reason, quality_status,
                to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
           FROM public.regulatory_amount_overrides
          WHERE regulator = 'FMANZ' AND evidence_url = ANY($1::text[])
          ORDER BY evidence_url`,
        [targetOverrideUrls],
      );
      if (
        targetOverrideRowsBefore.length !== FMANZ_CASE_AMOUNT_REVIEW.targetOverrideSnapshot.heldRowEvidenceUrlOverrideCount
        || sha256StableJson(targetOverrideRowsBefore) !== FMANZ_CASE_AMOUNT_REVIEW.targetOverrideSnapshot.heldRowEvidenceUrlOverridesSha256
      ) {
        throw new Error("FMANZ held-row amount overrides differ from the exact reviewed preflight snapshot; refusing review flags.");
      }
      const fmanzOverrideCount = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.regulatory_amount_overrides WHERE regulator = 'FMANZ'`,
      );
      if (fmanzOverrideCount[0]?.count !== FMANZ_CASE_AMOUNT_REVIEW.baseline.fmanzOverrideRows) {
        throw new Error("FMANZ amount override count differs from the reviewed 134-row baseline.");
      }

      const summary: Record<string, unknown> = {
        mode: reviewState === "already-exact" ? "already-exact-noop" : rehearse ? "rehearse" : apply ? "apply" : "dry-run",
        target: FMANZ_CASE_AMOUNT_REVIEW_TARGET,
        pinnedEvidence: {
          contract: FMANZ_CASE_AMOUNT_REVIEW.contract,
          baseline: FMANZ_CASE_AMOUNT_REVIEW.baseline,
          candidate: FMANZ_CASE_AMOUNT_REVIEW.candidate,
          sourcePreview: FMANZ_CASE_AMOUNT_REVIEW.sourcePreview,
        },
        before: {
          fmanzRawRows: rawRows.length,
          rawRowsSha256: rawDigest,
          fmanzPublicIds: publicIdsBefore.length,
          globalTrustedProjectionRows: allPublicProjectionBefore.length,
          globalTrustedProjectionSha256: sha256StableJson(allPublicProjectionBefore),
          fmanzOverrideRows: fmanzOverrideCount[0]?.count ?? null,
          globalOverrideRows: overrideRowsBefore.length,
          globalOverridesSha256: sha256StableJson(overrideRowsBefore),
          heldRowOverrides: targetOverrideRowsBefore.length,
          heldRowOverridesSha256: sha256StableJson(targetOverrideRowsBefore),
          existingTargetReviewRows: targetReviewsBefore.length,
          existingTargetPublicRows: beforeTargetRows.length,
        },
        heldRows: FMANZ_CASE_AMOUNT_REVIEW.heldRows.map((target) => ({
          rawId: target.rawId,
          contentHash: target.contentHash,
          publicCaseId: target.publicCaseId,
          firm: target.firm,
          date: target.date,
          rawAmount: target.rawAmount,
          candidateAmount: target.candidateAmount,
          currency: target.currency,
          evidenceUrl: target.evidenceUrl,
          factualReason: target.reason,
          reviewReason: fmanzCaseAmountReviewReason(target),
        })),
      };

      if (!writeMode) return completeFmanzRepairTransaction("dry-run", summary);
      if (reviewState === "already-exact" && !rehearse) return summary;

      for (const target of reviewState === "empty" ? FMANZ_CASE_AMOUNT_REVIEW.heldRows : []) {
        const inserted = await tx.unsafe(
          `INSERT INTO public.regulatory_case_amount_reviews
             (source_row_id, review_status, reason, evidence_url)
           SELECT e.id::text, 'required', $3, $4
             FROM public.eu_fines AS e
            WHERE e.id = $1::uuid AND e.content_hash = $2 AND upper(e.regulator) = 'FMANZ'
           ON CONFLICT (source_row_id) DO UPDATE SET
             reason = EXCLUDED.reason,
             evidence_url = EXCLUDED.evidence_url,
             updated_at = now()
           WHERE public.regulatory_case_amount_reviews.review_status = 'required'
           RETURNING source_row_id`,
          [target.rawId, target.contentHash, fmanzCaseAmountReviewReason(target), target.evidenceUrl],
        );
        if (inserted.length !== 1) throw new Error(`Exact review-row write did not affect one source row: ${target.rawId}.`);
      }

      await tx.unsafe("SELECT public.refresh_all_fines()");
      const publicIdsAfter = await tx.unsafe<Array<{ public_case_id: string }>>(
        `SELECT public_case_id FROM public.all_regulatory_fines_trusted
          WHERE upper(regulator) = 'FMANZ' ORDER BY public_case_id`,
      );
      assertSameFmanzSnapshot("FMANZ public IDs", publicIdsBefore, publicIdsAfter);
      verifyFmanzCaseReviewPublicIds(publicIdsAfter, FMANZ_CASE_AMOUNT_REVIEW);

      const allPublicProjectionAfter = await tx.unsafe<Array<{
        regulator: string; source_row_id: string; public_case_id: string; row: Record<string, unknown>;
      }>>(
        `SELECT regulator, id::text AS source_row_id, public_case_id,
                CASE WHEN upper(regulator) = 'FMANZ' AND public_case_id = ANY($1::text[])
                  THEN to_jsonb(fines)
                  ELSE jsonb_build_object('fullRowSha256', encode(sha256(convert_to(to_jsonb(fines)::text, 'UTF8')), 'hex'))
                END AS row
           FROM public.all_regulatory_fines_trusted AS fines
          ORDER BY regulator, public_case_id, id`,
        [targetPublicIds],
      );
      assertFmanzReviewProjectionPreserved(allPublicProjectionBefore, allPublicProjectionAfter, FMANZ_CASE_AMOUNT_REVIEW);

      const reviewRowsAfter = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT to_jsonb(review) AS row FROM public.regulatory_case_amount_reviews AS review ORDER BY source_row_id`,
      );
      const targetReviewsAfter = await tx.unsafe<Array<{
        source_row_id: string; review_status: string; reason: string; evidence_url: string;
      }>>(
        `SELECT source_row_id, review_status, reason, evidence_url
           FROM public.regulatory_case_amount_reviews WHERE source_row_id = ANY($1::text[])
          ORDER BY source_row_id`,
        [targetIds],
      );
      if (verifyFmanzCaseReviewRows(targetReviewsAfter, FMANZ_CASE_AMOUNT_REVIEW) !== "already-exact") {
        throw new Error("FMANZ review rows failed their required-status postcondition.");
      }
      assertSameFmanzSnapshot(
        "Non-target amount-review rows",
        reviewRowsBefore.filter((item) => !targetIds.includes(String((item.row as Record<string, unknown>).source_row_id))),
        reviewRowsAfter.filter((item) => !targetIds.includes(String((item.row as Record<string, unknown>).source_row_id))),
      );

      const rawRowsAfter = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT id::text AS id, content_hash, firm_individual, date_issued::text AS date_issued,
                source_url, final_notice_url, amount::text AS amount, amount_gbp::text AS amount_gbp,
                currency,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
                raw_payload
           FROM public.eu_fines WHERE regulator = 'FMANZ' ORDER BY id`,
      );
      const rawDigestAfter = verifyFmanzRawCorpus(rawRowsAfter, FMANZ_CASE_AMOUNT_REVIEW);
      assertSameFmanzSnapshot("All 408 FMANZ raw rows", rawDigest, rawDigestAfter);

      const overrideRowsAfter = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT to_jsonb(override) AS row FROM public.regulatory_amount_overrides AS override ORDER BY regulator, evidence_url`,
      );
      assertSameFmanzSnapshot("All-regulator amount overrides", overrideRowsBefore, overrideRowsAfter);
      const targetOverrideRowsAfter = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT regulator, evidence_url, amount_original::text AS amount_original, currency,
                amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur,
                verification_url, reason, quality_status,
                to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
           FROM public.regulatory_amount_overrides
          WHERE regulator = 'FMANZ' AND evidence_url = ANY($1::text[])
          ORDER BY evidence_url`,
        [targetOverrideUrls],
      );
      assertSameFmanzSnapshot("FMANZ held-row amount overrides", targetOverrideRowsBefore, targetOverrideRowsAfter);
      const fmanzOverrideCountAfter = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.regulatory_amount_overrides WHERE regulator = 'FMANZ'`,
      );
      assertSameFmanzSnapshot("FMANZ amount override row count", fmanzOverrideCount[0]?.count, fmanzOverrideCountAfter[0]?.count);

      summary.postchecks = {
        passed: true,
        reviewRows: { beforeCount: targetReviewsBefore.length, afterCount: targetReviewsAfter.length, expected: 10 },
        rawRows: { beforeCount: rawRows.length, afterCount: rawRowsAfter.length, beforeSha256: rawDigest, afterSha256: rawDigestAfter },
        keyedNonTargetProjection: {
          status: "passed",
          rows: allPublicProjectionBefore.filter((row) => !(row.regulator.toUpperCase() === "FMANZ" && targetPublicIds.includes(row.public_case_id))).length,
          beforeSha256: sha256StableJson(allPublicProjectionBefore.filter((row) => !(row.regulator.toUpperCase() === "FMANZ" && targetPublicIds.includes(row.public_case_id)))),
          afterSha256: sha256StableJson(allPublicProjectionAfter.filter((row) => !(row.regulator.toUpperCase() === "FMANZ" && targetPublicIds.includes(row.public_case_id)))),
        },
        publicProjection: {
          beforeRows: allPublicProjectionBefore.length,
          afterRows: allPublicProjectionAfter.length,
          beforeSha256: sha256StableJson(allPublicProjectionBefore),
          afterSha256: sha256StableJson(allPublicProjectionAfter),
          targetPublicRowsAllowedToChange: FMANZ_CASE_AMOUNT_REVIEW.expectedExistingPublicIds.length,
          changedFields: ["amount_quality", "requires_amount_review", "amount_review_reason", "trusted_amount_gbp", "trusted_amount_eur"],
        },
        overrides: {
          beforeCount: overrideRowsBefore.length,
          afterCount: overrideRowsAfter.length,
          beforeSha256: sha256StableJson(overrideRowsBefore),
          afterSha256: sha256StableJson(overrideRowsAfter),
        },
        heldRowOverrides: {
          beforeCount: targetOverrideRowsBefore.length,
          afterCount: targetOverrideRowsAfter.length,
          beforeSha256: sha256StableJson(targetOverrideRowsBefore),
          afterSha256: sha256StableJson(targetOverrideRowsAfter),
        },
      };
      return completeFmanzRepairTransaction(rehearse ? "rehearse" : "apply", summary);
    }).catch((error) => {
      if (!(error instanceof FmanzRehearsalRollback)) throw error;
      return { ...error.summary, mode: "rehearsal-rolled-back" };
    });

    console.log(JSON.stringify({
      ...result,
      safety: rehearse
        ? "approved exact review rows and postchecks completed inside the transaction; deliberate rollback verified, no changes committed"
        : apply
          ? "only ten required amount-review rows changed; raw rows, overrides, public IDs, and all unrelated public fields were verified unchanged"
          : "read-only preflight; no rows changed",
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "FMANZ case-amount review failed.");
    process.exitCode = 1;
  });
}
