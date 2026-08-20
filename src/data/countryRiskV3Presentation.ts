import type { CountryRiskV3Result } from "./countryRiskV3.js";

export const COUNTRY_RISK_V3_PILLAR_LABELS = {
  effectiveness: "Financial-crime effectiveness",
  safeguards: "Legal and supervisory safeguards",
  governance: "Governance and institutional integrity",
} as const;

export function countryRiskV3StatusLabel(status: CountryRiskV3Result["status"]): string {
  if (status === "complete") return "Full information available";
  if (status === "provisional") return "Some information unavailable";
  return "Not enough information to score";
}

export function countryRiskV3StatusExplanation(status: CountryRiskV3Result["status"]): string {
  if (status === "complete") return "All three underlying risk pillars are available.";
  if (status === "provisional") return "Two underlying pillars are available and their weights have been rebalanced. Missing evidence is not treated as low risk.";
  return "Fewer than two underlying pillars are available, so no headline score is published.";
}

export function countryRiskV3ConfidenceLabel(confidence: CountryRiskV3Result["confidence"]): string {
  if (confidence === "high") return "Strong supporting evidence";
  if (confidence === "medium") return "Some evidence is older";
  return "Limited supporting evidence";
}

export function countryRiskV3OverlayLabel(treatment: CountryRiskV3Result["overlays"]["sanctions"]["treatment"]): string {
  switch (treatment) {
    case "enhanced-review": return "Enhanced legal review";
    case "screening-and-transaction-review": return "Screen transactions and counterparties";
    case "no-direct-programme-identified": return "No direct programme identified";
    default: return "Evidence incomplete";
  }
}

export interface CountryRiskV3PublicExplanation {
  statusLabel: string;
  statusExplanation: string;
  confidenceLabel: string;
  pillars: Array<{
    key: keyof typeof COUNTRY_RISK_V3_PILLAR_LABELS;
    label: string;
    score: number | null;
    appliedWeight: number;
    contribution: number | null;
    explanation: string;
  }>;
  overlayLabels: { sanctions: string; fatf: string };
  beneficialOwnershipNote: string;
  missingInformation: string[];
}

export function buildCountryRiskV3PublicExplanation(result: CountryRiskV3Result): CountryRiskV3PublicExplanation {
  const keys = Object.keys(COUNTRY_RISK_V3_PILLAR_LABELS) as Array<keyof typeof COUNTRY_RISK_V3_PILLAR_LABELS>;
  return {
    statusLabel: countryRiskV3StatusLabel(result.status),
    statusExplanation: countryRiskV3StatusExplanation(result.status),
    confidenceLabel: countryRiskV3ConfidenceLabel(result.confidence),
    pillars: keys.map((key) => ({
      key,
      label: COUNTRY_RISK_V3_PILLAR_LABELS[key],
      score: result.pillars[key].score,
      appliedWeight: result.pillars[key].appliedWeight,
      contribution: result.pillars[key].contribution,
      explanation: result.pillars[key].explanation,
    })),
    overlayLabels: {
      sanctions: countryRiskV3OverlayLabel(result.overlays.sanctions.treatment),
      fatf: result.overlays.fatf.treatment.replaceAll("-", " "),
    },
    beneficialOwnershipNote: result.beneficialOwnership.note,
    missingInformation: result.limitingReasons,
  };
}
