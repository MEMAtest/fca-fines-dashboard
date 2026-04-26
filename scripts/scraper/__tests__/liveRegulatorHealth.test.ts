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
    expect(getFreshnessThresholdDays("SEC")).toBe(120);
    expect(getFreshnessThresholdDays("CIRO")).toBe(365);
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
    expect(result.severity).toBe("critical");
    expect(result.automationLevel).toBe("automated");
    expect(result.message).toContain("No live records");
  });

  it("marks curated archive feeds as watch-only when latest data falls outside the source contract", () => {
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
      new Date("2027-04-01T00:00:00Z"),
    );

    expect(result.status).toBe("stale");
    expect(result.severity).toBe("watch");
    expect(result.automationLevel).toBe("curated_archive");
    expect(result.ageDays).toBe(396);
    expect(result.message).toContain("365-day fragile source-contract window");
    expect(result.minimumHealthyRecords).toBe(9);
    expect(result.sourceContractSummary).toContain("challenge-protected");
  });

  it("warns when live archive volume collapses below the healthy floor", () => {
    const coverage = getRegulatorCoverage("CIRO");

    expect(coverage).not.toBeNull();

    const result = evaluateLiveRegulatorHealth(
      coverage!,
      {
        regulator: "CIRO",
        recordCount: 40,
        earliestRecordDate: "2019-11-18",
        latestRecordDate: "2026-03-26",
      },
      new Date("2026-03-27T00:00:00Z"),
    );

    expect(result.status).toBe("warning");
    expect(result.severity).toBe("action_required");
    expect(result.minimumHealthyRecords).toBe(139);
    expect(result.operatorAction).toContain("selector drift");
    expect(result.message).toContain("below the healthy floor");
  });

  it("marks future-dated records as action required", () => {
    const coverage = getRegulatorCoverage("JFSC");

    expect(coverage).not.toBeNull();

    const result = evaluateLiveRegulatorHealth(
      coverage!,
      {
        regulator: "JFSC",
        recordCount: 10,
        earliestRecordDate: "2017-03-01",
        latestRecordDate: "9999-12-31",
        futureRecordCount: 1,
        latestFutureRecordDate: "9999-12-31",
      },
      new Date("2026-04-26T00:00:00Z"),
    );

    expect(result.status).toBe("warning");
    expect(result.severity).toBe("action_required");
    expect(result.message).toContain("future-dated");
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
