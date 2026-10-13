import { describe, expect, it } from "vitest";
import { UNIFIED_VIEW_REFRESH_LOCK, withUnifiedViewRefreshLock } from "../lib/refreshViews.js";
import { scraperDbMaxConnections } from "../lib/euFineHelpers.js";

function fakeSql(refreshFailures: Error[] = []) {
  const calls: string[] = [];
  let released = false;
  const conn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    calls.push(values.length ? `${text} [${values.join(",")}]` : text);
    if (text.includes("refresh_all_fines") && refreshFailures.length) return Promise.reject(refreshFailures.shift());
    return Promise.resolve([]);
  }) as any;
  conn.unsafe = (text: string) => { calls.push(text); return Promise.resolve([]); };
  conn.release = () => { released = true; };
  const sql = { reserve: async () => conn } as any;
  return { sql, calls, released: () => released };
}

const deadlock = () => Object.assign(new Error("deadlock detected"), { code: "40P01" });
const last = (items: string[]) => items[items.length - 1];

describe("unified view refresh lock", () => {
  it("bounds the wait, locks, refreshes, unlocks and resets on one reserved connection", async () => {
    const f = fakeSql();
    await withUnifiedViewRefreshLock(f.sql, (c) => c`SELECT refresh_all_fines()`);
    expect(f.calls).toEqual([
      "SET lock_timeout = '10min'",
      `SELECT pg_advisory_lock(?) [${UNIFIED_VIEW_REFRESH_LOCK}]`,
      "SELECT refresh_all_fines()",
      `SELECT pg_advisory_unlock(?) [${UNIFIED_VIEW_REFRESH_LOCK}]`,
      "RESET lock_timeout",
    ]);
    expect(f.released()).toBe(true);
  });

  it("retries a deadlock against a writer outside the lock", async () => {
    const f = fakeSql([deadlock()]);
    await withUnifiedViewRefreshLock(f.sql, (c) => c`SELECT refresh_all_fines()`);
    expect(f.calls.filter((c) => c === "SELECT refresh_all_fines()")).toHaveLength(2);
    expect(f.released()).toBe(true);
  }, 15_000);

  it("unlocks and releases when the refresh fails for another reason", async () => {
    const f = fakeSql([new Error("boom")]);
    await expect(withUnifiedViewRefreshLock(f.sql, (c) => c`SELECT refresh_all_fines()`)).rejects.toThrow("boom");
    expect(f.calls.filter((c) => c === "SELECT refresh_all_fines()")).toHaveLength(1);
    expect(last(f.calls)).toBe("RESET lock_timeout");
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
