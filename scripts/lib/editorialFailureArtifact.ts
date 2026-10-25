import { createHash } from "node:crypto";
import type { QualityReport } from "./articleQuality.js";

export interface FailedEditorialAttempt {
  attempt: number;
  article: { title: string; excerpt: string; keywords: string[]; content: string } | null;
  qualityReport: QualityReport | null;
  generationError?: string;
}

export function buildEditorialFailureArtifact({
  generatedAt,
  topic,
  slug,
  track,
  sourceRecordCount,
  attempts,
  maxAttempts = 3,
  maxArticleChars = 60_000,
}: {
  generatedAt: string;
  topic: string;
  slug: string;
  track: string;
  sourceRecordCount: number;
  attempts: FailedEditorialAttempt[];
  maxAttempts?: number;
  maxArticleChars?: number;
}) {
  return {
    schemaVersion: 1,
    generatedAt,
    topic,
    slug,
    track,
    sourceRecordCount,
    sourceRowsIncluded: false,
    gateChanged: false,
    attempts: attempts.slice(-maxAttempts).map(({ attempt, article, qualityReport, generationError }) => {
      const content = article?.content ?? "";
      const boundedContent = content.slice(0, maxArticleChars);
      return {
        attempt,
        generationError: generationError?.slice(0, 2_000) ?? null,
        title: article?.title ?? null,
        excerpt: article?.excerpt ?? null,
        keywords: article?.keywords ?? [],
        content: boundedContent,
        contentTruncated: content.length > boundedContent.length,
        contentSha256: article ? createHash("sha256").update(content).digest("hex") : null,
        wordCount: content ? content.split(/\s+/).filter(Boolean).length : 0,
        quality: qualityReport ? {
          passed: qualityReport.passed,
          score: qualityReport.score,
          requiredPassed: qualityReport.requiredPassed,
          requiredTotal: qualityReport.requiredTotal,
          failedChecks: qualityReport.checks.filter((check) => !check.passed).map((check) => ({
            id: check.id,
            name: check.name,
            weight: check.weight,
            message: check.message.slice(0, 2_000),
          })),
        } : null,
      };
    }),
  };
}
