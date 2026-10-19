import fs from "node:fs";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";

interface FssLegacySuppression {
  id: string;
  date: string;
  title: string;
  evidenceUrl: string;
  reason: string;
}

interface StoredRow {
  id: string;
  regulator: string;
  firm_individual: string;
  date_issued: string;
  amount: string | number | null;
  final_notice_url: string | null;
  source_url: string | null;
}

const KOOKMIN_ID = "0de0c8d0-7a05-460d-bdb9-23baf984daa0";
const manifestPath = new URL("../scraper/data/fssLegacySuppressions.json", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as FssLegacySuppression[];

export function validateFssLegacySuppressionManifest(items: FssLegacySuppression[]): void {
  const ids = items.map((item) => item.id);
  if (items.length !== 39 || new Set(ids).size !== 39) {
    throw new Error(`Expected 39 unique reviewed FSS legacy rows, got ${items.length} rows / ${new Set(ids).size} IDs.`);
  }
  if (ids.includes(KOOKMIN_ID)) throw new Error("Kookmin's verified 2004 enforcement row must never be suppressed.");
  for (const item of items) {
    if (!/^[0-9a-f-]{36}$/i.test(item.id) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)
      || !item.title.trim() || !item.reason.trim() || !/^https:\/\//.test(item.evidenceUrl)) {
      throw new Error(`Malformed FSS legacy suppression entry: ${item.id}`);
    }
  }
}

validateFssLegacySuppressionManifest(manifest);

function verifyRows(rows: StoredRow[], items: FssLegacySuppression[]): void {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const missing = items.filter((item) => !byId.has(item.id)).map((item) => item.id);
  if (missing.length) throw new Error(`FSS suppression preflight missing stored source rows: ${missing.join(", ")}`);
  for (const item of items) {
    const row = byId.get(item.id)!;
    if (row.regulator.toUpperCase() !== "FSS"
      || row.firm_individual !== "Unnamed party (FSS)"
      || row.date_issued !== item.date
      || row.amount !== null
      || ![row.final_notice_url, row.source_url].includes(item.evidenceUrl)) {
      throw new Error(`FSS suppression preflight mismatch for ${item.id}; expected exact FSS source identity, date, unnamed entity, NULL amount and evidence URL.`);
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const revert = process.argv.includes("--revert");
  if (apply && revert) throw new Error("Choose either --apply or --revert, not both.");
  if (apply && process.env.FSS_LEGACY_SUPPRESSIONS_APPROVED !== "true") {
    throw new Error("Refusing suppression apply: set FSS_LEGACY_SUPPRESSIONS_APPROVED=true only after primary-source and independent review approval.");
  }
  if (revert && process.env.FSS_LEGACY_SUPPRESSION_REVERT_APPROVED !== "true") {
    throw new Error("Refusing suppression revert: set FSS_LEGACY_SUPPRESSION_REVERT_APPROVED=true after explicit review approval.");
  }

  requireExpectedDbTarget("fss-legacy-announcement-suppressions");
  const connection = resolveConnectionString();
  if (!connection) throw new Error("Database connection required for FSS suppression preflight.");
  const sql = postgres(connection, { max: 1, ssl: connection.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  try {
    const ids = manifest.map((item) => item.id);
    const rows = await sql.unsafe<StoredRow[]>(
      `SELECT id::text, regulator, firm_individual, to_char(date_issued, 'YYYY-MM-DD') AS date_issued,
              amount, final_notice_url, source_url
         FROM public.eu_fines WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    verifyRows(rows, manifest);
    const migrationReady = await sql`
      SELECT to_regclass('public.regulatory_case_suppressions') IS NOT NULL AS ready,
             pg_get_viewdef('public.all_regulatory_fines_trusted'::regclass, true) LIKE '%regulatory_case_suppressions%' AS trusted_view_guarded
    `;
    if ((apply || revert) && (!migrationReady[0]?.ready || !migrationReady[0]?.trusted_view_guarded)) {
      throw new Error("Reviewed suppression schema/trusted view migration is not present; no rows changed.");
    }
    const existing = await sql.unsafe<Array<{ source_row_id: string; reason: string }>>(
      `SELECT source_row_id, reason FROM public.regulatory_case_suppressions WHERE source_row_id = ANY($1::text[])`,
      [ids],
    ).catch(() => []);
    console.log(JSON.stringify({
      mode: apply ? "apply" : revert ? "revert" : "dry-run",
      evidence: "39 reviewed English/DART announcements do not identify a discrete named respondent and final case-level sanction; 2004 Kookmin enforcement remains outside this manifest.",
      candidateCount: manifest.length,
      verifiedStoredRows: rows.length,
      existingSuppressions: existing.length,
      manifest,
      migrationReady: migrationReady[0],
      writes: "none",
    }, null, 2));
    if (!apply && !revert) return;

    if (apply) {
      await sql.begin(async (tx) => {
        for (const item of manifest) {
          await tx.unsafe(
            `INSERT INTO public.regulatory_case_suppressions (source_row_id, regulator, reason, replacement_source_row_id)
             VALUES ($1, 'FSS', $2, NULL) ON CONFLICT (source_row_id) DO NOTHING`,
            [item.id, item.reason],
          );
        }
        const persisted = await tx.unsafe<Array<{ count: number }>>(
          `SELECT count(*)::int AS count FROM public.regulatory_case_suppressions WHERE source_row_id = ANY($1::text[]) AND regulator = 'FSS'`,
          [ids],
        );
        if (persisted[0]?.count !== manifest.length) throw new Error("Suppression postcondition failed; transaction rolled back.");
      });
    } else {
      await sql.unsafe(`DELETE FROM public.regulatory_case_suppressions WHERE source_row_id = ANY($1::text[]) AND regulator = 'FSS'`, [ids]);
    }
    const remaining = await sql.unsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM public.regulatory_case_suppressions WHERE source_row_id = ANY($1::text[]) AND regulator = 'FSS'`,
      [ids],
    );
    console.log(JSON.stringify({ postcondition: revert ? "removed exact manifest suppressions" : "all manifest suppressions persisted", count: remaining[0]?.count ?? null }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "FSS suppression reconciliation failed.");
    process.exitCode = 1;
  });
}
