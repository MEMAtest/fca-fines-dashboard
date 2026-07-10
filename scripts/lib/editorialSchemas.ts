import { z } from "zod";

export const GeneratedArticleSchema = z.object({
  title: z.string().min(10).max(70),
  excerpt: z.string().min(120).max(220),
  keywords: z.array(z.string().min(2)).min(5).max(8),
  content: z.string().min(1_000),
});

export const SourceEvidenceSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  publisher: z.string().min(1),
  sourceType: z.enum([
    "official_notice",
    "official_register",
    "legislation",
    "company_filing",
    "secondary_context",
  ]),
  retrievedAt: z.string().datetime(),
  official: z.boolean(),
  excerpt: z.string().min(1),
});

export const EvidenceClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(["action_type", "amount", "date", "finding", "entity", "context", "analysis"]),
  sourceIds: z.array(z.string()),
  recordIds: z.array(z.string()),
  verdict: z.enum(["verified", "ambiguous", "unsupported"]),
  verifier: z.enum(["regulatory-verifier-agent", "deterministic-source-gate"]),
  notes: z.string().optional(),
});

const RegulatoryEvidenceClaimSchema = EvidenceClaimSchema.extend({
  verifier: z.literal("regulatory-verifier-agent"),
});

export const RegulatoryReviewSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  claims: z.array(RegulatoryEvidenceClaimSchema).min(1),
});

export const CopyReviewSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  revisedTitle: z.string().min(10).max(70),
  revisedExcerpt: z.string().min(120).max(220),
  revisedContent: z.string().min(1_000),
});

export const VisualReviewSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  approvedImageIds: z.array(z.string()),
  approvedChartIds: z.array(z.string()),
});

export const HeadEditorialDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rationale: z.string().min(20),
  blockingIssues: z.array(z.string()),
});

export type GeneratedArticle = z.infer<typeof GeneratedArticleSchema>;
export type RegulatoryReview = z.infer<typeof RegulatoryReviewSchema>;
export type CopyReview = z.infer<typeof CopyReviewSchema>;
export type VisualReview = z.infer<typeof VisualReviewSchema>;
export type HeadEditorialDecision = z.infer<typeof HeadEditorialDecisionSchema>;
