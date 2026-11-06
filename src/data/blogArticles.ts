// Shared blog article metadata — consumed by both React components and build scripts.
// NO React/JSX imports here. The `icon` field lives in Blog.tsx only.

import { regulatorBlogs } from "./regulatorBlogs.js";
import { blogArticleEditorialUpgrades } from "./blogArticleEditorialUpgrades.js";
import { fcaMonthly2026Articles } from "./fcaMonthly2026/index.js";
import { dataStudyArticles } from "./blogDataStudies.js";
import { blogCataloguePart01 } from "./blogCatalogue/part01.js";
import { blogCataloguePart02 } from "./blogCatalogue/part02.js";
import { blogCataloguePart03 } from "./blogCatalogue/part03.js";
import { blogCataloguePart04 } from "./blogCatalogue/part04.js";
import { blogCataloguePart05 } from "./blogCatalogue/part05.js";
import { blogCataloguePart06 } from "./blogCatalogue/part06.js";
import { blogCataloguePart07 } from "./blogCatalogue/part07.js";
import { yearlyArticleData } from "./yearlyArticleData.js";
import type {
  ArticleStatus,
  ArticleType,
  BlogArticleMeta,
  StructuredRegulatorMetric,
  StructuredRegulatorSection,
  StructuredRegulatorLink,
  StructuredRegulatorSignal,
  StructuredRegulatorFaq,
  StructuredRegulatorArticle,
  YearlyArticleMeta,
  YearlyArticleSource,
} from "./blogArticleTypes.js";
import type { EditorialManifest, PublicationManifest } from "../types/editorial.js";
import type { ArticleRevisionManifest } from "../types/articleRevision.js";

const CONTROLLED_REVISION_SLUGS = new Set([
  "aml-kyc-enforcement-trends",
  "cyber-operational-resilience-enforcement",
  "regulatory-roundup-october-2026",
]);
const REQUIRED_REVISION_CHECK_IDS = [
  "word_count", "section_structure", "takeaway_structure", "data_accuracy",
  "amount_accuracy", "no_truncation", "no_duplicates", "no_hallucinated_firms",
  "no_internal_record_ids", "title_quality", "house_style", "data_usage",
  "specificity", "keyword_count", "editorial_tone", "readability",
  "article_evidence_contract", "grounded_cyber_topic",
];

export type {
  ArticleStatus,
  ArticleType,
  BlogArticleMeta,
  StructuredRegulatorMetric,
  StructuredRegulatorSection,
  StructuredRegulatorLink,
  StructuredRegulatorSignal,
  StructuredRegulatorFaq,
  StructuredRegulatorArticle,
  YearlyArticleMeta,
};


export function isPublished(
  article: {
    slug?: string;
    status?: ArticleStatus | string;
    dateISO: string;
    generatedBy?: "ai" | "manual";
    editorialManifest?: EditorialManifest;
    publicationManifest?: PublicationManifest;
    revisionManifest?: ArticleRevisionManifest;
    updatedAt?: string;
    dateModified?: string;
  },
  todayISO = new Date().toISOString().slice(0, 10),
): boolean {
  if (article.generatedBy === "ai") {
    const manifest = article.editorialManifest;
    const publication = article.publicationManifest;
    const revision = article.revisionManifest;
    const revisionCheckIds = Array.isArray(revision?.checks)
      ? revision.checks.map((check) => check.id)
      : [];
    const revisionSourceIds = Array.isArray(revision?.sourceRecordIds)
      ? revision.sourceRecordIds
      : [];
    const revisionSources = Array.isArray(revision?.sources) ? revision.sources : [];
    const validRevision = Boolean(
      revision?.version === 1 &&
      CONTROLLED_REVISION_SLUGS.has(article.slug || "") &&
      revision.slug === article.slug &&
      /^[a-f0-9]{64}$/.test(revision.contentHash) &&
      /^[a-f0-9]{64}$/.test(revision.previousContentHash) &&
      /^[a-f0-9]{64}$/.test(revision.sourceContractHash) &&
      /^[a-f0-9]{64}$/.test(revision.approvalManifestSha256) &&
      revision.operatorRecord?.identity === "root-primary-qa" &&
      revision.operatorRecord.result === "passed" &&
      revision.revisedAt === revision.operatorRecord.completedAt &&
      Number.isFinite(Date.parse(revision.revisedAt)) &&
      revision.revisedAt.slice(0, 10) <= todayISO &&
      article.dateModified === revision.revisedAt &&
      article.updatedAt === revision.revisedAt.slice(0, 10) &&
      new Set(revisionCheckIds).size === revisionCheckIds.length &&
      REQUIRED_REVISION_CHECK_IDS.every((id) => revision?.checks.some((check) => check.id === id && check.passed === true)) &&
      revisionSourceIds.length > 0 &&
      new Set(revisionSourceIds).size === revisionSourceIds.length &&
      revisionSources.length > 0 &&
      new Set(revisionSources.map((source) => source.id)).size === revisionSources.length &&
      revisionSources.every((source) => revisionSourceIds.includes(source.id)) &&
      /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(article.dateISO) &&
      (article.status === "published" || article.status === "scheduled"),
    );
    if (validRevision) {
      if (article.status === "scheduled") return article.dateISO <= todayISO;
      return true;
    }
    if (
      !manifest ||
      !publication ||
      manifest.headApproval?.status !== "approved" ||
      manifest.headApproval.contentHash !== manifest.contentHash ||
      publication.contentHash !== manifest.contentHash ||
      publication.approvedBy !== "head-editorial-agent" ||
      publication.publishedBy !== "publisher-agent" ||
      !new Set(["scheduled", "published"]).has(manifest.status)
    ) {
      return false;
    }
  }
  if (!article.status || article.status === "published") return true;
  if (article.status === "draft") return false;
  return article.dateISO <= todayISO;
}

const baseBlogArticles: BlogArticleMeta[] = [
  ...dataStudyArticles,
  ...blogCataloguePart01,
  ...blogCataloguePart02,
  ...fcaMonthly2026Articles,
  ...blogCataloguePart03,
  ...blogCataloguePart04,
  ...blogCataloguePart05,
  ...blogCataloguePart06,
  ...blogCataloguePart07,
];

export const blogArticles: BlogArticleMeta[] = baseBlogArticles.map(
  (article) => ({
    ...article,
    ...blogArticleEditorialUpgrades[article.slug],
  }),
);


function formatYearlyArticleDate(year: number): string {
  return `31 December ${year}`;
}

function estimateReadTime(article: YearlyArticleSource): string {
  const words = [
    article.executiveSummary,
    article.regulatoryContext,
    ...article.keyEnforcementThemes,
    article.professionalInsight,
    article.lookingAhead,
  ].join(" ").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(4, Math.ceil(words / 200))} min read`;
}

export const yearlyArticles: YearlyArticleMeta[] = yearlyArticleData.map(
  (article) => ({
    ...article,
    id: `fca-fines-${article.year}-annual-review`,
    articleType: "yearly",
    content: "",
    category: "Annual Analysis",
    readTime: estimateReadTime(article),
    date: formatYearlyArticleDate(article.year),
    dateISO: `${article.year}-12-31`,
  }),
);

const regulatorBlogSlugs = new Set(regulatorBlogs.map((article) => article.slug));
const CANONICAL_STANDARD_REGULATOR_GUIDE_SLUGS = new Set(
  ["fca-fines-enforcement-guide"].filter((slug) =>
    blogArticles.some((article) => article.slug === slug),
  ),
);

// Merge regulator blogs with main blog articles, keeping one canonical source for
// regulator guide slugs that exist in both datasets.
export const allBlogArticles: BlogArticleMeta[] = [
  ...blogArticles.filter(
    (article) =>
      !regulatorBlogSlugs.has(article.slug) ||
      CANONICAL_STANDARD_REGULATOR_GUIDE_SLUGS.has(article.slug),
  ),
  ...regulatorBlogs.filter(
    (article) => !CANONICAL_STANDARD_REGULATOR_GUIDE_SLUGS.has(article.slug),
  ),
];

export function getPublishedBlogArticles(todayISO?: string): BlogArticleMeta[] {
  return allBlogArticles.filter((article) => isPublished(article, todayISO));
}

/** Public editorial surfaces must never promote scheduled or draft material.
 * Legacy entries without a status remain public for backwards compatibility;
 * explicit publication is required once a status is present. */
export function isPubliclyPublished(article: BlogArticleMeta): boolean {
  if (article.status === "scheduled" || article.status === "draft") return false;
  return isPublished(article);
}

export function getPublicBlogArticles(): BlogArticleMeta[] {
  return allBlogArticles.filter(isPubliclyPublished);
}

export function getPublishedYearlyArticles(
  todayISO?: string,
): YearlyArticleMeta[] {
  return yearlyArticles.filter((article) => isPublished(article, todayISO));
}

export function getPublicYearlyArticles(): YearlyArticleMeta[] {
  return yearlyArticles.filter(isPubliclyPublished);
}

export function getPublishedAllArticles(
  todayISO?: string,
): BlogArticleMeta[] {
  return [
    ...getPublishedBlogArticles(todayISO),
    ...getPublishedYearlyArticles(todayISO),
  ];
}

// Helper: get all articles (blog + yearly) for sitemap/prerender
export function getAllArticleSlugs(): {
  slug: string;
  dateISO: string;
  type: "blog" | "yearly";
}[] {
  const blog = getPublishedBlogArticles().map((a) => ({
    slug: a.slug,
    dateISO: a.dateISO,
    type: "blog" as const,
  }));
  const yearly = getPublishedYearlyArticles().map((a) => ({
    slug: a.slug,
    dateISO: a.dateISO,
    type: "yearly" as const,
  }));
  return [...blog, ...yearly];
}
