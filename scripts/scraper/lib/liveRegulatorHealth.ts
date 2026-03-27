import {
  DAILY_LIVE_REGULATOR_CODES,
  FRAGILE_LIVE_REGULATOR_CODES,
  LIVE_REGULATOR_NAV_ITEMS,
  type RegulatorCoverage,
} from "../../../src/data/regulatorCoverage.js";

export type LiveRegulatorCadence = "daily" | "fragile";
export type LiveRegulatorHealthStatus = "ok" | "stale" | "missing";

export interface LiveRegulatorStatsRow {
  regulator: string;
  recordCount: number;
  earliestRecordDate: string | null;
  latestRecordDate: string | null;
}

export interface LiveRegulatorHealthResult {
  regulator: string;
  fullName: string;
  cadence: LiveRegulatorCadence;
  confidence: RegulatorCoverage["operationalConfidence"];
  recordCount: number;
  earliestRecordDate: string | null;
  latestRecordDate: string | null;
  ageDays: number | null;
  freshnessWindowDays: number;
  status: LiveRegulatorHealthStatus;
  message: string;
}

export const DAILY_FRESHNESS_THRESHOLD_DAYS = 3;
export const FRAGILE_FRESHNESS_THRESHOLD_DAYS = 10;

const FRAGILE_LIVE_REGULATOR_CODE_SET = new Set(FRAGILE_LIVE_REGULATOR_CODES);

export function getLiveRegulatorCadence(code: string): LiveRegulatorCadence {
  return FRAGILE_LIVE_REGULATOR_CODE_SET.has(code.toUpperCase())
    ? "fragile"
    : "daily";
}

export function getFreshnessThresholdDays(code: string) {
  return getLiveRegulatorCadence(code) === "fragile"
    ? FRAGILE_FRESHNESS_THRESHOLD_DAYS
    : DAILY_FRESHNESS_THRESHOLD_DAYS;
}

export function getTargetLiveRegulatorCodes(
  cadence: LiveRegulatorCadence | "all" = "all",
) {
  if (cadence === "daily") {
    return DAILY_LIVE_REGULATOR_CODES;
  }

  if (cadence === "fragile") {
    return FRAGILE_LIVE_REGULATOR_CODES;
  }

  return LIVE_REGULATOR_NAV_ITEMS.map((coverage) => coverage.code);
}

export function evaluateLiveRegulatorHealth(
  coverage: RegulatorCoverage,
  stats: LiveRegulatorStatsRow | undefined,
  referenceDate = new Date(),
): LiveRegulatorHealthResult {
  const freshnessWindowDays = getFreshnessThresholdDays(coverage.code);
  const cadence = getLiveRegulatorCadence(coverage.code);

  if (!stats || stats.recordCount === 0 || !stats.latestRecordDate) {
    return {
      regulator: coverage.code,
      fullName: coverage.fullName,
      cadence,
      confidence: coverage.operationalConfidence,
      recordCount: stats?.recordCount ?? 0,
      earliestRecordDate: stats?.earliestRecordDate ?? null,
      latestRecordDate: stats?.latestRecordDate ?? null,
      ageDays: null,
      freshnessWindowDays,
      status: "missing",
      message: "No live records were found in all_regulatory_fines.",
    };
  }

  const ageDays = differenceInUtcDays(stats.latestRecordDate, referenceDate);

  if (ageDays > freshnessWindowDays) {
    return {
      regulator: coverage.code,
      fullName: coverage.fullName,
      cadence,
      confidence: coverage.operationalConfidence,
      recordCount: stats.recordCount,
      earliestRecordDate: stats.earliestRecordDate,
      latestRecordDate: stats.latestRecordDate,
      ageDays,
      freshnessWindowDays,
      status: "stale",
      message: `Latest record is ${ageDays} days old, outside the ${freshnessWindowDays}-day ${cadence} window.`,
    };
  }

  return {
    regulator: coverage.code,
    fullName: coverage.fullName,
    cadence,
    confidence: coverage.operationalConfidence,
    recordCount: stats.recordCount,
    earliestRecordDate: stats.earliestRecordDate,
    latestRecordDate: stats.latestRecordDate,
    ageDays,
    freshnessWindowDays,
    status: "ok",
    message: `Latest record is ${ageDays} days old and within the ${freshnessWindowDays}-day ${cadence} window.`,
  };
}

export function buildLiveRegulatorHealthReport(
  statsRows: LiveRegulatorStatsRow[],
  cadence: LiveRegulatorCadence | "all" = "all",
  referenceDate = new Date(),
) {
  const statsByCode = new Map(
    statsRows.map((row) => [row.regulator.toUpperCase(), row]),
  );
  const targetCodes = new Set(getTargetLiveRegulatorCodes(cadence));

  return LIVE_REGULATOR_NAV_ITEMS.filter((coverage) =>
    targetCodes.has(coverage.code),
  )
    .map((coverage) =>
      evaluateLiveRegulatorHealth(
        coverage,
        statsByCode.get(coverage.code.toUpperCase()),
        referenceDate,
      ),
    )
    .sort((left, right) => left.regulator.localeCompare(right.regulator));
}

function differenceInUtcDays(dateText: string, referenceDate: Date) {
  const latest = new Date(dateText);
  const latestUtc = Date.UTC(
    latest.getUTCFullYear(),
    latest.getUTCMonth(),
    latest.getUTCDate(),
  );
  const referenceUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  return Math.max(0, Math.floor((referenceUtc - latestUtc) / 86_400_000));
}
