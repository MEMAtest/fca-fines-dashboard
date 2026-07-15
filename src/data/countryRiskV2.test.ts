import { describe, expect, it } from "vitest";
import type { FatfAssessmentRecord } from "./fatfAssessmentData.js";
import type { CountrySanctions } from "./sanctionsStatus.js";
import {
  computeCountryRiskV2,
  fatfAssessmentRisk,
  governancePillarRisk,
  sanctionsPillarRisk,
} from "./countryRiskV2.js";

const assessment: FatfAssessmentRecord = {
  iso2: "GB",
  country: "United Kingdom",
  methodology: "2013",
  assessmentDate: "2024-01-01",
  effectiveness: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [
    `IO${index + 1}`,
    (["SE", "ME", "LE"] as const)[index % 3],
  ])),
  technicalCompliance: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [
    `R${index + 1}`,
    (["C", "LC", "PC", "NC"] as const)[index % 4],
  ])),
};
const governance = { cc: 80, rl: 80, rq: 80, ge: 80, pv: 80, va: 80 };
const currentStates = { aml: "current", governance: "current", sanctions: "current" } as const;

describe("country risk v2 primitives", () => {
  it("weights FATF effectiveness 70% and technical compliance 30%", () => {
    const risk = fatfAssessmentRisk(assessment);
    expect(risk.effectiveness).toBeCloseTo(6.4, 1);
    expect(risk.technicalCompliance).toBeCloseTo(5, 1);
    expect(risk.score).toBeCloseTo(6, 1);
    expect(risk.evidenceCount).toBe(51);
  });

  it("equal-weights the six inverted WGI dimensions", () => {
    expect(governancePillarRisk(governance)).toEqual({ score: 2, evidenceCount: 6 });
  });

  it("uses highest sanctions scope plus breadth across four imposers", () => {
    const sanctions: CountrySanctions = {
      iso2: "GB",
      programs: [
        { imposer: "UK", tier: "sectoral", program: "A", sourceUrl: "https://example.test/a", reviewed: "2026-07" },
        { imposer: "EU", tier: "targeted", program: "B", sourceUrl: "https://example.test/b", reviewed: "2026-07" },
      ],
    };
    expect(sanctionsPillarRisk(sanctions, true).score).toBe(5.4);
  });
});

describe("country risk v2 publication rules", () => {
  it("publishes a complete, deterministic score when all pillars are current", () => {
    const result = computeCountryRiskV2("GB", {
      assessment,
      governance,
      sanctionsCoverageComplete: true,
      sourceStates: currentStates,
    });
    expect(result.status).toBe("complete");
    expect(result.confidence).toBe("high");
    expect(result.score).toBe(3.6);
    expect(result.band).toBe("moderate");
    expect(result.arithmetic).toContain("aml 6 × 50%");
  });

  it("does not turn missing sanctions coverage into zero risk", () => {
    const result = computeCountryRiskV2("GB", {
      assessment,
      governance,
      sanctionsCoverageComplete: false,
      sourceStates: { ...currentStates, sanctions: "review-required" },
    });
    expect(result.status).toBe("provisional");
    expect(result.pillars.sanctions.score).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("withholds the headline when fewer than two pillars exist", () => {
    const result = computeCountryRiskV2("GG", {
      governance,
      sanctionsCoverageComplete: false,
      sourceStates: { aml: "unavailable", governance: "current", sanctions: "review-required" },
    });
    expect(result.status).toBe("insufficient-data");
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
  });

  it("applies the FATF grey-list floor", () => {
    const lowRiskAssessment: FatfAssessmentRecord = {
      ...assessment,
      iso2: "AO",
      country: "Angola",
      effectiveness: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`IO${index + 1}`, "HE"])),
      technicalCompliance: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`R${index + 1}`, "C"])),
    };
    const result = computeCountryRiskV2("AO", {
      assessment: lowRiskAssessment,
      governance,
      sanctionsCoverageComplete: true,
      sourceStates: currentStates,
    });
    expect(result.score).toBe(6);
    expect(result.floors).toContainEqual({ reason: "fatf-grey", minimum: 6 });
  });

  it("never labels a provisional low numeric result as Low", () => {
    const result = computeCountryRiskV2("GB", {
      assessment: {
        ...assessment,
        effectiveness: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`IO${index + 1}`, "HE"])),
        technicalCompliance: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`R${index + 1}`, "C"])),
      },
      governance,
      sanctionsCoverageComplete: false,
      sourceStates: { ...currentStates, sanctions: "review-required" },
    });
    expect(result.score).toBeLessThan(3);
    expect(result.status).toBe("provisional");
    expect(result.band).toBe("moderate");
  });

  it("sets medium and low confidence for old FATF assessments", () => {
    const medium = computeCountryRiskV2("GB", {
      assessment: { ...assessment, assessmentDate: "2019-01-01" },
      governance,
      sanctionsCoverageComplete: true,
      sourceStates: currentStates,
      asOf: new Date("2026-01-01"),
    });
    const low = computeCountryRiskV2("GB", {
      assessment: { ...assessment, assessmentDate: "2015-01-01" },
      governance,
      sanctionsCoverageComplete: true,
      sourceStates: currentStates,
      asOf: new Date("2026-01-01"),
    });
    expect(medium.confidence).toBe("medium");
    expect(low.confidence).toBe("low");
  });

  it("clamps invalid WGI percentiles and the headline to the 0-10 scale", () => {
    expect(governancePillarRisk({ cc: -20, rl: -20, rq: -20, ge: -20, pv: -20, va: -20 }).score).toBe(10);
    expect(governancePillarRisk({ cc: 120, rl: 120, rq: 120, ge: 120, pv: 120, va: 120 }).score).toBe(0);
  });

  it("withholds a pillar when one of the six WGI dimensions is missing", () => {
    expect(governancePillarRisk({ cc: 50, rl: 50, rq: 50, ge: 50, pv: 50 })).toEqual({
      score: null,
      evidenceCount: 5,
    });
  });
});
