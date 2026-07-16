import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  buildCountryIndex,
  buildCountryView,
  globalRank,
  regionalAverages,
} from "./countryView.js";

const INSUFFICIENT = ["VG", "CW", "GI", "GG", "IM", "MS", "SX", "TC", "VA"];

describe("country score publication safeguards", () => {
  it("never publishes missing governance evidence as a 0.0 score", () => {
    const index = buildCountryIndex();
    expect(index).toHaveLength(211);
    expect(index.filter((entry) => entry.score === 0)).toEqual([]);
    expect(index.filter((entry) => entry.score === null).map((entry) => entry.country.iso2))
      .toEqual(INSUFFICIENT);
  });

  it.each(INSUFFICIENT)("withholds %s instead of assigning a Low band", (iso2) => {
    const entry = buildCountryIndex().find((candidate) => candidate.country.iso2 === iso2);
    expect(entry).toMatchObject({ score: null, band: null, status: "insufficient-data" });
    expect(globalRank(iso2).rank).toBeNull();
  });

  it("excludes withheld jurisdictions from ranks and regional averages", () => {
    const rated = buildCountryIndex().filter((entry) => entry.score !== null);
    expect(rated).toHaveLength(202);
    expect(globalRank("GB").total).toBe(202);
    expect(regionalAverages().reduce((sum, region) => sum + region.count, 0)).toBe(202);
  });

  it.each(["CW", "VG"])("uses safe decision copy for %s", (iso2) => {
    const country = getCountryByIso2(iso2);
    expect(country).toBeDefined();
    const view = buildCountryView(country!);
    expect(view.scoreStatus).toBe("insufficient-data");
    expect(view.decision.verdictHeadline).toContain("Insufficient evidence");
    expect(view.decision.verdictParagraph).toContain("withholds the numerical score");
    expect(view.decision.verdictParagraph).toContain("No zero or Low-risk conclusion");
    expect(view.decision.treatmentChecklist).toContain(
      "Do not classify the jurisdiction as low risk from missing evidence",
    );
  });
});
