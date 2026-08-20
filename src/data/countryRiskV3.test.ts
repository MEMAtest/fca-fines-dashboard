import { describe, expect, it } from "vitest";
import type { FatfAssessmentRecord } from "./fatfAssessmentData.js";
import {
  beneficialOwnershipRisk,
  computeCountryRiskV3,
  fatfEffectivenessRisk,
  fatfSafeguardsRisk,
  governanceSafeguardsRisk,
} from "./countryRiskV3.js";

const assessment: FatfAssessmentRecord = {
  iso2: "GB",
  country: "United Kingdom",
  methodology: "2013",
  assessmentDate: "2024-01-01",
  effectiveness: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [
    `IO${index + 1}`,
    index % 2 ? "SE" : "LE",
  ])),
  technicalCompliance: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [
    `R${index + 1}`,
    index % 4 === 0 ? "C" : "PC",
  ])),
};

describe("country risk v3", () => {
  it("uses all eleven FATF effectiveness outcomes", () => {
    expect(fatfEffectivenessRisk(assessment)).toMatchObject({ score: 7, evidenceCount: 11 });
    expect(fatfEffectivenessRisk({ ...assessment, effectiveness: { IO1: "LE" } })).toMatchObject({ score: null, evidenceCount: 1 });
  });

  it("requires every technical recommendation but excludes explicit NA ratings", () => {
    expect(fatfSafeguardsRisk(assessment)).toMatchObject({ score: 5, evidenceCount: 40 });
    expect(fatfSafeguardsRisk({ ...assessment, technicalCompliance: { ...assessment.technicalCompliance, R40: undefined }, technicalNotApplicable: ["R40"] })).toMatchObject({ score: 5, evidenceCount: 40 });
    expect(fatfSafeguardsRisk({ ...assessment, technicalCompliance: { ...assessment.technicalCompliance, R40: undefined } })).toMatchObject({ score: null, evidenceCount: 39 });
  });

  it("derives beneficial ownership as 60% IO5 + 20% R24 + 20% R25", () => {
    const bo = beneficialOwnershipRisk({
      ...assessment,
      effectiveness: { ...assessment.effectiveness, IO5: "LE" },
      technicalCompliance: { ...assessment.technicalCompliance, R24: "NC", R25: "PC" },
    });
    expect(bo).toMatchObject({ effectiveness: 10, companies: 10, trustsAndArrangements: 6.67, score: 9.3, availability: "available", evidenceCount: 3 });
  });

  it("uses inverted WGI dimensions and withholds incomplete governance", () => {
    expect(governanceSafeguardsRisk({ cc: 80, rl: 80, rq: 80, ge: 80, pv: 80, va: 80 })).toEqual({ score: 2, evidenceCount: 6 });
    expect(governanceSafeguardsRisk({ cc: 80, rl: 80, rq: 80, ge: 80, pv: 80 })).toEqual({ score: null, evidenceCount: 5 });
  });

  it("rebalances two available pillars and suppresses a provisional Low band", () => {
    const result = computeCountryRiskV3("GB", {
      assessment,
      governance: {},
      sanctionsCoverageComplete: false,
      sourceStates: { aml: "current", governance: "unavailable", fatfLists: "current", sanctions: "review-required" },
      asOf: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result.status).toBe("provisional");
    expect(result.score).not.toBeNull();
    expect(result.pillars.effectiveness.appliedWeight).toBeCloseTo(0.6923, 4);
    expect(result.pillars.safeguards.appliedWeight).toBeCloseTo(0.3077, 4);
    expect(result.pillars.governance.score).toBeNull();
  });

  it("does not let sanctions or FATF listing alter the numeric score", () => {
    const base = computeCountryRiskV3("GB", {
      assessment,
      governance: { cc: 80, rl: 80, rq: 80, ge: 80, pv: 80, va: 80 },
      sanctionsCoverageComplete: true,
      sourceStates: { aml: "current", governance: "current", fatfLists: "current", sanctions: "current" },
      asOf: new Date("2026-01-01T00:00:00Z"),
    });
    const listed = computeCountryRiskV3("VE", { asOf: new Date("2026-08-20T00:00:00Z") });
    expect(base.score).toBe(4.9);
    expect(listed.score).toBe(8.3);
    expect(listed.overlays.fatf.treatment).toBe("increased-monitoring");
    expect(listed.overlays.sanctions.highestTier).toBe("sectoral");
    expect(listed.arithmetic).toContain("sanctions and FATF listing are overlays");
  });

  it("marks missing sanctions as unavailable rather than treating absence as no programme", () => {
    const result = computeCountryRiskV3("GB", {
      assessment,
      governance: { cc: 80, rl: 80, rq: 80, ge: 80, pv: 80, va: 80 },
      sanctionsCoverageComplete: false,
      sourceStates: { aml: "current", governance: "current", fatfLists: "current", sanctions: "review-required" },
    });
    expect(result.sanctionsCoverageComplete).toBe(false);
    expect(result.overlays.sanctions.treatment).toBe("unavailable");
    expect(result.limitingReasons).toContain("Sanctions overlay coverage is not complete; no absence is assumed");
  });
});
