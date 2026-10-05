import { describe, expect, it } from "vitest";
import { searchResearchArticles } from "./researchSearch.js";

const article = (overrides: Record<string, unknown> = {}) => ({
  id: "a", slug: "a", title: "Cyber controls", seoTitle: "Cyber controls", excerpt: "A short note", content: "Operational resilience and data breach controls.", category: "Enforcement Analysis", readTime: "4 min read", date: "19 September 2026", dateISO: "2026-09-19", keywords: ["cyber"], ...overrides,
});
describe("weighted Research search", () => {
  it("labels title/keyword matches focused and body-only matches related", () => {
    const hits = searchResearchArticles([
      article(),
      article({ id: "b", slug: "b", title: "Monthly roundup", keywords: ["roundup"], content: "A data breach case was discussed." }),
    ], "cyber");
    expect(hits[0]?.kind).toBe("focused");
    expect(searchResearchArticles([article({ id: "b", slug: "b", title: "Monthly roundup", keywords: ["roundup"], content: "A data breach case was discussed." })], "data breach")[0]?.kind).toBe("related");
  });
});
