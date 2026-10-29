import { createHash } from "node:crypto";
import ruleDocument from "./data/asicAmountAttributionRules.json" with { type: "json" };

export interface AsicAmountAttributionInput {
  firmIndividual: string;
  mediaReleaseCode: string | null;
  mediaReleaseUrl: string | null;
  mediaReleaseTitle: string | null;
  /** Optional extracted text from the exact official media-release URL. */
  mediaReleaseSourceText?: string | null;
}

interface ExplicitPassage {
  passage: string;
  sha256: string;
  amount: number;
  entities: string[];
}

interface GroupRule {
  mediaReleaseCode: string;
  mediaReleaseUrl: string;
  headlineNeedle: string;
  groupAmount: number;
  groupCount: number;
  entities: string[];
  explicitPassages: ExplicitPassage[];
}

const RULES = ruleDocument as { version: number; regulator: string; groups: GroupRule[] };

export interface AsicAmountAttributionResult {
  matchedGroupRule: boolean;
  classification: "not_group_rule" | "group_total_unallocated" | "entity_explicit";
  amount: number | null;
  amountReviewReason: string | null;
  groupAmount: number | null;
  groupCount: number | null;
  evidencePassageSha256: string | null;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedEntity(value: string) {
  return collapseWhitespace(value).toLocaleLowerCase("en-AU");
}

function normalizedHeadline(value: string) {
  return collapseWhitespace(value)
    .toLocaleLowerCase("en-AU")
    .replace(/(\$[\d,.]+)\s*(million|billion|thousand)\b/g, "$1 $2");
}

function normalizedReleaseUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "www.asic.gov.au" || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function fingerprintAsicSourcePassage(passage: string) {
  return createHash("sha256").update(passage).digest("hex");
}

/** Conservative safety net for group headlines not yet in the source-specific rule catalog. */
export function isPotentialAsicGroupAmountHeadline(title: string | null | undefined) {
  const headline = normalizedHeadline(title ?? "");
  if (!/\$\s*[\d,.]+/.test(headline)) return false;
  const numberedGroup = /\b(?:to|across|among|for)\s+(?:\d+|two|three|four|five|six|seven|eight|nine|ten|several|multiple)\s+(?:(?:large|related|proprietary)\s+)*(?:companies|entities|firms|individuals|persons)\b/.test(headline);
  const pluralAction = /\b(?:companies|entities|firms|individuals|persons)\s+(?:pay|paid|receive|received|were fined|face|faced)\b/.test(headline);
  // Do not hold a single-firm notice merely because its headline uses words
  // such as "total" or "aggregate". Require an explicit plural/count cue.
  return numberedGroup || pluralAction;
}

export function resolveAsicAmountAttribution(
  row: AsicAmountAttributionInput,
): AsicAmountAttributionResult {
  if (RULES.version !== 1 || RULES.regulator !== "ASIC") {
    throw new Error("Unsupported ASIC amount attribution contract.");
  }

  const code = row.mediaReleaseCode?.trim().toUpperCase() ?? "";
  const releaseUrl = normalizedReleaseUrl(row.mediaReleaseUrl);
  const rule = RULES.groups.find((candidate) =>
    candidate.mediaReleaseCode === code && normalizedReleaseUrl(candidate.mediaReleaseUrl) === releaseUrl,
  );
  if (!rule) {
    return {
      matchedGroupRule: false,
      classification: "not_group_rule",
      amount: null,
      amountReviewReason: null,
      groupAmount: null,
      groupCount: null,
      evidencePassageSha256: null,
    };
  }

  const headline = normalizedHeadline(row.mediaReleaseTitle ?? "");
  const entity = rule.entities.find((candidate) => normalizedEntity(candidate) === normalizedEntity(row.firmIndividual));
  const groupEvidence = headline.includes(normalizedHeadline(rule.headlineNeedle));
  const sourceText = row.mediaReleaseSourceText ? collapseWhitespace(row.mediaReleaseSourceText) : "";
  const explicit = rule.explicitPassages.find((candidate) => {
    const passageHashMatches = fingerprintAsicSourcePassage(candidate.passage) === candidate.sha256;
    const passageAppearsInSource = Boolean(sourceText) && sourceText.includes(collapseWhitespace(candidate.passage));
    const entityIsNamed = candidate.entities.some((name) => normalizedEntity(name) === normalizedEntity(row.firmIndividual));
    return passageHashMatches && passageAppearsInSource && entityIsNamed;
  });

  if (entity && groupEvidence && explicit) {
    return {
      matchedGroupRule: true,
      classification: "entity_explicit",
      amount: explicit.amount,
      amountReviewReason: `Official ASIC release explicitly states AUD ${explicit.amount.toLocaleString("en-AU")} for ${row.firmIndividual}; retain the case-level amount review until source and identity review is completed.`,
      groupAmount: rule.groupAmount,
      groupCount: rule.groupCount,
      evidencePassageSha256: explicit.sha256,
    };
  }

  const reason = !entity
    ? `ASIC release ${rule.mediaReleaseCode} reports a group-level AUD ${rule.groupAmount.toLocaleString("en-AU")} amount across ${rule.groupCount} companies; this entity is not in the reviewed roster.`
    : !groupEvidence
      ? `ASIC release ${rule.mediaReleaseCode} identity matched, but its group-total headline did not; keep this row's amount under review.`
      : `ASIC release ${rule.mediaReleaseCode} reports AUD ${rule.groupAmount.toLocaleString("en-AU")} across ${rule.groupCount} companies; no fingerprinted per-entity amount passage was supplied for ${row.firmIndividual}.`;

  return {
    matchedGroupRule: true,
    classification: "group_total_unallocated",
    amount: null,
    amountReviewReason: reason,
    groupAmount: rule.groupAmount,
    groupCount: rule.groupCount,
    evidencePassageSha256: null,
  };
}
