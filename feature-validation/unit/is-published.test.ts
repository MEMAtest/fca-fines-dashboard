import { describe, expect, test } from "vitest";
import {
  allBlogArticles,
  getPublishedBlogArticles,
  isPublished,
  yearlyArticles,
} from "../../src/data/blogArticles.js";

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
});
