import type { CountryRiskV3Result } from "./countryRiskV3.js";

export function countryRiskV3BandLabel(band: NonNullable<CountryRiskV3Result["band"]>): string {
  return band === "low" ? "Lower" : band === "moderate" ? "Moderate" : band === "high" ? "High" : "Very high";
}

/**
 * Pillar names, in the vocabulary the audience already reads.
 *
 * A FATF mutual evaluation has exactly two axes and they have settled names:
 * technical compliance (Recommendations 1-40) and effectiveness (the 11
 * Immediate Outcomes). The report used FATF's word for one and a coinage,
 * "Legal and supervisory safeguards", for the other, so half of a well-known
 * pair appeared under a name nobody outside this codebase uses.
 *
 * "ICRG" was worse than unfamiliar, it was ambiguous: on a country-risk page it
 * reads as the PRS Group's International Country Risk Guide, a commercial
 * country-risk rating, where we mean FATF's International Co-operation Review
 * Group. Readers recognise the lists that group publishes, not the group, so
 * the pillar is named for the listing.
 *
 * "Integrity" narrowed governance toward corruption, which is one of the six
 * World Bank dimensions behind it, not the whole of them.
 */
export const COUNTRY_RISK_V3_PILLAR_LABELS = {
  effectiveness: "AML/CFT effectiveness",
  safeguards: "Technical compliance",
  governance: "Governance and institutions",
  icrg: "FATF listing status",
} as const;

/**
 * What each pillar means, for a reader who does not know the methodology.
 *
 * The labels alone ("Technical compliance") name a category without
 * saying what was measured or by whom. These sit under the labels on the report
 * so the section can explain the score without printing the arithmetic.
 */
export const COUNTRY_RISK_V3_PILLAR_PLAIN: Record<keyof typeof COUNTRY_RISK_V3_PILLAR_LABELS, string> = {
  effectiveness: "How well AML/CFT controls work in practice, as assessed by FATF across its eleven Immediate Outcomes.",
  safeguards: "Whether the laws, powers and supervisory framework meet FATF Recommendations 1-40.",
  governance: "Strength of public institutions, rule of law and transparency, across the six World Bank governance dimensions.",
  icrg: "FATF's own published listing, used in place of evaluation ratings where a country has never been evaluated.",
};

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
  calculation: CountryRiskV3Calculation | null;
}

/**
 * The calculation as rows, not as a sentence.
 *
 * `result.arithmetic` is the machine-facing string served over the API. It is
 * built from the pillar KEYS, so the page rendered "icrg 9.5 × 65% +
 * governance 6.7 × 35% = 8.5" — an internal identifier, truncated by the rail,
 * with the overlay caveat jammed on after a semicolon even though the panel
 * states that caveat directly above. Rows carry the same numbers under the
 * labels the reader has already seen on the bars.
 */
export interface CountryRiskV3Calculation {
  rows: Array<{ key: string; label: string; score: number; weightPct: number; contribution: number }>;
  total: number;
}

export function buildCountryRiskV3PublicExplanation(result: CountryRiskV3Result): CountryRiskV3PublicExplanation {
  // ICRG is deliberately conditional: assessed jurisdictions must not see a
  // phantom substitute, while no-MER jurisdictions must see the 65% input
  // that actually drives their headline result.
  const keys = countryRiskV3PublishedPillarKeys(result);
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
    calculation: buildCountryRiskV3Calculation(result, keys),
  };
}

function buildCountryRiskV3Calculation(
  result: CountryRiskV3Result,
  keys: Array<keyof typeof COUNTRY_RISK_V3_PILLAR_LABELS>,
): CountryRiskV3Calculation | null {
  if (result.score === null) return null;
  const rows = keys
    .map((key) => ({ key, pillar: result.pillars[key] }))
    .filter(({ pillar }) => pillar.score !== null && pillar.contribution !== null)
    .map(({ key, pillar }) => ({
      key,
      label: COUNTRY_RISK_V3_PILLAR_LABELS[key],
      score: pillar.score as number,
      weightPct: Math.round(pillar.appliedWeight * 1000) / 10,
      contribution: pillar.contribution as number,
    }));
  if (rows.length === 0) return null;
  return { rows, total: result.score };
}

/** Pillars that are part of the public v3 explanation contract. The ICRG
 * substitute is a conditional input: assessed countries must not expose a
 * null/zero-weight phantom pillar in exports or crawlable HTML. */
export function countryRiskV3PublishedPillarKeys(
  result: CountryRiskV3Result,
): Array<keyof typeof COUNTRY_RISK_V3_PILLAR_LABELS> {
  return (Object.keys(COUNTRY_RISK_V3_PILLAR_LABELS) as Array<keyof typeof COUNTRY_RISK_V3_PILLAR_LABELS>)
    .filter((key) => key !== "icrg" || result.pillars.icrg.score !== null);
}
