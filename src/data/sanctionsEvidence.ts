import type { SanctionsRegimeRelationship } from "./sanctionsRegimeCandidates.js";
import type { SanctionsTier } from "./sanctionsStatus.js";

export const SANCTIONS_IMPOSERS = ["OFAC", "UK", "EU", "UN"] as const;

export type SanctionsLegalStatus = "active" | "suspended" | "terminated" | "unknown";

export type SanctionsMeasureType =
  | "asset-freeze"
  | "travel-ban"
  | "arms-embargo"
  | "import-restriction"
  | "export-restriction"
  | "financial-restriction"
  | "services-restriction"
  | "transport-restriction"
  | "commodity-restriction";

export type SanctionsCoverageState =
  | "active-direct"
  | "active-situation-related"
  | "thematic-only"
  | "inactive"
  | "no-direct-regime"
  | "unknown";

export interface SanctionsClassificationFacts {
  legalStatus: SanctionsLegalStatus;
  relationship: SanctionsRegimeRelationship;
  measures: SanctionsMeasureType[];
  broadTradeProhibition: boolean;
  broadFinancialProhibition: boolean;
  materialNonDesignationRestriction: boolean;
}

export interface SanctionsClassificationResult {
  eligible: boolean;
  tier: SanctionsTier | null;
  coverageState: SanctionsCoverageState;
  reason: string;
}

const DESIGNATION_MEASURES = new Set<SanctionsMeasureType>([
  "asset-freeze",
  "travel-ban",
]);

/**
 * Converts reviewed legal facts into the v2 taxonomy. The result is proposed
 * by code and independently approved; the scoring engine never infers a tier
 * from a programme name or from the nationality of a designated person.
 */
export function classifySanctionsFacts(facts: SanctionsClassificationFacts): SanctionsClassificationResult {
  if (facts.legalStatus === "unknown") {
    return {
      eligible: false,
      tier: null,
      coverageState: "unknown",
      reason: "The legal status of the programme is unresolved.",
    };
  }
  if (facts.legalStatus !== "active") {
    return {
      eligible: false,
      tier: null,
      coverageState: "inactive",
      reason: `The programme is ${facts.legalStatus} and is not current country exposure.`,
    };
  }
  if (facts.relationship !== "direct-country-exposure") {
    return {
      eligible: false,
      tier: null,
      coverageState: "active-situation-related",
      reason: "The measures concern a situation in the country but do not sanction the country itself.",
    };
  }
  if (facts.broadTradeProhibition && facts.broadFinancialProhibition) {
    return {
      eligible: true,
      tier: "comprehensive",
      coverageState: "active-direct",
      reason: "Broad ordinary trade and financial dealings are restricted.",
    };
  }
  if (facts.materialNonDesignationRestriction) {
    return {
      eligible: true,
      tier: "sectoral",
      coverageState: "active-direct",
      reason: "A material class of ordinary transactions is restricted beyond named targets.",
    };
  }
  if (facts.measures.some((measure) => DESIGNATION_MEASURES.has(measure))) {
    return {
      eligible: true,
      tier: "targeted",
      coverageState: "active-direct",
      reason: "The active direct programme is principally designation-led.",
    };
  }
  return {
    eligible: false,
    tier: null,
    coverageState: "unknown",
    reason: "The recorded measures do not support a deterministic tier.",
  };
}

export function coverageStateForRejectedDecision(
  classification: SanctionsClassificationResult,
  requested: SanctionsCoverageState,
): SanctionsCoverageState {
  if (requested === "active-direct") {
    throw new Error("A rejected decision cannot retain active-direct coverage");
  }
  if (classification.coverageState === "unknown" && requested !== "thematic-only" && requested !== "no-direct-regime") {
    return "unknown";
  }
  return requested;
}
