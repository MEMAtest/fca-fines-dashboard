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
      bandCrossingCount: expect.any(Number),
    });
    expect(report.basel.status).toBe("not-loaded");
  });
});
