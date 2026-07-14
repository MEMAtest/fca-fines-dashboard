import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  GOVERNANCE_PERCENTILE,
  getGovernancePercentile,
} from "./governanceData.js";
import {
  fatfRisk,
  sanctionsRisk,
  governanceRisk,
  bandFor,
  computeCountryRiskScore,
} from "./countryRiskScore.js";

describe("governance snapshot", () => {
  it("every code resolves and every percentile is 0–100", () => {
    for (const [iso2, pct] of Object.entries(GOVERNANCE_PERCENTILE)) {
      expect(getCountryByIso2(iso2), iso2).toBeDefined();
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});

describe("pillar risk sub-scores", () => {
  it("fatfRisk: black=10, grey=6, none=0", () => {
    expect(fatfRisk("IR")).toBe(10); // black
    expect(fatfRisk("AO")).toBe(6); // grey
    expect(fatfRisk("GB")).toBe(0); // not listed
  });

  it("sanctionsRisk: comprehensive=10, sectoral=6, targeted=3, none=0", () => {
    expect(sanctionsRisk("CU")).toBe(10);
    expect(sanctionsRisk("RU")).toBe(6);
    expect(sanctionsRisk("VE")).toBe(3);
    expect(sanctionsRisk("GB")).toBe(0);
  });

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
});

describe("composite country risk score", () => {
  it("scores a comprehensive-embargo, black-listed, low-governance country as very high", () => {
    const s = computeCountryRiskScore("IR"); // FATF black + OFAC comprehensive + gov ~11
    expect(s.band).toBe("very-high");
    expect(s.score).toBeGreaterThan(9);
    expect(s.hasGovernance).toBe(true);
  });

  it("scores a strong-governance, unlisted, unsanctioned country as low", () => {
    const s = computeCountryRiskScore("GB");
    expect(s.band).toBe("low");
    expect(s.score).toBeLessThan(3);
    expect(s.components.fatf).toBe(0);
    expect(s.components.sanctions).toBe(0);
  });

  it("does NOT let enforcement volume enter the score (UK/US stay low despite heavy enforcement)", () => {
    expect(computeCountryRiskScore("US").band).toBe("low");
    expect(computeCountryRiskScore("GB").band).toBe("low");
  });

  it("renormalises weights when governance data is missing", () => {
    // British Virgin Islands: FATF grey (6), no sanctions, no WGI snapshot.
    expect(getGovernancePercentile("VG")).toBeUndefined();
    const s = computeCountryRiskScore("VG");
    expect(s.hasGovernance).toBe(false);
    expect(s.appliedWeights.governance).toBe(0);
    // 6 * (0.40 / 0.75) = 3.2
    expect(s.score).toBeCloseTo(3.2, 1);
    expect(s.band).toBe("moderate");
  });

  it("applied weights sum to 1", () => {
    for (const iso2 of ["IR", "GB", "VG", "RU"]) {
      const w = computeCountryRiskScore(iso2).appliedWeights;
      expect(w.fatf + w.sanctions + w.governance).toBeCloseTo(1, 6);
    }
  });
});
