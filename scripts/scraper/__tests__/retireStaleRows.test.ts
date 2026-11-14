import { describe, expect, it, vi } from "vitest";
import { planRetirement, retireStaleRows, RetirementAbortError } from "../lib/retireStaleRows.js";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, key: `k-${i}` }));
const keys = (n: number, skip: number[] = []) => new Set(rows(n).filter((_, i) => !skip.includes(i)).map((r) => r.key));

describe("planRetirement", () => {
  it("a partial fetch aborts and retires nothing", () => {
    const plan = planRetirement({ stored: rows(1000), keepKeys: keys(500), protectedIds: new Set(), label: "T" });
    expect(plan.abort).toMatch(/partial fetch/);
    expect(plan.retire).toEqual([]);
  });
  it("retiring more than max(50, 2%) aborts", () => {
    // 1,000 stored, 40 stale is allowed (<= 50) but fetched below 98% (960 < 980) aborts first; use explicit mode for the ceiling.
    const plan = planRetirement({ stored: rows(10_000), retireIds: rows(250).map((r) => r.id), protectedIds: new Set(), label: "T" });
    expect(plan.abort).toMatch(/limit 200/);
  });
  it("a protected row is never retired", () => {
    const plan = planRetirement({ stored: rows(1000), keepKeys: keys(1000, [3, 4]), protectedIds: new Set(["id-3"]), label: "T" });
    expect(plan.abort).toBeNull();
    expect(plan.retire).toEqual(["id-4"]);
    expect(plan.protectedKept).toEqual(["id-3"]);
  });
  it("a normal small retirement is planned", () => {
    const plan = planRetirement({ stored: rows(1000), keepKeys: keys(1000, [7]), protectedIds: new Set(), label: "T" });
    expect(plan).toMatchObject({ abort: null, retire: ["id-7"] });
  });
});

describe("retireStaleRows moves rows, never deletes them outright", () => {
  function fakeSql(stored: Array<{ id: string; key: string }>, protectedIds: string[] = []) {
    const statements: string[] = [];
    const run = async (q: string) => {
      statements.push(q.replace(/\s+/g, " ").trim());
      if (/SELECT t\.id::text AS id, t\.\w+ AS key/.test(q)) return stored;
      if (/regulatory_case_suppressions/.test(q)) return protectedIds.map((id) => ({ id }));
      if (/^\s*INSERT INTO/.test(q) || /^\s*DELETE FROM/.test(q)) return Object.assign([], { count: 1 });
      return [];
    };
    const tx = { unsafe: run };
    return { sql: { unsafe: run, begin: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) } as never, statements };
  }
  it("moves a stale row to the retired table, then removes it from the live table", async () => {
    const stored = rows(200);
    const { sql, statements } = fakeSql(stored);
    const result = await retireStaleRows({ sql, table: "eu_fines", regulators: ["CVM"], label: "CVM", keepKeys: keys(200, [5]) });
    expect(result.retired).toBe(1);
    const insert = statements.findIndex((s) => s.startsWith("INSERT INTO public.eu_fines_retired_entity_names"));
    const del = statements.findIndex((s) => s.startsWith("DELETE FROM public.eu_fines"));
    expect(insert).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(insert);
  });
  it("keeps a row referenced by a suppression", async () => {
    const { sql, statements } = fakeSql(rows(200), ["id-5"]);
    const result = await retireStaleRows({ sql, table: "eu_fines", regulators: ["CVM"], label: "CVM", keepKeys: keys(200, [5]) });
    expect(result).toMatchObject({ retired: 0, protectedKept: 1 });
    expect(statements.some((s) => s.startsWith("DELETE"))).toBe(false);
  });
  it("a partial fetch throws and issues no write", async () => {
    const { sql, statements } = fakeSql(rows(1000));
    await expect(retireStaleRows({ sql, table: "eu_fines", regulators: ["CVM"], label: "CVM", keepKeys: keys(100) })).rejects.toBeInstanceOf(RetirementAbortError);
    expect(statements.some((s) => /^(INSERT|DELETE)/.test(s))).toBe(false);
  });
});
