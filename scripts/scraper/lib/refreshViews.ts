import type { Sql } from "postgres";

/** Advisory-lock key shared by every scraper so unified-view refreshes run one at a time. */
export const UNIFIED_VIEW_REFRESH_LOCK = 72_140_331;

/**
 * Runs `refresh` while holding a session advisory lock on one reserved connection.
 * Parallel scrapers refreshing the same materialised views deadlocked on 2026-10-13
 * (one Postgres, no pooler); with the lock, later scrapers wait instead of failing.
 */
export async function withUnifiedViewRefreshLock<T>(
  sql: Sql<any>,
  refresh: (conn: Sql<any>) => Promise<T>,
): Promise<T> {
  const conn = await sql.reserve();
  try {
    await conn`SELECT pg_advisory_lock(${UNIFIED_VIEW_REFRESH_LOCK})`;
    return await refresh(conn);
  } finally {
    await conn`SELECT pg_advisory_unlock(${UNIFIED_VIEW_REFRESH_LOCK})`.catch(() => undefined);
    conn.release();
  }
}

/** `SELECT refresh_all_fines()` under the shared refresh lock. */
export function refreshAllFinesSerialised(sql: Sql<any>) {
  return withUnifiedViewRefreshLock(sql, (conn) => conn`SELECT refresh_all_fines()`);
}
