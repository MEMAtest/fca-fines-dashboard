import { describe, expect, test } from "vitest";
import {
  resolveArticleReleaseDate,
  upsertApprovedArticleSource,
} from "../../scripts/lib/articlePublisher.js";

const prefix = `type BlogArticleMeta = Record<string, unknown>;
const baseBlogArticles: BlogArticleMeta[] = [
  {
    slug: "manual-article",
    generatedBy: "manual",
  },
  {
    slug: "legacy-ai",
    generatedBy: "ai",
  },
];

export const blogArticles = baseBlogArticles.map((article) => article);
const yearlyArticleData = [
  { slug: "yearly-entry" },
];
`;

describe("Publisher Agent source insertion", () => {
  test("uses the real release date for a past-dated calendar article", () => {
    expect(resolveArticleReleaseDate("2025-08-01", "2026-07-24")).toEqual({
      scheduled: false,
      date: "24 July 2026",
      dateISO: "2026-07-24",
    });
  });

  test("preserves a future date for a scheduled article", () => {
    expect(resolveArticleReleaseDate("2026-08-01", "2026-07-24")).toEqual({
      scheduled: true,
      date: "1 August 2026",
      dateISO: "2026-08-01",
    });
  });

  test("appends a new article to baseBlogArticles, not the yearly array", () => {
    const result = upsertApprovedArticleSource(prefix, "new-approved", `  {
    slug: "new-approved",
    generatedBy: "ai",
    editorialManifest: { version: 1 },
  }`);
    expect(result.indexOf('slug: "new-approved"')).toBeLessThan(result.indexOf("export const blogArticles"));
    expect(result.indexOf('slug: "new-approved"')).toBeLessThan(result.indexOf("yearlyArticleData"));
  });

  test("replaces a legacy AI entry with its approved version", () => {
    const result = upsertApprovedArticleSource(prefix, "legacy-ai", `  {
    slug: "legacy-ai",
    generatedBy: "ai",
    editorialManifest: { version: 1 },
  }`);
    expect(result.match(/slug: "legacy-ai"/g)).toHaveLength(1);
    expect(result).toContain("editorialManifest");
  });

  test("never overwrites a manual article", () => {
    expect(() => upsertApprovedArticleSource(prefix, "manual-article", "  { slug: \"manual-article\" }")).toThrow(
      /not a replaceable legacy AI entry/,
    );
  });
});
