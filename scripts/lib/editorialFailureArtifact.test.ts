import { describe, expect, it } from "vitest";
import { buildEditorialFailureArtifact } from "./editorialFailureArtifact.js";

describe("editorial failure diagnostics", () => {
  it("preserves bounded per-attempt content and exact gate diagnostics without source rows", () => {
    const failure = buildEditorialFailureArtifact({
      generatedAt: "2026-10-25T10:00:00.000Z",
      topic: "Board Guide: Building Effective AML Controls",
      slug: "board-guide-aml-controls",
      track: "evergreen-guide",
      sourceRecordCount: 19,
      maxAttempts: 3,
      maxArticleChars: 40,
      attempts: [1, 2, 3, 4].map((attempt) => ({
        attempt,
        article: { title: `Attempt ${attempt}`, excerpt: "A bounded diagnostic excerpt.", keywords: ["AML"], content: "x".repeat(100) },
        qualityReport: {
          passed: false,
          score: 95,
          checks: [{ id: "article_evidence_contract", name: "Article Evidence Contract", weight: "required", passed: false,
            message: "Declared evidence-record count does not match the evidence contract (19 unique records)" }],
          requiredPassed: 17,
          requiredTotal: 18,
          softPassed: 0,
          softTotal: 0,
        },
      })),
    });

    expect(failure.attempts.map((attempt) => attempt.attempt)).toEqual([2, 3, 4]);
    expect(failure.attempts[0]?.content).toHaveLength(40);
    expect(failure.attempts[0]?.contentTruncated).toBe(true);
    expect(failure.attempts[0]?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(failure.attempts[0]?.quality?.failedChecks).toEqual([{
      id: "article_evidence_contract",
      name: "Article Evidence Contract",
      weight: "required",
      message: "Declared evidence-record count does not match the evidence contract (19 unique records)",
    }]);
    expect(failure.sourceRowsIncluded).toBe(false);
    expect(JSON.stringify(failure)).not.toContain("notice_url");
    expect(JSON.stringify(failure)).not.toContain("DATABASE_URL");
  });
});
