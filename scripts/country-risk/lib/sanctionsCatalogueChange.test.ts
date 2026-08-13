import { describe, expect, it } from "vitest";
import { classifySanctionsCatalogueChange } from "./sanctionsCatalogueChange.js";

const baseline = {
  approvedFingerprint: "catalogue-approved",
  approvedCoverageFingerprint: "country-regimes-approved",
  approvedScoringFingerprint: "scored-evidence-approved",
};

describe("sanctions catalogue change classification", () => {
  it("retains thematic-only EU catalogue drift without blocking the country score", () => {
    expect(classifySanctionsCatalogueChange(baseline, {
      catalogueFingerprint: "catalogue-with-new-thematic-regimes",
      coverageFingerprint: "country-regimes-approved",
      scoringFingerprint: "scored-evidence-approved",
    })).toEqual({
      catalogueChanged: true,
      coverageChanged: false,
      scoreEvidenceChanged: false,
    });
  });

  it("fails closed when the country coverage or scoring-relevant measures drift", () => {
    expect(classifySanctionsCatalogueChange(baseline, {
      catalogueFingerprint: "catalogue-changed",
      coverageFingerprint: "country-regimes-approved",
      scoringFingerprint: "changed-measures-or-expiry",
    }).scoreEvidenceChanged).toBe(true);
    expect(classifySanctionsCatalogueChange(baseline, {
      catalogueFingerprint: "catalogue-changed",
      coverageFingerprint: "country-regime-added",
      scoringFingerprint: "scored-evidence-approved",
    }).coverageChanged).toBe(true);
  });
});
