import fs from "node:fs";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import {
  assertCmfLegacyFixtureApplyApproval,
  CMF_LEGACY_FIXTURE_SOURCE_URL,
  CMF_LEGACY_FIXTURE_TARGET,
  validateCmfLegacyFixtureManifest,
  verifyCmfLegacyFixtureRows,
  type CmfLegacyFixture,
  type CmfStoredFixtureRow,
} from "./cmfLegacyFixtureSuppressionHelpers.js";

const manifestUrl = new URL("../scraper/data/cmfLegacyFixtureSuppressions.json", import.meta.url);
export const CMF_LEGACY_FIXTURE_MANIFEST = JSON.parse(fs.readFileSync(fileURLToPath(manifestUrl), "utf8")) as CmfLegacyFixture[];
validateCmfLegacyFixtureManifest(CMF_LEGACY_FIXTURE_MANIFEST);

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length || (apply && dryRun)) throw new Error("Usage: reconcileCmfLegacyTestFixtures.ts [--dry-run | --apply]");
  if (apply) assertCmfLegacyFixtureApplyApproval(
    process.env.CMF_LEGACY_FIXTURE_SUPPRESSIONS_APPROVED,
    process.env.CMF_LEGACY_FIXTURE_SUPPRESSION_TARGET,
  );

  if (!apply && !dryRun) process.argv.push("--dry-run");
  requireExpectedDbTarget("cmf-legacy-test-fixture-suppressions");
  const connection = resolveConnectionString();
  if (!connection) throw new Error("Database connection required for CMF fixture suppression preflight.");
  const sql = postgres(connection, { max: 1, ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  try {
    if (!apply) await sql.unsafe("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const ids = CMF_LEGACY_FIXTURE_MANIFEST.map((item) => item.id);
    const rows = await sql.unsafe<CmfStoredFixtureRow[]>(
      `SELECT id::text, regulator, firm_individual, to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
              amount, currency, final_notice_url, source_url
         FROM public.eu_fines WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    verifyCmfLegacyFixtureRows(rows, CMF_LEGACY_FIXTURE_MANIFEST);
    const schema = await sql`
      SELECT to_regclass('public.regulatory_case_suppressions') IS NOT NULL AS table_ready,
             pg_get_viewdef('public.all_regulatory_fines_trusted'::regclass, true) LIKE '%regulatory_case_suppressions%' AS trusted_view_guarded
    `;
    if ((apply || schema[0]?.table_ready) && (!schema[0]?.table_ready || !schema[0]?.trusted_view_guarded)) {
      throw new Error("CMF fixture suppressions require the suppression table and trusted-view filter; no rows changed.");
    }
    const existing = schema[0]?.table_ready
      ? await sql.unsafe<Array<{ source_row_id: string; regulator: string; reason: string }>>(
        `SELECT source_row_id, regulator, reason FROM public.regulatory_case_suppressions WHERE source_row_id = ANY($1::text[])`,
        [ids],
      )
      : [];
    const existingById = new Map(existing.map((row) => [row.source_row_id, row]));
    for (const item of CMF_LEGACY_FIXTURE_MANIFEST) {
      const row = existingById.get(item.id);
      if (row && (row.regulator.toUpperCase() !== "CMF" || row.reason !== item.reason)) {
        throw new Error(`Existing suppression for ${item.id} does not match the reviewed CMF reason; refusing to proceed.`);
      }
    }
    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      evidence: "The exact three rows originated in scrapeCmf.ts getTestData() at a6e1113; the current official-source loader does not emit these records.",
      candidateCount: CMF_LEGACY_FIXTURE_MANIFEST.length,
      verifiedStoredRows: rows.length,
      existingSuppressions: existing.length,
      target: CMF_LEGACY_FIXTURE_TARGET,
      sourceUrl: CMF_LEGACY_FIXTURE_SOURCE_URL,
      manifest: CMF_LEGACY_FIXTURE_MANIFEST,
      trustedViewGuarded: schema[0]?.trusted_view_guarded ?? false,
      rawRows: "preserved; this correction inserts suppression-view rows only",
    }, null, 2));
    if (!apply) return;

    await sql.begin(async (tx) => {
      for (const item of CMF_LEGACY_FIXTURE_MANIFEST) {
        await tx.unsafe(
          `INSERT INTO public.regulatory_case_suppressions (source_row_id, regulator, reason, replacement_source_row_id)
           VALUES ($1, 'CMF', $2, NULL) ON CONFLICT (source_row_id) DO NOTHING`,
          [item.id, item.reason],
        );
      }
      const persisted = await tx.unsafe<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM public.regulatory_case_suppressions WHERE source_row_id = ANY($1::text[]) AND regulator = 'CMF'`,
        [ids],
      );
      if (persisted[0]?.count !== CMF_LEGACY_FIXTURE_MANIFEST.length) throw new Error("CMF fixture suppression postcondition failed; transaction rolled back.");
    });
    console.log(JSON.stringify({ postcondition: "all exact CMF fixture suppressions persisted; source rows retained", count: CMF_LEGACY_FIXTURE_MANIFEST.length }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "CMF fixture suppression reconciliation failed.");
    process.exitCode = 1;
  });
}
