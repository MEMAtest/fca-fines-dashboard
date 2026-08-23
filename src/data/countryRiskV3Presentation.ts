import type { CountryRiskV3Result } from "./countryRiskV3.js";

export function countryRiskV3BandLabel(band: NonNullable<CountryRiskV3Result["band"]>): string {
  return band === "low" ? "Lower" : band === "moderate" ? "Moderate" : band === "high" ? "High" : "Very high";
}

export const COUNTRY_RISK_V3_PILLAR_LABELS = {
  effectiveness: "Financial-crime effectiveness",
  safeguards: "Legal and supervisory safeguards",
  governance: "Governance and institutional integrity",
  icrg: "FATF public determination (ICRG substitute)",
} as const;

export function countryRiskV3StatusLabel(status: CountryRiskV3Result["status"]): string {
  if (status === "complete") return "Full information available";
  if (status === "provisional") return "Some information unavailable";
  return "Not enough information to score";
}

export function countryRiskV3ResultKindLabel(kind: CountryRiskV3Result["resultKind"]): string {
  if (kind === "complete") return "Composite score"
  if (kind === "indicative-governance-proxy") return "Indicative governance proxy";
  return "Provisional composite score";
}

export function countryRiskV3ResultKindExplanation(kind: CountryRiskV3Result["resultKind"]): string {
  if (kind === "complete") return "All three underlying risk pillars are available and weighted using the published formula.";
  if (kind === "indicative-governance-proxy") return "Only World Bank governance evidence is available. This remains visible for discovery but is excluded from exact global ranking.";
  return "Some underlying evidence is unavailable; the available pillars are reweighted transparently and the result should not be treated as equally certain as a composite score.";
}

export function countryRiskV3StatusExplanation(status: CountryRiskV3Result["status"]): string {
  if (status === "complete") return "All three underlying risk pillars are available.";
  if (status === "provisional") return "Some underlying pillars are unavailable. Available weights are rebalanced; missing evidence is not treated as low risk.";
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
  resultKindLabel: string;
  resultKindExplanation: string;
  confidenceLabel: string;
  nearThreshold: boolean;
  sensitivityLabel: string | null;
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
  // ICRG is deliberately conditional: assessed jurisdictions must not see a
  // phantom substitute, while no-MER jurisdictions must see the 65% input
  // that actually drives their headline result.
  const keys = (Object.keys(COUNTRY_RISK_V3_PILLAR_LABELS) as Array<keyof typeof COUNTRY_RISK_V3_PILLAR_LABELS>)
    .filter((key) => key !== "icrg" || result.pillars.icrg.score !== null);
  return {
    statusLabel: countryRiskV3StatusLabel(result.status),
    statusExplanation: countryRiskV3StatusExplanation(result.status),
    resultKindLabel: countryRiskV3ResultKindLabel(result.resultKind),
    resultKindExplanation: countryRiskV3ResultKindExplanation(result.resultKind),
    confidenceLabel: countryRiskV3ConfidenceLabel(result.confidence),
    nearThreshold: result.sensitivity.nearThreshold,
    sensitivityLabel: result.sensitivity.scoreRange
      ? `Weight sensitivity ${result.sensitivity.scoreRange.low.toFixed(1)}–${result.sensitivity.scoreRange.high.toFixed(1)}/10`
      : null,
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
