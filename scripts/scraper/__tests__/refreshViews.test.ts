import { describe, expect, it } from "vitest";
import { UNIFIED_VIEW_REFRESH_LOCK, withUnifiedViewRefreshLock } from "../lib/refreshViews.js";
import { scraperDbMaxConnections } from "../lib/euFineHelpers.js";

function fakeSql(failRefresh = false) {
  const calls: string[] = [];
  let released = false;
  const conn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push(values.length ? `${text} [${values.join(",")}]` : text);
    if (failRefresh && text.includes("refresh_all_fines")) return Promise.reject(new Error("boom"));
    return Promise.resolve([]);
  }) as any;
  conn.release = () => { released = true; };
  const sql = { reserve: async () => conn } as any;
  return { sql, conn, calls, released: () => released };
}

describe("unified view refresh lock", () => {
  it("locks, refreshes and unlocks on one reserved connection", async () => {
    const f = fakeSql();
    await withUnifiedViewRefreshLock(f.sql, (c) => c`SELECT refresh_all_fines()`);
    expect(f.calls).toEqual([
      `SELECT pg_advisory_lock(?) [${UNIFIED_VIEW_REFRESH_LOCK}]`,
      "SELECT refresh_all_fines()",
      `SELECT pg_advisory_unlock(?) [${UNIFIED_VIEW_REFRESH_LOCK}]`,
    ]);
    expect(f.released()).toBe(true);
  });

  it("unlocks and releases when the refresh fails", async () => {
    const f = fakeSql(true);
    await expect(withUnifiedViewRefreshLock(f.sql, (c) => c`SELECT refresh_all_fines()`)).rejects.toThrow("boom");
    expect(f.calls.at(-1)).toContain("pg_advisory_unlock");
    expect(f.released()).toBe(true);
  });
});

describe("scraper connection pool size", () => {
  it("defaults to 2 and honours a positive override", () => {
    expect(scraperDbMaxConnections({})).toBe(2);
    expect(scraperDbMaxConnections({ SCRAPER_DB_MAX_CONNECTIONS: "4" })).toBe(4);
    expect(scraperDbMaxConnections({ SCRAPER_DB_MAX_CONNECTIONS: "0" })).toBe(2);
    expect(scraperDbMaxConnections({ SCRAPER_DB_MAX_CONNECTIONS: "x" })).toBe(2);
  });
});
