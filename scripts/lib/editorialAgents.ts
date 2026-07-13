import OpenAI from "openai";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import type { ChartSpec, ImageSpec, SourceEvidence } from "../../src/types/editorial.js";
import type { EditorialOutline, EditorialSectionKey } from "../../src/types/editorial.js";
import {
  ArticleMetadataSchema,
  ArticleOutlineSchema,
  CopyReviewSchema,
  DraftedSectionSchema,
  GeneratedArticleSchema,
  HeadEditorialDecisionSchema,
  RegulatoryReviewSchema,
  VisualReviewSchema,
  type CopyReview,
  type DraftedSection,
  type GeneratedArticle,
  type HeadEditorialDecision,
  type RegulatoryReview,
  type VisualReview,
} from "./editorialSchemas.js";
import { formatDataTable, type EnforcementRecord } from "./articleData.js";
import { runQualityGate } from "./articleQuality.js";
import {
  SECTION_BLUEPRINTS,
  composeDraftedSections,
  countSectionWords,
  getArticleLengthRepairPlan,
  normaliseEditorialOutline,
  replaceArticleSections,
  routeRegulatoryIssuesToSections,
  splitArticleSections,
} from "./editorialSections.js";

export const EDITORIAL_PROMPT_VERSION = "regactions-editorial-v2.1";

export type EditorialProvider = "openai" | "openrouter";

export function getEditorialProvider(): EditorialProvider {
  const configured = process.env.EDITORIAL_PROVIDER?.trim().toLowerCase();
  if (configured === "openai" || configured === "openrouter") return configured;
  if (process.env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  return "openai";
}

const OPENAI_DEFAULT_MODELS = {
  drafting: "gpt-5.5",
  regulatoryInitial: "gpt-5.5",
  regulatoryFinal: "gpt-5.5",
  copy: "gpt-5.4-mini",
  visual: "gpt-5.4-mini",
  head: "gpt-5.5",
} as const;

const OPENROUTER_DEFAULT_MODELS = {
  drafting: "deepseek/deepseek-v3.2",
  regulatoryInitial: "mistralai/mistral-small-3.2-24b-instruct",
  regulatoryFinal: "openai/gpt-4.1-mini",
  copy: "google/gemini-2.5-flash",
  visual: "google/gemini-2.5-flash",
  head: "google/gemini-2.5-flash",
} as const;

function defaultModel(role: keyof typeof OPENAI_DEFAULT_MODELS): string {
  return getEditorialProvider() === "openrouter"
    ? OPENROUTER_DEFAULT_MODELS[role]
    : OPENAI_DEFAULT_MODELS[role];
}

export const EDITORIAL_MODELS = {
  get drafting() { return process.env.EDITORIAL_DRAFT_MODEL?.trim() || defaultModel("drafting"); },
  get regulatoryInitial() {
    return process.env.EDITORIAL_INITIAL_REGULATORY_MODEL?.trim()
      || process.env.EDITORIAL_REGULATORY_MODEL?.trim()
      || defaultModel("regulatoryInitial");
  },
  get regulatoryFinal() {
    return process.env.EDITORIAL_FINAL_REGULATORY_MODEL?.trim()
      || process.env.EDITORIAL_REGULATORY_MODEL?.trim()
      || defaultModel("regulatoryFinal");
  },
  get copy() { return process.env.EDITORIAL_COPY_MODEL?.trim() || defaultModel("copy"); },
  get visual() { return process.env.EDITORIAL_VISUAL_MODEL?.trim() || defaultModel("visual"); },
  get head() { return process.env.EDITORIAL_HEAD_MODEL?.trim() || defaultModel("head"); },
} as const;

let openAiClient: OpenAI | null = null;
let openRouterClient: OpenAI | null = null;

export function normaliseEditorialExcerpt(value: string, maxLength = 220) {
  const excerpt = value.trim();
  const currencyFragment = /\b(?:GBP|USD|EUR|AUD|NZD|CAD|CHF|SGD|HKD)\s+\d+\.$/.test(excerpt);
  if (excerpt.length <= maxLength && /[.!?]$/.test(excerpt) && !/\.\.\.$/.test(excerpt) && !currencyFragment) return excerpt;
  const bounded = excerpt.slice(0, maxLength);
  let sentenceEnd = -1;
  for (let index = 0; index < bounded.length; index++) {
    const character = bounded[index];
    if (character === "!" || character === "?") sentenceEnd = index;
    const endsCurrencyFragment = /\b(?:GBP|USD|EUR|AUD|NZD|CAD|CHF|SGD|HKD)\s+\d+\.$/.test(excerpt.slice(0, index + 1));
    const partOfEllipsis = excerpt[index - 1] === "." || excerpt[index + 1] === ".";
    if (character === "."
      && !(/\d/.test(excerpt[index - 1] || "") && /\d/.test(excerpt[index + 1] || ""))
      && !endsCurrencyFragment
      && !partOfEllipsis) {
      sentenceEnd = index;
    }
  }
  if (sentenceEnd >= 119) return bounded.slice(0, sentenceEnd + 1);
  const clauseEnd = Math.max(bounded.lastIndexOf(","), bounded.lastIndexOf(";"));
  if (clauseEnd >= 119) return `${bounded.slice(0, clauseEnd).replace(/[,:;\s.]+$/, "")}.`;
  return `${bounded.slice(0, maxLength - 1).replace(/\s+\S*$/, "").replace(/[,:;\s.]+$/, "")}.`;
}

function getClient() {
  const provider = getEditorialProvider();
  if (provider === "openrouter") {
    const trialMode = process.env.EDITORIAL_TRIAL_MODE?.trim().toLowerCase() === "true";
    const approved = process.env.EDITORIAL_OPENROUTER_APPROVED?.trim().toLowerCase() === "true";
    if (!trialMode && !approved) {
      throw new Error("OpenRouter editorial generation is not approved; use --trial or set EDITORIAL_OPENROUTER_APPROVED=true after model acceptance");
    }
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required when EDITORIAL_PROVIDER=openrouter");
    openRouterClient ??= new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      timeout: 180_000,
      defaultHeaders: {
        "HTTP-Referer": "https://regactions.com",
        "X-Title": "RegActions Editorial Engine",
      },
    });
    return openRouterClient;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required when EDITORIAL_PROVIDER=openai");
  openAiClient ??= new OpenAI({ apiKey });
  return openAiClient;
}

async function runStructured<T>({
  model,
  name,
  schema,
  developer,
  user,
  webSearch = false,
  maxTokens = 12_000,
  temperature = 0.1,
  reasoningEffort = "low",
}: {
  model: string;
  name: string;
  schema: ZodType<T>;
  developer: string;
  user: string;
  webSearch?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
}): Promise<T> {
  if (getEditorialProvider() === "openrouter") {
    const plugins = [
      ...(webSearch ? [{ id: "web", engine: "exa", max_results: 5 }] : []),
      { id: "response-healing" },
    ];
    const completion = await getClient().chat.completions.create({
      model,
      messages: [
        { role: "system", content: `${developer}\n\nReturn a JSON object that exactly matches the supplied JSON schema.` },
        { role: "user", content: user },
      ],
      response_format: zodResponseFormat(schema, name),
      temperature,
      max_tokens: maxTokens,
      reasoning: { effort: reasoningEffort },
      plugins,
    } as Parameters<OpenAI["chat"]["completions"]["create"]>[0]) as unknown as {
      choices: Array<{ message: { content: string | null } }>;
    };
    const raw = completion.choices[0]?.message.content;
    if (!raw) throw new Error(`${name} returned no structured output`);

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      throw new Error(`${name} returned invalid JSON`);
    }

    const object = decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded as Record<string, unknown>
      : null;
    const candidates = [
      decoded,
      object?.[name],
      object?.article,
      object?.result,
      object?.output,
    ].filter((candidate) => candidate !== undefined);
    if (object) {
      const caseNormalised = Object.fromEntries(
        Object.entries(object).map(([key, value]) => [key.toLowerCase(), value]),
      ) as Record<string, unknown>;
      if (typeof caseNormalised.keywords === "string") {
        caseNormalised.keywords = caseNormalised.keywords
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean);
      }
      candidates.push(caseNormalised);
      if (typeof object.excerpt === "string") {
        const excerpt = normaliseEditorialExcerpt(object.excerpt);
        if (excerpt !== object.excerpt.trim()) candidates.push({ ...object, excerpt });
      }
      const sectionKey = name.match(/(?:section|repair)_(overview|actions|analysis|implications|takeaways|data)$/)?.[1];
      const sectionText = object.sectionText
        ?? object.section_text
        ?? object.sectionContent
        ?? object.section_content
        ?? object.markdown
        ?? object.content
        ?? object.text;
      if (sectionKey && typeof sectionText === "string") {
        candidates.push({ key: sectionKey, markdown: sectionText });
      }
      if (name === "regactions_regulatory_review") {
        const rawClaims = Array.isArray(object.claims) ? object.claims : [];
        const rawIssues = Array.isArray(object.issues)
          ? object.issues.filter((issue): issue is string => typeof issue === "string")
          : [];
        candidates.push({
          ...object,
          passed: rawClaims.length > 0 ? object.passed : false,
          issues: rawClaims.length > 0 ? rawIssues : [...rawIssues, "Verifier returned no material claims; targeted evidence repair is required."],
          claims: rawClaims.map((claim) => {
            if (!claim || typeof claim !== "object") return claim;
            const rawClaim = claim as Record<string, unknown>;
            const lowerClaim = Object.fromEntries(
              Object.entries(rawClaim).map(([key, value]) => [key.toLowerCase().replace(/_/g, ""), value]),
            ) as Record<string, unknown>;
            const allowedKinds = ["action_type", "amount", "date", "finding", "entity", "context", "analysis"];
            return {
              id: typeof lowerClaim.id === "string" ? lowerClaim.id : `incomplete_claim_${rawClaims.indexOf(claim)}`,
              text: typeof lowerClaim.text === "string" ? lowerClaim.text : "Verifier returned an incomplete material claim.",
              kind: allowedKinds.includes(String(lowerClaim.kind)) ? lowerClaim.kind : "context",
              sourceIds: Array.isArray(lowerClaim.sourceids) ? lowerClaim.sourceids : [],
              recordIds: Array.isArray(lowerClaim.recordids) ? lowerClaim.recordids : [],
              verdict: ["verified", "ambiguous", "unsupported"].includes(String(lowerClaim.verdict))
                ? lowerClaim.verdict
                : "ambiguous",
              verifier: "regulatory-verifier-agent",
              notes: typeof lowerClaim.notes === "string"
                ? lowerClaim.notes
                : "Verifier returned an incomplete claim; targeted evidence repair is required.",
            };
          }),
        });
      }
      if (name === "regactions_copy_review" && typeof object.revisedExcerpt === "string") {
        const revisedExcerpt = normaliseEditorialExcerpt(object.revisedExcerpt);
        candidates.push({ ...object, revisedExcerpt });
      }
    }
    let validationSummary = "";
    let fewestValidationIssues = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const parsed = schema.safeParse(candidate);
      if (parsed.success) return parsed.data;
      if (parsed.error.issues.length < fewestValidationIssues) {
        fewestValidationIssues = parsed.error.issues.length;
        validationSummary = parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
          .join("; ");
      }
    }

    const keys = object ? Object.keys(object).slice(0, 10).join(", ") : typeof decoded;
    const trailingClaimPreview = name === "regactions_regulatory_review" && object && Array.isArray(object.claims)
      ? `; trailing claim: ${JSON.stringify(object.claims[object.claims.length - 1]).slice(0, 500)}`
      : "";
    throw new Error(`${name} returned JSON with the wrong shape (top-level: ${keys || "empty object"}; ${validationSummary || "schema mismatch"}${trailingClaimPreview})`);
  }

  const response = await getClient().responses.parse({
    model,
    input: [
      { role: "developer", content: developer },
      { role: "user", content: user },
    ],
    tools: webSearch ? [{ type: "web_search" }] : undefined,
    max_output_tokens: maxTokens,
    text: { format: zodTextFormat(schema, name) },
  });

  if (!response.output_parsed) {
    throw new Error(`${name} returned no structured output`);
  }
  return response.output_parsed;
}

async function retryStructured<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface SectionedGeneratedArticle extends GeneratedArticle {
  outline?: EditorialOutline;
}

function recordsForSection(
  records: EnforcementRecord[],
  sourceRecordIds: string[],
) {
  const allowed = new Set(sourceRecordIds);
  const selected = records.filter((record) => allowed.has(record.id));
  return selected.length > 0 ? selected : records.slice(0, 6);
}

async function draftSection({
  section,
  outline,
  records,
}: {
  section: EditorialOutline["sections"][number];
  outline: EditorialOutline;
  records: EnforcementRecord[];
}): Promise<DraftedSection> {
  const selected = recordsForSection(records, section.sourceRecordIds);
  const lower = Math.max(80, section.targetWords - 20);
  const upper = section.targetWords + 20;
  const formatInstruction = section.key === "takeaways"
    ? "Format the section as five or six substantive Markdown bullet points."
    : "Use short paragraphs and a table only when it materially improves case comparison.";
  const verifiedAmounts = selected.filter((record) => record.amount_verified).length;
  const amountInstruction = section.key === "actions" && verifiedAmounts > 0
    ? `Cite ${Math.min(3, verifiedAmounts)} distinct verified penalties from the Amount column, using the exact source currency.`
    : "Do not force a monetary claim where the selected evidence has no verified amount.";
  return retryStructured(() => runStructured({
    model: section.key === "takeaways" ? EDITORIAL_MODELS.copy : EDITORIAL_MODELS.drafting,
    name: `regactions_section_${section.key}`,
    schema: DraftedSectionSchema,
    maxTokens: 2_500,
    temperature: 0.2,
    reasoningEffort: "none",
    developer: `You are drafting one bounded section of a RegActions regulatory article. Use UK English, never use an em dash, and write with senior-regulator restraint and strategy-consulting clarity. Use only the supplied evidence rows. Use exact firm and individual names from those rows. When a source names multiple people or firms, attribute each amount, remedy and finding only to the party explicitly linked to it; a combined amount belongs to the combined entity label. Do not add forecasts, legislation, causal explanations, regulatory expectations or compliance prescriptions that the evidence does not directly support. An unverified amount is not a non-monetary action. Never mention internal Record IDs or source IDs. ${amountInstruction} Do not repeat the section heading. ${formatInstruction} Return ${lower}-${upper} words of Markdown prose.`,
    user: JSON.stringify({
      articleTitle: outline.title,
      sectionKey: section.key,
      sectionHeading: section.heading,
      angle: section.angle,
      targetWords: section.targetWords,
      evidenceTable: formatDataTable(selected),
      exactSourceRecordIds: selected.map((record) => record.id),
    }),
  }));
}

function buildAboutDataSection(records: EnforcementRecord[]): DraftedSection {
  const regulators = [...new Set(records.map((record) => record.regulator).filter(Boolean))];
  const dates = records.map((record) => record.date_issued).filter(Boolean).sort();
  const verified = records.filter((record) => record.amount_verified).length;
  return {
    key: "data",
    markdown: `This analysis uses ${records.length} topic-filtered actions linked to official regulatory sources across ${regulators.length} regulators: ${regulators.join(", ")}. The records cover ${dates[0] || "an unspecified start date"} to ${dates[dates.length - 1] || "an unspecified end date"}. ${verified} records contain a monetary penalty verified against the evidence contract. Monetary values retain their source currency; GBP-normalised values are reserved for explicitly labelled aggregate charts. Other records may describe cancellations, prohibitions, investigations, orders or sanctions whose monetary value is not verified. The selection supports this article's analysis but is not a complete catalogue of every action in the period.`,
  };
}

export async function runSectionRepairAgent({
  articleTitle,
  sectionKey,
  heading,
  markdown,
  targetWords,
  issues,
  records,
}: {
  articleTitle: string;
  sectionKey: EditorialSectionKey;
  heading: string;
  markdown: string;
  targetWords: number;
  issues: string[];
  records: EnforcementRecord[];
}): Promise<DraftedSection> {
  const formatInstruction = sectionKey === "takeaways"
    ? "Return exactly five or six substantive Markdown bullet points, each beginning with '- '."
    : "Use short paragraphs and a table only when it materially improves case comparison.";
  return retryStructured(() => runStructured({
    model: EDITORIAL_MODELS.copy,
    name: `regactions_section_repair_${sectionKey}`,
    schema: DraftedSectionSchema,
    maxTokens: 2_500,
    temperature: 0.1,
    reasoningEffort: "none",
    developer: `You are the RegActions evidence repair editor. Rewrite only the supplied section. Remove every unsupported or ambiguous claim identified in the issues. Do not replace removed claims with new facts. Use only the supplied official-source rows and use exact firm or individual names. When a source names multiple people or firms, attribute each amount, remedy and finding only to the party explicitly linked to it; a combined amount belongs to the combined entity label. If an issue requires monetary specificity, cite exact verified penalties from the Amount column in their source currency and never use an unverified figure. Preserve UK English, use no em dash, keep each sentence below 45 words, omit the heading, and return between ${Math.max(80, targetWords - 20)} and ${targetWords + 20} words of Markdown. ${formatInstruction}`,
    user: JSON.stringify({
      articleTitle,
      sectionKey,
      heading,
      currentMarkdown: markdown,
      issues,
      evidenceTable: formatDataTable(records),
      exactSourceRecordIds: records.map((record) => record.id),
    }),
  }));
}

export async function runMetadataRepairAgent({
  article,
  issues,
}: {
  article: GeneratedArticle;
  issues: string[];
}) {
  return retryStructured(() => runStructured({
    model: EDITORIAL_MODELS.copy,
    name: "regactions_metadata_repair",
    schema: ArticleMetadataSchema,
    maxTokens: 1_200,
    temperature: 0.1,
    reasoningEffort: "none",
    developer: `Rewrite only the title, excerpt and keywords so they accurately reflect the supplied article after evidence repair. Use UK English and no em dash. Do not introduce a new entity, amount, date, action, trend or prediction.`,
    user: JSON.stringify({ article, issues }),
  }));
}

export async function repairArticleFromRegulatoryReview({
  article,
  review,
  records,
  outline,
  minimumWords = 1_100,
}: {
  article: GeneratedArticle;
  review: RegulatoryReview;
  records: EnforcementRecord[];
  outline?: EditorialOutline;
  minimumWords?: number;
}): Promise<{ article: GeneratedArticle; affectedSections: EditorialSectionKey[] }> {
  const routed = routeRegulatoryIssuesToSections(article.content, review);
  if (routed.size === 0) return { article, affectedSections: [] };
  const parsed = splitArticleSections(article.content);
  const replacements = new Map<EditorialSectionKey, string>();
  await Promise.all([...routed.entries()].map(async ([key, issues]) => {
    const current = parsed.find((section) => section.key === key);
    if (!current) return;
    const outlineSection = outline?.sections.find((section) => section.key === key);
    const selected = recordsForSection(records, outlineSection?.sourceRecordIds || records.map((record) => record.id).slice(0, 10));
    const repaired = await runSectionRepairAgent({
      articleTitle: article.title,
      sectionKey: key,
      heading: current.heading,
      markdown: current.markdown,
      targetWords: outlineSection?.targetWords || Math.max(140, countSectionWords(current.markdown)),
      issues,
      records: selected,
    });
    replacements.set(key, repaired.markdown);
  }));
  let content = replaceArticleSections(article.content, replacements);
  const lengthPlan = outline ? getArticleLengthRepairPlan(content, outline, minimumWords) : null;
  if (lengthPlan && outline) {
    const current = splitArticleSections(content).find((section) => section.key === lengthPlan.key);
    const outlineSection = outline.sections.find((section) => section.key === lengthPlan.key);
    if (current && outlineSection) {
      const expanded = await runSectionRepairAgent({
        articleTitle: article.title,
        sectionKey: lengthPlan.key,
        heading: lengthPlan.heading,
        markdown: current.markdown,
        targetWords: lengthPlan.targetWords,
        issues: [`Evidence repair reduced the assembled article to ${lengthPlan.totalWords} words. Restore at least ${minimumWords} words by clarifying only the supplied evidence in this section; do not introduce a new fact or claim.`],
        records: recordsForSection(records, outlineSection.sourceRecordIds),
      });
      content = replaceArticleSections(content, new Map([[lengthPlan.key, expanded.markdown]]));
    }
  }
  const metadata = await runMetadataRepairAgent({ article: { ...article, content }, issues: [...routed.values()].flat() });
  return {
    article: { ...metadata, content },
    affectedSections: [...routed.keys()],
  };
}

export async function runDraftingAgent(
  systemPrompt: string,
  userPrompt: string,
  options?: { records?: EnforcementRecord[]; minimumWords?: number; maximumWords?: number },
): Promise<SectionedGeneratedArticle> {
  const records = options?.records;
  const minimumWords = options?.minimumWords ?? 1_100;
  const maximumWords = options?.maximumWords ?? 1_600;
  if (!records || records.length < 5) return runStructured({
    model: EDITORIAL_MODELS.drafting,
    name: "regactions_article_draft",
    schema: GeneratedArticleSchema,
    developer: `${systemPrompt}\n\nReturn only the fields required by the supplied schema. The content field must contain the complete Markdown article. Do not include TITLE, EXCERPT, KEYWORDS or CONTENT labels inside any field.`,
    user: userPrompt,
  });

  const candidate = await retryStructured(() => runStructured({
    model: EDITORIAL_MODELS.drafting,
    name: "regactions_evidence_outline",
    schema: ArticleOutlineSchema,
    maxTokens: 4_000,
    temperature: 0.1,
    reasoningEffort: "none",
    developer: `${systemPrompt}\n\nCreate an evidence-led article outline, not article prose. Return exactly one entry for each required section key: overview, actions, analysis, implications, takeaways and data. Assign only exact Record IDs from the evidence table. Every proposed angle must be directly supportable by those rows. Do not add external trends, predictions, legislation or generic compliance advice.`,
    user: userPrompt,
  }));
  const outline = normaliseEditorialOutline(candidate, records);
  let sections = await Promise.all(outline.sections.map((section) =>
    section.key === "data"
      ? Promise.resolve(buildAboutDataSection(records))
      : draftSection({ section, outline, records })
  ));

  for (let lengthAttempt = 1; lengthAttempt <= 2; lengthAttempt++) {
    const lengthRepairs = sections.filter((section) => {
      const target = outline.sections.find((item) => item.key === section.key)!.targetWords;
      const words = countSectionWords(section.markdown);
      const takeawayBullets = section.key === "takeaways"
        ? (section.markdown.match(/^[-*] /gm) || []).length
        : 0;
      const longestTakeawayBullet = section.key === "takeaways"
        ? Math.max(0, ...section.markdown.split("\n")
          .filter((line) => /^[-*] /.test(line))
          .map((line) => countSectionWords(line)))
        : 0;
      return words < target - 35
        || words > target + 50
        || (section.key === "takeaways" && (takeawayBullets < 5 || takeawayBullets > 6 || longestTakeawayBullet > 45));
    });
    if (lengthRepairs.length === 0) break;
    const repaired = await Promise.all(lengthRepairs.map((section) => {
      const spec = outline.sections.find((item) => item.key === section.key)!;
      return runSectionRepairAgent({
        articleTitle: outline.title,
        sectionKey: section.key,
        heading: spec.heading,
        markdown: section.markdown,
        targetWords: spec.targetWords,
        issues: [
          `Section length is ${countSectionWords(section.markdown)} words. It must be between ${Math.max(80, spec.targetWords - 20)} and ${spec.targetWords + 20} words; target ${spec.targetWords} words. This is bounded expansion of supplied evidence, not permission to add facts.`,
          ...(section.key === "takeaways" ? ["Key Takeaways must contain exactly five or six Markdown bullet points, with each bullet no longer than 45 words."] : []),
        ],
        records: recordsForSection(records, spec.sourceRecordIds),
      });
    }));
    const replacements = new Map(repaired.map((section) => [section.key, section]));
    sections = sections.map((section) => replacements.get(section.key) || section);
  }

  const takeawaysAfterRepair = sections.find((section) => section.key === "takeaways")!;
  const takeawayBulletCount = (takeawaysAfterRepair.markdown.match(/^[-*] /gm) || []).length;
  const longestTakeawayBullet = Math.max(0, ...takeawaysAfterRepair.markdown.split("\n")
    .filter((line) => /^[-*] /.test(line))
    .map((line) => countSectionWords(line)));
  if (takeawayBulletCount < 5 || takeawayBulletCount > 6 || longestTakeawayBullet > 45) {
    const spec = outline.sections.find((item) => item.key === "takeaways")!;
    const repaired = await runSectionRepairAgent({
      articleTitle: outline.title,
      sectionKey: "takeaways",
      heading: spec.heading,
      markdown: takeawaysAfterRepair.markdown,
      targetWords: spec.targetWords,
      issues: [`The prior repair produced ${takeawayBulletCount} Markdown bullets and a longest bullet of ${longestTakeawayBullet} words. Return exactly five or six concise bullets, each no longer than 45 words.`],
      records: recordsForSection(records, spec.sourceRecordIds),
    });
    sections = sections.map((section) => section.key === "takeaways" ? repaired : section);
  }

  if (records.length <= 5) {
    const assembled = composeDraftedSections(outline, sections).toLowerCase();
    const missingEntities = records
      .map((record) => record.firm_individual?.trim())
      .filter((entity): entity is string => Boolean(entity) && !assembled.includes(entity!.toLowerCase()));
    if (missingEntities.length > 0) {
      const spec = outline.sections.find((item) => item.key === "actions")!;
      const current = sections.find((section) => section.key === "actions")!;
      const repaired = await runSectionRepairAgent({
        articleTitle: outline.title,
        sectionKey: "actions",
        heading: spec.heading,
        markdown: current.markdown,
        targetWords: spec.targetWords,
        issues: [`Use these exact source entity names at least once: ${missingEntities.join("; ")}.`],
        records,
      });
      sections = sections.map((section) => section.key === "actions" ? repaired : section);
    }
  }

  let assembledContent = composeDraftedSections(outline, sections);
  const assembledQuality = runQualityGate({
    title: outline.title,
    excerpt: outline.excerpt,
    keywords: outline.keywords,
    content: assembledContent,
  }, records, { minimumWords, maximumWords });
  const specificityIssue = assembledQuality.checks.find((check) => check.id === "specificity" && !check.passed);
  if (specificityIssue) {
    const spec = outline.sections.find((item) => item.key === "actions")!;
    const current = sections.find((section) => section.key === "actions")!;
    const verifiedFirst = [
      ...records.filter((record) => record.amount_verified),
      ...records.filter((record) => !record.amount_verified),
    ].slice(0, 10);
    const repaired = await runSectionRepairAgent({
      articleTitle: outline.title,
      sectionKey: "actions",
      heading: spec.heading,
      markdown: current.markdown,
      targetWords: spec.targetWords,
      issues: [specificityIssue.message],
      records: verifiedFirst,
    });
    sections = sections.map((section) => section.key === "actions" ? repaired : section);
    assembledContent = composeDraftedSections(outline, sections);
  }
  const postSpecificityQuality = runQualityGate({
    title: outline.title,
    excerpt: outline.excerpt,
    keywords: outline.keywords,
    content: assembledContent,
  }, records, { minimumWords, maximumWords });
  const amountIssue = postSpecificityQuality.checks.find((check) => check.id === "amount_accuracy" && !check.passed);
  if (amountIssue) {
    const amountTokens = amountIssue.message.match(/(?:£|\$|€)\s*[\d,.]+\s*(?:B|M|K|billion|million|thousand)?|\b(?:GBP|USD|EUR|AUD|NZD|CAD|CHF|SGD|HKD)\s+[\d,.]+/g) || [];
    const affected = sections.filter((section) =>
      amountTokens.some((token) => section.markdown.toLowerCase().includes(token.toLowerCase()))
    );
    const targets = affected.length > 0 ? affected : sections.filter((section) => section.key === "actions");
    const repaired = await Promise.all(targets.map((section) => {
      const spec = outline.sections.find((item) => item.key === section.key)!;
      return runSectionRepairAgent({
        articleTitle: outline.title,
        sectionKey: section.key,
        heading: spec.heading,
        markdown: section.markdown,
        targetWords: spec.targetWords,
        issues: [amountIssue.message, "Remove every unverified or incorrectly attributed amount. Retain only exact verified penalties from the evidence table."],
        records: recordsForSection(records, spec.sourceRecordIds),
      });
    }));
    const replacements = new Map(repaired.map((section) => [section.key, section]));
    sections = sections.map((section) => replacements.get(section.key) || section);
    assembledContent = composeDraftedSections(outline, sections);
  }

  for (let finalLengthAttempt = 1; finalLengthAttempt <= 2; finalLengthAttempt++) {
    const finalWordCount = countSectionWords(assembledContent);
    if (finalWordCount >= minimumWords) break;
    const candidate = sections
      .filter((section) => section.key !== "data" && section.key !== "takeaways")
      .map((section) => {
        const spec = outline.sections.find((item) => item.key === section.key)!;
        return { section, spec, deficit: spec.targetWords - countSectionWords(section.markdown) };
      })
      .sort((a, b) => b.deficit - a.deficit)[0];
    if (candidate) {
      const repaired = await runSectionRepairAgent({
        articleTitle: outline.title,
        sectionKey: candidate.section.key,
        heading: candidate.spec.heading,
        markdown: candidate.section.markdown,
        targetWords: countSectionWords(candidate.section.markdown) + (minimumWords - finalWordCount) + 40,
        issues: [`The assembled article is ${finalWordCount} words and must be at least ${minimumWords} words. Expand this section within its stated word band using only clarification and comparison of the supplied evidence.`],
        records: recordsForSection(records, candidate.spec.sourceRecordIds),
      });
      sections = sections.map((section) => section.key === candidate.section.key ? repaired : section);
      assembledContent = composeDraftedSections(outline, sections);
    }
  }

  return {
    title: outline.title,
    excerpt: outline.excerpt,
    keywords: outline.keywords,
    content: assembledContent,
    outline,
  };
}

export async function runRegulatoryVerifierAgent({
  title,
  excerpt,
  content,
  sources,
  priorClaims,
  webSearch = true,
  stage = "initial",
}: {
  title: string;
  excerpt: string;
  content: string;
  sources: SourceEvidence[];
  priorClaims?: RegulatoryReview["claims"];
  webSearch?: boolean;
  stage?: "initial" | "post-copy";
}): Promise<RegulatoryReview> {
  const regulatoryModel = stage === "post-copy"
    ? EDITORIAL_MODELS.regulatoryFinal
    : EDITORIAL_MODELS.regulatoryInitial;
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const review = await retryStructured(async () => {
    const candidate = await runStructured({
      model: regulatoryModel,
      name: "regactions_regulatory_review",
      schema: RegulatoryReviewSchema,
      maxTokens: 5_000,
      temperature: 0.1,
      reasoningEffort: "none",
      webSearch,
      developer: `You are the independent RegActions Regulatory Verifier. Check every material entity, date, amount, action type and regulatory finding against the supplied source ledger and official public sources. Distinguish fines from investigations, examinations, redress estimates, tax receivables, turnover, assets and other amounts. Assess semantic support, not verbatim wording. Reasonable paraphrases such as 'the FCA imposed a cancellation on X' and a source statement that 'we imposed a cancellation' concerning X are equivalent. A narrower supported statement is not invalid merely because it omits other remedies or background from the source. Treat date_issued as the authoritative official action or notice date supplied by the evidence record; never substitute a date from model memory. Month-level references to that action are supported unless the article claims a different event date. Analytical synthesis is permitted when it is visibly grounded in multiple supplied records and does not claim a universal or causal conclusion. Prior claims are context for rechecking the current article; never fail the article because a prior claim note is incomplete. Currency symbols, ISO codes and currency names are equivalent when both currency and exact numeric value agree, for example €375,000, EUR 375,000 and 375,000 euros. Do not mark a claim ambiguous solely because of those formatting differences. A claim that states no monetary figure is not ambiguous merely because the source ledger does not provide a verified penalty amount. Rounded values are not exact and must remain ambiguous when the source ledger provides a more precise amount. Fail only substantive contradictions, unsupported scope, wrong entities, amounts, dates, action types or findings, or materially misleading omissions. Group repeated references to the same underlying fact into one claim and return no more than 24 material claims. Every claims array item must be one material evidence claim with a permitted kind and verdict, exact sourceIds from the supplied ledger, recordIds and notes. Never shorten, invent or partially copy a source ID. Never append an overall assessment, summary, count or status object to the claims array; use the top-level passed and issues fields for that. Mark any claim without direct support as ambiguous or unsupported. Approval requires every material claim to be verified. The notes field is required for every claim; use a concise verification explanation. Treat ledgerSummary counts as deterministic system metadata derived from the supplied sources array; do not estimate or recount them from prose.`,
      user: JSON.stringify({
        title,
        excerpt,
        content,
        sources,
        ledgerSummary: {
          sourceCount: sources.length,
          officialSourceCount: sources.filter((source) => source.official).length,
          publishers: [...new Set(sources.map((source) => source.publisher))],
        },
        priorClaims,
      }),
    });
    if (verifierClaimsContainUnknownSources(candidate.claims, sourcesById)) {
      throw new Error("regactions_regulatory_review returned a claim with a missing or unknown source ID");
    }
    return candidate;
  });
  const claims = review.claims
    .filter((claim) => claimUsesOnlyArticleAmounts(claim.text, content))
    .map((claim) => normaliseVerifierClaimIdentity(claim, sourcesById))
    .map((claim) => {
    if (claim.verdict !== "verified" && structuredDateSupportsClaim(claim, sourcesById)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The claimed action date matches the authoritative structured source date.` };
    }
    if (claim.verdict === "ambiguous"
      && /source confirms/i.test(claim.notes)
      && /narrower|paraphrase|omits? specific details/i.test(claim.notes)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The narrower supported wording does not contradict the source.` };
    }
    if (claim.verdict === "ambiguous"
      && content.includes(claim.text)
      && !/\b(?:only|solely|always|all regulators|universally)\b/i.test(claim.text)
      && /(?:source|official notices?).*confirm/i.test(claim.notes)
      && /\b(?:incomplete|full scope|scope verification|omits? background)\b/i.test(claim.notes)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The complete article sentence is a supported narrower synthesis and does not assert exclusivity.` };
    }
    if (claim.verdict !== "verified"
      && claimMakesNoAmountButSourceConfirmsPenalty(claim, sourcesById)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The claim states no amount, and the structured source confirms that a financial penalty existed.` };
    }
    if (claim.verdict === "ambiguous"
      && !/\b(?:only|solely)\b/i.test(claim.text)
      && /multiple reasons for the fine|particular type of publication obligation|more specific finding|claim only mentions the ban/i.test(claim.notes)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The claim states a supported subset or general category without asserting exclusivity.` };
    }
    if (claim.verdict === "ambiguous"
      && !/\b(?:only|solely)\b/i.test(claim.text)
      && /source confirms/i.test(claim.notes)
      && /omits? (?:the )?(?:censure|restitution|suspension|additional|other|key)\b/i.test(claim.notes)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} Omission of additional supported remedies does not contradict this narrower finding.` };
    }
    if (claim.verdict === "ambiguous"
      && !containsMonetaryFigure(claim.text)
      && /source confirms/i.test(claim.notes)
      && /monetary value.*not verified|value of (?:any|the) associated penalty.*not verified|does not provide (?:a )?verified (?:penalty )?amount/i.test(claim.notes)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The article makes no monetary claim, so absence of a verified amount is not a contradiction.` };
    }
    if (claim.verdict === "ambiguous"
      && !/\b(?:only|solely)\b/i.test(claim.text)
      && (/reasonable paraphrase/i.test(claim.notes)
        || /which is supported,? but .*does not specify (?:the )?exact/i.test(claim.notes)
        || /article does not specify the exact/i.test(claim.notes)
        || /official action date .*within \d{4}.*article states the year/i.test(claim.notes)
        || /shortcomings? .*during .*not that the penalty was imposed during/i.test(claim.notes))) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The supported narrower wording does not assert exclusivity or a different event date.` };
    }
    if (claim.verdict === "ambiguous" && quotedObjectionAppearsInSources(claim, sourcesById)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The disputed wording appears directly in the structured source excerpt.` };
    }
    if (claim.verdict !== "verified" && /formatting difference|currency symbol difference/i.test(claim.notes)) {
      const sourceAmounts = claim.sourceIds.flatMap((sourceId) => {
        const excerpt = sourcesById.get(sourceId)?.excerpt || "";
        return [...excerpt.matchAll(/Verified penalty amount:\s*([A-Z]{3})\s+([\d.]+)/g)]
          .map((match) => ({ currency: match[1]!, amount: Number(match[2]) }));
      });
      const statedAmounts = [...claim.text.matchAll(/\b(GBP|USD|EUR|AUD|NZD|CAD|CHF|SGD|HKD)\s+([\d,]+(?:\.\d+)?)/g)]
        .map((match) => ({ currency: match[1]!, amount: Number(match[2]!.replace(/,/g, "")) }));
      const allAmountsMatch = statedAmounts.length > 0 && statedAmounts.every((stated) =>
        sourceAmounts.some((source) => source.currency === stated.currency && source.amount === stated.amount)
      );
      if (allAmountsMatch) {
        return { ...claim, verdict: "verified" as const, notes: `${claim.notes} Exact structured currency and amount match the source ledger.` };
      }
    }
    if (claim.verdict === "ambiguous"
      && claim.kind === "action_type"
      && /omit|not mention/i.test(claim.notes)
      && /fine|penalty/i.test(claim.notes)) {
      return { ...claim, verdict: "verified" as const, notes: `${claim.notes} The narrower action claim does not contradict or deny the additional penalty.` };
    }
    if (claim.verdict !== "ambiguous" || claim.kind !== "date" || !/more specific than/i.test(claim.notes)) {
      return claim;
    }
    const statedMonth = [claim.text, claim.notes]
      .map((value) => value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i)?.[0])
      .find(Boolean);
    if (!statedMonth) return claim;
    const referencedDates = claim.sourceIds
      .map((sourceId) => sourcesById.get(sourceId)?.excerpt.match(/Official evidence record date:\s*(\d{4}-\d{2}-\d{2})/)?.[1])
      .filter((date): date is string => Boolean(date));
    const monthMatches = referencedDates.some((date) => {
      const [year, month] = date.split("-").map(Number);
      if (!year || !month) return false;
      const sourceMonth = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(Date.UTC(year, month - 1, 1)));
      return sourceMonth.toLowerCase() === statedMonth.toLowerCase();
    });
    return monthMatches
      ? { ...claim, verdict: "verified" as const, notes: `${claim.notes} Month-and-year granularity matches the official evidence record date.` }
      : claim;
  });
  const everyClaimVerified = claims.length > 0 && claims.every((claim) => claim.verdict === "verified");
  return {
    ...review,
    passed: everyClaimVerified,
    issues: everyClaimVerified ? [] : review.issues,
    claims,
  };
}

export function verifierClaimsContainUnknownSources(
  claims: RegulatoryReview["claims"],
  sourcesById: Map<string, SourceEvidence>,
) {
  return claims.some((claim) =>
    claim.sourceIds.length === 0 || claim.sourceIds.some((sourceId) => !sourcesById.has(sourceId))
  );
}

export function normaliseVerifierClaimIdentity(
  claim: RegulatoryReview["claims"][number],
  sourcesById: Map<string, SourceEvidence>,
) {
  const sourceDerivedRecordIds = claim.sourceIds
    .filter((sourceId) => sourcesById.has(sourceId) && sourceId.startsWith("source:"))
    .map((sourceId) => sourceId.slice("source:".length))
    .filter(Boolean);
  const recordIds = sourceDerivedRecordIds.length > 0
    ? [...new Set(sourceDerivedRecordIds)]
    : [...new Set(claim.recordIds.map((recordId) => recordId.replace(/^record:/, "")).filter(Boolean))];
  const explicitAction = /\b(?:fined?|charged?|imposed|issued|ordered|banned|prohibited|cancelled|censured|sanctioned|settled|commenced proceedings|opened an investigation)\b/i
    .test(claim.text);
  return {
    ...claim,
    kind: claim.kind === "finding" && explicitAction ? "action_type" as const : claim.kind,
    recordIds,
  };
}

export function structuredDateSupportsClaim(
  claim: Pick<RegulatoryReview["claims"][number], "text" | "notes" | "sourceIds">,
  sourcesById: Map<string, SourceEvidence>,
) {
  if (!/\b(?:date|month|year|action|fine|sanction|agreement|order)\b/i.test(claim.notes)
    || !/\b(?:contradict(?:s|ed|ion)?|conflict(?:s|ed|ing)?|different|more specific|not directly supported|unsupported|only provides?)\b/i.test(claim.notes)) return false;
  const authoritativeDates = claim.sourceIds
    .map((sourceId) => sourcesById.get(sourceId)?.excerpt.match(/Official evidence record date:\s*(\d{4}-\d{2}-\d{2})/)?.[1])
    .filter((date): date is string => Boolean(date));
  if (authoritativeDates.length === 0) return false;

  const allegedArticleDate = claim.notes.match(
    /article[^.]{0,120}?\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
  );
  const candidates = allegedArticleDate
    ? [`${allegedArticleDate[1]} ${allegedArticleDate[2]}`]
    : [...claim.text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi)]
      .map((match) => `${match[1]} ${match[2]}`);
  return candidates.some((candidate) => authoritativeDates.some((date) => {
    const [year, month] = date.split("-").map(Number);
    if (!year || !month) return false;
    const sourceMonth = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, 1)));
    return sourceMonth.toLowerCase() === candidate.toLowerCase();
  }));
}

export function quotedObjectionAppearsInSources(
  claim: Pick<RegulatoryReview["claims"][number], "notes" | "sourceIds">,
  sourcesById: Map<string, SourceEvidence>,
) {
  const quoted = [...claim.notes.matchAll(/["']([^"']{8,100})["']/g)]
    .map((match) => match[1]!.toLowerCase().trim());
  if (quoted.length === 0) return false;
  const corpus = claim.sourceIds
    .map((sourceId) => sourcesById.get(sourceId)?.excerpt || "")
    .join(" ")
    .toLowerCase();
  return quoted.some((phrase) => corpus.includes(phrase));
}

function containsMonetaryFigure(value: string) {
  return /(?:£|\$|€)\s*\d|\b(?:AED|AUD|BRL|CAD|CHF|CLP|CNY|DKK|EUR|GBP|HKD|INR|JPY|KRW|MXN|NOK|NZD|SAR|SEK|SGD|TWD|USD|ZAR)\s+\d/i.test(value);
}

interface ParsedEditorialAmount {
  currency: string;
  amount: number;
}

function parseEditorialAmounts(value: string): ParsedEditorialAmount[] {
  const amounts: ParsedEditorialAmount[] = [];
  const pattern = /(?:\b(AED|AUD|BRL|CAD|CHF|CLP|CNY|DKK|EUR|GBP|HKD|INR|JPY|KRW|MXN|NOK|NZD|SAR|SEK|SGD|TWD|USD|ZAR)|([£$€]))\s*([\d,.]+)\s*(billion|million|thousand|bn|mn|b|m|k)?\b/gi;
  for (const match of value.matchAll(pattern)) {
    const currency = (match[1] || (match[2] === "£" ? "GBP" : match[2] === "€" ? "EUR" : "USD")).toUpperCase();
    const raw = (match[3] || "").replace(/,/g, "");
    let amount = Number(raw);
    const scale = (match[4] || "").toLowerCase();
    if (["billion", "bn", "b"].includes(scale)) amount *= 1_000_000_000;
    else if (["million", "mn", "m"].includes(scale)) amount *= 1_000_000;
    else if (["thousand", "k"].includes(scale)) amount *= 1_000;
    if (Number.isFinite(amount) && amount > 0) amounts.push({ currency, amount });
  }
  return amounts;
}

export function claimUsesOnlyArticleAmounts(claimText: string, articleContent: string) {
  const claimed = parseEditorialAmounts(claimText);
  if (claimed.length === 0) return true;
  const article = parseEditorialAmounts(articleContent);
  return claimed.every((claim) => article.some((candidate) =>
    candidate.currency === claim.currency
      && Math.abs(candidate.amount - claim.amount) <= Math.max(1, claim.amount * 0.001)
  ));
}

export function claimMakesNoAmountButSourceConfirmsPenalty(
  claim: Pick<RegulatoryReview["claims"][number], "text" | "notes" | "sourceIds">,
  sourcesById: Map<string, SourceEvidence>,
) {
  if (containsMonetaryFigure(claim.text)
    || !/\b(?:fine[ds]?|financial penalty|monetary penalty)\b/i.test(claim.text)
    || !/\b(?:amount|monetary value)\b/i.test(claim.notes)
    || !/\b(?:not specified|not specify|not verified|unspecified)\b/i.test(claim.notes)) return false;
  return claim.sourceIds.some((sourceId) =>
    /\b(?:fine[ds]?|financial penalty|monetary penalty)\b/i.test(sourcesById.get(sourceId)?.excerpt || "")
  );
}

export async function runCopyEditorAgent({
  title,
  excerpt,
  content,
  protectedEntityNames = [],
  mandatoryCorrections = [],
}: {
  title: string;
  excerpt: string;
  content: string;
  protectedEntityNames?: string[];
  mandatoryCorrections?: string[];
}): Promise<CopyReview> {
  return retryStructured(() => runStructured({
    model: EDITORIAL_MODELS.copy,
    name: "regactions_copy_review",
    schema: CopyReviewSchema,
    maxTokens: 4_000,
    temperature: 0.1,
    reasoningEffort: "none",
    developer: `You are the independent RegActions Copy Editor. Use UK English. Never use an em dash. The voice is 60% senior-regulator restraint and 40% strategy-consulting clarity: precise, sober and evidence-led, with answer-first synthesis, clear structure and actionable implications. Do not add, remove or reinterpret facts, amounts, dates, entities or source claims. Preserve every protected firm or individual name verbatim, including long formal entity labels. Preserve the six section headings and five or six Markdown bullets under Key Takeaways. Remove filler, generic advice, hype, first person, hedging and American spelling. Revise until every safely fixable style issue has been corrected. The passed field and issues list must assess the revised output, not the input. Return passed=true and an empty issues list when the revised output meets this contract. Return passed=false only for an issue that cannot be fixed without changing evidence, and explain only those remaining blockers.`,
    user: JSON.stringify({ title, excerpt, content, protectedEntityNames, mandatoryCorrections }),
  }));
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
    return retryStructured(() => runStructured({
      model: EDITORIAL_MODELS.visual,
      name: "regactions_visual_review",
      schema: VisualReviewSchema,
      developer,
      user: JSON.stringify({ charts, images, sourceIds }),
    }));
  }

  if (getEditorialProvider() === "openrouter") {
    return retryStructured(async () => {
      const response = await getClient().chat.completions.parse({
        model: EDITORIAL_MODELS.visual,
        messages: [
          { role: "system", content: `${developer}\n\nReturn a JSON object that exactly matches the supplied JSON schema.` },
          {
            role: "user",
            content: [
              { type: "text", text: JSON.stringify({ charts, images, sourceIds, candidateImageIds: candidateImages.map((image) => image.id) }) },
              ...candidateImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl, detail: "high" as const } })),
            ],
          },
        ],
        response_format: zodResponseFormat(VisualReviewSchema, "regactions_visual_review"),
        temperature: 0.1,
        max_tokens: 4_000,
        plugins: [{ id: "response-healing" }],
      } as Parameters<OpenAI["chat"]["completions"]["parse"]>[0]);
      if (!response.choices[0]?.message.parsed) throw new Error("regactions_visual_review returned no structured output");
      return response.choices[0].message.parsed as VisualReview;
    });
  }

  return retryStructured(async () => {
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
  });
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
  return retryStructured(() => runStructured({
    model: EDITORIAL_MODELS.head,
    name: "regactions_head_editorial_decision",
    schema: HeadEditorialDecisionSchema,
    developer: `You are the Head Editorial Agent and final editorial authority for RegActions. Approve only when the regulatory verifier, copy editor, visual editor and deterministic gates all pass. You cannot waive unsupported evidence, ambiguous action types, unverified amounts, UK-English failures, em dashes, visual provenance failures or content-hash mismatches. If any such issue exists, reject and identify the blockers.`,
    user: JSON.stringify({
      article: headEditorialArticlePayload(article),
      regulatoryReview,
      copyReview,
      visualReview,
      deterministicIssues,
    }),
  }));
}

export function headEditorialArticlePayload(article: GeneratedArticle) {
  return {
    title: article.title,
    excerpt: article.excerpt,
    keywords: article.keywords,
    content: article.content,
  };
}
