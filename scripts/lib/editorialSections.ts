import type {
  EditorialOutline,
  EditorialOutlineSection,
  EditorialSectionKey,
  EvidenceClaim,
} from "../../src/types/editorial.js";
import type { ArticleOutline, DraftedSection, RegulatoryReview } from "./editorialSchemas.js";

export interface OutlineEvidenceRecord {
  id: string;
  regulator: string;
  firm_individual: string;
  amount_verified: boolean;
}

export const SECTION_BLUEPRINTS: ReadonlyArray<{
  key: EditorialSectionKey;
  heading: string;
  targetWords: number;
}> = [
  { key: "overview", heading: "Overview", targetWords: 180 },
  { key: "actions", heading: "Key Enforcement Actions", targetWords: 320 },
  { key: "analysis", heading: "Analysis", targetWords: 270 },
  { key: "implications", heading: "Regulatory Implications", targetWords: 230 },
  { key: "takeaways", heading: "Key Takeaways", targetWords: 200 },
  { key: "data", heading: "About the Data", targetWords: 120 },
];

export function countSectionWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function getArticleLengthRepairPlan(
  content: string,
  outline: EditorialOutline,
  minimumWords = 1_100,
) {
  const totalWords = countSectionWords(content);
  if (totalWords >= minimumWords) return null;
  const candidate = splitArticleSections(content)
    .filter((section) => section.key !== "data" && section.key !== "takeaways")
    .map((section) => {
      const spec = outline.sections.find((item) => item.key === section.key)!;
      const currentWords = countSectionWords(section.markdown);
      return { section, currentWords, blueprintDeficit: spec.targetWords - currentWords };
    })
    .sort((a, b) => b.blueprintDeficit - a.blueprintDeficit)[0];
  if (!candidate) return null;
  return {
    key: candidate.section.key,
    heading: candidate.section.heading,
    currentWords: candidate.currentWords,
    targetWords: candidate.currentWords + (minimumWords - totalWords) + 40,
    totalWords,
  };
}

function distinctRecords(records: OutlineEvidenceRecord[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (!record.id || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

function fallbackIdsForSection(
  key: EditorialSectionKey,
  records: OutlineEvidenceRecord[],
) {
  const verified = records.filter((record) => record.amount_verified);
  const diverse: OutlineEvidenceRecord[] = [];
  const regulators = new Set<string>();
  for (const record of records) {
    if (regulators.has(record.regulator)) continue;
    diverse.push(record);
    regulators.add(record.regulator);
  }
  const preferred = key === "actions"
    ? [...verified, ...diverse, ...records]
    : key === "data"
      ? [...diverse, ...records]
      : [...diverse, ...verified, ...records];
  return distinctRecords(preferred).slice(0, key === "actions" ? 8 : 6).map((record) => record.id);
}

export function normaliseEditorialOutline(
  candidate: ArticleOutline,
  records: OutlineEvidenceRecord[],
): EditorialOutline {
  if (records.length < 5) throw new Error("An editorial outline requires at least five evidence records");
  const allowed = new Set(records.map((record) => record.id));
  const byKey = new Map(candidate.sections.map((section) => [section.key, section]));
  const sections: EditorialOutlineSection[] = SECTION_BLUEPRINTS.map((blueprint) => {
    const proposed = byKey.get(blueprint.key);
    const maxSources = blueprint.key === "actions" ? 8 : 6;
    let ids = [...new Set((proposed?.sourceRecordIds || []).filter((id) => allowed.has(id)))];
    if (blueprint.key === "actions") {
      ids = [
        ...records.filter((record) => record.amount_verified).slice(0, 3).map((record) => record.id),
        ...ids,
      ];
    }
    if (records.length <= 5 && ["actions", "analysis", "takeaways"].includes(blueprint.key)) {
      ids = [...records.map((record) => record.id), ...ids];
    }
    ids = [...new Set(ids)].slice(0, maxSources);
    return {
      ...blueprint,
      angle: proposed?.angle?.trim() || `Explain the source-backed evidence relevant to ${blueprint.heading.toLowerCase()}.`,
      sourceRecordIds: ids.length > 0 ? ids : fallbackIdsForSection(blueprint.key, records),
    };
  });

  const cited = new Set(sections.flatMap((section) => section.sourceRecordIds));
  if (cited.size < 5) {
    const analysis = sections.find((section) => section.key === "analysis")!;
    analysis.sourceRecordIds = [
      ...new Set([
        ...analysis.sourceRecordIds,
        ...records.map((record) => record.id).filter((id) => !cited.has(id)).slice(0, 5 - cited.size),
      ]),
    ];
  }
  return {
    title: candidate.title,
    excerpt: candidate.excerpt,
    keywords: candidate.keywords,
    sections,
  };
}

export function composeDraftedSections(
  outline: EditorialOutline,
  drafted: DraftedSection[],
) {
  const byKey = new Map(drafted.map((section) => [section.key, section.markdown.trim()]));
  return outline.sections.map((section) => {
    const markdown = byKey.get(section.key);
    if (!markdown) throw new Error(`Missing drafted section: ${section.key}`);
    const withoutHeading = markdown
      .replace(/^\s*##\s+[^\n]+\n*/i, "")
      .trim();
    return `## ${section.heading}\n\n${withoutHeading}`;
  }).join("\n\n");
}

export interface ParsedArticleSection {
  key: EditorialSectionKey;
  heading: string;
  markdown: string;
}

export function splitArticleSections(content: string): ParsedArticleSection[] {
  const matches = [...content.matchAll(/^##\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const heading = match[1]!.trim();
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    const blueprint = SECTION_BLUEPRINTS.find((item) => item.heading.toLowerCase() === heading.toLowerCase())
      || SECTION_BLUEPRINTS[index];
    if (!blueprint) throw new Error(`Unexpected article section: ${heading}`);
    return { key: blueprint.key, heading, markdown: content.slice(start, end).trim() };
  });
}

function claimTokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9£$€]{4,}/g) || []);
}

function similarity(claim: string, section: string) {
  const wanted = claimTokens(claim);
  if (wanted.size === 0) return 0;
  const available = claimTokens(section);
  let matched = 0;
  for (const token of wanted) if (available.has(token)) matched += 1;
  return matched / wanted.size;
}

export function routeRegulatoryIssuesToSections(
  content: string,
  review: Pick<RegulatoryReview, "passed" | "issues" | "claims">,
) {
  const sections = splitArticleSections(content);
  const routed = new Map<EditorialSectionKey, string[]>();
  const add = (key: EditorialSectionKey, issue: string) => {
    routed.set(key, [...(routed.get(key) || []), issue]);
  };
  const nonVerified = review.claims.filter((claim) => claim.verdict !== "verified");
  for (const claim of nonVerified) {
    const best = [...sections]
      .map((section) => ({ section, score: similarity(claim.text, section.markdown) }))
      .sort((a, b) => b.score - a.score)[0]?.section;
    add(best?.key || "analysis", `${claim.verdict.toUpperCase()}: ${claim.text}${claim.notes ? ` (${claim.notes})` : ""}`);
  }
  if (!review.passed && nonVerified.length === 0) {
    for (const issue of review.issues) add("analysis", issue);
  } else {
    for (const issue of review.issues) {
      if (![...routed.values()].some((items) => items.includes(issue))) add("implications", issue);
    }
  }
  return routed;
}

export function replaceArticleSections(
  content: string,
  replacements: Map<EditorialSectionKey, string>,
) {
  return splitArticleSections(content).map((section) =>
    `## ${section.heading}\n\n${(replacements.get(section.key) || section.markdown).trim()}`
  ).join("\n\n");
}

export function unsupportedClaims(review: Pick<RegulatoryReview, "claims">): EvidenceClaim[] {
  return review.claims.filter((claim) => claim.verdict !== "verified");
}
