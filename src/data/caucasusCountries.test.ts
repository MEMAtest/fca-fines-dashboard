/**
 * Spot coverage for the South Caucasus trio — Armenia (AM), Azerbaijan (AZ) and
 * Georgia (GE). Guards against regressions in the end-to-end country-risk
 * pipeline for these jurisdictions: canonical reference -> WGI + CPI ->
 * MONEYVAL membership -> computable composite score -> page inclusion ->
 * grounded narrative.
 */
import { describe, it, expect } from "vitest";

import { getCountryByIso2 } from "./countries.js";
import { getGovernanceDimensions, getGovernancePercentile } from "./governanceData.js";
import { getCpi } from "./cpiData.js";
import { getFatfNetwork } from "./fsrbMembership.js";
import { computeCountryRiskScore } from "./countryRiskScore.js";
import { pageCountries } from "./countryView.js";
import { getNarrative } from "./countryNarratives.js";
import { isFatfListed } from "./fatfStatus.js";
import { isSanctioned } from "./sanctionsStatus.js";

const TRIO = ["AM", "AZ", "GE"] as const;

describe("South Caucasus country coverage (AM / AZ / GE)", () => {
  it("resolves each via getCountryByIso2 with the expected canonical name", () => {
    expect(getCountryByIso2("AM")?.name).toBe("Armenia");
    expect(getCountryByIso2("AZ")?.name).toBe("Azerbaijan");
    expect(getCountryByIso2("GE")?.name).toBe("Georgia");
  });

  it("has WGI governance data (all six dimensions) for each", () => {
    for (const iso of TRIO) {
      const dims = getGovernanceDimensions(iso);
      expect(dims, iso).toBeTruthy();
      for (const k of ["cc", "rl", "rq", "ge", "pv", "va"] as const) {
        expect(typeof dims?.[k], `${iso}.${k}`).toBe("number");
      }
      expect(getGovernancePercentile(iso), iso).toBeGreaterThan(0);
    }
  });

  it("carries Transparency International CPI 2025 scores and ranks", () => {
    expect(getCpi("GE")).toEqual({ score: 50, rank: 56 });
    expect(getCpi("AM")).toEqual({ score: 46, rank: 65 });
    expect(getCpi("AZ")).toEqual({ score: 30, rank: 130 });
  });

  it("records MONEYVAL membership (Council of Europe FSRB) for each", () => {
    for (const iso of TRIO) {
      const net = getFatfNetwork(iso);
      expect(net.fsrbs.map((f) => f.code), iso).toContain("MONEYVAL");
      expect(net.fatfMember, iso).toBe(false);
    }
  });

  it("is neither FATF grey/black listed nor under a sanctions programme", () => {
    for (const iso of TRIO) {
      expect(isFatfListed(iso), iso).toBe(false);
      expect(isSanctioned(iso), iso).toBe(false);
    }
  });

  it("produces a plausible mid-range composite score for each", () => {
    const scored = (iso: string): number => {
      const result = computeCountryRiskScore(iso);
      expect(result.hasGovernance, iso).toBe(true);
      if (!result.hasGovernance) throw new Error(`${iso} governance fixture missing`);
      return result.score;
    };
    for (const iso of TRIO) {
      const rs = computeCountryRiskScore(iso);
      expect(rs.hasGovernance, iso).toBe(true);
      if (!rs.hasGovernance) throw new Error(`${iso} governance fixture missing`);
      expect(rs.score, iso).toBeGreaterThan(3);
      expect(rs.score, iso).toBeLessThan(7);
      // No escalators apply — score equals the governance base.
      expect(rs.fatf.points, iso).toBe(0);
      expect(rs.sanctions.points, iso).toBe(0);
    }
    // Ordering matches the sourced picture: Georgia cleanest, Azerbaijan riskiest.
    expect(scored("GE")).toBeLessThan(scored("AM"));
    expect(scored("AM")).toBeLessThan(scored("AZ"));
  });

  it("appears in pageCountries() so report pages are generated", () => {
    const iso2s = new Set(pageCountries().map((c) => c.iso2));
    for (const iso of TRIO) expect(iso2s.has(iso), iso).toBe(true);
  });

  it("has a grounded narrative with the expected shape and no em-dashes", () => {
    for (const iso of TRIO) {
      const n = getNarrative(iso);
      expect(n, iso).toBeTruthy();
      expect(n?.summary?.length, iso).toBeGreaterThan(80);
      expect(n?.whyItMatters?.length, iso).toBe(4);
      expect(n?.keyWatchpoints?.length, iso).toBe(4);
      expect(n?.analysis?.length, iso).toBeGreaterThan(300);
      expect(n?.outlook?.length, iso).toBeGreaterThan(300);
      // House style: no em-dashes anywhere in the narrative.
      expect(/[—–]/.test(JSON.stringify(n)), iso).toBe(false);
    }
  });
});
