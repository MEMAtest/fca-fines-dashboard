/**
 * Generates src/data/registerSanctionsChangeLog.ts — a committed, flat list
 * of sanctions-regime change-log events (category = 'sanctions' only) for
 * /countries/changes, changes.xml and the weekly digest to merge in.
 *
 * Deliberately excludes category = 'fatf': countryChanges.ts already derives
 * FATF events from FATF_CHANGE_LOG (the same ultimate source seedFatfChangeLog.ts
 * writes to register_change_log), so including 'fatf' rows here would double
 * the FATF events on the page/digest. This is the de-duplication mechanism —
 * by construction, not by fuzzy matching.
 *
 * Reads register_change_log via the DB when DATABASE_URL is set; otherwise
 * (no DB configured, e.g. in a sandboxed CI/build context) emits an empty
 * list rather than fabricating sanctions events. Run this after
 * runSanctionsIngest.ts in the daily workflow so the committed file reflects
 * the live table.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toIsoDateString } from "./pgDate.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(here, "..", "..", "..", "src", "data", "registerSanctionsChangeLog.ts");

export interface RegisterSanctionsChangeEvent {
  iso2: string;
  eventDate: string;
  summary: string;
  sourceUrl: string;
}

export async function fetchSanctionsChangeEvents(): Promise<RegisterSanctionsChangeEvent[]> {
  if (!process.env.DATABASE_URL?.trim() && !process.env.REGACTIONS_DATABASE_URL?.trim()) {
    return [];
  }
  try {
    const { getSqlClient } = await import("../../../server/db.js");
    const sql = getSqlClient();
    const rows = await sql(
      `SELECT iso2, event_date, summary, source_url FROM register_change_log
       WHERE category = 'sanctions' ORDER BY event_date DESC, id DESC`,
    );
    return rows.map((row: Record<string, unknown>) => ({
      iso2: String(row.iso2),
      eventDate: toIsoDateString(row.event_date),
      summary: String(row.summary),
      sourceUrl: String(row.source_url),
    }));
  } catch (error) {
    console.warn(
      "register_change_log unavailable while generating the sanctions change-log snapshot:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export function renderSanctionsChangeLogFile(events: RegisterSanctionsChangeEvent[]): string {
  return `/**
 * GENERATED FILE — do not hand-edit.
 * Produced by scripts/register/sanctions/generateSanctionsChangeLog.ts
 * Flat list of register_change_log rows with category = 'sanctions' (FATF
 * rows are intentionally excluded here — see that script's module comment
 * for why). Empty until the daily sanctions ingest lane has written its
 * first diff.
 */

export interface RegisterSanctionsChangeEvent {
  iso2: string;
  eventDate: string;
  summary: string;
  sourceUrl: string;
}

export const REGISTER_SANCTIONS_CHANGE_LOG: RegisterSanctionsChangeEvent[] =
${JSON.stringify(events, null, 2)};
`;
}

async function main() {
  const events = await fetchSanctionsChangeEvents();
  writeFileSync(OUTPUT_PATH, renderSanctionsChangeLogFile(events));
  console.log(`Wrote ${events.length} sanctions change-log event(s) to ${OUTPUT_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
