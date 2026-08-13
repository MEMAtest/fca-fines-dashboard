import { describe, expect, it } from "vitest";
import { sanctionsSourceRunPersistenceSummary, sanctionsSourceRunStatus } from "./sanctionsSourceRun.js";

describe("sanctions source-run persistence", () => {
  it("keeps unchanged healthy catalogues succeeded when another catalogue needs review", () => {
    const sources = [
      { id: "ofac-programmes", healthy: true, changed: false, baselineMissing: false },
      { id: "uk-regimes", healthy: true, changed: false, baselineMissing: false },
      { id: "eu-resources", healthy: true, changed: true, baselineMissing: false },
      { id: "un-consolidated-list", healthy: true, changed: false, baselineMissing: false },
    ];

    expect(sanctionsSourceRunPersistenceSummary(sources)).toEqual({
      productionScoresChanged: false,
      sourceStatuses: {
        "ofac-programmes": "succeeded",
        "uk-regimes": "succeeded",
        "eu-resources": "review_required",
        "un-consolidated-list": "succeeded",
      },
    });
  });

  it("records thematic catalogue drift without treating it as a score-affecting review", () => {
    const summary = sanctionsSourceRunPersistenceSummary([
      { id: "eu-resources", healthy: true, changed: false, catalogueChanged: true },
    ]);
    expect(summary).toEqual({
      productionScoresChanged: false,
      sourceStatuses: { "eu-resources": "succeeded" },
    });
  });

  it("fails only the source with an unhealthy response and holds changed or unbaselined sources for review", () => {
    expect(sanctionsSourceRunStatus({ id: "ofac-programmes", healthy: false })).toBe("failed");
    expect(sanctionsSourceRunStatus({ id: "eu-resources", healthy: true, baselineMissing: true })).toBe("review_required");
  });
});
