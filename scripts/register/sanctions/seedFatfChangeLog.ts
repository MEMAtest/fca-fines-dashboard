/**
 * Seeds register_change_log with FATF plenary history that is already
 * sourced and dated in src/data/fatfStatus.ts (FATF_CHANGE_LOG), citing the
 * official plenary/increased-monitoring outcome pages referenced there.
 * Idempotent: skips any (iso2, event_date, summary) combination already
 * present. Run manually (`npx tsx scripts/register/sanctions/seedFatfChangeLog.ts`)
 * or wired into the sanctions lane of the assurance workflow.
 */
import { FATF_CHANGE_LOG, FATF_SOURCE_URL, type FatfChange } from "../../../src/data/fatfStatus.js";
import { getSqlClient } from "../../../server/db.js";
import { recordRun } from "./registerStaleness.js";

// Plenary outcome page per cycle, as cited in the fatfStatus.ts comment block above
// FATF_CHANGE_LOG. Falls back to the general black/grey-list page if a cycle isn't
// individually cited (never omitted — always a working FATF source URL).
const PLENARY_SOURCE_BY_DATE: Record<string, string> = {
  "2026-06-19":
    "https://www.fatf-gafi.org/en/publications/Fatfgeneral/outcomes-fatf-plenary-june-2026.html",
  "2026-02-13":
    "https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/increased-monitoring-february-2026.html",
  "2025-10-24":
    "https://www.fatf-gafi.org/en/publications/Fatfgeneral/outcomes-FATF-plenary-october-2025.html",
};

function summarise(change: FatfChange): string {
  const listLabel = change.listing === "call-for-action" ? "black list" : "grey list";
  const verb = change.change === "added" ? "Added to" : "Removed from";
  return `FATF: ${verb} the ${listLabel} (${change.iso2}) at the ${change.date} plenary`;
}

export function buildFatfChangeLogRows() {
  return FATF_CHANGE_LOG.map((change) => ({
    iso2: change.iso2,
    category: "fatf" as const,
    eventDate: change.date,
    summary: summarise(change),
    sourceUrl: PLENARY_SOURCE_BY_DATE[change.date] ?? FATF_SOURCE_URL,
  }));
}

async function main() {
  const rows = buildFatfChangeLogRows();
  const sql = getSqlClient();
  let inserted = 0;
  for (const row of rows) {
    const existing = await sql(
      `SELECT 1 FROM register_change_log WHERE iso2 = $1 AND event_date = $2 AND summary = $3 LIMIT 1`,
      [row.iso2, row.eventDate, row.summary],
    );
    if (existing.length > 0) continue;
    await sql(
      `INSERT INTO register_change_log (iso2, category, event_date, summary, source_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.iso2, row.category, row.eventDate, row.summary, row.sourceUrl],
    );
    inserted += 1;
  }
  console.log(`FATF change-log seed: ${inserted} new row(s) inserted (of ${rows.length} total events).`);
  // Record the check regardless of whether anything new was found — a quiet
  // plenary cycle is a successful check, not a stale one.
  await recordRun("fatf", "success");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error) => {
    console.error(error);
    try {
      await recordRun("fatf", "error", error instanceof Error ? error.message : String(error));
    } catch {
      // DB unreachable too; the exit code below still signals failure.
    }
    process.exitCode = 1;
  });
}
