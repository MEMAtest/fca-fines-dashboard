import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import type { ChartSpec, ImageSpec, SourceEvidence } from "../../src/types/editorial.js";
import {
  CopyReviewSchema,
  GeneratedArticleSchema,
  HeadEditorialDecisionSchema,
  RegulatoryReviewSchema,
  VisualReviewSchema,
  type CopyReview,
  type GeneratedArticle,
  type HeadEditorialDecision,
  type RegulatoryReview,
  type VisualReview,
} from "./editorialSchemas.js";

export const EDITORIAL_PROMPT_VERSION = "regactions-editorial-v2.0";

export const EDITORIAL_MODELS = {
  get drafting() { return process.env.EDITORIAL_DRAFT_MODEL?.trim() || "gpt-5.5"; },
  get regulatory() { return process.env.EDITORIAL_REGULATORY_MODEL?.trim() || "gpt-5.5"; },
  get copy() { return process.env.EDITORIAL_COPY_MODEL?.trim() || "gpt-5.4-mini"; },
  get visual() { return process.env.EDITORIAL_VISUAL_MODEL?.trim() || "gpt-5.4-mini"; },
  get head() { return process.env.EDITORIAL_HEAD_MODEL?.trim() || "gpt-5.5"; },
} as const;

let client: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for the RegActions Editorial Engine");
  }
  client ??= new OpenAI({ apiKey });
  return client;
}

async function runStructured<T>({
  model,
  name,
  schema,
  developer,
  user,
  webSearch = false,
}: {
  model: string;
  name: string;
  schema: ZodType<T>;
  developer: string;
  user: string;
  webSearch?: boolean;
}): Promise<T> {
  const response = await getClient().responses.parse({
    model,
    input: [
      { role: "developer", content: developer },
      { role: "user", content: user },
    ],
    tools: webSearch ? [{ type: "web_search" }] : undefined,
    text: { format: zodTextFormat(schema, name) },
  });

  if (!response.output_parsed) {
    throw new Error(`${name} returned no structured output`);
  }
  return response.output_parsed;
}

export async function runDraftingAgent(
  systemPrompt: string,
  userPrompt: string,
): Promise<GeneratedArticle> {
  return runStructured({
    model: EDITORIAL_MODELS.drafting,
    name: "regactions_article_draft",
    schema: GeneratedArticleSchema,
    developer: `${systemPrompt}\n\nReturn only the fields required by the supplied schema. The content field must contain the complete Markdown article. Do not include TITLE, EXCERPT, KEYWORDS or CONTENT labels inside any field.`,
    user: userPrompt,
  });
}

export async function runRegulatoryVerifierAgent({
  title,
  excerpt,
  content,
  sources,
  priorClaims,
  webSearch = true,
}: {
  title: string;
  excerpt: string;
  content: string;
  sources: SourceEvidence[];
  priorClaims?: RegulatoryReview["claims"];
  webSearch?: boolean;
}): Promise<RegulatoryReview> {
  return runStructured({
    model: EDITORIAL_MODELS.regulatory,
    name: "regactions_regulatory_review",
    schema: RegulatoryReviewSchema,
    webSearch,
    developer: `You are the independent RegActions Regulatory Verifier. Check every material entity, date, amount, action type and regulatory finding against the supplied source ledger and official public sources. Distinguish fines from investigations, examinations, redress estimates, tax receivables, turnover, assets and other amounts. Mark any claim without direct support as ambiguous or unsupported. Approval requires every material claim to be verified.`,
    user: JSON.stringify({ title, excerpt, content, sources, priorClaims }),
  });
}

export async function runCopyEditorAgent({
  title,
  excerpt,
  content,
}: {
  title: string;
  excerpt: string;
  content: string;
}): Promise<CopyReview> {
  return runStructured({
    model: EDITORIAL_MODELS.copy,
    name: "regactions_copy_review",
    schema: CopyReviewSchema,
    developer: `You are the independent RegActions Copy Editor. Use UK English. Never use an em dash. The voice is 60% senior-regulator restraint and 40% strategy-consulting clarity: precise, sober and evidence-led, with answer-first synthesis, clear structure and actionable implications. Do not add, remove or reinterpret facts, amounts, dates, entities or source claims. Remove filler, generic advice, hype, first person, hedging and American spelling. Return the complete revised copy and list every remaining issue.`,
    user: JSON.stringify({ title, excerpt, content }),
  });
}

export async function runVisualEditorAgent({
  charts,
  images,
  sourceIds,
  candidateImages = [],
}: {
  charts: ChartSpec[];
  images: ImageSpec[];
  sourceIds: string[];
  candidateImages?: Array<{ id: string; dataUrl: string }>;
}): Promise<VisualReview> {
  const developer = `You are the RegActions Visual Editor. Approve only visuals that are accurate, useful and accessible. Numerical charts must be code-generated from verified record IDs. Review every supplied AI candidate image itself, not only its prompt. AI illustrations must be non-factual, must not imitate official notices, and must not contain regulator logos, firm photographs, embedded text or numerical claims. Every visual requires useful alt text. Return the exact IDs of every image and chart you approve.`;
  if (candidateImages.length === 0) {
    return runStructured({
      model: EDITORIAL_MODELS.visual,
      name: "regactions_visual_review",
      schema: VisualReviewSchema,
      developer,
      user: JSON.stringify({ charts, images, sourceIds }),
    });
  }

  const response = await getClient().responses.parse({
    model: EDITORIAL_MODELS.visual,
    input: [
      { role: "developer", content: developer },
      {
        role: "user",
        content: [
          { type: "input_text", text: JSON.stringify({ charts, images, sourceIds, candidateImageIds: candidateImages.map((image) => image.id) }) },
          ...candidateImages.map((image) => ({ type: "input_image" as const, image_url: image.dataUrl, detail: "high" as const })),
        ],
      },
    ],
    text: { format: zodTextFormat(VisualReviewSchema, "regactions_visual_review") },
  });
  if (!response.output_parsed) throw new Error("regactions_visual_review returned no structured output");
  return response.output_parsed;
}

export async function runHeadEditorialAgent({
  article,
  regulatoryReview,
  copyReview,
  visualReview,
  deterministicIssues,
}: {
  article: GeneratedArticle;
  regulatoryReview: RegulatoryReview;
  copyReview: CopyReview;
  visualReview: VisualReview;
  deterministicIssues: string[];
}): Promise<HeadEditorialDecision> {
  return runStructured({
    model: EDITORIAL_MODELS.head,
    name: "regactions_head_editorial_decision",
    schema: HeadEditorialDecisionSchema,
    developer: `You are the Head Editorial Agent and final editorial authority for RegActions. Approve only when the regulatory verifier, copy editor, visual editor and deterministic gates all pass. You cannot waive unsupported evidence, ambiguous action types, unverified amounts, UK-English failures, em dashes, visual provenance failures or content-hash mismatches. If any such issue exists, reject and identify the blockers.`,
    user: JSON.stringify({
      article,
      regulatoryReview,
      copyReview,
      visualReview,
      deterministicIssues,
    }),
  });
}
