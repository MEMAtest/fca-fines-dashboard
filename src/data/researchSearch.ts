import type { BlogArticleMeta } from "./blogArticles.js";

export type ResearchMatchKind = "focused" | "related";

export interface ResearchSearchHit<T extends BlogArticleMeta = BlogArticleMeta> {
  article: T;
  score: number;
  kind: ResearchMatchKind;
  matchReasons: string[];
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Weighted, deterministic research search. Title/keywords/category are the
 * focused set; body-only matches remain useful but are labelled related. */
export function searchResearchArticles<T extends BlogArticleMeta>(
  articles: T[],
  query: string,
): ResearchSearchHit<T>[] {
  const terms = normalise(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return articles.map((article) => ({ article, score: 0, kind: "focused", matchReasons: [] }));

  return articles
    .map((article) => {
      const fields = {
        title: normalise(article.title),
        keywords: normalise(article.keywords.join(" ")),
        category: normalise(article.category),
        excerpt: normalise(article.excerpt),
        body: normalise(article.content),
      };
      const reasons: string[] = [];
      let score = 0;
      for (const term of terms) {
        if (fields.title.includes(term)) { score += 12; reasons.push("title"); }
        if (fields.keywords.includes(term)) { score += 8; reasons.push("keyword"); }
        if (fields.category.includes(term)) { score += 6; reasons.push("category"); }
        if (fields.excerpt.includes(term)) { score += 4; reasons.push("excerpt"); }
        if (fields.body.includes(term)) { score += 1; reasons.push("body"); }
      }
      const uniqueReasons = Array.from(new Set(reasons));
      return {
        article,
        score,
        kind: uniqueReasons.some((reason) => ["title", "keyword", "category"].includes(reason)) ? "focused" : "related",
        matchReasons: uniqueReasons,
      } satisfies ResearchSearchHit<T>;
    })
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || right.article.dateISO.localeCompare(left.article.dateISO));
}

