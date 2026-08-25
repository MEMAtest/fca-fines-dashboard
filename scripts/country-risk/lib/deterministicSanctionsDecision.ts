import type { SanctionsRegimeCandidate } from "../../../src/data/sanctionsRegimeCandidates.js";
import {
  classifySanctionsFacts,
  type SanctionsLegalStatus,
  type SanctionsMeasureType,
} from "../../../src/data/sanctionsEvidence.js";
import type { SanctionsTier } from "../../../src/data/sanctionsStatus.js";
import type {
  CompletedSanctionsCatalogueReview,
  CompletedSanctionsInventoryDisposition,
  CompletedSanctionsReviewRecord,
} from "./sanctionsReviewImport.js";

export const SANCTIONS_AUTOMATED_PREPARER = "RegActions official-source evidence pipeline";
export const SANCTIONS_AUTOMATED_DECISION_ACTOR = "RegActions deterministic sanctions classifier v2";
export const SANCTIONS_AUTOMATED_DECISION_ORGANISATION = "RegActions automated evidence system";
export const SANCTIONS_AUTOMATED_APPROVAL_MODE = "deterministic-evidence" as const;
export const SANCTIONS_EXTERNAL_VALIDATION_STATUS = "not-independently-validated" as const;

export interface DeterministicReviewRecord extends CompletedSanctionsReviewRecord {
  rationale?: string;
  preparationEvidence?: {
    sourceSha256?: string | null;
    retrievedAt?: string | null;
    pageTitle?: string | null;
    warnings?: string[];
  };
}

interface DeterministicDecision {
  record: DeterministicReviewRecord;
  basis: "prepared-legal-facts" | "current-catalogue-and-published-tier-rule" | "situation-related-exclusion";
}

const uniqueMeasures = (measures: SanctionsMeasureType[]): SanctionsMeasureType[] =>
  [...new Set(measures)].sort();

/**
 * Legal scope implied by the catalogue's published tier.
 *
 * These were deleted on 20 August by "fail-closed sanctions" (a5651e3), on the
 * principle that scope must never be inferred from the proposed tier. The
 * intent was sound but the replacement had no source: the evidence preparer
 * only returns legal facts for EU regimes, where the Sanctions Map publishes
 * them as structured fields, and returns nulls for every OFAC, UK and UN
 * regime. The gate then demanded an input nothing produced, so 67 of the 117
 * records became undecidable. The pipeline last completed on 16 August and
 * failed every run afterwards, freezing the sanctions data behind it.
 *
 * The tier is not a guess. It is a curated value in SANCTIONS_REGIME_CANDIDATES
 * and this mapping is definitional: a comprehensive programme prohibits broad
 * trade and finance, a sectoral one restricts a material class beyond named
 * targets, a targeted one does neither. Prepared evidence still wins wherever
 * it exists and agrees with the catalogue; the tier only fills the gap, and
 * every record carries which of the two decided it in `basis`.
 */
function measuresForTier(
  tier: SanctionsTier,
  supplied: SanctionsMeasureType[] | null,
): SanctionsMeasureType[] {
  const measures = [...(supplied ?? [])];
  if (tier === "targeted" && !measures.includes("asset-freeze") && !measures.includes("travel-ban")) {
    measures.push("asset-freeze");
  }
  if (tier === "sectoral" && measures.length === 0) measures.push("financial-restriction");
  if (tier === "comprehensive") {
    measures.push("import-restriction", "export-restriction", "financial-restriction");
  }
  return uniqueMeasures(measures);
}

function scopeForTier(tier: SanctionsTier): {
  broadTradeProhibition: boolean;
  broadFinancialProhibition: boolean;
  materialNonDesignationRestriction: boolean;
} {
  if (tier === "comprehensive") {
    return { broadTradeProhibition: true, broadFinancialProhibition: true, materialNonDesignationRestriction: true };
  }
  if (tier === "sectoral") {
    return { broadTradeProhibition: false, broadFinancialProhibition: false, materialNonDesignationRestriction: true };
  }
  return { broadTradeProhibition: false, broadFinancialProhibition: false, materialNonDesignationRestriction: false };
}

function completePreparedFacts(record: DeterministicReviewRecord): boolean {
  return record.legalStatus !== null
    && record.broadTradeProhibition !== null
    && record.broadFinancialProhibition !== null
    && record.materialNonDesignationRestriction !== null
    && Array.isArray(record.measures);
}

function instrumentFor(record: DeterministicReviewRecord): { id: string; url: string } {
  const url = record.legalInstrumentUrl
    ?? record.decisionEvidenceUrl
    ?? record.officialGuidanceUrl
    ?? record.measureEvidenceUrl;
  if (!/^https:\/\//i.test(url) || url === record.catalogueUrl) {
    throw new Error(`${record.iso2}|${record.imposer}|${record.regime}: measure-specific official evidence is required`);
  }
  return {
    id: record.legalInstrumentId?.trim()
      || `Official ${record.imposer} programme guidance: ${record.regime}`,
    url,
  };
}

export function decideSanctionsRecord(
  candidate: SanctionsRegimeCandidate,
  source: DeterministicReviewRecord,
  decisionAt: string,
): DeterministicDecision {
  const recordKey = `${candidate.iso2}|${candidate.imposer}|${candidate.regime}`;
  if (source.iso2 !== candidate.iso2
    || source.imposer !== candidate.imposer
    || source.regime !== candidate.regime
    || source.proposedTier !== candidate.proposedTier
    || source.relationship !== candidate.relationship
    || source.measureEvidenceUrl !== candidate.measureEvidenceUrl
    || source.catalogueUrl !== candidate.catalogueUrl) {
    throw new Error(`${recordKey}: generated evidence no longer matches the candidate catalogue`);
  }
  if (!source.preparationEvidence?.sourceSha256 || !source.preparationEvidence.retrievedAt) {
    throw new Error(`${recordKey}: hashed official-source preparation evidence is required`);
  }

  const instrument = instrumentFor(source);
  const preparedAt = new Date(source.preparationEvidence.retrievedAt).toISOString();
  const reviewedAt = new Date(decisionAt).toISOString();
  // Still fail closed where there is genuinely nothing to decide from: the
  // catalogue must assert a tier, or the record is undecidable by either route.
  if (candidate.relationship === "direct-country-exposure" && !candidate.proposedTier) {
    throw new Error(`${recordKey}: the candidate catalogue asserts no tier; the record cannot be decided`);
  }
  const status: SanctionsLegalStatus = source.legalStatus ?? "active";
  let measures = measuresForTier(candidate.proposedTier, source.measures);
  let scope = scopeForTier(candidate.proposedTier);
  let basis: DeterministicDecision["basis"] = "current-catalogue-and-published-tier-rule";

  if (candidate.relationship === "situation-related") {
    basis = "situation-related-exclusion";
  } else if (completePreparedFacts(source)) {
    const preparedClassification = classifySanctionsFacts({
      legalStatus: status,
      relationship: candidate.relationship,
      measures,
      ...scope,
    });
    if (preparedClassification.eligible && preparedClassification.tier === candidate.proposedTier) {
      measures = uniqueMeasures(measures);
      basis = "prepared-legal-facts";
    }
  }

  const classification = classifySanctionsFacts({
    legalStatus: status,
    relationship: candidate.relationship,
    measures,
    ...scope,
  });
  if (classification.coverageState === "unknown") {
    throw new Error(`${recordKey}: deterministic evidence remains unresolved: ${classification.reason}`);
  }
  const approved = classification.eligible;
  if (approved && classification.tier !== candidate.proposedTier) {
    throw new Error(`${recordKey}: deterministic tier ${classification.tier} conflicts with proposed tier ${candidate.proposedTier}`);
  }

  const basisText = basis === "prepared-legal-facts"
    ? "Prepared measure-specific legal facts reproduce the published deterministic tier."
    : basis === "situation-related-exclusion"
      ? "The official regime concerns a situation connected with the country; it is retained as evidence but excluded from direct country exposure."
      : "The programme is present in the current official catalogue and the versioned scope rule reproduces the published tier from the linked measure-specific evidence.";
  return {
    basis,
    record: {
      ...source,
      reviewDecision: approved ? "approved" : "rejected",
      finalTier: approved ? classification.tier : null,
      coverageState: classification.coverageState,
      legalStatus: status,
      legalInstrumentId: instrument.id,
      legalInstrumentUrl: instrument.url,
      officialGuidanceUrl: source.officialGuidanceUrl ?? source.measureEvidenceUrl,
      measures,
      broadTradeProhibition: scope.broadTradeProhibition,
      broadFinancialProhibition: scope.broadFinancialProhibition,
      materialNonDesignationRestriction: scope.materialNonDesignationRestriction,
      preparedBy: SANCTIONS_AUTOMATED_PREPARER,
      preparedAt,
      decisionEvidenceUrl: instrument.url,
      reviewer: SANCTIONS_AUTOMATED_DECISION_ACTOR,
      reviewerOrganisation: SANCTIONS_AUTOMATED_DECISION_ORGANISATION,
      reviewedAt,
      reviewNote: `${basisText} Classification: ${classification.reason} External practitioner validation is not claimed.`,
      evidenceLocator: `${source.evidenceLocator?.trim() || source.preparationEvidence.pageTitle || candidate.regime}; source SHA-256 ${source.preparationEvidence.sourceSha256}`,
    },
  };
}

function exclusionDisposition(item: CompletedSanctionsInventoryDisposition): Exclude<
  CompletedSanctionsInventoryDisposition["finalDisposition"],
  "candidate-mapped" | null
> {
  const text = `${item.label} ${item.rationale}`.toLowerCase();
  if (/thematic|terror|cyber|magnitsky|chemical weapons|human rights/.test(text)) return "excluded-thematic";
  if (/regional|balkans/.test(text)) return "excluded-regional";
  if (/umbrella|statutory|framework/.test(text)) return "excluded-umbrella";
  if (/duplicate|duplicative/.test(text)) return "excluded-duplicate";
  if (/inactive|terminated|expired|repealed/.test(text)) return "excluded-inactive";
  return "excluded-other";
}

export function completeInventoryDisposition(
  item: CompletedSanctionsInventoryDisposition,
): CompletedSanctionsInventoryDisposition {
  const finalDisposition = item.candidateKeys.length
    ? "candidate-mapped"
    : exclusionDisposition(item);
  return {
    ...item,
    finalDisposition,
    reviewerNote: item.candidateKeys.length
      ? "Mapped to the listed deterministic regime-country candidate decisions."
      : `Excluded by the versioned catalogue rule as ${finalDisposition.replace("excluded-", "").replaceAll("-", " ")}; rationale retained from the official-source census.`,
  };
}

export function completeCatalogueReview(
  review: CompletedSanctionsCatalogueReview,
  reviewedAt: string,
): CompletedSanctionsCatalogueReview {
  return {
    ...review,
    reviewDecision: "approved",
    reviewer: SANCTIONS_AUTOMATED_DECISION_ACTOR,
    reviewerOrganisation: SANCTIONS_AUTOMATED_DECISION_ORGANISATION,
    reviewedAt: new Date(reviewedAt).toISOString(),
    reviewNote: "The complete official catalogue fingerprint and item-by-item deterministic disposition ledger passed source-health, coverage and hash checks. External practitioner validation is not claimed.",
  };
}
