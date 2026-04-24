import { describe, expect, it } from "vitest";
import { getUKEnforcementRegulator } from "../../src/data/ukEnforcement.js";
import {
  buildUKEnforcementHealthReport,
  evaluateUKEnforcementSourceHealth,
  isFailingUKEnforcementHealth,
} from "./ukEnforcementHealth.js";

const referenceDate = new Date("2026-04-24T00:00:00Z");

function regulator(code: string) {
  const result = getUKEnforcementRegulator(code);
  expect(result).toBeTruthy();
  return result!;
}

describe("ukEnforcementHealth", () => {
  it("marks adjacent sources missing when no records exist", () => {
    const result = evaluateUKEnforcementSourceHealth({
      regulator: regulator("OFSI"),
      stats: undefined,
      referenceDate,
    });

    expect(result.status).toBe("missing");
    expect(result.sourceLayer).toBe("uk_enforcement_actions");
    expect(isFailingUKEnforcementHealth(result)).toBe(true);
  });

  it("treats stale adjacent sources as warn-first non-failing health", () => {
    const result = evaluateUKEnforcementSourceHealth({
      regulator: regulator("PSR"),
      stats: {
        regulator: "PSR",
        recordCount: 4,
        earliestRecordDate: "2022-01-01",
        latestRecordDate: "2025-01-01",
      },
      run: {
        regulator: "PSR",
        lastRunAt: "2026-04-24T00:00:00.000Z",
        lastStatus: "success",
        lastErrorMessage: null,
        lastSuccessfulRunAt: "2026-04-24T00:00:00.000Z",
      },
      referenceDate,
    });

    expect(result.status).toBe("stale");
    expect(result.ageDays).toBeGreaterThan(180);
    expect(isFailingUKEnforcementHealth(result)).toBe(false);
  });

  it("fails when the latest scraper run errored", () => {
    const result = evaluateUKEnforcementSourceHealth({
      regulator: regulator("PRA"),
      stats: {
        regulator: "PRA",
        recordCount: 20,
        earliestRecordDate: "2013-01-01",
        latestRecordDate: "2026-04-20",
      },
      run: {
        regulator: "PRA",
        lastRunAt: "2026-04-24T00:00:00.000Z",
        lastStatus: "error",
        lastErrorMessage: "PRA news API failed with 503",
        lastSuccessfulRunAt: "2026-04-20T00:00:00.000Z",
      },
      referenceDate,
    });

    expect(result.status).toBe("error");
    expect(result.message).toContain("503");
    expect(isFailingUKEnforcementHealth(result)).toBe(true);
  });

  it("builds a warn-first report across all UK enforcement sources", () => {
    const statsRows = [
      {
        regulator: "FCA",
        recordCount: 318,
        earliestRecordDate: "2013-01-01",
        latestRecordDate: "2026-04-23",
      },
      {
        regulator: "PRA",
        recordCount: 20,
        earliestRecordDate: "2013-01-01",
        latestRecordDate: "2026-04-20",
      },
      {
        regulator: "PSR",
        recordCount: 4,
        earliestRecordDate: "2022-01-01",
        latestRecordDate: "2025-01-01",
      },
      {
        regulator: "OFSI",
        recordCount: 18,
        earliestRecordDate: "2022-01-01",
        latestRecordDate: "2026-04-20",
      },
      {
        regulator: "ICO",
        recordCount: 58,
        earliestRecordDate: "2022-01-01",
        latestRecordDate: "2026-04-20",
      },
      {
        regulator: "CMA",
        recordCount: 74,
        earliestRecordDate: "2022-01-01",
        latestRecordDate: "2026-04-20",
      },
      {
        regulator: "FRC",
        recordCount: 133,
        earliestRecordDate: "2022-01-01",
        latestRecordDate: "2026-04-20",
      },
      {
        regulator: "TPR",
        recordCount: 48,
        earliestRecordDate: "2022-01-01",
        latestRecordDate: "2026-04-20",
      },
    ];
    const runRows = ["PRA", "PSR", "OFSI", "ICO", "CMA", "FRC", "TPR"].map(
      (code) => ({
        regulator: code,
        lastRunAt: "2026-04-24T00:00:00.000Z",
        lastStatus: "success",
        lastErrorMessage: null,
        lastSuccessfulRunAt: "2026-04-24T00:00:00.000Z",
      }),
    );

    const report = buildUKEnforcementHealthReport({
      statsRows,
      runRows,
      referenceDate,
    });

    expect(report.totals.sources).toBe(8);
    expect(report.totals.failing).toBe(0);
    expect(report.success).toBe(true);
    expect(report.sources.find((source) => source.regulator === "PSR")?.status)
      .toBe("stale");
  });
});
