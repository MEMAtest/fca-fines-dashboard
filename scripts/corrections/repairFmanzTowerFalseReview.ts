import "dotenv/config";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describeDbTarget, requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import {
  FMANZ_TOWER_FALSE_REVIEW_REPAIR,
  FMANZ_TOWER_FALSE_REVIEW_TARGET,
  validateFmanzTowerFalseReviewRepair,
  verifyFmanzTowerProjection,
  verifyFmanzTowerRawRow,
  verifyFmanzTowerRequiredReview,
  type TowerRawRow,
  type TowerReviewRow,
} from "./fmanzTowerFalseReviewHelpers.js";
import { UNIFIED_VIEW_REFRESH_LOCK } from "../scraper/lib/refreshViews.js";

type SqlLike = { unsafe: <T extends any[] = any[]>(query: string, values?: any[]) => PromiseLike<T> };

class FmanzTowerRepairRehearsalRollback extends Error {
  constructor(readonly summary: Record<string, unknown>) {
    super("Tower false-review repair rehearsal completed; rolling back the transaction by design.");
  }
}

async function readRawTarget(tx: SqlLike) {
  const rows = await tx.unsafe<Array<TowerRawRow & { row_sha256: string }>>(
    `SELECT id::text AS id, upper(regulator) AS regulator, firm_individual,
            to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
            amount::text AS amount, currency, source_url, final_notice_url,
            raw_payload,
            encode(sha256(convert_to(to_jsonb(e)::text, 'UTF8')), 'hex') AS row_sha256
       FROM public.eu_fines AS e WHERE id = $1::uuid AND upper(regulator) = 'FMANZ'`,
    [FMANZ_TOWER_FALSE_REVIEW_REPAIR.target.sourceRowId],
  );
  if (rows.length !== 1) throw new Error(`Expected exactly one Tower raw row; found ${rows.length}.`);
  verifyFmanzTowerRawRow(rows[0]!);
  return rows[0]!;
}

async function readTargetReview(tx: SqlLike) {
  return tx.unsafe<TowerReviewRow[]>(
    `SELECT source_row_id, review_status, reason, evidence_url,
            to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS detected_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
            reviewed_by,
            CASE WHEN reviewed_at IS NULL THEN NULL
              ELSE to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS reviewed_at
       FROM public.regulatory_case_amount_reviews
      WHERE source_row_id = $1 ORDER BY detected_at`,
    [FMANZ_TOWER_FALSE_REVIEW_REPAIR.target.sourceRowId],
  );
}

async function readTargetProjection(tx: SqlLike) {
  const rows = await tx.unsafe<Array<{ row: Record<string, unknown> }>>(
    `SELECT to_jsonb(fines) AS row
       FROM public.all_regulatory_fines_trusted AS fines
      WHERE upper(regulator) = 'FMANZ' AND id::text = $1 AND public_case_id = $2`,
    [FMANZ_TOWER_FALSE_REVIEW_REPAIR.target.sourceRowId, FMANZ_TOWER_FALSE_REVIEW_REPAIR.target.publicCaseId],
  );
  if (rows.length > 1) throw new Error(`Expected at most one Tower public row; found ${rows.length}.`);
  return rows[0]?.row;
}

function summarizeProjection(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    public_case_id: row.public_case_id,
    firm_individual: row.firm_individual,
    date_issued: row.date_issued,
    amount_original: row.amount_original,
    amount_gbp: row.amount_gbp,
    amount_eur: row.amount_eur,
    currency: row.currency,
    amount_quality: row.amount_quality,
    requires_amount_review: row.requires_amount_review,
    amount_review_reason: row.amount_review_reason,
    trusted_amount_gbp: row.trusted_amount_gbp,
    trusted_amount_eur: row.trusted_amount_eur,
  };
}

async function verifyConcurrentRefreshPreflight(tx: SqlLike) {
  const indexRows = await tx.unsafe<Array<{ view_name: string; populated: boolean; has_full_unique_index: boolean }>>(
    `SELECT requested.view_name,
            COALESCE(matview.relkind = 'm' AND matview.relispopulated, false) AS populated,
            EXISTS (
              SELECT 1 FROM pg_index AS index_info
               WHERE index_info.indrelid = matview.oid
                 AND index_info.indisunique AND index_info.indisvalid AND index_info.indisready
                 AND index_info.indpred IS NULL AND index_info.indexprs IS NULL
            ) AS has_full_unique_index
       FROM unnest(ARRAY['public.all_regulatory_fines', 'public.all_regulatory_fines_canonical']) AS requested(view_name)
       LEFT JOIN pg_class AS matview ON matview.oid = to_regclass(requested.view_name)`
  );
  if (indexRows.length !== 2 || indexRows.some((row) => !row.populated || !row.has_full_unique_index)) {
    throw new Error("Concurrent refresh preflight failed: both populated materialized views require valid full named-column unique indexes.");
  }
  const functionRows = await tx.unsafe<Array<{ definition: string | null }>>(
    `SELECT pg_get_functiondef(to_regprocedure('public.refresh_all_fines()')) AS definition`,
  );
  const definition = functionRows[0]?.definition ?? "";
  if (
    !definition.includes("REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines;")
    || !definition.includes("REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines_canonical;")
  ) {
    throw new Error("Concurrent refresh preflight failed: public.refresh_all_fines() is not the reviewed concurrent dual-view implementation.");
  }
  return { indexes: indexRows, refreshFunctionSha256: createHash("sha256").update(definition).digest("hex") };
}

async function readGlobalIdentityDigest(tx: SqlLike) {
  const rows = await tx.unsafe<Array<{ count: number; sha256: string }>>(
    `SELECT count(*)::int AS count,
            encode(sha256(convert_to(coalesce(string_agg(
              concat_ws('|', upper(regulator), id::text, public_case_id), E'\\n'
              ORDER BY upper(regulator), id::text, public_case_id), ''), 'UTF8')), 'hex') AS sha256
       FROM public.all_regulatory_fines_trusted`,
  );
  if (rows.length !== 1 || !rows[0]?.sha256) throw new Error("Could not snapshot trusted public identities.");
  return rows[0];
}

async function readNonTargetTableDigest(
  tx: SqlLike,
  table: "regulatory_case_amount_reviews" | "regulatory_amount_overrides" | "regulatory_case_registry" | "regulatory_case_aliases",
) {
  const idFilter = table === "regulatory_case_amount_reviews" ? "WHERE source_row_id <> $1" : "";
  const rows = await tx.unsafe<Array<{ count: number; sha256: string }>>(
    `SELECT count(*)::int AS count,
            encode(sha256(convert_to(coalesce(string_agg(to_jsonb(row_value)::text, E'\\n'
              ORDER BY to_jsonb(row_value)::text), ''), 'UTF8')), 'hex') AS sha256
       FROM public.${table} AS row_value ${idFilter}`,
    table === "regulatory_case_amount_reviews" ? [FMANZ_TOWER_FALSE_REVIEW_REPAIR.target.sourceRowId] : [],
  );
  if (rows.length !== 1 || !rows[0]?.sha256) throw new Error(`Could not snapshot public.${table}.`);
  return rows[0];
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function runRepair(mode: "dry-run" | "rehearse" | "apply", tx: SqlLike) {
  await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  if (mode === "dry-run") await tx.unsafe("SET TRANSACTION READ ONLY");
  await tx.unsafe("SET LOCAL lock_timeout='30s'");
  await tx.unsafe("SET LOCAL statement_timeout='180s'");
  if (mode !== "dry-run") {
    await tx.unsafe(`SELECT pg_advisory_xact_lock(${UNIFIED_VIEW_REFRESH_LOCK})`);
    await tx.unsafe("LOCK TABLE public.eu_fines IN SHARE MODE");
    await tx.unsafe("LOCK TABLE public.regulatory_case_amount_reviews IN SHARE ROW EXCLUSIVE MODE");
  }

  const rawBefore = await readRawTarget(tx);
  const reviewRows = await readTargetReview(tx);
  const projectionBefore = await readTargetProjection(tx);
  const concurrentRefresh = await verifyConcurrentRefreshPreflight(tx);
  const nonTargetReviewsBefore = await readNonTargetTableDigest(tx, "regulatory_case_amount_reviews");
  const overridesBefore = await readNonTargetTableDigest(tx, "regulatory_amount_overrides");
  const registryBefore = await readNonTargetTableDigest(tx, "regulatory_case_registry");
  const aliasesBefore = await readNonTargetTableDigest(tx, "regulatory_case_aliases");
  const identitiesBefore = await readGlobalIdentityDigest(tx);

  const target = FMANZ_TOWER_FALSE_REVIEW_REPAIR.target;
  const base = {
    mode,
    target: FMANZ_TOWER_FALSE_REVIEW_TARGET,
    source: target.sourceUrl,
    event: { sourceRowId: target.sourceRowId, publicCaseId: target.publicCaseId, firm: target.firm, date: target.date, amountOriginal: target.amountOriginal, currency: target.currency },
    bodyEvidence: {
      acceptedBodySha256: FMANZ_TOWER_FALSE_REVIEW_REPAIR.bodyEvidence.acceptedBodySha256,
      currentBodySha256: FMANZ_TOWER_FALSE_REVIEW_REPAIR.bodyEvidence.currentBodySha256,
      normalizedBodySha256: FMANZ_TOWER_FALSE_REVIEW_REPAIR.bodyEvidence.normalizedBodySha256,
    },
    snapshots: {
      rawRowSha256: rawBefore.row_sha256,
      globalTrustedIdentities: identitiesBefore,
      nonTargetReviewRows: nonTargetReviewsBefore,
      amountOverrides: overridesBefore,
      registryRows: registryBefore,
      aliasRows: aliasesBefore,
    },
    concurrentRefresh,
  };

  if (reviewRows.length === 0) {
    verifyFmanzTowerProjection(projectionBefore, "cleared");
    return { ...base, state: "already-cleared-noop", proposedAction: "none", safety: "no database rows changed" };
  }
  if (reviewRows.length !== 1) throw new Error(`Expected zero or one Tower review marker; found ${reviewRows.length}.`);
  verifyFmanzTowerRequiredReview(reviewRows[0]!);
  verifyFmanzTowerProjection(projectionBefore, "current");

  const preview = {
    ...base,
    state: "exact-false-positive-held",
    reviewRow: reviewRows[0],
    currentProjection: summarizeProjection(projectionBefore),
    proposedAction: "delete only the exact generic required-review marker; preserve raw case, native and converted amount, URL override, registry, aliases, and every public identity",
  };
  if (mode === "dry-run") return { ...preview, safety: "read-only preflight; no rows changed" };

  const deletion = await tx.unsafe<Array<{ source_row_id: string }>>(
    `DELETE FROM public.regulatory_case_amount_reviews
      WHERE source_row_id = $1
        AND review_status = $2
        AND reason = $3
        AND evidence_url = $4
        AND to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = $5::text
        AND to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = $6::text
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
      RETURNING source_row_id`,
    [
      reviewRows[0]!.source_row_id,
      reviewRows[0]!.review_status,
      reviewRows[0]!.reason,
      reviewRows[0]!.evidence_url,
      reviewRows[0]!.detected_at,
      reviewRows[0]!.updated_at,
    ],
  );
  if (deletion.length !== 1 || deletion[0]?.source_row_id !== target.sourceRowId) {
    throw new Error("Exact Tower false-positive review marker did not delete once; refusing to continue.");
  }
  await tx.unsafe("SELECT public.refresh_all_fines()");

  const rawAfter = await readRawTarget(tx);
  if (rawAfter.row_sha256 !== rawBefore.row_sha256) throw new Error("Tower raw source row changed; transaction must roll back.");
  const reviewAfter = await readTargetReview(tx);
  if (reviewAfter.length !== 0) throw new Error("Tower review marker remains after the scoped clear; transaction must roll back.");
  const projectionAfter = await readTargetProjection(tx);
  verifyFmanzTowerProjection(projectionAfter, "cleared");

  const identitiesAfter = await readGlobalIdentityDigest(tx);
  if (identitiesAfter.count !== identitiesBefore.count || identitiesAfter.sha256 !== identitiesBefore.sha256) {
    throw new Error("A public case identity changed during the Tower trusted-amount repair; transaction must roll back.");
  }
  for (const [label, before, after] of [
    ["non-target amount-review rows", nonTargetReviewsBefore, await readNonTargetTableDigest(tx, "regulatory_case_amount_reviews")],
    ["amount overrides", overridesBefore, await readNonTargetTableDigest(tx, "regulatory_amount_overrides")],
    ["case registry rows", registryBefore, await readNonTargetTableDigest(tx, "regulatory_case_registry")],
    ["case alias rows", aliasesBefore, await readNonTargetTableDigest(tx, "regulatory_case_aliases")],
  ] as const) {
    if (before.count !== after.count || before.sha256 !== after.sha256) {
      throw new Error(`${label} changed during the Tower repair; transaction must roll back.`);
    }
  }

  const result: Record<string, unknown> = {
    ...preview,
    state: "cleared-in-transaction",
    postchecks: {
      passed: true,
      rawRowSha256Unchanged: rawAfter.row_sha256,
      reviewMarkerCount: reviewAfter.length,
      projection: summarizeProjection(projectionAfter),
      globalTrustedIdentitiesUnchanged: identitiesAfter,
      nonTargetReviewRowsUnchanged: nonTargetReviewsBefore,
      amountOverridesUnchanged: overridesBefore,
      registryRowsUnchanged: registryBefore,
      aliasRowsUnchanged: aliasesBefore,
      snapshotSha256: sha256Json({ identitiesBefore, nonTargetReviewsBefore, overridesBefore, registryBefore, aliasesBefore, rawSha256: rawBefore.row_sha256 }),
    },
  };
  if (mode === "rehearse") throw new FmanzTowerRepairRehearsalRollback(result);
  return result;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  const rehearse = process.argv.includes("--rehearse");
  const unknown = process.argv.slice(2).filter((argument) => !["--apply", "--dry-run", "--rehearse"].includes(argument));
  if (unknown.length || [apply, dryRun, rehearse].filter(Boolean).length > 1) {
    throw new Error("Usage: repairFmanzTowerFalseReview.ts [--dry-run | --rehearse | --apply]");
  }
  const mode = apply ? "apply" : rehearse ? "rehearse" : "dry-run";
  validateFmanzTowerFalseReviewRepair(FMANZ_TOWER_FALSE_REVIEW_REPAIR);
  if (mode !== "dry-run") {
    if (process.env.FMANZ_TOWER_FALSE_REVIEW_APPROVED !== "true") {
      throw new Error("Refusing Tower review deletion or rehearsal without FMANZ_TOWER_FALSE_REVIEW_APPROVED=true after independent review.");
    }
    if (process.env.FMANZ_TOWER_FALSE_REVIEW_TARGET !== FMANZ_TOWER_FALSE_REVIEW_TARGET) {
      throw new Error(`Refusing Tower review deletion without exact target ${FMANZ_TOWER_FALSE_REVIEW_TARGET}.`);
    }
  }
  const dbTarget = mode === "dry-run"
    ? describeDbTarget()
    : requireExpectedDbTarget("fmanz-tower-false-review-repair");
  const connection = resolveConnectionString();
  if (!connection) throw new Error("Database connection required for Tower amount-quality preflight.");
  const sql = postgres(connection, { max: 1, ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  try {
    let result: Record<string, unknown>;
    if (mode === "rehearse") {
      try {
        result = await sql.begin((tx) => runRepair(mode, tx)) as Record<string, unknown>;
      } catch (error) {
        if (!(error instanceof FmanzTowerRepairRehearsalRollback)) throw error;
        const rollbackReadback = await sql.begin((tx) => runRepair("dry-run", tx)) as Record<string, unknown>;
        if (
          rollbackReadback.state !== "exact-false-positive-held"
          || sha256Json(rollbackReadback.snapshots) !== sha256Json(error.summary.snapshots)
        ) {
          throw new Error("Tower review repair rehearsal did not restore the exact pre-change hold state after rollback.");
        }
        result = { ...error.summary, mode: "rehearsal-rolled-back", rollbackReadback };
      }
    } else {
      result = await sql.begin((tx) => runRepair(mode, tx)) as Record<string, unknown>;
    }
    console.log(JSON.stringify({
      ...result,
      databaseTarget: dbTarget,
      safety: mode === "dry-run"
        ? "read-only exact-row preflight; no mutation was performed"
        : mode === "rehearse"
          ? "scoped delete, concurrent refresh, and postchecks ran inside one transaction; deliberate rollback and exact pre-state readback passed"
        : result.state === "already-cleared-noop"
          ? "exact desired state already present; no mutation was performed"
          : "only the exact unreviewed generic false-positive marker was deleted; all raw amounts and global identities were verified before commit",
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Tower false-review repair failed.");
    process.exitCode = 1;
  });
}
