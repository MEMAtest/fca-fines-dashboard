import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LIVE_REGULATOR_NAV_ITEMS,
  getRegulatorCoverage,
} from "../../src/data/regulatorCoverage.js";
import {
  createSqlClient,
  requireDatabaseUrl,
} from "../scraper/lib/euFineHelpers.js";
import { evaluateLiveRegulatorHealth } from "../scraper/lib/liveRegulatorHealth.js";
import type { LiveRegulatorStatsRow } from "../scraper/lib/liveRegulatorHealth.js";

export interface FreshnessRow {
  regulator: string;
  latestRecord: string | null;
  daysSinceLatest: number | null;
  totalRecords: number;
  recordsLast90Days: number;
  recordsLast12mPerMonth: number;
  futureRecordCount?: number;
  latestFutureRecordDate?: string | null;
}

export interface FlaggedRegulator extends FreshnessRow {
  reason: string;
  thresholdDays: number;
}

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
        )::float8 AS "recordsLast12mPerMonth",
        COUNT(*) FILTER (WHERE date_issued > CURRENT_DATE + INTERVAL '30 days')::int AS "futureRecordCount",
        MAX(date_issued) FILTER (WHERE date_issued > CURRENT_DATE + INTERVAL '30 days')::text AS "latestFutureRecordDate"
      FROM public.all_regulatory_fines_canonical
      GROUP BY regulator
    `;
    return rows;
  } finally {
    await sql.end();
  }
}

/**
 * Keep this legacy audit useful as an evidence report without allowing its
 * historical 30/90-day heuristics to become a second scraper alerting path.
 * The source-contract-aware assurance agent owns scraper-health severity.
 */
export function evaluate(
  rows: FreshnessRow[],
  referenceDate = new Date(),
): FlaggedRegulator[] {
  const liveCodes = new Set(
    LIVE_REGULATOR_NAV_ITEMS.map((coverage) => coverage.code.toUpperCase()),
  );

  const flagged: FlaggedRegulator[] = [];
  for (const row of rows) {
    const regUpper = row.regulator.toUpperCase();
    if (!liveCodes.has(regUpper)) continue;
    if (row.daysSinceLatest === null) continue;

    const coverage = getRegulatorCoverage(regUpper);
    if (!coverage || coverage.stage !== "live") continue;

    const healthStats: LiveRegulatorStatsRow = {
      regulator: regUpper,
      recordCount: row.totalRecords,
      earliestRecordDate: null,
      latestRecordDate: row.latestRecord,
      futureRecordCount: row.futureRecordCount ?? 0,
      latestFutureRecordDate: row.latestFutureRecordDate ?? null,
    };
    const health = evaluateLiveRegulatorHealth(coverage, healthStats, referenceDate);

    // Watch-only stale states (including low-frequency, sparse and curated
    // feeds) remain visible in the canonical assurance report, but must not
    // produce a second email from this broad historical audit.
    if (!["action_required", "critical"].includes(health.severity)) continue;

    flagged.push({
      ...row,
      reason: `${row.regulator} source-contract health is ${health.severity}: ${health.message}`,
      thresholdDays: health.freshnessWindowDays,
    });
  }

  flagged.sort((a, b) => (b.daysSinceLatest ?? 0) - (a.daysSinceLatest ?? 0));
  return flagged;
}

export async function main() {
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("Data freshness audit failed:", err);
    process.exit(1);
  });
}
