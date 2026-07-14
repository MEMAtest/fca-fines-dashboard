import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  ENFORCEMENT_COVERED_ISO2,
  hasEnforcementCoverage,
  getRegulatorsForCountry,
  getCountryEnforcementSummary,
  enforcementCoveredCountries,
} from "./countryEnforcement.js";

describe("country enforcement coverage", () => {
  it("covers multiple countries, all resolving to real ISO2 countries", () => {
    expect(ENFORCEMENT_COVERED_ISO2.length).toBeGreaterThanOrEqual(10);
    for (const iso2 of ENFORCEMENT_COVERED_ISO2) {
      expect(getCountryByIso2(iso2), iso2).toBeDefined();
    }
  });

  it("excludes the EU pseudo-jurisdiction", () => {
    expect(ENFORCEMENT_COVERED_ISO2).not.toContain("EU");
    expect(hasEnforcementCoverage("EU")).toBe(false);
  });

  it("maps the UK to the FCA with tracked actions", () => {
    expect(hasEnforcementCoverage("GB")).toBe(true);
    const regs = getRegulatorsForCountry("GB");
    const fca = regs.find((r) => r.code === "FCA");
    expect(fca).toBeDefined();
    expect(fca!.count).toBeGreaterThan(0);
  });

  it("summarises tracked actions per country (sorted, positive)", () => {
    const summary = getCountryEnforcementSummary("GB");
    expect(summary).toBeDefined();
    expect(summary!.regulatorCount).toBeGreaterThan(0);
    expect(summary!.trackedActions).toBeGreaterThan(0);
    // regulators sorted by count desc
    const counts = summary!.regulators.map((r) => r.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("returns undefined summary for uncovered countries", () => {
    // Iran has no live financial regulator in our dataset
    expect(getCountryEnforcementSummary("IR")).toBeUndefined();
    expect(hasEnforcementCoverage("IR")).toBe(false);
  });

  it("enforcementCoveredCountries() resolves every code", () => {
    const countries = enforcementCoveredCountries();
    expect(countries.length).toBe(ENFORCEMENT_COVERED_ISO2.length);
  });
});
