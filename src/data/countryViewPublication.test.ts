import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  buildCountryIndex,
  buildCountryView,
  formatDate,
  globalRank,
  regionalAverages,
} from "./countryView.js";

const FORMER_V1_GAPS = ["VG", "CW", "GI", "GG", "IM", "MS", "SX", "TC", "VA"];

describe("country score publication safeguards", () => {
  it("formats persisted ISO score-run timestamps as calendar dates", () => {
    expect(formatDate("2026-07-17T10:03:29.041Z")).toBe("17 Jul 2026");
  });

  it("never publishes missing governance evidence as a 0.0 score", () => {
    const index = buildCountryIndex();
    expect(index).toHaveLength(211);
    expect(index.filter((entry) => entry.score === 0)).toEqual([]);
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
    expect(rated).toHaveLength(211);
    expect(globalRank("GB").total).toBe(211);
    expect(regionalAverages().reduce((sum, region) => sum + region.count, 0)).toBe(211);
  });

  it("exposes only the complete promoted sanctions snapshot", () => {
    const index = buildCountryIndex();
    expect(index.every((entry) => entry.sanctionsCoverageComplete)).toBe(true);
    expect(index.filter((entry) => entry.sanctionsTier).length).toBeGreaterThan(0);
  });

  it.each(["CW", "VG"])("uses safe decision copy for %s", (iso2) => {
    const country = getCountryByIso2(iso2);
    expect(country).toBeDefined();
    const view = buildCountryView(country!);
    expect(view.scoreStatus).toBe("provisional");
    expect(view.riskV2.score).not.toBeNull();
    expect(view.riskV2.band).not.toBe("low");
    expect(view.decision.verdictParagraph).toContain("Some information is unavailable");
    expect(view.decision.verdictParagraph).toContain("will not be labelled Low risk");
  });
});
