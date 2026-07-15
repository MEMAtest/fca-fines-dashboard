import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  GOVERNANCE_PERCENTILE,
  GOVERNANCE_DIMENSIONS,
} from "./governanceData.js";
import {
  governanceRisk,
  bandFor,
  computeCountryRiskScore,
  scoreBreakdown,
  DOMAIN_WEIGHTS,
  FATF_ESCALATION,
  SANCTIONS_ESCALATION,
} from "./countryRiskScore.js";

describe("governance snapshot", () => {
  it("every code resolves; mean + per-dimension percentiles are 0–100", () => {
    for (const [iso2, pct] of Object.entries(GOVERNANCE_PERCENTILE)) {
      expect(getCountryByIso2(iso2), iso2).toBeDefined();
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
      const d = GOVERNANCE_DIMENSIONS[iso2];
      expect(d, iso2).toBeDefined();
      for (const v of Object.values(d)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("scoring primitives", () => {
  it("governanceRisk inverts the percentile (higher governance = lower risk)", () => {
    expect(governanceRisk(100)).toBe(0);
    expect(governanceRisk(0)).toBe(10);
    expect(governanceRisk(50)).toBe(5);
  });

  it("bandFor uses the 4-band thresholds", () => {
    expect(bandFor(2.9)).toBe("low");
    expect(bandFor(3)).toBe("moderate");
    expect(bandFor(5)).toBe("high");
    expect(bandFor(7)).toBe("very-high");
    expect(bandFor(9.7)).toBe("very-high");
  });

  it("governance domain weights sum to 1", () => {
    const sum =
      DOMAIN_WEIGHTS.corruption +
      DOMAIN_WEIGHTS.ruleOfLaw +
      DOMAIN_WEIGHTS.politicalStability +
      DOMAIN_WEIGHTS.accountability;
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("Basel-structured composite (governance base + escalators)", () => {
  it("black-listed + comprehensive-sanctioned + weak governance is very high (near cap)", () => {
    const s = computeCountryRiskScore("IR");
    expect(s.band).toBe("very-high");
    expect(s.score).toBeGreaterThan(9);
    expect(s.fatf.points).toBe(FATF_ESCALATION.black);
    expect(s.sanctions.points).toBe(SANCTIONS_ESCALATION.comprehensive);
  });

  it("strong-governance, unlisted, unsanctioned country is low with no escalators", () => {
    const s = computeCountryRiskScore("GB");
    expect(s.band).toBe("low");
    expect(s.score).toBeLessThan(3);
    expect(s.fatf.points).toBe(0);
    expect(s.sanctions.points).toBe(0);
    expect(s.score).toBeCloseTo(s.base, 5); // score == base when nothing escalates
  });

  it("weak-governance, unlisted country reaches the upper bands on the base alone", () => {
    // Somalia: extremely weak WGI, NOT FATF-listed, NOT sanctioned — must not read "Low".
    const s = computeCountryRiskScore("SO");
    expect(s.fatf.points).toBe(0);
    expect(s.sanctions.points).toBe(0);
    expect(s.band).toBe("very-high");
    expect(s.score).toBeGreaterThanOrEqual(7);
  });

  it("composite is exactly base + FATF + sanctions escalators, capped at 10 (CPI/enforcement never added)", () => {
    for (const iso2 of ["IR", "GB", "SO", "RU", "NG", "VE", "KP"]) {
      const s = computeCountryRiskScore(iso2);
      const expected = Math.min(
        10,
        Math.round((s.base + s.fatf.points + s.sanctions.points) * 10) / 10,
      );
      expect(s.score, iso2).toBe(expected);
    }
  });

  it("enforcement volume does not enter the score (US/GB stay low despite heavy enforcement)", () => {
    expect(computeCountryRiskScore("US").band).toBe("low");
    expect(computeCountryRiskScore("GB").band).toBe("low");
  });

  it("a FATF grey listing adds exactly 1.5 escalator points", () => {
    const s = computeCountryRiskScore("AO"); // Angola — grey list
    expect(s.fatf.points).toBe(FATF_ESCALATION.grey);
    expect(s.fatf.label).toBe("Grey list");
  });

  it("missing governance data → base 0, score from escalators only", () => {
    // British Virgin Islands: FATF grey, no sanctions, no WGI snapshot.
    const s = computeCountryRiskScore("VG");
    expect(s.hasGovernance).toBe(false);
    expect(s.base).toBe(0);
    expect(s.score).toBeCloseTo(FATF_ESCALATION.grey, 5); // 1.5
    expect(s.band).toBe("low");
  });

  it("scoreBreakdown exposes 4 domains that weight-average to the base", () => {
    const b = scoreBreakdown("NG");
    expect(b.domains).toHaveLength(4);
    expect(b.score).toBe(computeCountryRiskScore("NG").score);
    const avail = b.domains.filter((d) => d.risk !== null);
    const wSum = avail.reduce((s, d) => s + d.weightPct, 0);
    const wMean =
      avail.reduce((s, d) => s + (d.risk as number) * d.weightPct, 0) / wSum;
    expect(wMean).toBeCloseTo(b.base, 1);
  });
});
