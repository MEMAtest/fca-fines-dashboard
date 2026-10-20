import fs from "node:fs";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import {
  assertSameSnapshot,
  assertSameKeyedPublicProjectionSnapshot,
  completeFmanzRepairTransaction,
  expectedRepairReason,
  FmanzRehearsalRollback,
  filterFmanzNonTargetOverrides,
  normalizeDbTimestampToReviewedPrecision,
  requireFmanzRepairDbPins,
  sha256JsonRows,
  sha256SortedStrings,
  validateFmanzAmountRepairManifest,
  verifyFmanzRepairOverrides,
  verifyFmanzRepairPublicRows,
  verifyFmanzRepairSourceRows,
  type FmanzAmountRepairManifest,
  type FmanzRepairOverrideRow,
  type FmanzRepairPublicRow,
  type FmanzRepairSourceRow,
} from "./fmanzUnsupportedAmountHelpers.js";

export const FMANZ_UNSUPPORTED_AMOUNT_REPAIR_TARGET = "reviewed-fmanz-unsupported-amounts-v1";
const manifestUrl = new URL("../scraper/data/fmanzUnsupportedAmountCorrections.json", import.meta.url);
export const FMANZ_UNSUPPORTED_AMOUNT_REPAIR = JSON.parse(
  fs.readFileSync(fileURLToPath(manifestUrl), "utf8"),
) as FmanzAmountRepairManifest;

async function main() {
  const apply = process.argv.includes("--apply");
  const rehearse = process.argv.includes("--rehearse");
  const dryRun = process.argv.includes("--dry-run");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--apply" && arg !== "--rehearse" && arg !== "--dry-run");
  const writeMode = apply || rehearse;
  if (unknown.length || [apply, rehearse, dryRun].filter(Boolean).length > 1) {
    throw new Error("Usage: repairFmanzUnsupportedAmounts.ts [--dry-run | --apply | --rehearse]");
  }
  if (writeMode && process.env.FMANZ_UNSUPPORTED_AMOUNT_REPAIR_APPROVED !== "true") {
    throw new Error("Refusing write mode without FMANZ_UNSUPPORTED_AMOUNT_REPAIR_APPROVED=true after independent review.");
  }
  if (writeMode && process.env.FMANZ_UNSUPPORTED_AMOUNT_REPAIR_TARGET !== FMANZ_UNSUPPORTED_AMOUNT_REPAIR_TARGET) {
    throw new Error(`Refusing write mode without exact target ${FMANZ_UNSUPPORTED_AMOUNT_REPAIR_TARGET}.`);
  }
  validateFmanzAmountRepairManifest(FMANZ_UNSUPPORTED_AMOUNT_REPAIR);
  if (!writeMode && !dryRun) process.argv.push("--dry-run");
  requireFmanzRepairDbPins();
  requireExpectedDbTarget("fmanz-unsupported-amount-repair");
  const connection = resolveConnectionString();
  if (!connection) throw new Error("Database connection required for FMANZ amount repair preflight.");
  const sql = postgres(connection, {
    max: 1,
    ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      if (!writeMode) await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL lock_timeout='30s'");
      await tx.unsafe("SET LOCAL statement_timeout='120s'");
      if (writeMode) {
        await tx.unsafe("SELECT pg_advisory_xact_lock(72140331)");
        await tx.unsafe("LOCK TABLE public.regulatory_amount_overrides IN SHARE ROW EXCLUSIVE MODE");
        await tx.unsafe("LOCK TABLE public.eu_fines IN SHARE ROW EXCLUSIVE MODE");
      }

      const sourceIds = FMANZ_UNSUPPORTED_AMOUNT_REPAIR.corrections.flatMap((item) => item.sourceRows.map((row) => row.id));
      const sourceRows = await tx.unsafe<FmanzRepairSourceRow[]>(
        `SELECT id::text, content_hash, regulator, firm_individual,
                to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
                source_url, final_notice_url, currency, amount::text, amount_gbp::text,
                raw_payload #>> '{entry,title}' AS entry_title,
                raw_payload #>> '{entry,dateIssued}' AS entry_date,
                raw_payload #>> '{entry,detailUrl}' AS entry_detail_url,
                raw_payload #>> '{detail,title}' AS detail_title,
                raw_payload #>> '{detail,dateIssued}' AS detail_date
           FROM public.eu_fines WHERE id = ANY($1::uuid[])
           ${writeMode ? "FOR UPDATE" : ""}`,
        [sourceIds],
      );
      verifyFmanzRepairSourceRows(sourceRows, FMANZ_UNSUPPORTED_AMOUNT_REPAIR);

      const urls = FMANZ_UNSUPPORTED_AMOUNT_REPAIR.corrections.map((item) => item.evidenceUrl);
      const targetOverrides = await tx.unsafe<FmanzRepairOverrideRow[]>(
        `SELECT regulator, evidence_url, amount_original::text, currency,
                amount_gbp::text, amount_eur::text, verification_url, reason,
                quality_status,
                to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
           FROM public.regulatory_amount_overrides
          WHERE regulator = 'FMANZ' AND evidence_url = ANY($1::text[])
          ${apply ? "FOR UPDATE" : ""}`,
        [urls],
      );
      const alreadyApplied = verifyFmanzRepairOverrides(targetOverrides, FMANZ_UNSUPPORTED_AMOUNT_REPAIR);

      const allOverridesBefore = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT regulator, evidence_url, amount_original::text AS amount_original,
                currency, amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur,
                verification_url, reason, quality_status,
                to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS verified_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
           FROM public.regulatory_amount_overrides
          WHERE NOT (regulator = 'FMANZ' AND evidence_url = ANY($1::text[]))
          ORDER BY regulator, evidence_url`,
        [urls],
      );
      const overrideCountBefore = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.regulatory_amount_overrides WHERE regulator = 'FMANZ'`,
      );
      const fmanzNonTargetOverrides = filterFmanzNonTargetOverrides(allOverridesBefore);
      if (
        overrideCountBefore[0]?.count !== FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.overrideCount
        || fmanzNonTargetOverrides.length !== FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.nonTargetOverrideCount
      ) {
        throw new Error("Amount override inventory differs from the reviewed 134-row baseline.");
      }
      const nonTargetOverrideTuples = fmanzNonTargetOverrides.map((row) => [
        row.regulator, row.evidence_url, row.amount_original, row.currency, row.amount_gbp,
        row.amount_eur, row.verification_url, row.reason,
        normalizeDbTimestampToReviewedPrecision(row.verified_at),
        normalizeDbTimestampToReviewedPrecision(row.created_at),
        normalizeDbTimestampToReviewedPrecision(row.updated_at), row.quality_status,
      ]);
      if (sha256JsonRows(nonTargetOverrideTuples) !== FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.nonTargetOverridesSha256) {
        throw new Error("One or more non-target amount overrides differ from the reviewed baseline.");
      }
      const publicIdsBefore = await tx.unsafe<Array<{ public_case_id: string }>>(
        `SELECT public_case_id FROM public.all_regulatory_fines_trusted
          WHERE regulator = 'FMANZ' ORDER BY public_case_id`,
      );
      const rawCountBefore = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.eu_fines WHERE regulator = 'FMANZ'`,
      );
      if (rawCountBefore[0]?.count !== FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.rawFmanzRows) {
        throw new Error(`FMANZ raw row count drifted from the reviewed baseline: ${rawCountBefore[0]?.count ?? "missing"}.`);
      }
      const publicIds = publicIdsBefore.map((row) => row.public_case_id);
      if (publicIds.length !== FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.publicFmanzIds) {
        throw new Error(`FMANZ public-case count drifted from the reviewed baseline: ${publicIds.length}.`);
      }
      if (sha256SortedStrings(publicIds) !== FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.publicIdsSha256) {
        throw new Error("FMANZ public-case ID set differs from the reviewed baseline; refusing to repair overrides.");
      }
      const targetPublicIds = FMANZ_UNSUPPORTED_AMOUNT_REPAIR.corrections.map((item) => item.publicCaseId);
      for (const publicCaseId of targetPublicIds) {
        if (!publicIds.includes(publicCaseId)) throw new Error(`Reviewed public case is missing before repair: ${publicCaseId}.`);
      }
      const publicTargetsBefore = await tx.unsafe<FmanzRepairPublicRow[]>(
        `SELECT public_case_id, canonical_case_id, firm_individual,
                to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
                notice_url, source_url, amount_original::text, amount_gbp::text,
                amount_eur::text, currency, amount_quality
           FROM public.all_regulatory_fines_trusted
          WHERE public_case_id = ANY($1::text[])`,
        [targetPublicIds],
      );
      const publicAlreadyRepaired = verifyFmanzRepairPublicRows(publicTargetsBefore, FMANZ_UNSUPPORTED_AMOUNT_REPAIR);
      if (publicAlreadyRepaired !== alreadyApplied) {
        throw new Error("FMANZ public amount projection and override rows disagree about whether the repair is applied.");
      }
      const allPublicIdsBefore = await tx.unsafe<Array<{ regulator: string; source_row_id: string; public_case_id: string }>>(
        `SELECT regulator, id::text AS source_row_id, public_case_id
           FROM public.all_regulatory_fines_trusted
          ORDER BY regulator, public_case_id, id`,
      );
      const nonTargetPublicProjectionBefore = await tx.unsafe<Array<Record<string, unknown> & {
        regulator: string; source_row_id: string; public_case_id: string;
      }>>(
        `SELECT regulator, public_case_id, id::text AS source_row_id, canonical_case_id,
                firm_individual, date_issued::text AS date_issued, notice_url, source_url,
                amount_original::text AS amount_original, currency,
                amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur,
                amount_quality
           FROM public.all_regulatory_fines_trusted
          WHERE NOT (upper(regulator) = 'FMANZ' AND public_case_id = ANY($1::text[]))
          ORDER BY regulator, public_case_id, id`,
        [targetPublicIds],
      );
      const rawRowsBefore = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT id::text AS id, content_hash, firm_individual, date_issued::text AS date_issued,
                source_url, final_notice_url, amount::text AS amount, currency,
                amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur, raw_payload
           FROM public.eu_fines WHERE regulator = 'FMANZ' ORDER BY id`,
      );
      if (rawRowsBefore.length !== FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.rawFmanzRows) {
        throw new Error("FMANZ raw source snapshot count differs from the reviewed baseline.");
      }

      const sourceTargetSummary = FMANZ_UNSUPPORTED_AMOUNT_REPAIR.corrections.map((item) => ({
        firm: item.firm,
        publicCaseId: item.publicCaseId,
        officialSourceUrl: item.officialSourceUrl,
        previewContentHash: item.preview.contentHash,
        rawSourceRowIds: item.sourceRows.map((row) => row.id),
        correction: "withhold unsupported derived amount; preserve raw rows and public ID",
      }));
      const summary: Record<string, unknown> = {
        mode: alreadyApplied ? "already-applied-noop" : rehearse ? "rehearse" : apply ? "apply" : "dry-run",
        sourcePreview: FMANZ_UNSUPPORTED_AMOUNT_REPAIR.sourcePreview,
        baseline: {
          rawFmanzRows: rawCountBefore[0]?.count ?? null,
          publicFmanzIds: publicIds.length,
          publicIdsSha256: FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.publicIdsSha256,
          fmanzOverrideCount: overrideCountBefore[0]?.count ?? null,
          fmanzNonTargetOverrideCount: fmanzNonTargetOverrides.length,
          globalNonTargetOverrideCount: allOverridesBefore.length,
          nonTargetOverridesSha256: FMANZ_UNSUPPORTED_AMOUNT_REPAIR.baseline.nonTargetOverridesSha256,
          allPublicCaseIds: allPublicIdsBefore.length,
          nonTargetPublicProjectionRows: nonTargetPublicProjectionBefore.length,
        },
        protectedNonTargetOverrides: allOverridesBefore.length,
        targets: sourceTargetSummary,
      };
      if (!writeMode) return completeFmanzRepairTransaction("dry-run", summary);
      if (alreadyApplied) return completeFmanzRepairTransaction(rehearse ? "rehearse" : "apply", summary);

      for (const item of FMANZ_UNSUPPORTED_AMOUNT_REPAIR.corrections) {
        const expected = item.expectedOverride;
        const updated = await tx.unsafe(
          `UPDATE public.regulatory_amount_overrides
              SET amount_original = NULL,
                  amount_gbp = NULL,
                  amount_eur = NULL,
                  quality_status = 'not_disclosed',
                  reason = $1,
                  verified_at = now(),
                  updated_at = now()
            WHERE regulator = 'FMANZ' AND evidence_url = $2
              AND amount_original = $3::numeric AND currency = $4
              AND amount_gbp = $5::numeric AND amount_eur = $6::numeric
              AND verification_url = $7 AND reason = $8
              AND quality_status = $9 AND verified_at = $10::timestamptz
            RETURNING evidence_url`,
          [
            expectedRepairReason(item, FMANZ_UNSUPPORTED_AMOUNT_REPAIR.sourcePreview.sha256),
            item.evidenceUrl, expected.amountOriginal, expected.currency, expected.amountGbp,
            expected.amountEur, expected.verificationUrl, expected.reason,
            expected.qualityStatus, expected.verifiedAt,
          ],
        );
        if (updated.length !== 1) throw new Error(`Exact guarded update did not affect one override: ${item.evidenceUrl}.`);
      }

      await tx.unsafe("SELECT public.refresh_all_fines()");
      const afterIds = await tx.unsafe<Array<{ public_case_id: string }>>(
        `SELECT public_case_id FROM public.all_regulatory_fines_trusted
          WHERE regulator = 'FMANZ' ORDER BY public_case_id`,
      );
      assertSameSnapshot("FMANZ public case IDs", publicIds, afterIds.map((row) => row.public_case_id));
      const rawCountAfter = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.eu_fines WHERE regulator = 'FMANZ'`,
      );
      assertSameSnapshot("FMANZ raw row count", rawCountBefore[0]?.count, rawCountAfter[0]?.count);

      const allOverridesAfter = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT regulator, evidence_url, amount_original::text AS amount_original,
                currency, amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur,
                verification_url, reason, quality_status,
                to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS verified_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
           FROM public.regulatory_amount_overrides
          WHERE NOT (regulator = 'FMANZ' AND evidence_url = ANY($1::text[]))
          ORDER BY regulator, evidence_url`,
        [urls],
      );
      assertSameSnapshot("Non-target amount overrides", allOverridesBefore, allOverridesAfter);
      const overrideCountAfter = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.regulatory_amount_overrides WHERE regulator = 'FMANZ'`,
      );
      assertSameSnapshot("Amount override inventory", overrideCountBefore[0]?.count, overrideCountAfter[0]?.count);

      const allPublicIdsAfter = await tx.unsafe<Array<{ regulator: string; source_row_id: string; public_case_id: string }>>(
        `SELECT regulator, id::text AS source_row_id, public_case_id
           FROM public.all_regulatory_fines_trusted
          ORDER BY regulator, public_case_id, id`,
      );
      assertSameKeyedPublicProjectionSnapshot("All-regulator public case IDs", allPublicIdsBefore, allPublicIdsAfter);
      const nonTargetPublicProjectionAfter = await tx.unsafe<Array<Record<string, unknown> & {
        regulator: string; source_row_id: string; public_case_id: string;
      }>>(
        `SELECT regulator, public_case_id, id::text AS source_row_id, canonical_case_id,
                firm_individual, date_issued::text AS date_issued, notice_url, source_url,
                amount_original::text AS amount_original, currency,
                amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur,
                amount_quality
           FROM public.all_regulatory_fines_trusted
          WHERE NOT (upper(regulator) = 'FMANZ' AND public_case_id = ANY($1::text[]))
          ORDER BY regulator, public_case_id, id`,
        [targetPublicIds],
      );
      assertSameKeyedPublicProjectionSnapshot("Non-target all-regulator public projections", nonTargetPublicProjectionBefore, nonTargetPublicProjectionAfter);
      const rawRowsAfter = await tx.unsafe<Array<Record<string, unknown>>>(
        `SELECT id::text AS id, content_hash, firm_individual, date_issued::text AS date_issued,
                source_url, final_notice_url, amount::text AS amount, currency,
                amount_gbp::text AS amount_gbp, amount_eur::text AS amount_eur, raw_payload
           FROM public.eu_fines WHERE regulator = 'FMANZ' ORDER BY id`,
      );
      assertSameSnapshot("All FMANZ raw source rows", rawRowsBefore, rawRowsAfter);

      const finalOverrides = await tx.unsafe<FmanzRepairOverrideRow[]>(
        `SELECT regulator, evidence_url, amount_original::text, currency,
                amount_gbp::text, amount_eur::text, verification_url, reason,
                quality_status,
                to_char(verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS verified_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
           FROM public.regulatory_amount_overrides
          WHERE regulator = 'FMANZ' AND evidence_url = ANY($1::text[])`,
        [urls],
      );
      if (!verifyFmanzRepairOverrides(finalOverrides, FMANZ_UNSUPPORTED_AMOUNT_REPAIR)) {
        throw new Error("FMANZ override postcondition failed; transaction must roll back.");
      }
      const finalTrusted = await tx.unsafe<FmanzRepairPublicRow[]>(
        `SELECT public_case_id, canonical_case_id, firm_individual,
                to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
                notice_url, source_url, amount_original::text, amount_gbp::text,
                amount_eur::text, currency, amount_quality
           FROM public.all_regulatory_fines_trusted
          WHERE public_case_id = ANY($1::text[])`,
        [targetPublicIds],
      );
      if (!verifyFmanzRepairPublicRows(finalTrusted, FMANZ_UNSUPPORTED_AMOUNT_REPAIR)) {
        throw new Error("Reviewed FMANZ public amount postcondition failed; transaction must roll back.");
      }
      summary.postchecks = {
        passed: true,
        allRegulatorPublicRows: {
          beforeCount: allPublicIdsBefore.length,
          afterCount: allPublicIdsAfter.length,
          beforeSha256: sha256JsonRows(allPublicIdsBefore),
          afterSha256: sha256JsonRows(allPublicIdsAfter),
        },
        nonTargetPublicProjection: {
          beforeCount: nonTargetPublicProjectionBefore.length,
          afterCount: nonTargetPublicProjectionAfter.length,
          beforeSha256: sha256JsonRows(nonTargetPublicProjectionBefore),
          afterSha256: sha256JsonRows(nonTargetPublicProjectionAfter),
        },
        fmanzRawRows: {
          beforeCount: rawRowsBefore.length,
          afterCount: rawRowsAfter.length,
          beforeSha256: sha256JsonRows(rawRowsBefore),
          afterSha256: sha256JsonRows(rawRowsAfter),
        },
        nonTargetOverrides: {
          beforeCount: allOverridesBefore.length,
          afterCount: allOverridesAfter.length,
          beforeSha256: sha256JsonRows(allOverridesBefore),
          afterSha256: sha256JsonRows(allOverridesAfter),
        },
      };
      return completeFmanzRepairTransaction(rehearse ? "rehearse" : "apply", summary);
    }).catch((error) => {
      if (!(error instanceof FmanzRehearsalRollback)) throw error;
      return { ...error.summary, mode: "rehearsal-rolled-back" };
    });
    console.log(JSON.stringify({
      ...result,
      target: FMANZ_UNSUPPORTED_AMOUNT_REPAIR_TARGET,
      safety: rehearse
        ? "approved FMANZ updates and all postchecks completed inside the transaction; deliberate rollback verified, no changes committed"
        : apply
        ? "only three reviewed amount override rows changed; transaction verifies and preserves every FMANZ public ID, raw-row count, and non-target override"
        : "read-only preflight; no rows changed",
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "FMANZ amount repair failed.");
    process.exitCode = 1;
  });
}
