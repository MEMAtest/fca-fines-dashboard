import { describe, expect, it } from "vitest";
import {
  buildLiveRegulatorHealthReport,
  evaluateLiveRegulatorHealth,
  getFreshnessThresholdDays,
  getLiveRegulatorCadence,
} from "../lib/liveRegulatorHealth.js";
import { getRegulatorCoverage } from "../../../src/data/regulatorCoverage.js";

describe("liveRegulatorHealth", () => {
  it("assigns fragile cadence and longer thresholds to lower-confidence live regulators", () => {
    expect(getLiveRegulatorCadence("FCA")).toBe("daily");
    expect(getLiveRegulatorCadence("DFSA")).toBe("fragile");
    expect(getFreshnessThresholdDays("SEC")).toBe(3);
    expect(getFreshnessThresholdDays("CIRO")).toBe(10);
  });

  it("marks missing live regulators when no records are present", () => {
    const coverage = getRegulatorCoverage("CIRO");

    expect(coverage).not.toBeNull();

    const result = evaluateLiveRegulatorHealth(
      coverage!,
      undefined,
      new Date("2026-03-27T00:00:00Z"),
    );

    expect(result.status).toBe("missing");
    expect(result.automationLevel).toBe("automated");
    expect(result.message).toContain("No live records");
  });

  it("marks stale feeds when latest data falls outside the cadence window", () => {
    const coverage = getRegulatorCoverage("DFSA");

    expect(coverage).not.toBeNull();

    const result = evaluateLiveRegulatorHealth(
      coverage!,
      {
        regulator: "DFSA",
        recordCount: 19,
        earliestRecordDate: "2016-09-26",
        latestRecordDate: "2026-03-01",
      },
      new Date("2026-03-27T00:00:00Z"),
    );

    expect(result.status).toBe("stale");
    expect(result.automationLevel).toBe("curated_archive");
    expect(result.ageDays).toBe(26);
    expect(result.message).toContain("10-day fragile window");
  });

  it("builds a report for the selected live cadence group", () => {
    const results = buildLiveRegulatorHealthReport(
      [
        {
          regulator: "FCA",
          recordCount: 300,
          earliestRecordDate: "2013-01-01",
          latestRecordDate: "2026-03-26",
        },
        {
          regulator: "SEC",
          recordCount: 1797,
          earliestRecordDate: "2012-01-03",
          latestRecordDate: "2026-03-25",
        },
        {
          regulator: "DFSA",
          recordCount: 19,
          earliestRecordDate: "2016-09-26",
          latestRecordDate: "2026-03-20",
        },
      ],
      "daily",
      new Date("2026-03-27T00:00:00Z"),
    );

    expect(results.some((result) => result.regulator === "DFSA")).toBe(false);
    expect(results.find((result) => result.regulator === "FCA")?.status).toBe(
      "ok",
    );
    expect(results.find((result) => result.regulator === "SEC")?.status).toBe(
      "ok",
    );
  });
});
