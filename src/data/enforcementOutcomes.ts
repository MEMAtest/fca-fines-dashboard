export const ENFORCEMENT_OUTCOME_CLASSIFICATION_VERSION = "2026-09-20.1";

export type EnforcementRecordClass =
  | "enforcement_outcome"
  | "proceeding"
  | "regulatory_alert"
  | "informational_notice"
  | "unknown";

export type EnforcementOutcomeType =
  | "monetary_penalty"
  | "prohibition_debarment"
  | "licence_restriction_revocation"
  | "public_censure_reprimand"
  | "remediation_redress"
  | "prosecution_court_order"
  | "suspension"
  | "settlement_undertaking"
  | "other";

export type MonetaryPenaltyStatus = "disclosed" | "undisclosed" | "none" | "unknown";

export type EnforcementPublicationType =
  | "final_notice"
  | "decision_order"
  | "press_release"
  | "public_notice"
  | "court_judgment"
  | "settlement"
  | "warning_alert"
  | "other";

export type EnforcementProceduralStatus =
  | "final"
  | "settled"
  | "appealed"
  | "pending"
  | "alert_only"
  | "unknown";

export interface EnforcementOutcomeClassification {
  recordClass: EnforcementRecordClass;
  outcomeTypes: EnforcementOutcomeType[];
  primaryOutcome: EnforcementOutcomeType | null;
  monetaryPenaltyStatus: MonetaryPenaltyStatus;
  publicationType: EnforcementPublicationType;
  proceduralStatus: EnforcementProceduralStatus;
  classificationVersion: string;
  matchReasons: string[];
}

export interface EnforcementOutcomeInput {
  amountOriginal?: number | string | null;
  amountGbp?: number | string | null;
  amountEur?: number | string | null;
  requiresAmountReview?: boolean | null;
  amountQuality?: string | null;
  breachType?: string | null;
  summary?: string | null;
  noticeUrl?: string | null;
  sourceUrl?: string | null;
  breachCategories?: unknown;
}

const OUTCOME_RULES: Array<{
  type: EnforcementOutcomeType;
  reason: string;
  pattern: RegExp;
}> = [
  {
    type: "prohibition_debarment",
    reason: "prohibition_or_ban",
    pattern: /\b(prohibit(?:ed|ion)?|debar(?:red|ment)?|disqualif(?:ied|ication)|bann?ed|industry ban)\b/i,
  },
  {
    type: "licence_restriction_revocation",
    reason: "licence_action",
    pattern: /\b(licen[cs]e|registration|authori[sz]ation)\b.{0,45}\b(revok(?:ed|ation)|cancel(?:led|lation)|withdrawn|restrict(?:ed|ion)|surrender(?:ed)?)\b|\b(revok(?:ed|ation)|cancel(?:led|lation)|withdrawn|restrict(?:ed|ion))\b.{0,45}\b(licen[cs]e|registration|authori[sz]ation)\b/i,
  },
  {
    type: "public_censure_reprimand",
    reason: "censure_or_reprimand",
    pattern: /\b(public censure|censur(?:ed|e)|reprimand(?:ed)?)\b/i,
  },
  {
    type: "remediation_redress",
    reason: "redress_or_remediation",
    pattern: /\b(redress|restitution|compensation|remediation|disgorgement|repay(?:ment)?|refund(?:ed)?)\b/i,
  },
  {
    type: "prosecution_court_order",
    reason: "court_or_prosecution_outcome",
    pattern: /\b(convict(?:ed|ion)|sentenc(?:ed|ing)|prosecut(?:ed|ion)|court order|injunction|imprison(?:ed|ment))\b/i,
  },
  {
    type: "suspension",
    reason: "suspension",
    pattern: /\b(suspend(?:ed|sion))\b/i,
  },
  {
    type: "settlement_undertaking",
    reason: "settlement_or_undertaking",
    pattern: /\b(settle(?:d|ment)|undertaking|accepted findings and sanctions|letter of acceptance.{0,20}waiver.{0,20}consent|\bawc\b)\b/i,
  },
  {
    type: "other",
    reason: "other_concluded_regulatory_action",
    pattern: /\b(non monetary order|supervisory sanction|enforcement action|administrative action|disciplinary action)\b/i,
  },
];

const MONETARY_PATTERN = /\b(fine[ds]?|financial penalty|monetary penalty|monetary sanction|civil (?:money )?penalty|administrative penalty|penalty of|penalised|penalized)\b/i;
const ALERT_PATTERN = /\b(investor alert|consumer alert|fraud alert|scam alert|warning list|illegal operator|unauthori[sz]ed (?:firm|entity|operator|provider)|blacklist(?:ed)?)\b/i;
const PENDING_PATTERN = /\b(charg(?:ed|es)|proceedings? (?:commenced|filed|opened|pending)|complaint filed|hearing scheduled|investigation (?:opened|ongoing|underway)|show cause notice|notice of allegations)\b/i;
const FINAL_PATTERN = /\b(final notice|final decision|final order|ordered to|has imposed|imposed a|was fined|were fined|revoked|cancelled|censured|reprimanded|convicted|sentenced|settled)\b/i;
const INFORMATIONAL_PATTERN = /\b(guidance|consultation|discussion paper|policy statement|annual report|framework|speech|market study|thematic review)\b/i;

function finitePositive(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function joinedEvidence(input: EnforcementOutcomeInput): string {
  const categories = Array.isArray(input.breachCategories)
    ? input.breachCategories.join(" ")
    : typeof input.breachCategories === "string"
      ? input.breachCategories
      : "";
  return [input.breachType, categories, input.summary, input.noticeUrl, input.sourceUrl]
    .filter(Boolean)
    .join(" ")
    .replace(/[_-]+/g, " ");
}

function resolvePublicationType(text: string): EnforcementPublicationType {
  if (/\bfinal notice\b/i.test(text)) return "final_notice";
  if (/\b(judgment|judgement|court ruling)\b/i.test(text)) return "court_judgment";
  if (/\b(settlement|undertaking|\bawc\b)\b/i.test(text)) return "settlement";
  if (ALERT_PATTERN.test(text)) return "warning_alert";
  if (/\b(decision|order)\b/i.test(text)) return "decision_order";
  if (/\bpress release\b/i.test(text) || /\/news\//i.test(text)) return "press_release";
  if (/\bpublic notice\b/i.test(text) || /\/notices?\//i.test(text)) return "public_notice";
  return "other";
}

export function classifyEnforcementOutcome(
  input: EnforcementOutcomeInput,
): EnforcementOutcomeClassification {
  const text = joinedEvidence(input);
  const matchReasons: string[] = [];
  const outcomeTypes: EnforcementOutcomeType[] = [];
  const trustedAmountDisclosed = !input.requiresAmountReview &&
    (finitePositive(input.amountGbp) || finitePositive(input.amountEur));
  const informationalEvidence = INFORMATIONAL_PATTERN.test(text);
  const monetaryLanguage = MONETARY_PATTERN.test(text) && !informationalEvidence;

  if (trustedAmountDisclosed || monetaryLanguage) {
    outcomeTypes.push("monetary_penalty");
    matchReasons.push(trustedAmountDisclosed ? "trusted_positive_amount" : "monetary_penalty_wording");
  }

  for (const rule of OUTCOME_RULES) {
    if (rule.pattern.test(text) && !outcomeTypes.includes(rule.type)) {
      outcomeTypes.push(rule.type);
      matchReasons.push(rule.reason);
    }
  }

  const finalEvidence = FINAL_PATTERN.test(text) || outcomeTypes.length > 0 || trustedAmountDisclosed;
  const alertEvidence = ALERT_PATTERN.test(text);
  const pendingEvidence = PENDING_PATTERN.test(text);

  let recordClass: EnforcementRecordClass;
  if (finalEvidence) recordClass = "enforcement_outcome";
  else if (alertEvidence) recordClass = "regulatory_alert";
  else if (pendingEvidence) recordClass = "proceeding";
  else if (informationalEvidence) recordClass = "informational_notice";
  else recordClass = "unknown";

  if (recordClass === "regulatory_alert") matchReasons.push("alert_wording");
  if (recordClass === "proceeding") matchReasons.push("pending_proceeding_wording");
  if (recordClass === "informational_notice") matchReasons.push("informational_wording");

  let proceduralStatus: EnforcementProceduralStatus = "unknown";
  if (/\b(appeal(?:ed| pending)?|under appeal)\b/i.test(text)) proceduralStatus = "appealed";
  else if (recordClass === "regulatory_alert") proceduralStatus = "alert_only";
  else if (recordClass === "proceeding") proceduralStatus = "pending";
  else if (/\b(settle(?:d|ment)|undertaking|\bawc\b)\b/i.test(text)) proceduralStatus = "settled";
  else if (recordClass === "enforcement_outcome") proceduralStatus = "final";

  let monetaryPenaltyStatus: MonetaryPenaltyStatus = "unknown";
  if (trustedAmountDisclosed) monetaryPenaltyStatus = "disclosed";
  else if (outcomeTypes.includes("monetary_penalty")) monetaryPenaltyStatus = "undisclosed";
  else if (recordClass === "enforcement_outcome") monetaryPenaltyStatus = "none";

  return {
    recordClass,
    outcomeTypes,
    primaryOutcome: outcomeTypes[0] ?? null,
    monetaryPenaltyStatus,
    publicationType: resolvePublicationType(text),
    proceduralStatus,
    classificationVersion: ENFORCEMENT_OUTCOME_CLASSIFICATION_VERSION,
    matchReasons: [...new Set(matchReasons)],
  };
}

export const ENFORCEMENT_OUTCOME_LABELS: Record<EnforcementOutcomeType, string> = {
  monetary_penalty: "Fine",
  prohibition_debarment: "Prohibition",
  licence_restriction_revocation: "Licence action",
  public_censure_reprimand: "Censure",
  remediation_redress: "Redress",
  prosecution_court_order: "Court action",
  suspension: "Suspension",
  settlement_undertaking: "Settlement",
  other: "Regulatory action",
};
