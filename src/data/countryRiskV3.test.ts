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

  it("derives beneficial ownership as 80% FATF + 20% register access", () => {
    const weak = {
      ...assessment,
      effectiveness: { ...assessment.effectiveness, IO5: "LE" as const },
      technicalCompliance: { ...assessment.technicalCompliance, R24: "NC" as const, R25: "PC" as const },
    };
    // The FATF half is unchanged: 60% IO5 + 20% R24 + 20% R25 = 9.3.
    expect(beneficialOwnershipRisk(weak, "ZZ")).toMatchObject({
      effectiveness: 10,
      companies: 10,
      trustsAndArrangements: 6.67,
      // ZZ has no register in the snapshot, so absence scores 9.0. The FATF
      // half is carried unrounded: 9.334 x 0.8 + 9.0 x 0.2 = 9.267 -> 9.3.
      score: 9.3,
      evidenceCount: 3,
    });
    // The United Kingdom runs a whole-economy register a firm can read, which
    // pulls the same FATF ratings down: 9.334 x 0.8 + 2.0 x 0.2 = 7.867 -> 7.9.
    const gb = beneficialOwnershipRisk(weak, "GB");
    expect(gb.score).toBe(7.9);
    expect(gb.register.tier).toBe("cdd-accessible");
    expect(gb.formula).toBe("80% FATF (60% IO5 + 20% R24 + 20% R25) + 20% register access");
  });

  it("uses inverted WGI dimensions and withholds governance below five of six", () => {
    expect(governanceSafeguardsRisk({ cc: 80, rl: 80, rq: 80, ge: 80, pv: 80, va: 80 })).toEqual({ score: 2, evidenceCount: 6 });
    // Five of six now scores. Exactly three jurisdictions sit here — Bermuda,
    // Anguilla and US Virgin Islands, each missing only Voice and
    // Accountability — and none has between one and four dimensions, so this
    // threshold admits those three and nothing else. Requiring all six dropped
    // US Virgin Islands from the site entirely over one absent series.
    expect(governanceSafeguardsRisk({ cc: 80, rl: 80, rq: 80, ge: 80, pv: 80 })).toEqual({ score: 2, evidenceCount: 5 });
    expect(governanceSafeguardsRisk({ cc: 80, rl: 80, rq: 80, ge: 80 })).toEqual({ score: null, evidenceCount: 4 });
    expect(governanceSafeguardsRisk(undefined)).toEqual({ score: null, evidenceCount: 0 });
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

  it("publishes Libya from its sole WGI pillar, flagged as indicative", () => {
    // This test previously asserted the opposite: status "insufficient-data",
    // a null score, every appliedWeight zero. That was a deliberate rule — one
    // pillar is evidence, not a composite, so do not normalise it to 100%.
    //
    // It was changed on purpose. Withholding a number for Libya, Somalia,
    // Sudan and twelve others meant the platform said "not enough information"
    // about some of the highest-risk jurisdictions on earth while holding a
    // clear governance reading for every one of them. The score is now
    // published and the thinness of the evidence is disclosed instead of the
    // score being suppressed: status provisional, confidence low, and an
    // explicit limiting reason.
    //
    // The invariant that actually mattered still holds and is asserted below:
    // missing evidence is never scored as zero.
    const result = computeCountryRiskV3("LY", { asOf: new Date("2026-08-20T00:00:00Z") });
    expect(result.status).toBe("provisional");
    expect(result.score).toBe(7.3);
    expect(result.confidence).toBe("low");
    expect(result.pillars.governance.score).toBe(7.3);
    expect(result.pillars.governance.appliedWeight).toBe(1);
    expect(result.limitingReasons).toContain(
      "Only one line of evidence is available, so the score is indicative rather than a composite",
    );
    // Missing pillars contribute nothing — they are not read as zero risk.
    expect(result.pillars.effectiveness.score).toBeNull();
    expect(result.pillars.effectiveness.contribution).toBeNull();
    expect(result.pillars.safeguards.score).toBeNull();
    expect(result.pillars.safeguards.contribution).toBeNull();
  });
});
