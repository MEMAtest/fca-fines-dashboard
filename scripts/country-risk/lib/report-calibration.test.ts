import { describe, expect, it } from "vitest";
import { buildCalibrationReport } from "../report-calibration.js";

describe("country-risk calibration report", () => {
  it("reports the all-country publication and sensitivity contract", async () => {
    const report = await buildCalibrationReport();
    expect(report.methodologyVersion).toBe("3.1.0");
    expect(report.allCountries).toMatchObject({
      total: 214,
      rankedEligible: 204,
      completeRanked: 190,
      provisionalCompositeRanked: 14,
      indicativeProxyUnranked: 10,
    });
    expect(report.allCountries.sensitivity).toMatchObject({
      onePillarRangeNotApplicable: 10,
      bandCrossingCount: 45,
      maxSpan: 0.7,
    });
    expect(report.allCountries.nearThresholdCounts).toEqual({
      // Near-threshold counts drift whenever the underlying evidence refreshes.
      // One country crossed into each of the 0.2 and 0.3 bands when #221
      // refreshed the FATF ratings; the shape of the distribution is unchanged.
      within0_1: 41,
      within0_2: 66,
      within0_3: 93,
    });
    expect(report.basel.status).toBe("not-loaded");
  });
});
