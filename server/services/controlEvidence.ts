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
    return alias && normalizeEntity(alias) !== normalizeEntity(respondent)
      ? [{ alias, locator: passage.locator }]
      : [];
  });

  return passages.flatMap((passage) => {
    const direct = passageNamesRespondent(passage.text, respondent);
    if (direct) return [{ ...passage, respondentAttribution: { method: "respondent_name_in_same_passage", locator: passage.locator, matchedName: respondent } }];
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

/** Require the named respondent to occur in the very same passage as the claim. */
export function passageNamesRespondent(passage: string, respondent: string): boolean {
  const entity = normalizeEntity(respondent);
  const text = normalizeEntity(passage);
  if (!entity || entity.length < 5 || !text) return false;
  if (text.includes(entity)) return true;

  // Regulators commonly omit legal suffixes. The core name must still be a
  // distinctive multi-token substring, never a generic single-word match.
  const core = entity.replace(/\b(plc|limited|ltd|incorporated|inc|corp|corporation|llc|bank|group|the)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return core.length >= 8 && core.split(" ").length >= 2 && text.includes(core);
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
      const terms = match.matchedTerms.map(normalizeEntity).filter(Boolean);
      if (!terms.some((term) => normalizeEntity(text).includes(term))) continue;
      const rawTerms = match.matchedTerms.filter((term) => normalizeEntity(text).includes(normalizeEntity(term)));
      const matchedTerm = rawTerms.find((term) => text.toLowerCase().includes(term.toLowerCase()));
      const attributedName = attribution?.matchedName ?? caseRecord.respondent;
      const aliasIndex = text.toLowerCase().indexOf(attributedName.toLowerCase());
      const termIndex = matchedTerm ? text.toLowerCase().indexOf(matchedTerm.toLowerCase()) : -1;
      const evidenceEnd = Math.max(aliasIndex + attributedName.length, termIndex + (matchedTerm?.length ?? 0));
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
