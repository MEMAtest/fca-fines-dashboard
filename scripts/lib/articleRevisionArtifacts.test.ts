import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildArticleEvidenceContract } from "./articleEvidenceContract.js";
import { getArticleQualityWordRange, runQualityGate, type ArticleContent } from "./articleQuality.js";
import { stableJsonHash, contentHashFromMeta, ARTICLE_REVISION_SLUGS, REQUIRED_REVISION_CHECKS } from "./articleRevisionPublisher.js";
import { contentHash } from "./editorialWorkflow.js";
import type { ArticleRevisionManifest } from "../../src/types/articleRevision.js";

const originalPublicationDates: Record<string, string> = {
  "aml-kyc-enforcement-trends": "2026-08-12",
  "cyber-operational-resilience-enforcement": "2026-09-16",
  "regulatory-roundup-october-2026": "2026-10-05",
};

describe("revised published article artifacts", () => {
  it("keeps all three reviewed revisions hash-bound, contract-bound, and at 100% deterministic quality", () => {
    for (const slug of ARTICLE_REVISION_SLUGS) {
      const article = JSON.parse(readFileSync(`scripts/data/published/${slug}.json`, "utf8")) as Record<string, any>;
      const revision = article.revisionManifest as ArticleRevisionManifest | undefined;

      expect(revision, `${slug} must retain its revision record`).toBeDefined();
      expect(article.slug).toBe(slug);
      expect(article.dateISO).toBe(originalPublicationDates[slug]);
      expect(article.status).toBe("published");
      for (const stale of ["editorialManifest", "publicationManifest", "qualityReport", "generatedAt"]) {
        expect(article, `${slug} must not retain stale ${stale}`).not.toHaveProperty(stale);
      }

      const currentContentHash = contentHash({
        title: article.title,
        excerpt: article.excerpt,
        keywords: article.keywords,
        content: article.content,
      });
      expect(contentHashFromMeta(article)).toBe(currentContentHash);
      expect(revision!.version).toBe(1);
      expect(revision!.slug).toBe(slug);
      expect(revision!.contentHash).toBe(currentContentHash);
      expect(revision!.operatorRecord).toMatchObject({ identity: "root-primary-qa", result: "passed" });
      expect(revision!.publicationHistory[0]?.dateISO).toBe(originalPublicationDates[slug]);

      const records = article.sourceRecords as Array<Record<string, any>>;
      expect(records.map((record) => record.id).sort()).toEqual([...revision!.sourceRecordIds].sort());
      const contract = buildArticleEvidenceContract(records as any);
      expect(revision!.sourceContractHash).toBe(stableJsonHash(contract));
      expect(article.editorialManifest).toBeUndefined();

      const quality = runQualityGate(article as ArticleContent, records as any, getArticleQualityWordRange(article.articleType), contract);
      expect(quality.score, `${slug} score`).toBe(100);
      expect(quality.checks).toHaveLength(18);
      expect(quality.passed, `${slug} failed: ${quality.checks.filter((check) => !check.passed).map((check) => `${check.id}: ${check.message}`).join("; ")}`).toBe(true);
      for (const id of REQUIRED_REVISION_CHECKS) {
        expect(quality.checks.find((check) => check.id === id)?.passed, `${slug} ${id}`).toBe(true);
      }
      expect(revision!.checks.map((check) => check.id).sort()).toEqual(quality.checks.map((check) => check.id).sort());
    }
  });
});
