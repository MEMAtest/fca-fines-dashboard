import { describe, expect, it } from "vitest";
import {
  FIRST_LOAD_GRACE_HOURS,
  freshRowCondition,
  freshWindowDays,
  isFreshRow,
  type FreshRowCandidate,
} from "./freshRows.js";

const DAY = 86_400_000;
const now = new Date("2026-10-12T06:00:00Z");
const lastRun = new Date(now.getTime() - DAY);

function context(rows: FreshRowCandidate[]) {
  const firstSeenByRegulator = new Map<string, Date>();
  for (const row of rows) {
    const created = new Date(row.created_at);
    const known = firstSeenByRegulator.get(row.regulator);
    if (!known || created < known) firstSeenByRegulator.set(row.regulator, created);
  }
  return { since: lastRun, now, firstSeenByRegulator };
}

// Simulates one backfill: 15,000 historical decisions (2013 to today) all
// created within the last hour, plus an established regulator with old rows.
function historicalLoad(): FreshRowCandidate[] {
  const loadTime = new Date(now.getTime() - 3_600_000);
  return Array.from({ length: 15_000 }, (_, i) => ({
    regulator: "BCB",
    date_issued: new Date(now.getTime() - (i % 4_700) * DAY),
    created_at: new Date(loadTime.getTime() + i),
  }));
}

describe("shared fresh-row rule", () => {
  it("a 15,000-row historical first load yields zero notification items", () => {
    const rows = historicalLoad();
    const ctx = context(rows);
    expect(rows.filter((row) => isFreshRow(row, ctx))).toHaveLength(0);
    // ...including the recent decisions inside the same first load:
    const recentInLoad = rows.filter((row) => now.getTime() - new Date(row.date_issued).getTime() < 30 * DAY);
    expect(recentInLoad.length).toBeGreaterThan(50);
    expect(recentInLoad.some((row) => isFreshRow(row, ctx))).toBe(false);
  });

  it("a historical backfill into an ESTABLISHED regulator is excluded by the decision-date window", () => {
    const oldRow: FreshRowCandidate = {
      regulator: "CVM",
      date_issued: new Date("2021-03-01"),
      created_at: new Date("2026-01-01"),
    };
    const backfill = historicalLoad().map((row) => ({ ...row, regulator: "CVM" }));
    const ctx = context([oldRow, ...backfill]);
    expect(backfill.filter((row) => isFreshRow(row, ctx))).toHaveLength(Math.max(
      0,
      backfill.filter((row) => now.getTime() - new Date(row.date_issued).getTime() <= 30 * DAY).length,
    ));
    // Only in-window decisions can pass; none of the 2013-2025 rows do.
    expect(backfill.filter((row) => isFreshRow(row, ctx) && new Date(row.date_issued).getFullYear() < 2026)).toHaveLength(0);
  });

  it("a genuinely new decision from an established regulator still fires", () => {
    const established: FreshRowCandidate = {
      regulator: "BCB",
      date_issued: new Date("2026-09-01"),
      created_at: new Date("2026-09-15T05:00:00Z"),
    };
    const fresh: FreshRowCandidate = {
      regulator: "BCB",
      date_issued: new Date("2026-10-08"),
      created_at: new Date("2026-10-12T05:30:00Z"),
    };
    const rows = [...historicalLoad(), established, fresh];
    const ctx = context(rows);
    expect(isFreshRow(fresh, ctx)).toBe(true);
    expect(isFreshRow(established, ctx)).toBe(false); // created before the last run
  });

  it("does not fire for a new regulator's second-day load inside the grace period", () => {
    const first: FreshRowCandidate = { regulator: "NEWREG", date_issued: new Date("2026-10-10"), created_at: new Date("2026-10-12T04:00:00Z") };
    const sameBatch: FreshRowCandidate = { ...first, created_at: new Date(new Date(first.created_at).getTime() + (FIRST_LOAD_GRACE_HOURS - 1) * 3_600_000) };
    const ctx = context([first, sameBatch]);
    expect(isFreshRow(sameBatch, ctx)).toBe(false);
  });

  it("widens the window for monthly monitors only", () => {
    expect(freshWindowDays(1)).toBe(30);
    expect(freshWindowDays(7)).toBe(30);
    expect(freshWindowDays(31)).toBe(45);
  });

  it("emits SQL carrying all three conditions and rejects unsafe identifiers", () => {
    const sql = freshRowCondition({
      view: "public.all_regulatory_fines_trusted",
      alias: "monitor_rows",
      sinceSql: "$3::timestamptz",
      windowDays: 30,
    });
    expect(sql).toContain("monitor_rows.created_at > $3::timestamptz");
    expect(sql).toContain("monitor_rows.date_issued >= NOW() - INTERVAL '30 days'");
    expect(sql).toContain("MIN(first_seen.created_at)");
    expect(sql).toContain(`INTERVAL '${FIRST_LOAD_GRACE_HOURS} hours'`);
    expect(() => freshRowCondition({ view: "x; drop table y", sinceSql: "NOW()" })).toThrow();
    expect(() => freshRowCondition({ view: "v", sinceSql: "NOW()", windowDays: 100000 })).toThrow();
  });
});
