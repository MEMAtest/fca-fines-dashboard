import type { CountryRiskSourceStatus } from "./countryRiskSources.js";

export type CountryRiskSourceHealthState = "healthy" | "warning" | "critical";

export interface CountryRiskOperationalSourceRun {
  source_id: string;
  status: string;
  source_url?: string | null;
  retrieved_at: string | Date;
  effective_at?: string | null;
  sha256?: string | null;
  parser_version?: string | null;
  record_count?: number | string | null;
  error_message?: string | null;
  metadata?: unknown;
}

export interface CountryRiskSourceHealthIssue {
  sourceId: string;
  severity: "warning" | "critical";
  code:
    | "database-unavailable"
    | "declared-source-unhealthy"
    | "missing-operational-run"
    | "operational-run-failed"
    | "operational-run-stale"
    | "operational-run-empty"
    | "operational-run-unhashed"
    | "operational-run-date-invalid";
  message: string;
}

export interface CountryRiskSourceHealthReport {
  status: CountryRiskSourceHealthState;
  checkedAt: string;
  lastSuccessfulCheckAt: string | null;
  publicMessage: string;
  readyForScoring: boolean;
  requiredOperationalSources: number;
  observedOperationalSources: number;
  issues: CountryRiskSourceHealthIssue[];
}

interface OperationalRule {
  id: string;
  maximumAgeDays: number;
}

export const COUNTRY_RISK_OPERATIONAL_SOURCE_RULES: OperationalRule[] = [
  { id: "ofac-programmes", maximumAgeDays: 2 },
  { id: "uk-regimes", maximumAgeDays: 2 },
  { id: "eu-resources", maximumAgeDays: 2 },
  { id: "un-consolidated-list", maximumAgeDays: 2 },
  { id: "fatf-lists", maximumAgeDays: 14 },
  { id: "fatf-assessments", maximumAgeDays: 45 },
  { id: "world-bank-wgi", maximumAgeDays: 400 },
  { id: "sanctions-regimes", maximumAgeDays: 8 },
];

function asTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function latestRuns(runs: CountryRiskOperationalSourceRun[]): Map<string, CountryRiskOperationalSourceRun> {
  const result = new Map<string, CountryRiskOperationalSourceRun>();
  for (const run of runs) {
    const current = result.get(run.source_id);
    if (!current || asTime(run.retrieved_at) > asTime(current.retrieved_at)) result.set(run.source_id, run);
  }
  return result;
}

function formatPublicDate(value: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function assessCountryRiskSourceHealth(input: {
  asOf: Date;
  declaredSources: CountryRiskSourceStatus[];
  operationalRuns: CountryRiskOperationalSourceRun[];
  databaseAvailable?: boolean;
  databaseError?: string | null;
}): CountryRiskSourceHealthReport {
  const issues: CountryRiskSourceHealthIssue[] = [];
  const databaseAvailable = input.databaseAvailable ?? true;
  const asOfTime = input.asOf.getTime();

  if (!databaseAvailable) {
    issues.push({
      sourceId: "country-risk-database",
      severity: "critical",
      code: "database-unavailable",
      message: `Operational source history is unavailable${input.databaseError ? `: ${input.databaseError}` : "."}`,
    });
  }

  for (const source of input.declaredSources.filter((item) => item.scored)) {
    if (source.state !== "current") {
      issues.push({
        sourceId: source.id,
        severity: "critical",
        code: "declared-source-unhealthy",
        message: `${source.name} is ${source.state}; scored sources must be current.`,
      });
    }
  }

  const latest = latestRuns(input.operationalRuns);
  for (const rule of COUNTRY_RISK_OPERATIONAL_SOURCE_RULES) {
    const run = latest.get(rule.id);
    if (!run) {
      issues.push({
        sourceId: rule.id,
        severity: "critical",
        code: "missing-operational-run",
        message: `No operational source run is recorded for ${rule.id}.`,
      });
      continue;
    }

    const retrievedAt = asTime(run.retrieved_at);
    if (!Number.isFinite(retrievedAt) || retrievedAt > asOfTime + 86_400_000) {
      issues.push({
        sourceId: rule.id,
        severity: "critical",
        code: "operational-run-date-invalid",
        message: `${rule.id} has an invalid or future retrieval date.`,
      });
    } else if ((asOfTime - retrievedAt) / 86_400_000 > rule.maximumAgeDays) {
      issues.push({
        sourceId: rule.id,
        severity: "critical",
        code: "operational-run-stale",
        message: `${rule.id} is older than its ${rule.maximumAgeDays}-day operational threshold.`,
      });
    }

    if (run.status !== "succeeded") {
      issues.push({
        sourceId: rule.id,
        severity: "critical",
        code: "operational-run-failed",
        message: `${rule.id} last finished with status ${run.status}${run.error_message ? `: ${run.error_message}` : "."}`,
      });
    }
    if (!Number.isFinite(Number(run.record_count)) || Number(run.record_count) <= 0) {
      issues.push({
        sourceId: rule.id,
        severity: "critical",
        code: "operational-run-empty",
        message: `${rule.id} returned no records; empty source responses fail closed.`,
      });
    }
    if (!run.sha256) {
      issues.push({
        sourceId: rule.id,
        severity: "critical",
        code: "operational-run-unhashed",
        message: `${rule.id} has no stored source hash.`,
      });
    }
  }

  const successfulTimes = [...latest.values()]
    .filter((run) => run.status === "succeeded")
    .map((run) => asTime(run.retrieved_at))
    .filter(Number.isFinite);
  const lastSuccessfulTime = successfulTimes.length ? Math.max(...successfulTimes) : null;
  const hasCritical = issues.some((issue) => issue.severity === "critical");
  const hasWarning = issues.some((issue) => issue.severity === "warning");
  const status: CountryRiskSourceHealthState = hasCritical ? "critical" : hasWarning ? "warning" : "healthy";

  return {
    status,
    checkedAt: input.asOf.toISOString(),
    lastSuccessfulCheckAt: lastSuccessfulTime === null ? null : new Date(lastSuccessfulTime).toISOString(),
    publicMessage: lastSuccessfulTime === null
      ? "Source check unavailable"
      : `Sources checked through ${formatPublicDate(lastSuccessfulTime)}`,
    readyForScoring: !hasCritical,
    requiredOperationalSources: COUNTRY_RISK_OPERATIONAL_SOURCE_RULES.length,
    observedOperationalSources: latest.size,
    issues,
  };
}
