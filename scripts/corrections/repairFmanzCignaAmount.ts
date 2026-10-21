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
  assertCignaProjectionPreserved,
  exactDecimalEqual,
  fmanzOverrideBaselineSelect,
  sha256StableJson,
  snapshotKeyedProjection,
  targetCignaOverrideSelect,
  updateCignaOverrideAndRefresh,
  validateFmanzCignaAmountManifest,
  verifyCignaOverrideState,
  verifyCignaTargetRawRow,
  verifyPinnedFmanzCignaArtifacts,
  type CignaOverrideRow,
  type FmanzCignaAmountManifest,
} from "./fmanzCignaAmountRepairHelpers.js";

export const FMANZ_CIGNA_AMOUNT_REPAIR_TARGET = "reviewed-fmanz-cigna-amount-correction-v1";
const manifestUrl = new URL("../scraper/data/fmanzCignaAmountCorrection20261021.json", import.meta.url);
export const FMANZ_CIGNA_AMOUNT_REPAIR = JSON.parse(
  fs.readFileSync(fileURLToPath(manifestUrl), "utf8"),
) as FmanzCignaAmountManifest;

export type SqlLike = { unsafe: <T extends any[] = any[]>(query: string, values?: any[]) => PromiseLike<T> };

async function tableDigest(tx: SqlLike, table: "regulatory_case_amount_reviews" | "regulatory_case_registry" | "regulatory_case_aliases") {
  const rows = await tx.unsafe<Array<{ count: number; sha256: string }>>(
    `SELECT count(*)::int AS count,
            encode(sha256(convert_to(coalesce(string_agg(to_jsonb(row_value)::text, E'\\n' ORDER BY to_jsonb(row_value)::text), ''), 'UTF8')), 'hex') AS sha256
       FROM public.${table} AS row_value`,
  );
  if (rows.length !== 1 || !rows[0]?.sha256) throw new Error(`Could not snapshot public.${table}.`);
  return { count: rows[0].count, sha256: rows[0].sha256 };
}

async function readRawCorpus(tx: SqlLike) {
  return tx.unsafe<Array<Record<string, unknown>>>(
    `SELECT id::text AS id, content_hash, firm_individual, date_issued::text AS date_issued,
            source_url, final_notice_url, amount::text AS amount, amount_gbp::text AS amount_gbp,
            currency,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
            raw_payload
       FROM public.eu_fines WHERE regulator = 'FMANZ' ORDER BY id`,
  );
}

async function readPublicFmanzRows(tx: SqlLike) {
  return tx.unsafe<Array<Record<string, unknown>>>(
    `SELECT id::text AS id, public_case_id, canonical_case_id, firm_individual,
            to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
            amount_original::text AS amount_original, amount_gbp::text AS amount_gbp,
            currency, amount_quality, notice_url, source_url
       FROM public.all_regulatory_fines_trusted WHERE upper(regulator) = 'FMANZ'
      ORDER BY public_case_id`,
  );
}

export async function readAllOverrideBaselineRows(tx: SqlLike) {
  return tx.unsafe<Array<Record<string, unknown>>>(
    fmanzOverrideBaselineSelect,
  );
}

async function readAllOverrides(tx: SqlLike) {
  return tx.unsafe<Array<{ row: Record<string, unknown> }>>(
    `SELECT to_jsonb(override_row) AS row FROM public.regulatory_amount_overrides AS override_row
      ORDER BY regulator, evidence_url`,
  );
}

export async function readTargetOverride(tx: SqlLike) {
  const select = targetCignaOverrideSelect(FMANZ_CIGNA_AMOUNT_REPAIR);
  return tx.unsafe<CignaOverrideRow[]>(
    select.query,
    select.values,
  );
}

async function readAllProjectionKeys(tx: SqlLike) {
  return tx.unsafe<Array<{ regulator: string; source_row_id: string; public_case_id: string; row_hash: string }>>(
    `SELECT regulator, id::text AS source_row_id, public_case_id,
            encode(sha256(convert_to(to_jsonb(fines)::text, 'UTF8')), 'hex') AS row_hash
       FROM public.all_regulatory_fines_trusted AS fines
      ORDER BY regulator, public_case_id, id`,
  );
}

async function readTargetProjection(tx: SqlLike) {
  return tx.unsafe<Array<Record<string, unknown>>>(
    `SELECT to_jsonb(fines) AS row
       FROM public.all_regulatory_fines_trusted AS fines
      WHERE upper(regulator) = 'FMANZ' AND id::text = $1::text AND public_case_id = $2`,
    [FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.rawId, FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.publicCaseId],
  );
}

async function readRawTarget(tx: SqlLike) {
  const rows = await tx.unsafe<Array<Record<string, unknown>>>(
    `SELECT id::text AS id, content_hash, regulator, firm_individual,
            to_char(date_issued, 'YYYY-MM-DD') AS date_issued, source_url, final_notice_url,
            amount::text AS amount, currency
       FROM public.eu_fines WHERE id = $1::uuid`,
    [FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.rawId],
  );
  if (rows.length !== 1) throw new Error(`Expected one exact Cigna raw row, found ${rows.length}.`);
  verifyCignaTargetRawRow(rows[0], FMANZ_CIGNA_AMOUNT_REPAIR);
}

function assertTargetPublicRow(row: Record<string, unknown> | undefined, expectedState: "old" | "new") {
  if (!row) throw new Error("Cigna trusted public target row is missing.");
  const target = FMANZ_CIGNA_AMOUNT_REPAIR.targetRow;
  const expected = expectedState === "old"
    ? FMANZ_CIGNA_AMOUNT_REPAIR.expectedOldOverride
    : FMANZ_CIGNA_AMOUNT_REPAIR.expectedOverride;
  const expectedCanonicalId = expectedState === "old"
    ? target.canonicalCaseId
    : FMANZ_CIGNA_AMOUNT_REPAIR.expectedNewCanonicalCaseId;
  const mismatched: string[] = [];
  const check = (field: string, matches: boolean) => { if (!matches) mismatched.push(field); };
  check("id", String(row.id) === target.rawId);
  check("regulator", row.regulator === "FMANZ");
  check("public_case_id", row.public_case_id === target.publicCaseId);
  check("canonical_case_id", row.canonical_case_id === expectedCanonicalId);
  check("firm_individual", row.firm_individual === target.firm);
  check("date_issued", String(row.date_issued).slice(0, 10) === target.date);
  check("amount_original", exactDecimalEqual(row.amount_original, expected.amountOriginal));
  check("amount_gbp", exactDecimalEqual(row.amount_gbp, expected.amountGbp));
  check("amount_eur", exactDecimalEqual(row.amount_eur, expected.amountEur));
  check("trusted_amount_gbp", exactDecimalEqual(row.trusted_amount_gbp, expected.amountGbp));
  check("trusted_amount_eur", exactDecimalEqual(row.trusted_amount_eur, expected.amountEur));
  check("currency", row.currency === expected.currency);
  check("amount_quality", row.amount_quality === expected.qualityStatus);
  check("amount_verification_url", row.amount_verification_url === expected.verificationUrl);
  check("amount_override_reason", row.amount_override_reason === expected.reason);
  if (mismatched.length) {
    throw new Error(`Cigna public projection differs from exact ${expectedState} state in: ${mismatched.join(", ")}.`);
  }
}

function assertNonTargetOverridesPreserved(before: Array<{ row: Record<string, unknown> }>, after: Array<{ row: Record<string, unknown> }>) {
  const targetEvidenceUrl = FMANZ_CIGNA_AMOUNT_REPAIR.expectedOldOverride.evidenceUrl;
  const target = (item: { row: Record<string, unknown> }) => item.row.regulator === "FMANZ" && String(item.row.evidence_url) === targetEvidenceUrl;
  const oldRows = before.filter((item) => !target(item)).map((item) => item.row);
  const newRows = after.filter((item) => !target(item)).map((item) => item.row);
  if (sha256StableJson(oldRows) !== sha256StableJson(newRows)) {
    throw new Error("A non-target amount override changed during the Cigna repair.");
  }
}

async function runRepair(mode: "dry-run" | "apply" | "rehearse", tx: SqlLike) {
  await tx.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  if (mode === "dry-run") await tx.unsafe("SET TRANSACTION READ ONLY");
  await tx.unsafe("SET LOCAL lock_timeout='30s'");
  await tx.unsafe("SET LOCAL statement_timeout='180s'");
  if (mode !== "dry-run") {
    await tx.unsafe("SELECT pg_advisory_xact_lock(72140331)");
    await tx.unsafe("LOCK TABLE public.regulatory_amount_overrides IN SHARE ROW EXCLUSIVE MODE");
    await tx.unsafe("LOCK TABLE public.eu_fines IN SHARE MODE");
    await tx.unsafe("LOCK TABLE public.regulatory_case_amount_reviews IN SHARE MODE");
    await tx.unsafe("LOCK TABLE public.regulatory_case_registry IN SHARE MODE");
    await tx.unsafe("LOCK TABLE public.regulatory_case_aliases IN SHARE MODE");
  }

  const rawBefore = await readRawCorpus(tx);
  const baseline = FMANZ_CIGNA_AMOUNT_REPAIR.pins.baseline;
  if (rawBefore.length !== baseline.rawRows || sha256StableJson(rawBefore) !== baseline.rawRowsSha256) {
    throw new Error("Live 408-row FMANZ raw corpus does not match the reviewed baseline; refusing Cigna repair.");
  }
  const fmanzPublicBefore = await readPublicFmanzRows(tx);
  if (fmanzPublicBefore.length !== baseline.publicRows) throw new Error("Live FMANZ public row count differs from the 96-row baseline.");
  const idsHash = createHash("sha256").update(fmanzPublicBefore.map((row) => String(row.public_case_id)).sort().join("\n")).digest("hex");
  if (idsHash !== baseline.publicIdsSha256) throw new Error("Live FMANZ public IDs differ from their pinned baseline.");
  const overrideRowsBaseline = await readAllOverrideBaselineRows(tx);
  if (overrideRowsBaseline.length !== baseline.overrideRows) throw new Error("Live FMANZ amount override count differs from the 134-row baseline.");
  const nonTargetBaselineOverrides = overrideRowsBaseline.filter((row) =>
    !(row.regulator === "FMANZ" && String(row.evidence_url).replace(/\/+$/, "") === FMANZ_CIGNA_AMOUNT_REPAIR.expectedOldOverride.evidenceUrl.replace(/\/+$/, "")),
  );
  if (sha256StableJson(nonTargetBaselineOverrides) !== baseline.nonTargetOverridesSha256) {
    throw new Error("Live non-target override rows differ from the pinned baseline.");
  }

  await readRawTarget(tx);
  const targetOverrideBefore = await readTargetOverride(tx);
  const overrideState = verifyCignaOverrideState(targetOverrideBefore, FMANZ_CIGNA_AMOUNT_REPAIR);
  const expectedPublicRows = JSON.parse(fs.readFileSync(baseline.path, "utf8")).publicRows as Array<Record<string, unknown>>;
  if (overrideState === "old") {
    if (sha256StableJson(fmanzPublicBefore) !== baseline.publicRowsSha256) {
      throw new Error("Live FMANZ public rows do not match the exact pinned pre-correction snapshot.");
    }
  } else {
    const withoutCigna = fmanzPublicBefore.filter((row) => row.public_case_id !== FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.publicCaseId);
    const baselineWithoutCigna = expectedPublicRows.filter((row) => row.public_case_id !== FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.publicCaseId);
    if (sha256StableJson(withoutCigna) !== sha256StableJson(baselineWithoutCigna)) {
      throw new Error("Live non-Cigna FMANZ public rows differ from their pinned baseline after the target is corrected.");
    }
  }

  const globalBeforeRows = await readAllProjectionKeys(tx);
  const globalBefore = snapshotKeyedProjection(globalBeforeRows);
  if (globalBefore.count !== FMANZ_CIGNA_AMOUNT_REPAIR.pins.candidate.beforeGlobalPublicRows) {
    throw new Error(`Global trusted projection count differs from the pinned baseline: ${globalBefore.count}.`);
  }
  const targetKey = JSON.stringify(["FMANZ", FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.rawId, FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.publicCaseId]);
  const targetProjectionBefore = await readTargetProjection(tx);
  if (targetProjectionBefore.length !== 1) throw new Error(`Expected one Cigna pre-refresh projection row, found ${targetProjectionBefore.length}.`);
  assertTargetPublicRow(targetProjectionBefore[0]!.row as Record<string, unknown>, overrideState);
  globalBefore.records.set(targetKey, targetProjectionBefore[0]!.row as Record<string, unknown>);

  const allOverridesBefore = await readAllOverrides(tx);
  const reviewsBefore = await tableDigest(tx, "regulatory_case_amount_reviews");
  const registryBefore = await tableDigest(tx, "regulatory_case_registry");
  const aliasesBefore = await tableDigest(tx, "regulatory_case_aliases");
  const summary: Record<string, unknown> = {
    mode: overrideState === "new" && mode === "apply" ? "already-applied-noop" : mode,
    target: FMANZ_CIGNA_AMOUNT_REPAIR_TARGET,
    sourceUrl: FMANZ_CIGNA_AMOUNT_REPAIR.source.releaseUrl,
    judgmentUrl: FMANZ_CIGNA_AMOUNT_REPAIR.source.judgmentUrl,
    raw: { id: FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.rawId, contentHash: FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.contentHash, rows: rawBefore.length, sha256: sha256StableJson(rawBefore) },
    baseline: { fmanzPublicRows: fmanzPublicBefore.length, globalPublicRows: globalBefore.count, amountOverrides: overrideRowsBaseline.length },
    targetBefore: overrideState,
  };
  if (mode === "dry-run" || overrideState === "new" && mode === "apply") {
    if (mode === "apply") return summary;
    return completeFmanzRepairTransaction("dry-run", summary);
  }

  if (overrideState === "old") {
    await updateCignaOverrideAndRefresh(tx, FMANZ_CIGNA_AMOUNT_REPAIR);
  } else {
    await tx.unsafe("SELECT public.refresh_all_fines()");
  }
  const targetOverrideAfter = await readTargetOverride(tx);
  if (verifyCignaOverrideState(targetOverrideAfter, FMANZ_CIGNA_AMOUNT_REPAIR) !== "new") {
    throw new Error("Cigna amount override failed its exact post-refresh corrected-state check.");
  }
  const rawAfter = await readRawCorpus(tx);
  if (rawAfter.length !== rawBefore.length || sha256StableJson(rawAfter) !== sha256StableJson(rawBefore)) {
    throw new Error("FMANZ raw source rows changed during the Cigna override repair.");
  }
  const publicAfter = await readPublicFmanzRows(tx);
  if (publicAfter.length !== fmanzPublicBefore.length || sha256StableJson(publicAfter.filter((row) => row.public_case_id !== FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.publicCaseId))
    !== sha256StableJson(fmanzPublicBefore.filter((row) => row.public_case_id !== FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.publicCaseId))) {
    throw new Error("FMANZ public IDs/count or a non-Cigna public row changed after the trusted-view refresh.");
  }
  const targetPublicAfter = publicAfter.find((row) => row.public_case_id === FMANZ_CIGNA_AMOUNT_REPAIR.targetRow.publicCaseId);
  if (!targetPublicAfter) throw new Error("Cigna trusted public target row disappeared after the trusted-view refresh.");

  const globalAfterRows = await readAllProjectionKeys(tx);
  const globalAfter = snapshotKeyedProjection(globalAfterRows);
  const targetProjectionAfter = await readTargetProjection(tx);
  if (targetProjectionAfter.length !== 1) throw new Error(`Expected one Cigna post-refresh projection row, found ${targetProjectionAfter.length}.`);
  globalAfter.records.set(targetKey, targetProjectionAfter[0]!.row as Record<string, unknown>);
  assertCignaProjectionPreserved(globalBefore, globalAfter, FMANZ_CIGNA_AMOUNT_REPAIR);

  const allOverridesAfter = await readAllOverrides(tx);
  assertNonTargetOverridesPreserved(allOverridesBefore, allOverridesAfter);
  for (const [table, before] of [
    ["regulatory_case_amount_reviews", reviewsBefore],
    ["regulatory_case_registry", registryBefore],
    ["regulatory_case_aliases", aliasesBefore],
  ] as const) {
    const after = await tableDigest(tx, table);
    if (after.count !== before.count || after.sha256 !== before.sha256) {
      throw new Error(`public.${table} changed during Cigna correction; transaction must roll back.`);
    }
  }
  summary.postchecks = {
    passed: true,
    correction: {
      amountOriginal: FMANZ_CIGNA_AMOUNT_REPAIR.expectedOverride.amountOriginal,
      amountGbp: FMANZ_CIGNA_AMOUNT_REPAIR.expectedOverride.amountGbp,
      amountEur: FMANZ_CIGNA_AMOUNT_REPAIR.expectedOverride.amountEur,
      qualityStatus: FMANZ_CIGNA_AMOUNT_REPAIR.expectedOverride.qualityStatus,
      evidenceUrl: FMANZ_CIGNA_AMOUNT_REPAIR.expectedOverride.evidenceUrl,
      canonicalCaseId: FMANZ_CIGNA_AMOUNT_REPAIR.expectedNewCanonicalCaseId,
    },
    preserved: {
      rawFmanzRows: rawAfter.length,
      fmanzPublicIds: publicAfter.length,
      globalPublicRows: globalAfter.count,
      globalPublicIdentities: "exact keyed set unchanged",
      nonTargetOverrides: "all exact JSON rows unchanged",
      amountReviews: reviewsBefore.count,
      registryRows: registryBefore.count,
      aliasRows: aliasesBefore.count,
    },
  };
  return completeFmanzRepairTransaction(mode, summary);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rehearse = process.argv.includes("--rehearse");
  const dryRun = process.argv.includes("--dry-run");
  const unknown = process.argv.slice(2).filter((arg) => !["--apply", "--rehearse", "--dry-run"].includes(arg));
  if (unknown.length || [apply, rehearse, dryRun].filter(Boolean).length > 1) {
    throw new Error("Usage: repairFmanzCignaAmount.ts [--dry-run | --apply | --rehearse]");
  }
  const mode = apply ? "apply" : rehearse ? "rehearse" : "dry-run";
  if (mode !== "dry-run" && process.env.FMANZ_CIGNA_AMOUNT_REPAIR_APPROVED !== "true") {
    throw new Error("Refusing Cigna write mode without FMANZ_CIGNA_AMOUNT_REPAIR_APPROVED=true after independent review.");
  }
  if (mode !== "dry-run" && process.env.FMANZ_CIGNA_AMOUNT_REPAIR_TARGET !== FMANZ_CIGNA_AMOUNT_REPAIR_TARGET) {
    throw new Error(`Refusing Cigna write mode without exact target ${FMANZ_CIGNA_AMOUNT_REPAIR_TARGET}.`);
  }
  validateFmanzCignaAmountManifest(FMANZ_CIGNA_AMOUNT_REPAIR);
  verifyPinnedFmanzCignaArtifacts(FMANZ_CIGNA_AMOUNT_REPAIR);
  if (!process.env.REGACTIONS_EXPECTED_DB_HOST?.trim() || !process.env.REGACTIONS_EXPECTED_DB_NAME?.trim()) {
    throw new Error("Cigna correction requires both non-empty REGACTIONS_EXPECTED_DB_HOST and REGACTIONS_EXPECTED_DB_NAME pins.");
  }
  requireFmanzRepairDbPins();
  requireExpectedDbTarget("fmanz-cigna-amount-repair");
  const connection = resolveConnectionString();
  if (!connection) throw new Error("Database connection required for Cigna amount repair preflight.");
  const sql = postgres(connection, { max: 1, ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  try {
    const result = await sql.begin((tx) => runRepair(mode, tx)).catch((error) => {
      if (!(error instanceof FmanzRehearsalRollback)) throw error;
      return { ...error.summary, mode: "rehearsal-rolled-back" };
    });
    console.log(JSON.stringify({
      ...result,
      safety: mode === "dry-run"
        ? "read-only preflight; no rows changed"
        : mode === "rehearse"
          ? "exact override, refresh, and all postchecks ran inside one transaction; deliberate rollback verified, no changes committed"
          : "only the exact Cigna override was updated; raw rows, projection identities, reviews, registry, aliases, and non-target overrides were verified",
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "FMANZ Cigna correction failed.");
    process.exitCode = 1;
  });
}
