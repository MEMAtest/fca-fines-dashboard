import { getSqlClient, type SqlClient } from "../db.js";
import {
  UK_ENFORCEMENT_REGULATORS,
  type UKEnforcementRegulator,
} from "../../src/data/ukEnforcement.js";

export type UKEnforcementHealthStatus =
  | "ok"
  | "warning"
  | "stale"
  | "missing"
  | "error";

export type UKEnforcementSourceLayer =
  | "all_regulatory_fines"
  | "uk_enforcement_actions";

export interface UKEnforcementHealthStatsRow {
  regulator: string;
  recordCount: number;
  earliestRecordDate: string | null;
  latestRecordDate: string | null;
}

export interface UKEnforcementHealthRunRow {
  regulator: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastErrorMessage: string | null;
  lastSuccessfulRunAt: string | null;
}

export interface UKEnforcementHealthResult {
  regulator: string;
  fullName: string;
  sourceLayer: UKEnforcementSourceLayer;
  recordCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  ageDays: number | null;
  freshnessWindowDays: number;
  minimumHealthyRecords: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastErrorMessage: string | null;
  lastSuccessfulRunAt: string | null;
  status: UKEnforcementHealthStatus;
  message: string;
}

const ADJACENT_RUN_RECENCY_DAYS = 7;

const UK_HEALTH_CONTRACTS: Record<
  string,
  {
    sourceLayer: UKEnforcementSourceLayer;
    minimumHealthyRecords: number;
    freshnessWindowDays: number;
    requireRunRecency: boolean;
  }
> = {
  FCA: {
    sourceLayer: "all_regulatory_fines",
    minimumHealthyRecords: 250,
    freshnessWindowDays: 120,
    requireRunRecency: false,
  },
  PRA: {
    sourceLayer: "uk_enforcement_actions",
    minimumHealthyRecords: 15,
    freshnessWindowDays: 180,
    requireRunRecency: true,
  },
  PSR: {
    sourceLayer: "uk_enforcement_actions",
    minimumHealthyRecords: 3,
    freshnessWindowDays: 180,
    requireRunRecency: true,
  },
  OFSI: {
    sourceLayer: "uk_enforcement_actions",
    minimumHealthyRecords: 10,
    freshnessWindowDays: 180,
    requireRunRecency: true,
  },
  ICO: {
    sourceLayer: "uk_enforcement_actions",
    minimumHealthyRecords: 40,
    freshnessWindowDays: 180,
    requireRunRecency: true,
  },
  CMA: {
    sourceLayer: "uk_enforcement_actions",
    minimumHealthyRecords: 50,
    freshnessWindowDays: 180,
    requireRunRecency: true,
  },
  FRC: {
    sourceLayer: "uk_enforcement_actions",
    minimumHealthyRecords: 100,
    freshnessWindowDays: 180,
    requireRunRecency: true,
  },
  TPR: {
    sourceLayer: "uk_enforcement_actions",
    minimumHealthyRecords: 30,
    freshnessWindowDays: 180,
    requireRunRecency: true,
  },
};

function differenceInUtcDays(dateText: string, referenceDate: Date) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return null;

  const dateUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const referenceUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  return Math.max(0, Math.floor((referenceUtc - dateUtc) / 86_400_000));
}

function buildMissingResult(
  regulator: UKEnforcementRegulator,
  run: UKEnforcementHealthRunRow | undefined,
) {
  const contract = UK_HEALTH_CONTRACTS[regulator.code];
  return {
    regulator: regulator.code,
    fullName: regulator.fullName,
    sourceLayer: contract.sourceLayer,
    recordCount: 0,
    earliestDate: null,
    latestDate: null,
    ageDays: null,
    freshnessWindowDays: contract.freshnessWindowDays,
    minimumHealthyRecords: contract.minimumHealthyRecords,
    lastRunAt: run?.lastRunAt ?? null,
    lastStatus: run?.lastStatus ?? null,
    lastErrorMessage: run?.lastErrorMessage ?? null,
    lastSuccessfulRunAt: run?.lastSuccessfulRunAt ?? null,
    status: "missing" as const,
    message: `No records found in ${contract.sourceLayer}.`,
  };
}

export function evaluateUKEnforcementSourceHealth({
  regulator,
  stats,
  run,
  referenceDate = new Date(),
}: {
  regulator: UKEnforcementRegulator;
  stats: UKEnforcementHealthStatsRow | undefined;
  run?: UKEnforcementHealthRunRow;
  referenceDate?: Date;
}): UKEnforcementHealthResult {
  const contract = UK_HEALTH_CONTRACTS[regulator.code];

  if (!contract) {
    throw new Error(`Missing UK enforcement health contract for ${regulator.code}`);
  }

  if (run?.lastStatus === "error") {
    return {
      ...buildMissingResult(regulator, run),
      recordCount: stats?.recordCount ?? 0,
      earliestDate: stats?.earliestRecordDate ?? null,
      latestDate: stats?.latestRecordDate ?? null,
      ageDays: stats?.latestRecordDate
        ? differenceInUtcDays(stats.latestRecordDate, referenceDate)
        : null,
      status: "error",
      message: `Latest scraper run failed: ${run.lastErrorMessage ?? "unknown error"}.`,
    };
  }

  if (!stats || stats.recordCount === 0 || !stats.latestRecordDate) {
    return buildMissingResult(regulator, run);
  }

  const ageDays = differenceInUtcDays(stats.latestRecordDate, referenceDate);
  const base = {
    regulator: regulator.code,
    fullName: regulator.fullName,
    sourceLayer: contract.sourceLayer,
    recordCount: stats.recordCount,
    earliestDate: stats.earliestRecordDate,
    latestDate: stats.latestRecordDate,
    ageDays,
    freshnessWindowDays: contract.freshnessWindowDays,
    minimumHealthyRecords: contract.minimumHealthyRecords,
    lastRunAt: run?.lastRunAt ?? null,
    lastStatus: run?.lastStatus ?? null,
    lastErrorMessage: run?.lastErrorMessage ?? null,
    lastSuccessfulRunAt: run?.lastSuccessfulRunAt ?? null,
  };

  if (stats.recordCount < contract.minimumHealthyRecords) {
    return {
      ...base,
      status: "warning",
      message: `Record count is ${stats.recordCount}, below the healthy floor of ${contract.minimumHealthyRecords}.`,
    };
  }

  if (ageDays !== null && ageDays > contract.freshnessWindowDays) {
    return {
      ...base,
      status: "stale",
      message: `Latest action is ${ageDays} days old, outside the ${contract.freshnessWindowDays}-day window.`,
    };
  }

  if (contract.requireRunRecency) {
    if (!run?.lastSuccessfulRunAt) {
      return {
        ...base,
        status: "warning",
        message: "No successful scraper run has been recorded yet.",
      };
    }

    const runAgeDays = differenceInUtcDays(run.lastSuccessfulRunAt, referenceDate);
    if (runAgeDays !== null && runAgeDays > ADJACENT_RUN_RECENCY_DAYS) {
      return {
        ...base,
        status: "warning",
        message: `Latest successful scraper run is ${runAgeDays} days old, outside the ${ADJACENT_RUN_RECENCY_DAYS}-day monitoring window.`,
      };
    }
  }

  return {
    ...base,
    status: "ok",
    message: "Source is inside the current UK enforcement monitoring contract.",
  };
}

export function buildUKEnforcementHealthReport({
  statsRows,
  runRows,
  referenceDate = new Date(),
}: {
  statsRows: UKEnforcementHealthStatsRow[];
  runRows: UKEnforcementHealthRunRow[];
  referenceDate?: Date;
}) {
  const statsByRegulator = new Map(
    statsRows.map((row) => [row.regulator.toUpperCase(), row]),
  );
  const runsByRegulator = new Map(
    runRows.map((row) => [row.regulator.toUpperCase(), row]),
  );
  const sources = UK_ENFORCEMENT_REGULATORS.map((regulator) =>
    evaluateUKEnforcementSourceHealth({
      regulator,
      stats: statsByRegulator.get(regulator.code),
      run: runsByRegulator.get(regulator.code),
      referenceDate,
    }),
  );
  const statusCounts = sources.reduce(
    (counts, source) => {
      counts[source.status] += 1;
      return counts;
    },
    { ok: 0, warning: 0, stale: 0, missing: 0, error: 0 },
  );
  const failing = sources.filter(isFailingUKEnforcementHealth);

  return {
    success: failing.length === 0,
    generatedAt: referenceDate.toISOString(),
    policy: "warn_first",
    totals: {
      sources: sources.length,
      failing: failing.length,
      ...statusCounts,
    },
    sources,
  };
}

export function isFailingUKEnforcementHealth(
  result: UKEnforcementHealthResult,
) {
  return result.status === "missing" || result.status === "error";
}

export async function loadUKEnforcementHealthStats(sql: SqlClient) {
  const rows = await sql(
    `
      SELECT
        regulator,
        COUNT(*)::int AS "recordCount",
        MIN(date_issued)::text AS "earliestRecordDate",
        MAX(date_issued)::text AS "latestRecordDate"
      FROM all_regulatory_fines
      WHERE regulator = 'FCA'
      GROUP BY regulator

      UNION ALL

      SELECT
        regulator,
        COUNT(*)::int AS "recordCount",
        MIN(date_issued)::text AS "earliestRecordDate",
        MAX(date_issued)::text AS "latestRecordDate"
      FROM uk_enforcement_actions
      GROUP BY regulator
    `,
  );

  return rows.map((row) => ({
    regulator: String(row.regulator),
    recordCount: Number(row.recordCount ?? 0),
    earliestRecordDate: row.earliestRecordDate
      ? String(row.earliestRecordDate)
      : null,
    latestRecordDate: row.latestRecordDate
      ? String(row.latestRecordDate)
      : null,
  }));
}

export async function loadUKEnforcementScraperRuns(sql: SqlClient) {
  try {
    const regulatorCodes = UK_ENFORCEMENT_REGULATORS.map(
      (regulator) => regulator.code,
    );
    const regulatorPlaceholders = regulatorCodes
      .map((_, index) => `$${index + 1}`)
      .join(", ");
    const rows = await sql(
      `
        WITH latest AS (
          SELECT
            regulator,
            started_at,
            status,
            error_message,
            ROW_NUMBER() OVER (
              PARTITION BY regulator
              ORDER BY started_at DESC
            ) AS rn
          FROM scraper_runs
          WHERE regulator IN (${regulatorPlaceholders})
        ),
        latest_success AS (
          SELECT
            regulator,
            MAX(started_at) AS last_successful_run_at
          FROM scraper_runs
          WHERE regulator IN (${regulatorPlaceholders})
            AND status = 'success'
          GROUP BY regulator
        )
        SELECT
          latest.regulator,
          latest.started_at::text AS "lastRunAt",
          latest.status AS "lastStatus",
          latest.error_message AS "lastErrorMessage",
          latest_success.last_successful_run_at::text AS "lastSuccessfulRunAt"
        FROM latest
        LEFT JOIN latest_success
          ON latest_success.regulator = latest.regulator
        WHERE latest.rn = 1
      `,
      regulatorCodes,
    );

    return rows.map((row) => ({
      regulator: String(row.regulator),
      lastRunAt: row.lastRunAt ? String(row.lastRunAt) : null,
      lastStatus: row.lastStatus ? String(row.lastStatus) : null,
      lastErrorMessage: row.lastErrorMessage
        ? String(row.lastErrorMessage)
        : null,
      lastSuccessfulRunAt: row.lastSuccessfulRunAt
        ? String(row.lastSuccessfulRunAt)
        : null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("scraper_runs") || message.includes("does not exist")) {
      return [];
    }
    throw error;
  }
}

export async function getUKEnforcementHealth(sql = getSqlClient()) {
  const [statsRows, runRows] = await Promise.all([
    loadUKEnforcementHealthStats(sql),
    loadUKEnforcementScraperRuns(sql),
  ]);

  return buildUKEnforcementHealthReport({
    statsRows,
    runRows,
  });
}
