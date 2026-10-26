import { createHash } from "node:crypto";

export const CONTROL_EVIDENCE_MAX_PASSAGE = 2000;

export type OfficialSourcePassage = {
  text: string;
  locator: string;
  respondentAttribution?: { method: string; locator: string; matchedName: string };
};

export type ControlEvidenceMatch = {
  code: string;
  label: string;
  matchedTerms: string[];
  field: string;
  passage: string;
};

export type ControlEvidenceCase = {
  publicCaseId: string;
  respondent: string;
  sourceUrl: string;
  summary: string | null;
  breachType: string | null;
  breachCategories: unknown;
};

export type ControlEvidenceCandidate = {
  public_case_id: string;
  control_code: string;
  taxonomy_version: string;
  source_url: string;
  content_hash: string;
  passage: string;
  locator: string;
  respondent: string;
  attribution_method: string;
  fetched_at: string;
  review_status: "candidate";
};

export function sha256Hex(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function normalizeEntity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTermSpan(text: string, term: string): { start: number; end: number } | null {
  const words = normalizeEntity(term).split(" ").filter(Boolean);
  if (!words.length) return null;
  const pattern = words.map(escapeRegExp).join("[\\W_]+");
  const found = new RegExp(pattern, "i").exec(text);
  return found ? { start: found.index, end: found.index + found[0].length } : null;
}

function respondentMention(passage: string, respondent: string): string | null {
  return new RegExp(escapeRegExp(respondent.trim()), "i").exec(passage)?.[0] ?? null;
}

/**
 * Attribute a short respondent alias only where the official source itself
 * defines it next to the case's full legal name. Alias evidence remains
 * document-local and the definition locator is preserved with every match.
 */
export function attributeRespondentPassages(passages: OfficialSourcePassage[], respondent: string): OfficialSourcePassage[] {
  const escapedRespondent = escapeRegExp(respondent.trim());
  const definition = new RegExp(`${escapedRespondent}\\s*\\(\\s*["'“”]?([A-Z][A-Za-z0-9&.'-]{2,})["'“”]?\\s*\\)`, "i");
  const definitions = passages.flatMap((passage) => {
    const match = passage.text.match(definition);
    const alias = match?.[1]?.trim();
    const formalDefinition = /["'“‘]([^"'”’]{3,80})["'”’]\s+means\s+(?:the\s+)?/i.exec(passage.text);
    // Do not interpolate document text into a RegExp: official PDFs are
    // untrusted input. Match the respondent only in the literal remainder.
    const formalRemainder = formalDefinition
      ? passage.text.slice(formalDefinition.index + formalDefinition[0].length)
      : "";
    const formalAlias = formalDefinition && new RegExp(`^\\s*(?:the\\s+)?${escapedRespondent}(?![A-Za-z0-9])`, "i").test(formalRemainder)
      ? formalDefinition[1].trim()
      : null;
    const candidates = [alias, formalAlias].filter((value): value is string => Boolean(value));
    return candidates.filter((value) => normalizeEntity(value) !== normalizeEntity(respondent))
      .map((value) => ({ alias: value, locator: passage.locator }));
  });

  return passages.flatMap((passage) => {
    const direct = respondentMention(passage.text, respondent);
    if (direct) return [{ ...passage, respondentAttribution: { method: "respondent_name_in_same_passage", locator: passage.locator, matchedName: direct } }];
    for (const item of definitions) {
      const escapedAlias = escapeRegExp(item.alias);
      if (new RegExp(`\\b${escapedAlias}\\b`, "i").test(passage.text)) {
        return [{ ...passage, respondentAttribution: {
          method: `same_document_defined_alias:${item.alias}`,
          locator: item.locator,
          matchedName: item.alias,
        } }];
      }
    }
    return [];
  });
}

function legalParagraphNumber(text: string): { prefix: string; final: number } | null {
  const match = /^(?:(?:\d{1,3})\s+)?((?:\d+\.)+)(\d+)\b/.exec(text.trim());
  if (!match) return null;
  return { prefix: match[1], final: Number(match[2]) };
}

function labeledCustomerSubject(text: string): string | null {
  const first = /\b(?:Customer|Account)\s+[A-Z]\b/i.exec(text);
  if (!first || first.index > 220) return null;
  return first[0].toLowerCase();
}

/**
 * Add only one-paragraph legal-notice context when the evidence paragraph
 * itself omits the respondent but the immediately adjacent numbered
 * paragraph names it and repeats one unambiguous Customer/Account label.
 * This is intentionally stricter than whole-document respondent attribution.
 */
export function attributeRespondentPassagesWithAdjacentSubjectContext(
  passages: OfficialSourcePassage[],
  respondent: string,
): OfficialSourcePassage[] {
  const directlyAttributed = attributeRespondentPassages(passages, respondent);
  const directlyByLocator = new Map(directlyAttributed.map((passage) => [passage.locator, passage]));
  const result = [...directlyAttributed];
  const seen = new Set(directlyAttributed.map((passage) => passage.locator));
  for (let index = 0; index < passages.length; index += 1) {
    const evidence = passages[index];
    if (directlyByLocator.has(evidence.locator)) continue;
    const subject = labeledCustomerSubject(evidence.text);
    const evidenceNumber = legalParagraphNumber(evidence.text);
    if (!subject || !evidenceNumber) continue;
    for (const neighborIndex of [index - 1, index + 1]) {
      if (neighborIndex < 0 || neighborIndex >= passages.length) continue;
      const neighbor = directlyByLocator.get(passages[neighborIndex].locator);
      if (!neighbor?.respondentAttribution) continue;
      if (labeledCustomerSubject(neighbor.text) !== subject) continue;
      const neighborNumber = legalParagraphNumber(neighbor.text);
      if (!neighborNumber || neighborNumber.prefix !== evidenceNumber.prefix || Math.abs(neighborNumber.final - evidenceNumber.final) !== 1) continue;
      const combinedText = [index, neighborIndex].sort((a, b) => a - b)
        .map((passageIndex) => passages[passageIndex].text.trim()).join(" ").replace(/\s+/g, " ");
      if (combinedText.length > CONTROL_EVIDENCE_MAX_PASSAGE) continue;
      const locator = `${evidence.locator};respondent-context-at=${neighbor.locator}`;
      if (seen.has(locator)) continue;
      seen.add(locator);
      result.push({
        text: combinedText,
        locator,
        respondentAttribution: {
          method: "same_document_adjacent_numbered_subject_context",
          locator: neighbor.respondentAttribution.locator,
          matchedName: neighbor.respondentAttribution.matchedName,
        },
      });
      break;
    }
  }
  return result;
}

/** Require the named respondent to occur in the very same passage as the claim. */
export function passageNamesRespondent(passage: string, respondent: string): boolean {
  const entity = normalizeEntity(respondent);
  const text = normalizeEntity(passage);
  if (!entity || entity.length < 5 || !text) return false;
  return text.includes(entity);
}

export function buildControlEvidenceCandidates(args: {
  caseRecord: ControlEvidenceCase;
  sourceHash: string;
  passages: OfficialSourcePassage[];
  matches: ControlEvidenceMatch[];
  taxonomyVersion: string;
  fetchedAt?: string;
}): ControlEvidenceCandidate[] {
  const { caseRecord, sourceHash, passages, matches, taxonomyVersion } = args;
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  const candidates: ControlEvidenceCandidate[] = [];
  const perControlSeen = new Set<string>();

  for (const passage of passages) {
    const text = passage.text.trim().replace(/\s+/g, " ");
    const attribution = passage.respondentAttribution;
    if (!text || (!attribution && !passageNamesRespondent(text, caseRecord.respondent))) continue;
    for (const match of matches) {
      if (match.passage.replace(/\s+/g, " ").trim() !== text) continue;
      const terms = match.matchedTerms.map(normalizeEntity).filter(Boolean);
      if (!terms.some((term) => normalizeEntity(text).includes(term))) continue;
      const attributedName = attribution?.matchedName ?? caseRecord.respondent;
      const aliasIndex = text.toLowerCase().indexOf(attributedName.toLowerCase());
      const termSpan = match.matchedTerms.map((term) => findTermSpan(text, term)).find(Boolean) ?? null;
      const termIndex = termSpan?.start ?? -1;
      const evidenceEnd = Math.max(aliasIndex + attributedName.length, termSpan?.end ?? -1);
      const evidenceStart = Math.min(aliasIndex, termIndex);
      if (aliasIndex < 0 || termIndex < 0 || evidenceEnd - evidenceStart > CONTROL_EVIDENCE_MAX_PASSAGE) continue;
      let start = Math.max(0, evidenceStart - Math.floor((CONTROL_EVIDENCE_MAX_PASSAGE - (evidenceEnd - evidenceStart)) / 2));
      let end = Math.min(text.length, start + CONTROL_EVIDENCE_MAX_PASSAGE);
      if (end < evidenceEnd) { end = evidenceEnd; start = Math.max(0, end - CONTROL_EVIDENCE_MAX_PASSAGE); }
      const clipped = text.slice(start, end).trim();
      const locator = attribution && attribution.locator !== passage.locator
        ? `${passage.locator};respondent-defined-at=${attribution.locator}`
        : passage.locator;
      const dedupe = `${match.code}\u0000${locator}\u0000${clipped}`;
      if (perControlSeen.has(dedupe)) continue;
      perControlSeen.add(dedupe);
      candidates.push({
        public_case_id: caseRecord.publicCaseId,
        control_code: match.code,
        taxonomy_version: taxonomyVersion,
        source_url: caseRecord.sourceUrl,
        content_hash: sourceHash,
        passage: clipped,
        locator,
        respondent: caseRecord.respondent,
        attribution_method: attribution?.method ?? "respondent_name_in_same_passage",
        fetched_at: fetchedAt,
        review_status: "candidate",
      });
    }
  }
  return candidates;
}

/**
 * Fail-closed apply validator: regenerate the exact candidate from the live,
 * already hash-verified respondent-attributed passage and compare its stable
 * projection. This uses the same normalized term-span logic as discovery, so
 * punctuation/case normalization in a legitimate matcher alias does not
 * disagree with a raw substring check of the preserved source passage.
 */
export function validateReviewedCandidateSupport(args: {
  row: Omit<ControlEvidenceCandidate, "review_status">;
  caseRecord: ControlEvidenceCase;
  sourceHash: string;
  passage: OfficialSourcePassage & { respondentAttribution: NonNullable<OfficialSourcePassage["respondentAttribution"]> };
  matches: ControlEvidenceMatch[];
  taxonomyVersion: string;
}): void {
  const { row, caseRecord, sourceHash, passage, matches, taxonomyVersion } = args;
  if (sourceHash !== row.content_hash) throw new Error("Reviewed source hash differs from current official source");
  if (row.taxonomy_version !== taxonomyVersion) throw new Error("Reviewed taxonomy version differs from current matcher");
  const reproduced = buildControlEvidenceCandidates({
    caseRecord,
    sourceHash,
    passages: [passage],
    matches: matches.map((match) => ({ ...match, passage: passage.text })),
    taxonomyVersion,
    fetchedAt: row.fetched_at,
  }).find((candidate) => candidate.control_code === row.control_code);
  if (!reproduced ||
      reproduced.public_case_id !== row.public_case_id ||
      reproduced.control_code !== row.control_code ||
      reproduced.taxonomy_version !== row.taxonomy_version ||
      reproduced.source_url !== row.source_url ||
      reproduced.content_hash !== row.content_hash ||
      reproduced.passage !== row.passage ||
      reproduced.locator !== row.locator ||
      reproduced.respondent !== row.respondent ||
      reproduced.attribution_method !== row.attribution_method ||
      reproduced.fetched_at !== row.fetched_at) {
    throw new Error("Reviewed evidence row is not exactly reproducible from the current attributed control passage");
  }
}
