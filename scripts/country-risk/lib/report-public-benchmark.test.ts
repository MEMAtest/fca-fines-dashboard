import { describe, expect, it } from "vitest";
import {
  buildPublicBenchmarkReport,
  renderPublicBenchmarkMarkdown,
} from "../report-public-benchmark.js";

describe("public competitor benchmark", () => {
  it("validates and reports the stratified 30-country sample without inferring private scores", () => {
    const report = buildPublicBenchmarkReport(undefined, new Date("2026-08-06T13:28:14.832Z"));
    expect(report.sampleSize).toBe(30);
    expect(report.regActionsCoverage).toBeGreaterThanOrEqual(213);
    expect(report.competitorPublicCoverageClaim).toBe(245);
    // The benchmark intentionally records changes since its observation date.
    // A genuine official-source refresh can change a confidence or status, so
    // the release gate must verify that those deltas are reported rather than
    // incorrectly treating every legitimate refresh as a test failure.
    expect(report.changedSinceObservation.every((change) =>
      JSON.stringify(change.observed) !== JSON.stringify(change.current),
    )).toBe(true);
    expect(Object.values(report.comparisonCounts).reduce((sum, value) => sum + value, 0)).toBe(30);
    const markdown = renderPublicBenchmarkMarkdown(report);
    expect(markdown).toContain("KYC numeric scores are not public and are not inferred");
    expect(markdown).toContain("| Myanmar | 7.8 very-high");
    expect(markdown).toContain("| Russia | 4.6 moderate");
  });
});
