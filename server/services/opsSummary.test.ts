import { describe, expect, it } from "vitest";
import { evaluateOpsHealth } from "./opsSummary.js";

const healthy = {
  sources: { criticalFailures: 0, needsReview: 0, overdue: 0, weakEvidence: 0 },
  scrapers: { quarantined: 0, stale: 0, uncontracted: 0, missingRuns: 0 },
  monitors: { recentFailures: 0, verificationOverdue: 0, activeWithoutBaseline: 0 },
  boardPack: { failed: 0, overdue: 0, processing: 0, due: 0 },
};

describe("consolidated operations health", () => {
  it("is healthy only when every trust and delivery lane is clear", () => {
    expect(evaluateOpsHealth(healthy)).toEqual({
      overall: "healthy",
      sections: { sources: "healthy", scrapers: "healthy", monitors: "healthy", boardPack: "healthy" },
    });
  });

  it("surfaces warnings without hiding a critical lane", () => {
    const result = evaluateOpsHealth({
      ...healthy,
      sources: { ...healthy.sources, needsReview: 2 },
      scrapers: { ...healthy.scrapers, quarantined: 1 },
    });
    expect(result.overall).toBe("critical");
    expect(result.sections.sources).toBe("warning");
    expect(result.sections.scrapers).toBe("critical");
  });
});
