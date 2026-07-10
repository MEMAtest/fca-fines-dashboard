import crypto from "node:crypto";
import type {
  AgentReview,
  ChartSpec,
  EditorialManifest,
  EvidenceClaim,
  HeadEditorialApproval,
  ImageSpec,
  SourceEvidence,
} from "../../src/types/editorial.js";
import type { GeneratedArticle } from "./editorialSchemas.js";

export interface EditorialEvidenceRecord {
  id: string;
  regulator: string;
  firm_individual: string;
  amount: number;
  currency: string;
  date_issued: string;
  breach_type: string;
  summary: string;
  notice_url: string;
  source_url: string;
  amount_verified: boolean;
}

export interface EditorialDraftArtifact extends GeneratedArticle {
  id: string;
  slug: string;
  seoTitle: string;
  category: string;
  readTime: string;
  date: string;
  dateISO: string;
  keywords: string[];
  status: "draft" | "scheduled" | "published";
  generatedBy: "ai";
  generatedAt: string;
  articleType?: string;
  topicTrack?: "timely" | "evergreen-thematic" | "evergreen-guide";
  sourceRecords: EditorialEvidenceRecord[];
  editorialManifest: EditorialManifest;
}

const UK_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\borganization(s|al|ally)?\b/gi, "organisation$1"],
  [/\bbehavior(s|al)?\b/gi, "behaviour$1"],
  [/\bprioritize(d|s|ing)?\b/gi, "prioritise$1"],
  [/\banalyze(d|s|ing)?\b/gi, "analyse$1"],
  [/\bmodeling\b/gi, "modelling"],
  [/\bcenter(s|ed|ing)?\b/gi, "centre$1"],
  [/\blicense\b(?=\s+(?:regime|requirement|application|holder|condition))/gi, "licence"],
  [/\bcolor(s|ed|ing|ful|less)?\b/gi, "colour$1"],
  [/\bfavor(s|ed|ing|able)?\b/gi, "favour$1"],
  [/\bhonor(s|ed|ing|able)?\b/gi, "honour$1"],
  [/\bauthoriz(e|ed|es|ing)\b/gi, "authoris$1"],
  [/\bauthorization(s)?\b/gi, "authorisation$1"],
  [/\brecogniz(e|ed|es|ing)\b/gi, "recognis$1"],
  [/\bcanceled\b/gi, "cancelled"],
  [/\bcanceling\b/gi, "cancelling"],
  [/\blabeled\b/gi, "labelled"],
  [/\blabeling\b/gi, "labelling"],
  [/\badvisor(s)?\b/gi, "adviser$1"],
  [/\bdefense(s)?\b/gi, "defence$1"],
  [/\bgray\b/gi, "grey"],
  [/\btraveler(s)?\b/gi, "traveller$1"],
  [/\btraveling\b/gi, "travelling"],
  [/\bfulfill(s|ed|ing|ment)?\b/gi, "fulfil$1"],
];

const PROHIBITED_PHRASES = [
  "delve",
  "it is important to note",
  "it is worth noting",
  "in conclusion",
  "to summarise",
  "in summary",
  "as mentioned above",
  "at the end of the day",
  "going forward",
  "moving forward",
];

const PENALTY_LANGUAGE = /\b(fine[ds]?|financial penalty|monetary penalty|civil penalty|geldbu(?:ß|ss)e|bu(?:ß|ss)geld|ordnungsgeld|penalty of|penalised|penalized)\b/i;
const NON_PENALTY_LANGUAGE = /\b(review|examination|investigation opened|consultation|tax receivable|assets under management|turnover|redress estimate|prüfung (?:eingeleitet|ein)|leitet (?:eine )?prüfung)\b/i;

const OFFICIAL_REGULATORY_HOSTS = [
  "fca.org.uk", "bankofengland.co.uk", "gov.uk", "sec.gov", "cftc.gov", "finra.org",
  "occ.gov", "fdic.gov", "federalreserve.gov", "fincen.gov", "bafin.de", "bundesjustizamt.de",
  "europa.eu", "ecb.europa.eu", "amf-france.org", "acpr.banque-france.fr", "cnmv.es",
  "afm.nl", "dnb.nl", "centralbank.ie", "cssf.lu", "finma.ch", "fma.gv.at", "fsma.be",
  "asic.gov.au", "austrac.gov.au", "mas.gov.sg", "hkma.gov.hk", "sfc.hk", "sebi.gov.in",
  "fma.govt.nz", "ciro.ca", "osc.ca", "cvm.gov.br", "dfsa.ae", "adgm.com", "centralbank.ae",
  "jfsc.org", "gfsc.gg", "bma.bm", "cima.ky", "cbn.gov.ng",
] as const;

export function isOfficialRegulatorySource(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return OFFICIAL_REGULATORY_HOSTS.some((official) => host === official || host.endsWith(`.${official}`));
  } catch {
    return false;
  }
}

export function contentHash(article: Pick<GeneratedArticle, "title" | "excerpt" | "keywords" | "content">) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      title: article.title,
      excerpt: article.excerpt,
      keywords: article.keywords,
      content: article.content,
    }))
    .digest("hex");
}

export function normaliseToHouseStyle(value: string) {
  let output = value.replace(/—/g, ",");
  for (const [pattern, replacement] of UK_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function getHouseStyleIssues(article: Pick<GeneratedArticle, "title" | "excerpt" | "content">) {
  const text = `${article.title}\n${article.excerpt}\n${article.content}`;
  const lower = text.toLowerCase();
  const issues: string[] = [];

  if (text.includes("—")) issues.push("Em dash detected");
  for (const [pattern] of UK_REPLACEMENTS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) issues.push(`Non-UK spelling detected: ${pattern.source}`);
  }
  for (const phrase of PROHIBITED_PHRASES) {
    if (lower.includes(phrase)) issues.push(`Prohibited phrase detected: ${phrase}`);
  }
  if (/\b(i |i'm|i've|we |we're|we've|our |my )\b/i.test(text)) {
    issues.push("First-person language detected");
  }
  return [...new Set(issues)];
}

export function isVerifiedPenaltyAmount(record: Omit<EditorialEvidenceRecord, "amount_verified">) {
  if (!(record.amount > 0)) return false;
  if (!isOfficialRegulatorySource(record.notice_url || record.source_url)) return false;
  const corpus = `${record.breach_type} ${record.summary}`;
  return PENALTY_LANGUAGE.test(corpus) && !NON_PENALTY_LANGUAGE.test(corpus);
}

export function buildSourceEvidence(records: EditorialEvidenceRecord[], retrievedAt = new Date().toISOString()) {
  const sources = new Map<string, SourceEvidence>();
  for (const record of records) {
    const url = record.notice_url || record.source_url;
    if (!url) continue;
    const id = `source:${record.id}`;
    const official = isOfficialRegulatorySource(url);
    sources.set(id, {
      id,
      url,
      title: `${record.regulator} action concerning ${record.firm_individual}`,
      publisher: record.regulator,
      sourceType: official ? "official_notice" : "secondary_context",
      retrievedAt,
      official,
      excerpt: record.summary || record.breach_type,
    });
  }
  return [...sources.values()];
}

export function buildDeterministicClaims(records: EditorialEvidenceRecord[]): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];
  for (const record of records) {
    const sourceIds = record.notice_url || record.source_url ? [`source:${record.id}`] : [];
    const common = {
      sourceIds,
      recordIds: [record.id],
      verifier: "deterministic-source-gate" as const,
    };
    const official = isOfficialRegulatorySource(record.notice_url || record.source_url);
    claims.push({
      id: `claim:${record.id}:action`,
      text: `${record.regulator} recorded an action concerning ${record.firm_individual} on ${record.date_issued}.`,
      kind: "action_type",
      verdict: official ? "verified" : "unsupported",
      ...common,
    });
    if (record.amount > 0) {
      claims.push({
        id: `claim:${record.id}:amount`,
        text: `${record.firm_individual} received a financial penalty of ${record.currency} ${record.amount}.`,
        kind: "amount",
        verdict: record.amount_verified ? "verified" : "ambiguous",
        notes: record.amount_verified
          ? "Penalty language is present in the official-source summary."
          : "A monetary value is present but is not verified as a penalty.",
        ...common,
      });
    }
  }
  return claims;
}

export function buildDefaultImageSpecs(slug: string, articleType?: string, articleTitle?: string): ImageSpec[] {
  const images: ImageSpec[] = [
    ["hero", 1600, 900, `/blog/images/${slug}-hero.png`],
    ["open_graph", 1200, 630, `/og/${slug}.png`],
    ["social_square", 1080, 1080, `/blog/images/${slug}-square.png`],
    ["social_portrait", 1080, 1350, `/blog/images/${slug}-portrait.png`],
  ].map(([purpose, width, height, outputPath], index) => ({
    id: `image:${slug}:${index + 1}`,
    purpose: purpose as ImageSpec["purpose"],
    width: width as number,
    height: height as number,
    altText: `RegActions editorial cover for ${slug.replace(/-/g, " ")}`,
    outputPath: outputPath as string,
    generatedBy: "satori" as const,
    factual: false,
    sourceIds: [],
    approved: true,
  }));

  if (new Set(["thematic", "persona"]).has(articleType || "")) {
    images.push({
      id: `image:${slug}:inline-1`,
      purpose: "inline_illustration",
      width: 1536,
      height: 1024,
      altText: `Abstract editorial illustration about ${slug.replace(/-/g, " ")}`,
      caption: "Conceptual illustration. It does not depict an enforcement notice or factual event.",
      prompt: `An abstract conceptual interpretation of the editorial theme "${articleTitle || slug.replace(/-/g, " ")}", expressed through governance systems, oversight, decision pathways and emerging risk signals.`,
      outputPath: `/blog/images/${slug}-inline-1.png`,
      generatedBy: "gpt-image-2",
      factual: false,
      sourceIds: [],
      approved: false,
    });
  }
  return images;
}

export function buildChartSpecs(
  slug: string,
  articleType: string | undefined,
  records: EditorialEvidenceRecord[],
): ChartSpec[] {
  if (!new Set(["monthly", "comparison", "forensic", "trends"]).has(articleType || "")) {
    return [];
  }
  const verified = records
    .filter((record) => record.amount_verified && record.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  const dates = records.map((record) => record.date_issued).filter(Boolean).sort();
  if (verified.length >= 2) {
    return [{
      id: `chart:${slug}:top-penalties`,
      type: "bar",
      title: "Largest verified penalties in the analysis",
      purpose: "Compare the largest source-verified monetary penalties cited in the article.",
      xKey: "firm",
      series: [{ key: "amount", label: "Penalty", format: "currency_gbp", colour: "#0d9488" }],
      data: verified.map((record) => ({ firm: record.firm_individual, amount: record.amount })),
      sourceRecordIds: verified.map((record) => record.id),
      reportingPeriod: { start: dates[0] || "unknown", end: dates[dates.length - 1] || "unknown" },
      currencyBasis: "GBP values supplied by the verified RegActions record set.",
      caption: "Only monetary penalties verified against official-source records are included.",
      altText: `Horizontal bar chart comparing ${verified.length} verified penalties`,
      sourceNote: "Source: RegActions verified enforcement records and linked official notices.",
      staticPath: `/blog/charts/${slug}-top-penalties.png`,
    }];
  }

  const official = records.filter((record) => isOfficialRegulatorySource(record.notice_url || record.source_url));
  const groupKey = articleType === "comparison" ? "regulator" : articleType === "trends" ? "year" : "breach";
  const groups = new Map<string, { count: number; ids: string[] }>();
  for (const record of official) {
    const label = groupKey === "regulator"
      ? record.regulator
      : groupKey === "year"
        ? record.date_issued.slice(0, 4)
        : record.breach_type || "Other action";
    const group = groups.get(label) || { count: 0, ids: [] };
    group.count += 1;
    group.ids.push(record.id);
    groups.set(label, group);
  }
  let chartGroupKey = groupKey;
  let grouped = [...groups.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  if (grouped.length < 2 && official.length >= 2) {
    chartGroupKey = "case";
    grouped = official.slice(0, 8).map((record) => [
      record.firm_individual,
      { count: 1, ids: [record.id] },
    ] as [string, { count: number; ids: string[] }]);
  }
  if (grouped.length < 2) return [];
  const sourceRecordIds = [...new Set(grouped.flatMap(([, group]) => group.ids))];
  return [{
    id: `chart:${slug}:action-pattern`,
    type: chartGroupKey === "year" ? "line" : "bar",
    title: chartGroupKey === "regulator" ? "Source actions by regulator" : chartGroupKey === "year" ? "Source actions by year" : chartGroupKey === "case" ? "Official-source cases in the analysis" : "Source actions by breach theme",
    purpose: "Show the distribution of official-source actions without assigning unverified monetary values.",
    xKey: "label",
    series: [{ key: "count", label: "Actions", format: "count", colour: "#0d9488" }],
    data: grouped.map(([label, group]) => ({ label, count: group.count })),
    sourceRecordIds,
    reportingPeriod: { start: dates[0] || "unknown", end: dates[dates.length - 1] || "unknown" },
    caption: "Counts include official-source actions. No unverified monetary value is shown.",
    altText: `Chart showing official-source action counts across ${grouped.length} ${chartGroupKey} groups`,
    sourceNote: "Source: RegActions records linked to official regulatory notices.",
    staticPath: `/blog/charts/${slug}-action-pattern.png`,
  }];
}

export function getDeterministicEditorialIssues({
  article,
  sources,
  claims,
  charts,
  images,
  articleType,
  records,
}: {
  article: GeneratedArticle;
  sources: SourceEvidence[];
  claims: EvidenceClaim[];
  charts: ChartSpec[];
  images: ImageSpec[];
  articleType?: string;
  records: EditorialEvidenceRecord[];
}) {
  const issues = getHouseStyleIssues(article);
  const sourceIds = new Set(sources.map((source) => source.id));
  const officialSourceIds = new Set(sources.filter((source) => source.official).map((source) => source.id));
  const recordIds = new Set(records.map((record) => record.id));
  const verifiedAmountRecordIds = new Set(
    records.filter((record) => record.amount_verified && record.amount > 0).map((record) => record.id),
  );
  const officialRecordIds = new Set(
    records
      .filter((record) => isOfficialRegulatorySource(record.notice_url || record.source_url))
      .map((record) => record.id),
  );

  if (claims.some((claim) => claim.verdict !== "verified")) {
    issues.push("One or more evidence claims are not verified");
  }
  if (claims.length === 0 || !claims.some((claim) => claim.kind === "action_type")) {
    issues.push("Regulatory review did not verify any enforcement action claims");
  }
  if (claims.some((claim) => claim.sourceIds.length === 0 || claim.sourceIds.some((id) => !sourceIds.has(id)))) {
    issues.push("One or more evidence claims lack a valid source");
  }
  if (claims.some((claim) => claim.kind !== "analysis" && !claim.sourceIds.some((id) => officialSourceIds.has(id)))) {
    issues.push("One or more factual claims lack an official regulatory source");
  }
  if (claims.some((claim) => claim.recordIds.length === 0 || claim.recordIds.some((id) => !recordIds.has(id)))) {
    issues.push("One or more evidence claims lack a valid source record");
  }
  if (claims.some((claim) => claim.kind === "amount" && claim.recordIds.some((id) => !verifiedAmountRecordIds.has(id)))) {
    issues.push("One or more amount claims refer to an unverified monetary record");
  }
  if (new Set(["monthly", "comparison", "forensic", "trends"]).has(articleType || "") && charts.length === 0) {
    issues.push(`Article type ${articleType} requires at least one verified chart`);
  }
  if (charts.some((chart) => chart.sourceRecordIds.length === 0 || chart.sourceRecordIds.some((id) => !officialRecordIds.has(id)))) {
    issues.push("One or more charts lack verified source records");
  }
  if (charts.some((chart) => chart.series.some((series) => series.format === "currency_gbp") && chart.sourceRecordIds.some((id) => !verifiedAmountRecordIds.has(id)))) {
    issues.push("One or more monetary charts contain unverified penalty records");
  }
  if (!images.some((image) => image.purpose === "open_graph" && image.approved)) {
    issues.push("Approved Open Graph image is missing");
  }
  if (images.some((image) => !image.altText.trim())) {
    issues.push("One or more images lack alt text");
  }
  if (images.some((image) => !image.approved)) {
    issues.push("One or more images lack Visual Editor approval");
  }
  if (sources.some((source) => !source.excerpt.trim())) {
    issues.push("One or more source records lack an evidence excerpt");
  }
  return [...new Set(issues)];
}

export function buildInitialEditorialManifest({
  slug,
  article,
  articleType,
  records,
  generationModel,
  promptVersion,
  generatedAt = new Date().toISOString(),
}: {
  slug: string;
  article: GeneratedArticle;
  articleType?: string;
  records: EditorialEvidenceRecord[];
  generationModel: string;
  promptVersion: string;
  generatedAt?: string;
}): EditorialManifest {
  const sources = buildSourceEvidence(records, generatedAt);
  const claims = buildDeterministicClaims(records);
  return {
    version: 1,
    status: "drafted",
    contentHash: contentHash(article),
    generatedAt,
    generationModel,
    promptVersion,
    sources,
    claims,
    charts: buildChartSpecs(slug, articleType, records),
    images: buildDefaultImageSpecs(slug, articleType, article.title),
    reviews: [],
  };
}

export function makeAgentReview({
  role,
  model,
  promptVersion,
  passed,
  issues,
  hash,
}: Omit<AgentReview, "completedAt" | "contentHash"> & { hash: string }): AgentReview {
  return {
    role,
    model,
    promptVersion,
    completedAt: new Date().toISOString(),
    passed,
    issues,
    contentHash: hash,
  };
}

export function makeHeadApproval({
  approved,
  hash,
  model,
  promptVersion,
  rationale,
}: {
  approved: boolean;
  hash: string;
  model: string;
  promptVersion: string;
  rationale: string;
}): HeadEditorialApproval {
  return {
    status: approved ? "approved" : "rejected",
    reviewer: "head-editorial-agent",
    approvedAt: approved ? new Date().toISOString() : undefined,
    contentHash: hash,
    model,
    promptVersion,
    rationale,
  };
}

export function assertPublishableDraft(draft: EditorialDraftArtifact) {
  const hash = contentHash(draft);
  const manifest = draft.editorialManifest;
  const issues = getDeterministicEditorialIssues({
    article: draft,
    sources: manifest.sources,
    claims: manifest.claims,
    charts: manifest.charts,
    images: manifest.images,
    articleType: draft.articleType,
    records: draft.sourceRecords,
  });
  if (manifest.contentHash !== hash) issues.push("Editorial manifest content hash does not match the draft");
  if (manifest.headApproval?.status !== "approved") issues.push("Head Editorial Agent approval is missing");
  if (manifest.headApproval?.contentHash !== hash) issues.push("Head Editorial Agent approval hash is stale");
  for (const role of ["regulatory-verifier-agent", "copy-editor-agent", "visual-editor-agent"] as const) {
    if (!manifest.reviews.some((review) => review.role === role && review.passed && review.contentHash === hash)) {
      issues.push(`Passing ${role} review for the current content hash is missing`);
    }
  }
  if (issues.length > 0) {
    throw new Error(`Draft is not publishable:\n- ${issues.join("\n- ")}`);
  }
  return { hash, manifest };
}
