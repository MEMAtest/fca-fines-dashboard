#!/usr/bin/env npx tsx
/**
 * Record a dated snapshot of every country's composite risk score into
 * src/data/scoreSnapshots.json (idempotent per date). This starts the forward
 * history that a future score-trend chart will read — there is no back-data, so
 * a real trend only accrues from the first run onward.
 *
 * Run on each data refresh (WGI/CPI/FATF/sanctions update) or on a weekly cron:
 *   npx tsx scripts/snapshot-scores.ts
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pageCountries } from "../src/data/countryView.js";
import { computeCountryRiskScore } from "../src/data/countryRiskScore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "data", "scoreSnapshots.json");
const date =
  process.argv.find((a) => a.startsWith("--date="))?.split("=")[1] ??
  new Date().toISOString().slice(0, 10);

export interface Snapshot {
  date: string;
  scores: Record<string, number>;
}

export function upsertSnapshot(
  snapshots: Snapshot[],
  date: string,
  scores: Record<string, number>,
) {
  return [
    ...snapshots.filter((snapshot) => snapshot.date !== date),
    { date, scores },
  ].sort((left, right) => left.date.localeCompare(right.date));
}

function main() {
  const scores: Record<string, number> = {};
  for (const c of pageCountries()) {
    const result = computeCountryRiskScore(c.iso2);
    if (result.hasGovernance) scores[c.iso2] = result.score;
  }

  let snapshots: Snapshot[] = [];
  if (existsSync(OUT)) {
    try {
      snapshots = JSON.parse(readFileSync(OUT, "utf8")) as Snapshot[];
    } catch {
      snapshots = [];
    }
  }
  snapshots = upsertSnapshot(snapshots, date, scores);
  writeFileSync(OUT, JSON.stringify(snapshots));
  console.log(
    `Recorded snapshot ${date}: ${Object.keys(scores).length} countries. Total snapshots: ${snapshots.length}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
