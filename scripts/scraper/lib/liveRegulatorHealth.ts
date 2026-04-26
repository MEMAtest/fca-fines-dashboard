import {
  DAILY_LIVE_REGULATOR_CODES,
  FRAGILE_LIVE_REGULATOR_CODES,
  LIVE_REGULATOR_NAV_ITEMS,
  getRegulatorCoverage,
  type RegulatorCoverage,
} from "../../../src/data/regulatorCoverage.js";

export type LiveRegulatorCadence = "daily" | "fragile";
export type LiveRegulatorHealthStatus = "ok" | "warning" | "stale" | "missing";
export type LiveRegulatorHealthSeverity =
  | "ok"
  | "watch"
  | "action_required"
  | "critical";

export interface LiveRegulatorStatsRow {
  regulator: string;
  recordCount: number;
  earliestRecordDate: string | null;
  latestRecordDate: string | null;
  futureRecordCount?: number;
  latestFutureRecordDate?: string | null;
}

export interface LiveRegulatorHealthResult {
  regulator: string;
  fullName: string;
  cadence: LiveRegulatorCadence;
  confidence: RegulatorCoverage["operationalConfidence"];
  automationLevel: RegulatorCoverage["automationLevel"];
  recordCount: number;
  earliestRecordDate: string | null;
  latestRecordDate: string | null;
  futureRecordCount: number;
  latestFutureRecordDate: string | null;
  ageDays: number | null;
  freshnessWindowDays: number;
  minimumHealthyRecords: number;
  zeroResultPolicy: RegulatorCoverage["feedContract"]["zeroResultPolicy"];
  sourceContractSummary: string;
  operatorAction: string;
  status: LiveRegulatorHealthStatus;
  severity: LiveRegulatorHealthSeverity;
  message: string;
}

export const DAILY_FRESHNESS_THRESHOLD_DAYS = 180;
export const FRAGILE_FRESHNESS_THRESHOLD_DAYS = 365;

const FRAGILE_LIVE_REGULATOR_CODE_SET = new Set(FRAGILE_LIVE_REGULATOR_CODES);

export function getLiveRegulatorCadence(code: string): LiveRegulatorCadence {
  return FRAGILE_LIVE_REGULATOR_CODE_SET.has(code.toUpperCase())
    ? "fragile"
    : "daily";
}

export function getFreshnessThresholdDays(code: string) {
  const coverage = getRegulatorCoverage(code);
  if (coverage) {
    return coverage.feedContract.staleAfterDays;
  }

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
      automationLevel: coverage.automationLevel,
      recordCount: stats?.recordCount ?? 0,
      earliestRecordDate: stats?.earliestRecordDate ?? null,
      latestRecordDate: stats?.latestRecordDate ?? null,
      futureRecordCount: stats?.futureRecordCount ?? 0,
      latestFutureRecordDate: stats?.latestFutureRecordDate ?? null,
      ageDays: null,
      freshnessWindowDays,
      minimumHealthyRecords: coverage.feedContract.minimumHealthyRecords,
      zeroResultPolicy: coverage.feedContract.zeroResultPolicy,
      sourceContractSummary: coverage.feedContract.sourceContractSummary,
      operatorAction: coverage.feedContract.operatorAction,
      status: "missing",
      severity: "critical",
      message: "No live records were found in all_regulatory_fines.",
    };
  }

  const ageDays = differenceInUtcDays(stats.latestRecordDate, referenceDate);
  const latestFutureRecordDate = stats.latestFutureRecordDate ?? null;
  const futureRecordCount = stats.futureRecordCount ?? 0;

  if (
    futureRecordCount > 0 ||
    isFutureDateOutsideTolerance(stats.latestRecordDate, referenceDate)
  ) {
    return {
      regulator: coverage.code,
      fullName: coverage.fullName,
      cadence,
      confidence: coverage.operationalConfidence,
      automationLevel: coverage.automationLevel,
      recordCount: stats.recordCount,
      earliestRecordDate: stats.earliestRecordDate,
      latestRecordDate: stats.latestRecordDate,
      futureRecordCount,
      latestFutureRecordDate: latestFutureRecordDate ?? stats.latestRecordDate,
      ageDays,
      freshnessWindowDays,
      minimumHealthyRecords: coverage.feedContract.minimumHealthyRecords,
      zeroResultPolicy: coverage.feedContract.zeroResultPolicy,
      sourceContractSummary: coverage.feedContract.sourceContractSummary,
      operatorAction: "Remove or correct future-dated records before treating the feed as healthy.",
      status: "warning",
      severity: "action_required",
      message: `${futureRecordCount || 1} future-dated records were found; latest future date is ${latestFutureRecordDate ?? stats.latestRecordDate}.`,
    };
  }

  if (ageDays > freshnessWindowDays) {
    return {
      regulator: coverage.code,
      fullName: coverage.fullName,
      cadence,
      confidence: coverage.operationalConfidence,
      automationLevel: coverage.automationLevel,
      recordCount: stats.recordCount,
      earliestRecordDate: stats.earliestRecordDate,
      latestRecordDate: stats.latestRecordDate,
      futureRecordCount,
      latestFutureRecordDate,
      ageDays,
      freshnessWindowDays,
      minimumHealthyRecords: coverage.feedContract.minimumHealthyRecords,
      zeroResultPolicy: coverage.feedContract.zeroResultPolicy,
      sourceContractSummary: coverage.feedContract.sourceContractSummary,
      operatorAction: coverage.feedContract.operatorAction,
      status: "stale",
      severity:
        coverage.automationLevel === "sparse_source" ||
        coverage.automationLevel === "curated_archive"
          ? "watch"
          : "action_required",
      message: `Latest record is ${ageDays} days old, outside the ${freshnessWindowDays}-day ${cadence} source-contract window.`,
    };
  }

  if (
    coverage.feedContract.minimumHealthyRecords > 0
    && stats.recordCount < coverage.feedContract.minimumHealthyRecords
  ) {
    return {
      regulator: coverage.code,
      fullName: coverage.fullName,
      cadence,
      confidence: coverage.operationalConfidence,
      automationLevel: coverage.automationLevel,
      recordCount: stats.recordCount,
      earliestRecordDate: stats.earliestRecordDate,
      latestRecordDate: stats.latestRecordDate,
      futureRecordCount,
      latestFutureRecordDate,
      ageDays,
      freshnessWindowDays,
      minimumHealthyRecords: coverage.feedContract.minimumHealthyRecords,
      zeroResultPolicy: coverage.feedContract.zeroResultPolicy,
      sourceContractSummary: coverage.feedContract.sourceContractSummary,
      operatorAction: coverage.feedContract.operatorAction,
      status: "warning",
      severity: "action_required",
      message: `Record count is ${stats.recordCount}, below the healthy floor of ${coverage.feedContract.minimumHealthyRecords} for this feed contract.`,
    };
  }

  return {
    regulator: coverage.code,
    fullName: coverage.fullName,
    cadence,
    confidence: coverage.operationalConfidence,
    automationLevel: coverage.automationLevel,
    recordCount: stats.recordCount,
    earliestRecordDate: stats.earliestRecordDate,
    latestRecordDate: stats.latestRecordDate,
    futureRecordCount,
    latestFutureRecordDate,
    ageDays,
    freshnessWindowDays,
    minimumHealthyRecords: coverage.feedContract.minimumHealthyRecords,
    zeroResultPolicy: coverage.feedContract.zeroResultPolicy,
    sourceContractSummary: coverage.feedContract.sourceContractSummary,
    operatorAction: coverage.feedContract.operatorAction,
    status: "ok",
    severity: "ok",
    message: `Latest record is ${ageDays} days old and within the ${freshnessWindowDays}-day ${cadence} source-contract window.`,
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

function isFutureDateOutsideTolerance(dateText: string, referenceDate: Date) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const futureTolerance = new Date(referenceDate);
  futureTolerance.setUTCDate(futureTolerance.getUTCDate() + 30);
  return date > futureTolerance;
}
