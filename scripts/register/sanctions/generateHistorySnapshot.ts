/**
 * Generates src/data/registerHistorySnapshot.ts — a committed snapshot of the
 * last 5 change-log events per country, for prerendering the Sanctions & FATF
 * tab without a DB round-trip. Run after seedFatfChangeLog.ts / a sanctions
 * run so the snapshot reflects the DB; for now (no sanctions runs yet) it is
 * built directly from the sourced FATF_CHANGE_LOG so prerender has honest
 * content on day one. Drift is caught by generateHistorySnapshot.test.ts.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFatfChangeLogRows } from "./seedFatfChangeLog.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(here, "..", "..", "..", "src", "data", "registerHistorySnapshot.ts");

export interface RegisterHistorySnapshotEvent {
  iso2: string;
  category: string;
  eventDate: string;
  summary: string;
  sourceUrl: string;
}

export function buildSnapshot(): Record<string, RegisterHistorySnapshotEvent[]> {
  const rows = buildFatfChangeLogRows();
  const byIso2 = new Map<string, RegisterHistorySnapshotEvent[]>();
  for (const row of rows) {
    const list = byIso2.get(row.iso2) ?? [];
    list.push(row);
    byIso2.set(row.iso2, list);
  }
  const result: Record<string, RegisterHistorySnapshotEvent[]> = {};
  for (const [iso2, events] of byIso2) {
    result[iso2] = events
      .slice()
      .sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1))
      .slice(0, 5);
  }
  return result;
}

export function renderSnapshotFile(snapshot: Record<string, RegisterHistorySnapshotEvent[]>): string {
  return `/**
 * GENERATED FILE — do not hand-edit.
 * Produced by scripts/register/sanctions/generateHistorySnapshot.ts
 * Last 5 register_change_log-shaped events per country (currently sourced
 * from the verified FATF_CHANGE_LOG; sanctions-regime deltas are added once
 * the daily GitHub Actions sanctions lane has produced its first snapshot).
 * registerHistorySnapshot.test.ts fails the build if this drifts from source.
 */

export interface RegisterHistorySnapshotEvent {
  iso2: string;
  category: string;
  eventDate: string;
  summary: string;
  sourceUrl: string;
}

export const REGISTER_HISTORY_SNAPSHOT: Record<string, RegisterHistorySnapshotEvent[]> =
${JSON.stringify(snapshot, null, 2)};
`;
}

function main() {
  const snapshot = buildSnapshot();
  writeFileSync(OUTPUT_PATH, renderSnapshotFile(snapshot));
  console.log(`Wrote ${Object.keys(snapshot).length} countries' history snapshot to ${OUTPUT_PATH}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
