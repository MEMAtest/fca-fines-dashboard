// Shared blog article types. Re-exported from blogArticles.ts so existing imports keep working.
// NO React/JSX imports here.

import type { EditorialManifest, PublicationManifest } from "../types/editorial.js";
import type { ArticleRevisionManifest } from "../types/articleRevision.js";

export type ArticleStatus = "published" | "scheduled" | "draft";
export type ArticleType =
  | "standard"
  | "yearly"
  | "regulator"
  | "monthly"
  | "comparison"
  | "forensic"
  | "trends"
  | "thematic"
  | "persona"
  | "evidence-brief";

export interface BlogArticleMeta {
  id: string;
  slug: string;
  title: string;
  seoTitle: string;
  excerpt: string;
  content: string;
  category: string;
  readTime: string;
  date: string;
  dateISO: string;
  featured?: boolean;
  structuredArticle?: StructuredRegulatorArticle;
  keywords: string[];
  articleType?: ArticleType;
  status?: ArticleStatus;
  year?: number;
  executiveSummary?: string;
  regulatoryContext?: string;
  keyEnforcementThemes?: string[];
  professionalInsight?: string;
  lookingAhead?: string;
  generatedBy?: "ai" | "manual";
  generatedAt?: string;
  editorialManifest?: EditorialManifest;
  publicationManifest?: PublicationManifest;
  /** Current controlled revision provenance; legacy manifests are not current approval. */
  revisionManifest?: ArticleRevisionManifest;
  /** Human-readable calendar date associated with the latest revision. */
  updatedAt?: string;
  /** Real ISO date of the latest substantial revision; absent for unchanged articles. */
  dateModified?: string;
}

export interface StructuredRegulatorMetric {
  label: string;
  value: string;
  note?: string;
}

export interface StructuredRegulatorSection {
  heading: string;
  intro?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface StructuredRegulatorLink {
  label: string;
  url: string;
  description: string;
}

export interface StructuredRegulatorSignal {
  title: string;
  detail: string;
}

export interface StructuredRegulatorFaq {
  question: string;
  answer: string;
}

export interface StructuredRegulatorArticle {
  eyebrow: string;
  introduction: string;
  executiveSummary: string[];
  metrics: StructuredRegulatorMetric[];
  sections: StructuredRegulatorSection[];
  signals: StructuredRegulatorSignal[];
  boardQuestions: string[];
  takeaways: string[];
  sourceLinks: StructuredRegulatorLink[];
  relatedLinks: StructuredRegulatorLink[];
  faqs: StructuredRegulatorFaq[];
}

export interface YearlyArticleMeta extends BlogArticleMeta {
  articleType: "yearly";
  year: number;
  executiveSummary: string;
  regulatoryContext: string;
  keyEnforcementThemes: string[];
  professionalInsight: string;
  lookingAhead: string;
}

export type YearlyArticleSource = Omit<
  YearlyArticleMeta,
  "id" | "content" | "category" | "readTime" | "date" | "articleType"
> & { dateISO?: string };
