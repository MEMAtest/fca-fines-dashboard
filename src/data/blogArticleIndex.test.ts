import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BLOG_ARTICLE_INDEX, BLOG_ARTICLE_COUNT } from "./blogArticleIndex.js";
import { getPublicBlogArticles, isPublished } from "./blogArticles.js";
import { buildBlogIndexSource } from "../../scripts/generate-blog-index.js";

/**
 * The index is a committed generated file, so it can go stale. The build
 * regenerates it, but a stale commit would still ship wrong preview cards, so
 * this fails the moment the two disagree.
 */
describe("blog article index", () => {
  it("matches what the generator produces from blogArticles.ts", () => {
    const committed = readFileSync("src/data/blogArticleIndex.ts", "utf8");
    expect(
      committed === buildBlogIndexSource(),
      "src/data/blogArticleIndex.ts is stale. Run: npx tsx scripts/generate-blog-index.ts --write",
    ).toBe(true);
  });

  it("covers every explicitly public article, newest first", () => {
    const published = getPublicBlogArticles();
    expect(BLOG_ARTICLE_COUNT).toBe(published.length);
    expect(BLOG_ARTICLE_INDEX).toHaveLength(published.length);
    for (let i = 1; i < BLOG_ARTICLE_INDEX.length; i += 1) {
      expect(BLOG_ARTICLE_INDEX[i - 1].dateISO >= BLOG_ARTICLE_INDEX[i].dateISO).toBe(true);
    }
  });

  it("does not expose draft or scheduled editorial material", () => {
    expect(getPublicBlogArticles().every((article) =>
      article.status !== "draft" && article.status !== "scheduled"
    )).toBe(true);
  });

  it("carries only the fields the cards render", () => {
    // The entire point is not shipping article bodies to the homepage.
    for (const card of BLOG_ARTICLE_INDEX) {
      expect(Object.keys(card).sort()).toEqual(
        ["category", "date", "dateISO", "excerpt", "slug", "title"],
      );
      expect(card).not.toHaveProperty("content");
    }
  });
});

describe("controlled revision publication filter", () => {
  const hash = "a".repeat(64);
  const article = (): Parameters<typeof isPublished>[0] => {
    const checks = [
      "word_count", "section_structure", "takeaway_structure", "data_accuracy",
      "amount_accuracy", "no_truncation", "no_duplicates", "no_hallucinated_firms",
      "no_internal_record_ids", "title_quality", "house_style", "data_usage",
      "specificity", "keyword_count", "editorial_tone", "readability",
      "article_evidence_contract", "grounded_cyber_topic",
    ].map((id) => ({ id, passed: true as const }));
    const sourceIds = ["record-1"];
    const revisedAt = "2026-10-21T16:09:58.305Z";
    return {
      slug: "cyber-operational-resilience-enforcement",
      status: "published",
      generatedBy: "ai",
      dateISO: "2026-09-16",
      updatedAt: "2026-10-21",
      dateModified: revisedAt,
      revisionManifest: {
        version: 1 as const,
        slug: "cyber-operational-resilience-enforcement",
        revisedAt,
        operatorRecord: { identity: "root-primary-qa" as const, completedAt: revisedAt, result: "passed" as const },
        previousContentHash: hash,
        contentHash: hash,
        sourceContractHash: hash,
        sourceRecordIds: sourceIds,
        approvalManifestSha256: hash,
        checks,
        sources: [{ id: "record-1", regulator: "SEC", url: "https://www.sec.gov/example" }],
        publicationHistory: [{ dateISO: "2026-09-16", originalContentHash: hash, originalArtifactSha256: hash }],
      },
    };
  };

  it("accepts only a complete current revision for a controlled article", () => {
    expect(isPublished(article(), "2026-10-21")).toBe(true);
  });

  it("rejects a revision with a failed required check", () => {
    const candidate = article();
    const malformedCandidate = {
      ...candidate,
      revisionManifest: {
        ...candidate.revisionManifest!,
        checks: [
          ...candidate.revisionManifest!.checks.slice(1),
          { id: "word_count", passed: false },
        ],
      },
    };
    expect(isPublished(malformedCandidate as unknown as Parameters<typeof isPublished>[0], "2026-10-21")).toBe(false);
  });

  it("rejects a revision for a slug outside the controlled allowlist", () => {
    const candidate = article();
    candidate.slug = "unapproved-revision";
    expect(isPublished(candidate, "2026-10-21")).toBe(false);
  });

  it("does not expose a revision dated in the future", () => {
    const candidate = article();
    const future = "2026-10-22T00:00:00.000Z";
    candidate.revisionManifest!.revisedAt = future;
    candidate.revisionManifest!.operatorRecord.completedAt = future;
    candidate.dateModified = future;
    candidate.updatedAt = "2026-10-22";
    expect(isPublished(candidate, "2026-10-21")).toBe(false);
  });
});
