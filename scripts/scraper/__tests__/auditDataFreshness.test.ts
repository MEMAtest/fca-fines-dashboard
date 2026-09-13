import { describe, expect, it } from "vitest";
import { evaluate, type FreshnessRow } from "../../monitoring/auditDataFreshness.js";

function row(overrides: Partial<FreshnessRow>): FreshnessRow {
  return {
    regulator: "AMMC",
    latestRecord: "2024-03-07",
    daysSinceLatest: 850,
    totalRecords: 9,
    recordsLast90Days: 0,
    recordsLast12mPerMonth: 0.08,
    ...overrides,
  };
}

describe("legacy data freshness audit", () => {
  it("does not flag a low-frequency source merely because its archive is quiet", () => {
    expect(
      evaluate([row({ regulator: "AMMC" })], new Date("2026-07-24T00:00:00Z")),
    ).toEqual([]);
  });

  it("retains genuine source-contract action-required findings", () => {
    const flagged = evaluate(
      [
        row({
          regulator: "FCA",
          latestRecord: "2025-01-01",
          daysSinceLatest: 450,
          totalRecords: 300,
          recordsLast12mPerMonth: 20,
        }),
      ],
      new Date("2026-07-24T00:00:00Z"),
    );

    expect(flagged).toHaveLength(1);
    expect(flagged[0].thresholdDays).toBe(180);
    expect(flagged[0].reason).toContain("source-contract health is action_required");
  });

  it("retains future-dated records as action required", () => {
    const flagged = evaluate(
      [
        row({
          regulator: "FCA",
          latestRecord: "2026-12-31",
          daysSinceLatest: 0,
          totalRecords: 300,
          futureRecordCount: 1,
          latestFutureRecordDate: "2026-12-31",
        }),
      ],
      new Date("2026-07-24T00:00:00Z"),
    );

    expect(flagged).toHaveLength(1);
    expect(flagged[0].reason).toContain("future-dated");
  });
});
