import postgres, { type Sql } from "postgres";
import { resolveConnectionString } from "../../lib/dbTarget.js";

/** Advisory-lock key shared by every writer so unified-view refreshes run one at a time. */
export const UNIFIED_VIEW_REFRESH_LOCK = 72_140_331;

/** Bounds the wait for the refresh lock (and the refresh's own table locks). */
const REFRESH_LOCK_TIMEOUT = "10min";
const DEADLOCK_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isDeadlock(error: unknown) {
  return (error as { code?: string } | null)?.code === "40P01" || /deadlock detected/i.test(String((error as Error)?.message ?? error));
}

/**
 * Runs `refresh` while holding a session advisory lock on one reserved connection.
 * Parallel scrapers refreshing the same materialised views deadlocked on 2026-10-13
 * (one Postgres, no pooler). With the lock, later writers wait (at most
 * REFRESH_LOCK_TIMEOUT, so a dead session cannot block them for hours), and a
 * deadlock against a writer outside the lock is retried.
 */
export async function withUnifiedViewRefreshLock<T>(
  sql: Sql<any>,
  refresh: (conn: Sql<any>) => Promise<T>,
): Promise<T> {
  const conn = await sql.reserve();
  try {
    await conn.unsafe(`SET lock_timeout = '${REFRESH_LOCK_TIMEOUT}'`);
    await conn`SELECT pg_advisory_lock(${UNIFIED_VIEW_REFRESH_LOCK})`;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await refresh(conn);
      } catch (error) {
        if (!isDeadlock(error) || attempt >= DEADLOCK_RETRIES) throw error;
        console.warn(`⚠️ View refresh deadlocked (attempt ${attempt}/${DEADLOCK_RETRIES}); retrying`);
        await sleep(2_000 * attempt);
      }
    }
  } finally {
    await conn`SELECT pg_advisory_unlock(${UNIFIED_VIEW_REFRESH_LOCK})`.catch(() => undefined);
    await conn.unsafe("RESET lock_timeout").catch(() => undefined);
    conn.release();
  }
}

/** `SELECT refresh_all_fines()` under the shared refresh lock. */
export function refreshAllFinesSerialised(sql: Sql<any>) {
  return withUnifiedViewRefreshLock(sql, (conn) => conn`SELECT refresh_all_fines()`);
}

/**
 * For scripts whose client is a connection pool without `reserve` (server/db.ts):
 * opens a one-connection client, refreshes `views` in order under the lock, closes it.
 */
export async function refreshViewsStandalone(views: string[]) {
  const url = resolveConnectionString()?.trim();
  if (!url) throw new Error("A database connection string is required to refresh views");
  const sql = postgres(url, { max: 1, ssl: url.includes("sslmode=") ? { rejectUnauthorized: false } : false });
  try {
    await withUnifiedViewRefreshLock(sql, async (conn) => {
      for (const view of views) {
        if (!/^[a-z_.]+$/.test(view)) throw new Error(`Refusing to refresh unexpected view name: ${view}`);
        await conn.unsafe(`REFRESH MATERIALIZED VIEW ${view}`);
      }
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
