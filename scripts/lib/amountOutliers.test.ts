import { describe, expect, it } from "vitest";
import { findAmountOutliers, markedFigures, type OutlierRow } from "./amountOutliers.js";

const row = (o: Partial<OutlierRow>): OutlierRow => ({
  id: "r", regulator: "DNB", firm_individual: "X", date_issued: "2025-01-01", amount_original: 1000, currency: "EUR", amount_gbp: 850,
  summary: "", breach_type: "", amount_quality: "reported", requires_amount_review: false, ...o,
});

describe("amount outlier rules", () => {
  it("reads currency-marked figures only", () => {
    expect(markedFigures("fined €2.6 million on 6 May 2025 and £41,230 plus 620.000 Euro")).toEqual(expect.arrayContaining([2_600_000, 41_230, 620_000]));
    expect(markedFigures("On 5 August 2024 under section 12")).toEqual([]);
  });
  it("flags a stored amount 10x its own text figure (bunq, Travelex shapes)", () => {
    const out = findAmountOutliers([row({ id: "bunq", amount_original: 26_000_000, amount_gbp: 22_100_000, summary: "administrative fine of €2.6 million on bunq" })]);
    expect(out.map((o) => o.rule)).toContain("10x-text-figure");
  });
  it("flags >= 10x the regulator's previous max and >= GBP 1bn", () => {
    const rows = [row({ id: "a", amount_gbp: 100_000, amount_original: 100_000 }), row({ id: "b", date_issued: "2025-02-01", amount_gbp: 5_000_000, amount_original: 5_000_000 }), row({ id: "c", date_issued: "2025-03-01", regulator: "FINRA", amount_gbp: 2e9, amount_original: 2e9 })];
    const rules = findAmountOutliers(rows).map((o) => `${o.row.id}:${o.rule}`);
    expect(rules).toContain("b:10x-regulator-max");
    expect(rules).toContain("c:over-1bn");
  });
  it("does not flag consistent, reviewed, overridden or already-held rows", () => {
    const ok = row({ id: "ok", amount_original: 2_600_000, amount_gbp: 2_210_000, summary: "fine of €2.6 million" });
    const held = row({ id: "held", amount_gbp: 3e9, amount_original: 3e9, requires_amount_review: true });
    const ver = row({ id: "ver", amount_gbp: 3e9, amount_original: 3e9, amount_quality: "verified_override" });
    const rev = row({ id: "rev", amount_gbp: 3e9, amount_original: 3e9 });
    expect(findAmountOutliers([ok, held, ver, rev], new Set(["rev"]))).toEqual([]);
  });
});

describe("baseline does not chain off wrong values", () => {
  it("a flagged wrong amount does not make the next large amount look normal", () => {
    const rows = [
      row({ id: "a", amount_gbp: 100_000, amount_original: 100_000 }),
      row({ id: "wrong", date_issued: "2025-02-01", amount_gbp: 85_000_000, amount_original: 100_000_000 }),
      row({ id: "next", date_issued: "2025-03-01", amount_gbp: 20_000_000, amount_original: 20_000_000 }),
    ];
    const ids = findAmountOutliers(rows).map((o) => o.row.id);
    expect(ids).toContain("wrong");
    expect(ids).toContain("next");
  });
});

describe("FCA decision-notice figures never reach rankings", () => {
  it("flags Decision Notice URLs and hardship wording, unless reviewed", () => {
    const dn = row({ id: "dn", regulator: "FCA", amount_gbp: 1_000_000, amount_original: 1_000_000, notice_url: "https://www.fca.org.uk/publication/decision-notices/x.pdf" });
    const hard = row({ id: "h", regulator: "FCA", amount_gbp: 5_000, amount_original: 5_000, summary: "would have imposed a financial penalty of £5,000 had he not shown serious financial hardship" });
    const final = row({ id: "ok", regulator: "FCA", amount_gbp: 1_000_000, amount_original: 1_000_000, notice_url: "https://www.fca.org.uk/publication/final-notices/x.pdf" });
    expect(findAmountOutliers([dn, hard, final]).filter((o) => o.rule === "fca-decision-notice").map((o) => o.row.id).sort()).toEqual(["dn", "h"]);
    expect(findAmountOutliers([dn], new Set(["dn"]))).toEqual([]);
  });
});

describe("HTML-entity currency symbols", () => {
  it("reads &#x20AC;15,810 and flags a x1000 stored amount (DNB shape)", () => {
    expect(markedFigures("imposed an administrative fine of &#x20AC;15,810 on Black Swan")).toContain(15_810);
    const out = findAmountOutliers([row({ id: "bs", amount_original: 15_810_000, amount_gbp: 13_438_500, summary: "imposed an administrative fine of &#x20AC;15,810 on Black Swan" })]);
    expect(out.map((o) => o.rule)).toContain("10x-text-figure");
  });
});

describe("scale errors hidden by a corrupt headline", () => {
  it("flags stored = 1000 x a quoted figure even if the headline repeats the stored value", () => {
    const out = findAmountOutliers([row({ id: "z", amount_original: 75_000_000, amount_gbp: 63_750_000, summary: "Zenco fined €75,000,000 by DNB for ... imposed a fine of &#x20AC;75,000 on Zenco" })]);
    expect(out.map((o) => o.rule)).toContain("10x-text-figure");
  });
});
