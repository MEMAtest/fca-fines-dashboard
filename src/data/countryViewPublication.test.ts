import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  buildCountryIndex,
  buildCountryView,
  countrySanctionsPresentation,
  formatDate,
  globalRank,
  regionalAverages,
} from "./countryView.js";
import { computeCountryRiskCurrent } from "./countryRiskMethodology.js";
import { getApprovedSanctionsCoverage } from "./sanctionsApprovedData.js";

const FORMER_V1_GAPS = ["VG", "CW", "GI", "GG", "IM", "MS", "SX", "TC", "VA"];

describe("country score publication safeguards", () => {
  it("formats persisted ISO score-run timestamps as calendar dates", () => {
    expect(formatDate("2026-07-17T10:03:29.041Z")).toBe("17 Jul 2026");
  });

  it("never publishes missing governance evidence as a 0.0 score", () => {
    const index = buildCountryIndex();
    // 214, not 213: US Virgin Islands has five of the six WGI dimensions, and
    // hasGovernanceData() only recognised the complete-series table, so it was
    // the one country in the list with no page at all.
    expect(index).toHaveLength(214);
    // The invariant that matters, and the reason this test exists: absent
    // evidence must never surface as a 0.0 "no risk" score.
    expect(index.filter((entry) => entry.score === 0)).toEqual([]);
    // Every jurisdiction now carries a score. Thin evidence is disclosed
    // through status and confidence rather than by withholding the number.
    expect(index.filter((entry) => entry.score === null)).toEqual([]);
    expect(index.filter((entry) => entry.status === "insufficient-data")).toEqual([]);
  });

  it.each(FORMER_V1_GAPS)("publishes %s provisionally without assigning a Low band", (iso2) => {
    const entry = buildCountryIndex().find((candidate) => candidate.country.iso2 === iso2);
    expect(entry?.score).not.toBeNull();
    expect(entry?.status).toBe("provisional");
    expect(entry?.band).not.toBe("low");
    expect(globalRank(iso2).rank).not.toBeNull();
  });

  it("includes complete and provisional jurisdictions in ranks and regional averages", () => {
    const rated = buildCountryIndex().filter((entry) => entry.score !== null);
    expect(rated).toHaveLength(214);
    expect(globalRank("GB").total).toBe(214);
    expect(regionalAverages().reduce((sum, region) => sum + region.count, 0)).toBe(214);
  });

  it("exposes only the complete promoted sanctions snapshot", () => {
    const index = buildCountryIndex();
    expect(index.every((entry) => entry.sanctionsCoverageComplete)).toBe(true);
    expect(index.filter((entry) => entry.sanctionsTier).length).toBeGreaterThan(0);
  });

  it("keeps the public coverage result fail-closed for a future partial jurisdiction", () => {
    const partialCoverage = getApprovedSanctionsCoverage("GB").slice(0, 3);
    const result = computeCountryRiskCurrent("GB", { sanctionsCoverage: partialCoverage });
    const presentation = countrySanctionsPresentation("GB", result);
    expect(presentation.sanctionsCoverageComplete).toBe(false);
    expect(presentation.sanctions).toBeUndefined();
    expect(presentation.sanctionsTier).toBeUndefined();
    expect(result.overlays.sanctions.treatment).toBe("unavailable");
    expect(result.limitingReasons).toContain("Sanctions overlay coverage is not complete; no absence is assumed");
  });

  it.each(["CW", "VG"])("uses safe decision copy for %s", (iso2) => {
    const country = getCountryByIso2(iso2);
    expect(country).toBeDefined();
    const view = buildCountryView(country!);
    expect(view.scoreStatus).toBe("provisional");
    expect(view.riskV3.score).not.toBeNull();
    expect(view.riskV2.band).not.toBe("low");
    expect(view.decision.verdictParagraph).toContain("Some information is unavailable");
    expect(view.decision.verdictParagraph).toContain("will not be labelled Low risk");
  });
});
