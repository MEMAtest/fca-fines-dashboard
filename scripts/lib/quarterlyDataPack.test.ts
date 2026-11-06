import { describe, expect, it } from "vitest";
import { amountsInText, amountStatedInText, buildPack, classify, quarterWindow, distinctActions, type PackRow } from "./quarterlyDataPack.js";

const row = (o: Partial<PackRow>): PackRow => ({
  id: "x", regulator: "FCA", country_name: null, firm_individual: "A Ltd", amount_original: 1000, currency: "GBP", amount_gbp: 1000,
  date_issued: "2026-08-01", breach_type: "Fine", breach_categories: ["AML"], summary: "The FCA fined A Ltd for failings.",
  notice_url: "https://www.fca.org.uk/n.pdf", source_url: null, ...o,
});

describe("quarterly data pack", () => {
  it("computes quarter windows", () => {
    expect(quarterWindow(2026, 3)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(quarterWindow(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
  });
  it("reads amounts quoted in text", () => {
    expect(amountsInText("fined EUR 2.5 million and £46m, plus 620.000 Euro and $1,105,000")).toEqual(expect.arrayContaining([2_500_000, 46_000_000, 620_000, 1_105_000]));
    expect(amountStatedInText(row({ amount_original: 2_500_000, summary: "fined 2.5 million" }))).toBe(true);
  });
  it("excludes repeated rows, rejected defects and unattested large amounts", () => {
    const dup = [1, 2, 3].map((i) => row({ id: `d${i}` }));
    const big = row({ id: "big", amount_original: 30_000_000, amount_gbp: 30_000_000 });
    const rej = row({ id: "rej", amount_original: 20_000, amount_gbp: 20_000, firm_individual: "B", summary: "The FCA fined B." });
    const ok = row({ id: "ok", firm_individual: "C", summary: "The FCA fined C for other failings." });
    const r = classify([...dup, big, rej, ok], { attested: {}, rejected: { rej: "defect" } });
    expect(r.verified.map((v) => v.id)).toEqual(["ok"]);
    expect(r.exclusions).toHaveLength(5);
    const a = classify([big], { attested: { big: "checked" } });
    expect(a.verified).toHaveLength(1);
  });
  it("counts duplicate rows once as actions and builds a pack", () => {
    const rows = [row({ id: "a" }), row({ id: "b" }), row({ id: "c", firm_individual: "Z" })];
    expect(distinctActions(rows)).toBe(2);
    const pack = buildPack(2026, 3, rows, [row({ id: "y", date_issued: "2025-08-01" })], [], { attested: {} });
    expect(pack.current.actions).toBe(2);
    expect(pack.yoy.actionsPct).toBe(100);
    expect(pack.qoq.actionsPct).toBeNull();
  });
});
