import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BLOG_ARTICLE_INDEX, BLOG_ARTICLE_COUNT } from "./blogArticleIndex.js";
import { getPublishedBlogArticles } from "./blogArticles.js";
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

  it("covers every published article, newest first", () => {
    const published = getPublishedBlogArticles();
    expect(BLOG_ARTICLE_COUNT).toBe(published.length);
    expect(BLOG_ARTICLE_INDEX).toHaveLength(published.length);
    for (let i = 1; i < BLOG_ARTICLE_INDEX.length; i += 1) {
      expect(BLOG_ARTICLE_INDEX[i - 1].dateISO >= BLOG_ARTICLE_INDEX[i].dateISO).toBe(true);
    }
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
