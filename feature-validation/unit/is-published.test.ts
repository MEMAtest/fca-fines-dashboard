import { describe, expect, test } from "vitest";
import {
  allBlogArticles,
  blogArticles,
  getPublishedBlogArticles,
  isPublished,
  yearlyArticles,
} from "../../src/data/blogArticles.js";

const upgradedBlogSlugs = [
  "fca-enforcement-trends-2013-2025",
  "fca-enforcement-outlook-february-2026",
  "fca-fines-march-2026",
  "fca-aml-fines-anti-money-laundering",
  "20-biggest-fca-fines-of-all-time",
  "fca-fines-january-2026",
  "fca-fines-february-2026",
  "fca-final-notices-explained",
  "fca-fines-banks-complete-list",
  "senior-managers-regime-fca-fines",
  "board-guide-aml-controls-global-enforcement",
  "eu-financial-regulators-enforcement-guide",
  "occ-enforcement-actions-complete-guide",
  "sec-enforcement-guide-fines-data",
  "cbi-ireland-enforcement-guide",
  "finra-ciro-sro-enforcement-comparison",
  "latin-america-enforcement-cvm-cnbv-cmf",
  "switzerland-offshore-enforcement-finma-jfsc-gfsc",
  "systems-controls-enforcement-global",
  "board-guide-governance-accountability-enforcement",
  "fincen-bsa-enforcement-guide",
  "market-abuse-enforcement-global-comparison",
  "middle-east-enforcement-dfsa-fsra-cbuae",
  "apac-financial-enforcement-comparison",
] as const;

describe("isPublished", () => {
  const today = "2026-05-08";

  test("treats missing status as published", () => {
    expect(isPublished({ dateISO: "2099-01-01" }, today)).toBe(true);
  });

  test("treats explicit published status as published regardless of date", () => {
    expect(
      isPublished({ status: "published", dateISO: "2099-01-01" }, today),
    ).toBe(true);
  });

  test("never publishes drafts", () => {
    expect(isPublished({ status: "draft", dateISO: "2026-05-01" }, today)).toBe(
      false,
    );
  });

  test("publishes scheduled articles on their date", () => {
    expect(
      isPublished({ status: "scheduled", dateISO: "2026-05-08" }, today),
    ).toBe(true);
  });

  test("publishes scheduled articles after their date", () => {
    expect(
      isPublished({ status: "scheduled", dateISO: "2026-05-07" }, today),
    ).toBe(true);
  });

  test("hides scheduled articles before their date", () => {
    expect(
      isPublished({ status: "scheduled", dateISO: "2026-05-09" }, today),
    ).toBe(false);
  });

  test("published blog selector excludes future scheduled articles", () => {
    const articles = getPublishedBlogArticles(today);
    expect(articles.some((a) => a.slug === "sec-enforcement-guide-fines-data")).toBe(
      true,
    );
    expect(
      articles.some((a) => a.slug === "occ-enforcement-actions-complete-guide"),
    ).toBe(false);
  });

  test("yearly articles are normalized to the shared article shape", () => {
    expect(yearlyArticles.length).toBeGreaterThan(0);
    expect(yearlyArticles[0]).toMatchObject({
      articleType: "yearly",
      category: "Annual Analysis",
      content: "",
    });
    expect(yearlyArticles[0].id).toMatch(/^fca-fines-\d{4}-annual-review$/);
  });

  test("all scheduled multi-regulator articles have publish dates", () => {
    const scheduled = allBlogArticles.filter((article) =>
      [
        "sec-enforcement-guide-fines-data",
        "occ-enforcement-actions-complete-guide",
        "global-aml-enforcement-comparison-2026",
        "eu-financial-regulators-enforcement-guide",
        "apac-financial-enforcement-comparison",
        "board-guide-aml-controls-global-enforcement",
        "cbi-ireland-enforcement-guide",
        "finra-ciro-sro-enforcement-comparison",
        "market-abuse-enforcement-global-comparison",
        "switzerland-offshore-enforcement-finma-jfsc-gfsc",
        "board-guide-governance-accountability-enforcement",
        "fincen-bsa-enforcement-guide",
        "systems-controls-enforcement-global",
        "middle-east-enforcement-dfsa-fsra-cbuae",
        "latin-america-enforcement-cvm-cnbv-cmf",
      ].includes(article.slug),
    );

    expect(scheduled).toHaveLength(15);
    expect(scheduled.every((article) => article.status === "scheduled")).toBe(
      true,
    );
    expect(scheduled.map((article) => article.dateISO)).toEqual([
      "2026-05-08",
      "2026-05-11",
      "2026-05-13",
      "2026-05-15",
      "2026-05-18",
      "2026-05-20",
      "2026-05-22",
      "2026-05-25",
      "2026-05-27",
      "2026-05-29",
      "2026-06-01",
      "2026-06-03",
      "2026-06-05",
      "2026-06-08",
      "2026-06-10",
    ]);
  });

  test("public blog slugs resolve to one canonical article", () => {
    const slugCounts = allBlogArticles.reduce<Record<string, number>>(
      (counts, article) => {
        counts[article.slug] = (counts[article.slug] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const duplicates = Object.entries(slugCounts)
      .filter(([, count]) => count > 1)
      .map(([slug]) => slug);

    expect(duplicates).toEqual([]);
  });

  test("blog quality upgrade batch keeps substantial content and links", () => {
    const articlesBySlug = new Map(
      blogArticles.map((article) => [article.slug, article]),
    );

    for (const slug of upgradedBlogSlugs) {
      const article = articlesBySlug.get(slug);
      expect(article, `${slug} should exist`).toBeDefined();

      const wordCount = article!.content
        .split(/\s+/)
        .filter((word) => word.length > 0).length;

      expect(wordCount, `${slug} word count`).toBeGreaterThanOrEqual(1100);
      expect(article!.title.length, `${slug} title length`).toBeLessThanOrEqual(
        70,
      );
      expect(article!.content, `${slug} regulator hub link`).toContain(
        "/regulators",
      );
      expect(article!.content, `${slug} search link`).toContain("/search?q=");
      expect(article!.content, `${slug} board pack link`).toContain(
        "/board-pack",
      );
    }
  });
});
