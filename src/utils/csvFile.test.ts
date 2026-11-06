import { describe, expect, it } from "vitest";
import { CSV_BOM, csvCell, csvFooterRow, guardFormula, withBom } from "./csvFile.js";

describe("csvFile", () => {
  it("prefixes formula triggers with a quote", () => {
    for (const bad of ["=1+1", "+44", "-1+1", "-cmd|x", "@SUM(A1)", "\tx", "\rx"]) expect(guardFormula(bad)).toBe(`'${bad}`);
    expect(guardFormula("Laos")).toBe("Laos");
    expect(guardFormula("-0.3")).toBe("-0.3");
    expect(guardFormula("-12")).toBe("-12");
  });
  it("quotes commas and doubles quotes, after guarding", () => {
    expect(csvCell('=a,"b"')).toBe(`"'=a,""b"""`);
  });
  it("adds a single UTF-8 BOM", () => {
    expect(withBom("a").charCodeAt(0)).toBe(0xfeff);
    expect(withBom(CSV_BOM + "a")).toBe(CSV_BOM + "a");
  });
  it("footer states source, as-of and url", () => {
    expect(csvFooterRow("RegActions", "2026-11-06", "https://regactions.com/x")).toContain("As of: 2026-11-06");
  });
});
