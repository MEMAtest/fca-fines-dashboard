import "dotenv/config";
import { writeFileSync } from "node:fs";
import { LIVE_REGULATOR_NAV_ITEMS } from "../../src/data/regulatorCoverage.js";
import {
  createSqlClient,
  requireDatabaseUrl,
} from "../scraper/lib/euFineHelpers.js";

interface FreshnessRow {
  regulator: string;
  latestRecord: string | null;
  daysSinceLatest: number | null;
  totalRecords: number;
  recordsLast90Days: number;
  recordsLast12mPerMonth: number;
}

interface FlaggedRegulator extends FreshnessRow {
  reason: string;
  thresholdDays: number;
}

const ACTIVE_AVG_THRESHOLD = 1.5;
const STALE_DAYS_FOR_ACTIVE = 30;
const STALE_DAYS_FOR_SPARSE = 90;
const ALERT_FILE = process.env.DATA_FRESHNESS_ALERT_FILE ?? "/tmp/data-freshness-alert.json";

async function loadFreshness(): Promise<FreshnessRow[]> {
  const sql = createSqlClient();
  try {
    const rows = await sql<FreshnessRow[]>`
      SELECT
        regulator,
        MAX(date_issued)::text AS "latestRecord",
        (CURRENT_DATE - MAX(date_issued))::int AS "daysSinceLatest",
        COUNT(*)::int AS "totalRecords",
        COUNT(*) FILTER (WHERE date_issued >= CURRENT_DATE - INTERVAL '90 days')::int AS "recordsLast90Days",
        ROUND(
          (COUNT(*) FILTER (WHERE date_issued >= CURRENT_DATE - INTERVAL '12 months'))::numeric / 12,
          2
        )::float8 AS "recordsLast12mPerMonth"
      FROM all_regulatory_fines
      GROUP BY regulator
    `;
    return rows;
  } finally {
    await sql.end();
  }
}

function evaluate(rows: FreshnessRow[]): FlaggedRegulator[] {
  const liveCodes = new Set(
    LIVE_REGULATOR_NAV_ITEMS.map((coverage) => coverage.code.toUpperCase()),
  );

  const flagged: FlaggedRegulator[] = [];
  for (const row of rows) {
    const regUpper = row.regulator.toUpperCase();
    if (!liveCodes.has(regUpper)) continue;
    if (row.daysSinceLatest === null) continue;

    const isActive = row.recordsLast12mPerMonth >= ACTIVE_AVG_THRESHOLD;
    const thresholdDays = isActive ? STALE_DAYS_FOR_ACTIVE : STALE_DAYS_FOR_SPARSE;
    if (row.daysSinceLatest <= thresholdDays) continue;

    const reason = isActive
      ? `${row.regulator} historically averages ${row.recordsLast12mPerMonth}/month but no records in ${row.daysSinceLatest} days (latest ${row.latestRecord})`
      : `${row.regulator} has not received a record in ${row.daysSinceLatest} days (latest ${row.latestRecord}, sparse regulator)`;

    flagged.push({ ...row, reason, thresholdDays });
  }

  flagged.sort((a, b) => (b.daysSinceLatest ?? 0) - (a.daysSinceLatest ?? 0));
  return flagged;
}

async function main() {
  requireDatabaseUrl();
  const rows = await loadFreshness();
  const flagged = evaluate(rows);

  const report = {
    generatedAt: new Date().toISOString(),
    totalRegulatorsChecked: rows.length,
    liveRegulatorsConsidered: LIVE_REGULATOR_NAV_ITEMS.length,
    flaggedCount: flagged.length,
    flagged,
  };

  writeFileSync(ALERT_FILE, JSON.stringify(report, null, 2));

  if (flagged.length === 0) {
    console.log(`✅ Data freshness OK: ${rows.length} regulators checked, none stale.`);
    return;
  }

  console.warn(
    `⚠️ Data freshness alert: ${flagged.length} live regulator(s) past threshold.`,
  );
  for (const item of flagged) {
    console.warn(`  • ${item.reason}`);
  }
  console.warn(`Wrote alert detail to ${ALERT_FILE}`);
}

main().catch((err) => {
  console.error("Data freshness audit failed:", err);
  process.exit(1);
});
