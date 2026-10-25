/**
 * Staleness logic for the register's sanctions + FATF lanes, per the plan:
 * "sanctions 48h, FATF 7d. A breach raises an alert ... The page shows
 * 'stale since' rather than hiding the section."
 *
 * Pure functions here are tested directly; the DB read (latest successful
 * register_ingest_runs row per lane) lives in getLatestRunAt() below and is
 * exercised by the ops-health cron / workflow, not by unit tests.
 */
import { getSqlClient } from "../../../server/db.js";

export type RegisterLane = "sanctions" | "fatf";

export const STALENESS_BUDGET_HOURS: Record<RegisterLane, number> = {
  sanctions: 48,
  fatf: 24 * 7,
};

export interface LaneStaleness {
  lane: RegisterLane;
  lastSuccessAt: string | null; // ISO timestamp of the last successful run, or null if never run
  budgetHours: number;
  isStale: boolean;
  staleSince: string | null; // the moment the budget was breached (lastSuccessAt + budget), ISO
}

export function evaluateLaneStaleness(
  lane: RegisterLane,
  lastSuccessAt: string | Date | null,
  now: Date = new Date(),
): LaneStaleness {
  const budgetHours = STALENESS_BUDGET_HOURS[lane];
  if (!lastSuccessAt) {
    // Never run successfully: stale from day one, not "undefined"/"clean".
    return { lane, lastSuccessAt: null, budgetHours, isStale: true, staleSince: null };
  }
  const lastSuccess = new Date(lastSuccessAt);
  const staleSinceMs = lastSuccess.getTime() + budgetHours * 60 * 60 * 1000;
  const isStale = now.getTime() > staleSinceMs;
  return {
    lane,
    lastSuccessAt: lastSuccess.toISOString(),
    budgetHours,
    isStale,
    staleSince: isStale ? new Date(staleSinceMs).toISOString() : null,
  };
}

export async function getLatestRunAt(lane: string): Promise<string | null> {
  const sql = getSqlClient();
  const rows = await sql(
    `SELECT completed_at FROM register_ingest_runs WHERE lane = $1 AND status = 'success'
     ORDER BY completed_at DESC LIMIT 1`,
    [lane],
  );
  return rows[0]?.completed_at ? new Date(rows[0].completed_at as string).toISOString() : null;
}

/**
 * `lane` is any string, not just the two budgeted lanes: per-regime rows
 * (e.g. "sanctions-eu") use the same table to record skip/error evidence
 * for the tab's "EU list not ingested" note, without needing their own
 * staleness budget.
 */
export async function recordRun(lane: string, status: "success" | "error" | "skipped", detail?: string) {
  const sql = getSqlClient();
  await sql(
    `INSERT INTO register_ingest_runs (lane, status, detail) VALUES ($1, $2, $3)`,
    [lane, status, detail ?? null],
  );
}

/** Latest row for a per-regime lane (e.g. "sanctions-eu"), for surfacing
 * skip/error evidence in the API/tab. Null if that lane has never run. */
export async function getLatestRun(
  lane: string,
): Promise<{ status: string; detail: string | null; completedAt: string } | null> {
  const sql = getSqlClient();
  const rows = await sql(
    `SELECT status, detail, completed_at FROM register_ingest_runs WHERE lane = $1
     ORDER BY completed_at DESC LIMIT 1`,
    [lane],
  );
  if (rows.length === 0) return null;
  return {
    status: String(rows[0].status),
    detail: rows[0].detail ? String(rows[0].detail) : null,
    completedAt: new Date(rows[0].completed_at as string).toISOString(),
  };
}

export async function evaluateRegisterStaleness(now: Date = new Date()): Promise<LaneStaleness[]> {
  const lanes: RegisterLane[] = ["sanctions", "fatf"];
  const results: LaneStaleness[] = [];
  for (const lane of lanes) {
    const lastSuccessAt = await getLatestRunAt(lane);
    results.push(evaluateLaneStaleness(lane, lastSuccessAt, now));
  }
  return results;
}
