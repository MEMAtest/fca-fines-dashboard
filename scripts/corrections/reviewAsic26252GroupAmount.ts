import "dotenv/config";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describeDbTarget, requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import { UNIFIED_VIEW_REFRESH_LOCK } from "../scraper/lib/refreshViews.js";
import {
  ASIC_26252_GROUP_REVIEW_TARGET,
  ASIC_26252_OFFICIAL_NOTICE_URL,
  isExactAsic26252ReviewMarkerSet,
  validateAsic26252CurrentRows,
  validateAsic26252GroupReviewContract,
  validateAsic26252Roster,
  type Asic26252GroupReviewContract,
} from "./asic26252GroupReviewHelpers.js";
import ruleDocument from "../scraper/data/asicAmountAttributionRules.json" with { type: "json" };
import contractDocument from "./data/asic26252GroupReviewV1.json" with { type: "json" };

const TARGET_DATABASE = { host: "89.167.95.173", database: "fcafines" };
const contract = contractDocument as Asic26252GroupReviewContract;
const rule = (ruleDocument as { groups: Array<{ mediaReleaseCode: string; mediaReleaseUrl: string; entities: string[]; headlineNeedle: string; groupAmount: number; groupCount: number }> }).groups
  .find((candidate) => candidate.mediaReleaseCode === contract.releaseCode && candidate.mediaReleaseUrl === contract.noticeUrl);

type SqlLike = { unsafe: <T extends any[] = any[]>(query: string, values?: any[]) => PromiseLike<T> };

class Asic26252RehearsalRollback extends Error {
  constructor(readonly result: Record<string, unknown>) {
    super("ASIC 26-252MR review rehearsal complete; transaction rolled back by design.");
  }
}

function parsedPayload(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error("ASIC 26-252MR raw source payload is absent or malformed.");
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertExactRawPayloads(rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    const payload = parsedPayload(row.raw_payload);
    if (payload.mediaReleaseCode !== contract.releaseCode
      || payload.mediaReleaseUrl !== contract.noticeUrl
      || typeof payload.mediaReleaseTitle !== "string"
      || !(payload.mediaReleaseTitle as string).toLocaleLowerCase("en-AU").includes(rule!.headlineNeedle)) {
      throw new Error(`ASIC 26-252MR raw payload changed for ${String(row.id)}; refusing to queue a review marker.`);
    }
  }
}

async function readTargetRows(tx: SqlLike) {
  const rows = await tx.unsafe<Array<Record<string, unknown>>>(
    `SELECT raw.id::text AS id, upper(raw.regulator) AS regulator, raw.content_hash, raw.firm_individual,
            to_char(raw.date_issued, 'YYYY-MM-DD') AS date_issued,
            raw.amount::text AS raw_amount, raw.amount_gbp::text AS raw_amount_gbp,
            raw.amount_eur::text AS raw_amount_eur, raw.currency, raw.source_url,
            raw.final_notice_url, raw.raw_payload,
            encode(sha256(convert_to(to_jsonb(raw)::text, 'UTF8')), 'hex') AS raw_row_sha256,
            trusted.public_case_id::text AS public_case_id,
            trusted.canonical_case_id::text AS canonical_case_id,
            trusted.notice_url, trusted.amount_original::text AS amount_original,
            trusted.amount_gbp::text AS amount_gbp, trusted.amount_eur::text AS amount_eur,
            trusted.amount_quality, trusted.requires_amount_review,
            trusted.trusted_amount_gbp::text AS trusted_amount_gbp,
            trusted.trusted_amount_eur::text AS trusted_amount_eur,
            trusted.source_review_status, trusted.source_content_hash,
            trusted.source_link_status, trusted.source_official_domain_match,
            review.source_row_id AS review_source_row_id,
            review.review_status, review.reason AS review_reason,
            review.evidence_url AS review_evidence_url,
            override.evidence_url AS override_url
       FROM public.eu_fines raw
       JOIN public.all_regulatory_fines_trusted trusted ON trusted.id::text = raw.id::text
       LEFT JOIN public.regulatory_case_amount_reviews review ON review.source_row_id = raw.id::text
       LEFT JOIN LATERAL (
         SELECT string_agg(candidate.evidence_url, '|' ORDER BY candidate.evidence_url) AS evidence_url
           FROM public.regulatory_amount_overrides candidate
          WHERE candidate.regulator = 'ASIC'
            AND public.normalise_regulatory_evidence_url(candidate.evidence_url) = ANY(ARRAY[
              public.normalise_regulatory_evidence_url(trusted.notice_url),
              public.normalise_regulatory_evidence_url(raw.final_notice_url),
              public.normalise_regulatory_evidence_url(raw.source_url)
            ])
       ) override ON TRUE
      WHERE raw.id = ANY($1::uuid[]) AND upper(raw.regulator) = 'ASIC'
      ORDER BY lower(raw.firm_individual), raw.id`,
    [contract.targets.map((target) => target.id)],
  );
  return rows;
}

async function readExactGroupIds(tx: SqlLike) {
  return tx.unsafe<Array<{ id: string }>>(
    `SELECT fines.id::text AS id
       FROM public.all_regulatory_fines_trusted fines
      WHERE upper(fines.regulator) = 'ASIC'
        AND trim(fines.notice_url) = $1
        AND fines.date_issued::date = $2::date
        AND upper(fines.currency) = $3
        AND fines.amount_original = $4::numeric
      ORDER BY fines.id`,
    [contract.noticeUrl, contract.date, contract.currency, contract.storedGroupHeadlineAmount],
  );
}

async function readTargetReviews(tx: SqlLike) {
  return tx.unsafe<Array<Record<string, unknown>>>(
    `SELECT source_row_id, review_status, reason, evidence_url,
            reviewed_by, reviewed_at,
            to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS detected_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
       FROM public.regulatory_case_amount_reviews
      WHERE source_row_id = ANY($1::text[])
      ORDER BY source_row_id`,
    [contract.targets.map((target) => target.id)],
  );
}

async function verifyConcurrentRefreshPreflight(tx: SqlLike) {
  const rows = await tx.unsafe<Array<{ view_name: string; populated: boolean; has_full_unique_index: boolean }>>(
    `SELECT requested.view_name,
            COALESCE(matview.relkind = 'm' AND matview.relispopulated, false) AS populated,
            EXISTS (
              SELECT 1 FROM pg_index AS index_info
               WHERE index_info.indrelid = matview.oid
                 AND index_info.indisunique AND index_info.indisvalid AND index_info.indisready
                 AND index_info.indpred IS NULL AND index_info.indexprs IS NULL
            ) AS has_full_unique_index
       FROM unnest(ARRAY['public.all_regulatory_fines', 'public.all_regulatory_fines_canonical']) AS requested(view_name)
       LEFT JOIN pg_class AS matview ON matview.oid = to_regclass(requested.view_name)`,
  );
  if (rows.length !== 2 || rows.some((row) => !row.populated || !row.has_full_unique_index)) {
    throw new Error("Concurrent refresh preflight failed: both populated materialized views need valid full unique indexes.");
  }
  const functions = await tx.unsafe<Array<{ definition: string | null }>>(
    "SELECT pg_get_functiondef(to_regprocedure('public.refresh_all_fines()')) AS definition",
  );
  const definition = functions[0]?.definition ?? "";
  if (!definition.includes("REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines;")
    || !definition.includes("REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines_canonical;")) {
    throw new Error("Concurrent refresh preflight failed: refresh_all_fines() is not the expected concurrent dual-view implementation.");
  }
  return { views: rows, refreshFunctionSha256: createHash("sha256").update(definition).digest("hex") };
}

async function digestQuery(tx: SqlLike, query: string, values: unknown[] = []) {
  const rows = await tx.unsafe<Array<{ count: number; sha256: string }>>(query, values);
  if (rows.length !== 1 || !rows[0]?.sha256) throw new Error("Could not snapshot a protected table or identity set.");
  return rows[0];
}

async function readProtectedSnapshots(tx: SqlLike) {
  const ids = contract.targets.map((target) => target.id);
  const [identities, nonTargetReviews, overrides, registry, aliases] = await Promise.all([
    digestQuery(tx, `SELECT count(*)::int AS count,
      encode(sha256(convert_to(coalesce(string_agg(concat_ws('|', upper(regulator), id::text, public_case_id, canonical_case_id), E'\\n' ORDER BY upper(regulator), id::text, public_case_id, canonical_case_id), ''), 'UTF8')), 'hex') AS sha256
      FROM public.all_regulatory_fines_trusted`),
    digestQuery(tx, `SELECT count(*)::int AS count,
      encode(sha256(convert_to(coalesce(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY to_jsonb(row_value)::text), ''), 'UTF8')), 'hex') AS sha256
      FROM public.regulatory_case_amount_reviews AS row_value WHERE source_row_id <> ALL($1::text[])`, [ids]),
    digestQuery(tx, `SELECT count(*)::int AS count,
      encode(sha256(convert_to(coalesce(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY to_jsonb(row_value)::text), ''), 'UTF8')), 'hex') AS sha256
      FROM public.regulatory_amount_overrides AS row_value`),
    digestQuery(tx, `SELECT count(*)::int AS count,
      encode(sha256(convert_to(coalesce(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY to_jsonb(row_value)::text), ''), 'UTF8')), 'hex') AS sha256
      FROM public.regulatory_case_registry AS row_value`),
    digestQuery(tx, `SELECT count(*)::int AS count,
      encode(sha256(convert_to(coalesce(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY to_jsonb(row_value)::text), ''), 'UTF8')), 'hex') AS sha256
      FROM public.regulatory_case_aliases AS row_value`),
  ]);
  return { identities, nonTargetReviews, overrides, registry, aliases };
}

function assertDigestUnchanged(label: string, before: Record<string, any>, after: Record<string, any>) {
  if (before.count !== after.count || before.sha256 !== after.sha256) {
    throw new Error(`${label} changed during ASIC 26-252MR review-marker insertion; transaction must roll back.`);
  }
}

function summarizeTarget(row: Record<string, unknown>) {
  return {
    id: row.id,
    public_case_id: row.public_case_id,
    firm_individual: row.firm_individual,
    date_issued: row.date_issued,
    amount_original: row.amount_original,
    currency: row.currency,
    amount_quality: row.amount_quality,
    requires_amount_review: row.requires_amount_review,
    trusted_amount_gbp: row.trusted_amount_gbp,
    trusted_amount_eur: row.trusted_amount_eur,
    source_review_status: row.source_review_status,
  };
}

async function run(mode: "dry-run" | "rehearse" | "apply", tx: SqlLike) {
  await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  if (mode === "dry-run") await tx.unsafe("SET TRANSACTION READ ONLY");
  await tx.unsafe("SET LOCAL lock_timeout = '30s'");
  await tx.unsafe("SET LOCAL statement_timeout = '180s'");
  if (mode !== "dry-run") {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(${UNIFIED_VIEW_REFRESH_LOCK})`);
    await tx.unsafe("LOCK TABLE public.eu_fines IN SHARE MODE");
    await tx.unsafe("LOCK TABLE public.regulatory_case_amount_reviews IN SHARE ROW EXCLUSIVE MODE");
  }

  const rows = await readTargetRows(tx);
  const groupIds = await readExactGroupIds(tx);
  assertExactRawPayloads(rows);
  const expectedIds = new Set(contract.targets.map((target) => target.id));
  if (groupIds.length !== expectedIds.size || groupIds.some((row) => !expectedIds.has(row.id))) {
    throw new Error(`ASIC 26-252MR current raw group is not exactly the 21 pinned rows; found ${groupIds.length}.`);
  }

  const reviewsBefore = await readTargetReviews(tx);
  const targetIds = new Set(contract.targets.map((target) => target.id));
  const exactExistingReviews = isExactAsic26252ReviewMarkerSet(contract, reviewsBefore);
  if (reviewsBefore.length === 0) {
    validateAsic26252CurrentRows(contract, rows, "unheld");
  } else if (exactExistingReviews) {
    validateAsic26252CurrentRows(contract, rows, "held");
  } else {
    throw new Error(`ASIC 26-252MR has ${reviewsBefore.length} nonmatching pre-existing review rows; refusing partial or altered state.`);
  }
  const refresh = await verifyConcurrentRefreshPreflight(tx);
  const snapshots = await readProtectedSnapshots(tx);
  const rawRowsBefore = rows.map((row) => ({ id: row.id, rowSha256: row.raw_row_sha256 }));

  if (exactExistingReviews) {
    return {
      mode,
      target: ASIC_26252_GROUP_REVIEW_TARGET,
      source: ASIC_26252_OFFICIAL_NOTICE_URL,
      state: "already-applied-exact-required-holds-noop",
      proposedAction: "none; all 21 exact required case review markers are already present",
      exactPhysicalRows: rows.length,
      reviewRows: reviewsBefore,
      rawRowsUnchanged: rawRowsBefore,
      protectedSnapshots: snapshots,
      concurrentRefresh: refresh,
      safety: "verified exact post-state; no rows changed",
    };
  }

  const preview = {
    mode,
    target: ASIC_26252_GROUP_REVIEW_TARGET,
    source: ASIC_26252_OFFICIAL_NOTICE_URL,
    officialEvidence: {
      passage: contract.officialPassage,
      passageSha256: contract.officialPassageSha256,
      currentSourceContentHash: contract.sourceContentHash,
    },
    exactGroup: {
      regulator: contract.regulator,
      releaseCode: contract.releaseCode,
      date: contract.date,
      nativeCurrency: contract.currency,
      storedRawAmount: contract.storedGroupHeadlineAmount,
      officialGroupTotal: contract.officialGroupTotal,
      officialPerEntityAmount: contract.officialPerEntityAmount,
      exactPhysicalRows: rows.length,
      targets: rows.map(summarizeTarget),
    },
    proposedAction: "insert only 21 exact required case amount-review markers; preserve every raw amount, converted amount, public/canonical ID, source assessment, URL override, registry row, and alias",
    protectedSnapshots: snapshots,
    rawRowsBefore,
    concurrentRefresh: refresh,
  };
  if (mode === "dry-run") return { ...preview, state: "exact-group-review-proposal", safety: "read-only preflight; no rows changed" };

  const inserted = await tx.unsafe<Array<{ source_row_id: string }>>(
    `INSERT INTO public.regulatory_case_amount_reviews (source_row_id, review_status, reason, evidence_url)
     SELECT raw.id::text, 'required', $2, $3
       FROM public.eu_fines AS raw
      WHERE raw.id = ANY($1::uuid[])
        AND upper(raw.regulator) = 'ASIC'
        AND NOT EXISTS (
          SELECT 1 FROM public.regulatory_case_amount_reviews existing
           WHERE existing.source_row_id = raw.id::text
        )
     RETURNING source_row_id`,
    [contract.targets.map((target) => target.id), contract.reviewReason, contract.noticeUrl],
  );
  const insertedIds = new Set(inserted.map((row) => row.source_row_id));
  if (inserted.length !== 21 || insertedIds.size !== 21 || [...expectedIds].some((id) => !insertedIds.has(id))) {
    throw new Error(`Expected exactly the 21 pinned review markers; inserted ${inserted.length}; transaction must roll back.`);
  }

  await tx.unsafe("SELECT public.refresh_all_fines()");

  const rowsAfter = await readTargetRows(tx);
  if (rowsAfter.length !== 21) throw new Error("ASIC 26-252MR rows disappeared after refresh; transaction must roll back.");
  assertExactRawPayloads(rowsAfter);
  const targetById = new Map(contract.targets.map((target) => [target.id, target]));
  for (const row of rowsAfter) {
    const original = rows.find((before) => before.id === row.id);
    const target = targetById.get(String(row.id));
    if (!target || row.public_case_id !== target.publicCaseId
      || row.canonical_case_id !== target.publicCaseId
      || row.content_hash !== target.contentHash
      || row.firm_individual !== target.firm
      || !original || row.raw_row_sha256 !== original.raw_row_sha256
      || row.amount_original !== contract.storedGroupHeadlineAmount
      || row.amount_gbp !== contract.currentAmountGbp || row.amount_eur !== contract.currentAmountEur
      || row.amount_quality !== contract.heldAmountQuality
      || row.requires_amount_review !== true
      || row.trusted_amount_gbp !== null || row.trusted_amount_eur !== null
      || row.source_review_status !== contract.sourceReviewStatus
      || row.source_content_hash !== contract.sourceContentHash) {
      throw new Error(`ASIC 26-252MR row ${String(row.id)} changed outside the required review hold; transaction must roll back.`);
    }
  }
  const reviewsAfter = await readTargetReviews(tx);
  if (!isExactAsic26252ReviewMarkerSet(contract, reviewsAfter)) {
    throw new Error("ASIC 26-252MR post-refresh review rows differ from the exact 21 required markers; transaction must roll back.");
  }

  const protectedAfter = await readProtectedSnapshots(tx);
  for (const key of Object.keys(snapshots) as Array<keyof typeof snapshots>) {
    assertDigestUnchanged(key, snapshots[key], protectedAfter[key]);
  }
  const postchecks = {
    passed: true,
    reviewRowsInserted: reviewsAfter.length,
    rawRowsUnchanged: rawRowsBefore,
    protectedSnapshotsUnchanged: protectedAfter,
    publicAndCanonicalIdentitiesUnchanged: protectedAfter.identities,
    sourceReviewStateUnchanged: contract.sourceReviewStatus,
    overridesRegistryAliasesUnchanged: {
      overrides: protectedAfter.overrides,
      registry: protectedAfter.registry,
      aliases: protectedAfter.aliases,
    },
  };
  const result = { ...preview, state: "21-case-amount-review-held-in-transaction", postchecks };
  if (mode === "rehearse") throw new Asic26252RehearsalRollback(result);
  return result;
}

async function main() {
  const switches = ["--dry-run", "--rehearse", "--apply"];
  const selected = process.argv.slice(2).filter((argument) => switches.includes(argument));
  const unknown = process.argv.slice(2).filter((argument) => !switches.includes(argument));
  if (unknown.length || selected.length !== 1) throw new Error("Usage: reviewAsic26252GroupAmount.ts --dry-run | --rehearse | --apply");
  const mode = selected[0]!.slice(2) as "dry-run" | "rehearse" | "apply";
  if (!rule) throw new Error("ASIC 26-252MR attribution rule is missing.");
  validateAsic26252GroupReviewContract(contract);
  validateAsic26252Roster(contract, rule.entities);
  if (rule.groupCount !== 21 || rule.groupAmount !== 4_158_000) throw new Error("ASIC 26-252MR source rule amount/count changed.");
  if (mode !== "dry-run") {
    if (process.env.ASIC_26_252_GROUP_REVIEW_APPROVED !== "true"
      || process.env.ASIC_26_252_GROUP_REVIEW_TARGET !== ASIC_26252_GROUP_REVIEW_TARGET) {
      throw new Error("Rehearse/apply requires explicit ASIC_26_252_GROUP_REVIEW_APPROVED=true and the exact target token after independent review.");
    }
  }
  const dbTarget = mode === "dry-run"
    ? describeDbTarget()
    : requireExpectedDbTarget("asic-26-252-group-review");
  const connection = resolveConnectionString();
  if (!connection) throw new Error("No authorised database connection is configured.");
  const actualTarget = describeDbTarget(connection);
  if (!actualTarget || actualTarget.host !== TARGET_DATABASE.host || actualTarget.database !== TARGET_DATABASE.database) {
    throw new Error("ASIC 26-252MR review operator refused an unexpected database target.");
  }
  if (mode !== "dry-run" && (dbTarget?.host !== TARGET_DATABASE.host || dbTarget.database !== TARGET_DATABASE.database)) {
    throw new Error("ASIC 26-252MR review operator requires the guarded fcafines target.");
  }

  const sql = postgres(connection, {
    max: 1,
    ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false,
    connection: { application_name: ASIC_26252_GROUP_REVIEW_TARGET, options: "-c statement_timeout=25000" },
  });
  try {
    let result: Record<string, unknown>;
    if (mode === "rehearse") {
      try {
        result = await sql.begin((tx) => run(mode, tx)) as Record<string, unknown>;
      } catch (error) {
        if (!(error instanceof Asic26252RehearsalRollback)) throw error;
        const rollbackReadback = await sql.begin((tx) => run("dry-run", tx)) as Record<string, unknown>;
        if (rollbackReadback.state !== "exact-group-review-proposal"
          || sha256Json(rollbackReadback.protectedSnapshots) !== sha256Json(error.result.protectedSnapshots)) {
          throw new Error("ASIC 26-252MR review rehearsal did not restore the exact pre-change state after rollback.");
        }
        result = { ...error.result, mode: "rehearsal-rolled-back", rollbackReadback };
      }
    } else {
      result = await sql.begin((tx) => run(mode, tx)) as Record<string, unknown>;
    }
    console.log(JSON.stringify({
      ...result,
      databaseTarget: dbTarget,
      safety: mode === "dry-run"
        ? "read-only exact-group preflight; no rows changed"
        : result.state === "already-applied-exact-required-holds-noop"
          ? "exact review-only post-state already present; no rows changed"
        : mode === "rehearse"
          ? "21 exact review markers inserted and concurrent projections checked inside one transaction, then deliberately rolled back and read back"
          : "only the exact 21 required amount-review markers were inserted; raw amounts, projections, source assessments, identities, overrides, registry and aliases were verified",
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ASIC 26-252MR group review failed.");
    process.exitCode = 1;
  });
}
