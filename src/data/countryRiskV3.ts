import { getFatfAssessment, type FatfAssessmentRecord } from "./fatfAssessmentData.js";
import { getFatfStatus, type FatfStatus } from "./fatfStatus.js";
import { getGovernanceDimensions, type WgiDimensions } from "./governanceData.js";
import {
  getApprovedSanctions,
  getApprovedSanctionsCoverage,
  SANCTIONS_APPROVED_SNAPSHOT,
  type ApprovedSanctionsProgram,
  type ApprovedSanctionsCoverageCell,
} from "./sanctionsApprovedData.js";
import type { CountrySanctions, SanctionsTier } from "./sanctionsStatus.js";
import { countryRiskSourceStatus, type CountryRiskSourceState } from "./countryRiskSources.js";
import { bandFor, type RiskBand } from "./countryRiskScore.js";

/**
 * Country Risk v3 deliberately separates intrinsic country risk from legal
 * restrictions. Sanctions and FATF list status are overlays: they affect the
 * recommended treatment, but never add points to the country score.
 */
export const COUNTRY_RISK_V3_METHODOLOGY_VERSION = "3.0.0" as const;
export const COUNTRY_RISK_V3_PILLAR_WEIGHTS = {
  effectiveness: 0.45,
  safeguards: 0.20,
  governance: 0.35,
} as const;

export type CountryRiskPublicationStatus = "complete" | "provisional" | "insufficient-data";
export type CountryRiskConfidence = "high" | "medium" | "low";
export type CountryRiskCoverageStatus = "available" | "unavailable";

export interface CountryRiskV3Pillar {
  score: number | null;
  weight: number;
  appliedWeight: number;
  contribution: number | null;
  evidenceCount: number;
  coverageStatus: CountryRiskCoverageStatus;
  sourceState: CountryRiskSourceState;
  explanation: string;
}

export type BeneficialOwnershipAvailability =
  | "available"
  | "partial"
  | "unavailable";

export interface BeneficialOwnershipEvidence {
  /** FATF IO5 effectiveness risk, 0-10 (higher means higher risk). */
  effectiveness: number | null;
  /** FATF Recommendation 24 legal/technical risk, 0-10. */
  companies: number | null;
  /** FATF Recommendation 25 legal/technical risk, 0-10. */
  trustsAndArrangements: number | null;
  /** 60% IO5 + 20% R24 + 20% R25, when all three are present. */
  score: number | null;
  availability: BeneficialOwnershipAvailability;
  evidenceCount: number;
  formula: string;
  sourceUrl: string;
  assessmentDate: string | null;
  note: string;
}

export interface CountryRiskSanctionsOverlay {
  coverageComplete: boolean;
  sourceState: CountryRiskSourceState;
  highestTier?: SanctionsTier;
  programs: ApprovedSanctionsProgram[];
  reviewedAt: string | null;
  externalValidation: typeof SANCTIONS_APPROVED_SNAPSHOT.externalValidation;
  treatment: "screening-and-transaction-review" | "enhanced-review" | "no-direct-programme-identified" | "unavailable";
}

export interface CountryRiskFatfOverlay {
  listing: FatfStatus["listing"] | null;
  requiredAction: FatfStatus["requiredAction"] | null;
  lastReviewed: string | null;
  treatment: "countermeasures" | "enhanced-due-diligence" | "increased-monitoring" | "none";
}

export interface CountryRiskV3Result {
  methodologyVersion: typeof COUNTRY_RISK_V3_METHODOLOGY_VERSION;
  iso2: string;
  asOf: string;
  score: number | null;
  band: RiskBand | null;
  status: CountryRiskPublicationStatus;
  confidence: CountryRiskConfidence;
  pillars: {
    effectiveness: CountryRiskV3Pillar;
    safeguards: CountryRiskV3Pillar;
    governance: CountryRiskV3Pillar;
  };
  beneficialOwnership: BeneficialOwnershipEvidence;
  overlays: {
    sanctions: CountryRiskSanctionsOverlay;
    fatf: CountryRiskFatfOverlay;
  };
  sanctionsCoverageComplete: boolean;
  limitingReasons: string[];
  arithmetic: string;
}

export interface CountryRiskV3Inputs {
  assessment?: FatfAssessmentRecord;
  governance?: Partial<WgiDimensions>;
  sanctions?: CountrySanctions;
  sanctionsCoverageComplete?: boolean;
  sanctionsCoverage?: ApprovedSanctionsCoverageCell[];
  sourceStates?: Partial<Record<"fatfLists" | "aml" | "governance" | "sanctions", CountryRiskSourceState>>;
  asOf?: Date;
}

const EFFECTIVENESS_RISK = { HE: 0, SE: 3.33, ME: 6.67, LE: 10 } as const;
const TECHNICAL_RISK = { C: 0, LC: 3.33, PC: 6.67, NC: 10 } as const;
const IMPOSERS = ["OFAC", "UK", "EU", "UN"] as const;
const round1 = (value: number) => Math.round(value * 10) / 10;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const mean = (values: number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;

function assessmentValue(record: FatfAssessmentRecord | undefined, key: `IO${number}` | `R${number}`): number | null {
  if (!record) return null;
  const raw = key.startsWith("IO")
    ? record.effectiveness[key as keyof typeof record.effectiveness]
    : record.technicalCompliance[key as keyof typeof record.technicalCompliance];
  if (!raw) return null;
  return key.startsWith("IO")
    ? EFFECTIVENESS_RISK[raw as keyof typeof EFFECTIVENESS_RISK]
    : TECHNICAL_RISK[raw as keyof typeof TECHNICAL_RISK];
}

/** FATF effectiveness risk, requiring all eleven Immediate Outcomes. */
export function fatfEffectivenessRisk(record: FatfAssessmentRecord | undefined): {
  score: number | null;
  evidenceCount: number;
} {
  const values = Array.from({ length: 11 }, (_, index) => assessmentValue(record, `IO${index + 1}`));
  if (values.some((value) => value === null)) {
    return { score: null, evidenceCount: values.filter((value) => value !== null).length };
  }
  return { score: round1(mean(values as number[]) as number), evidenceCount: values.length };
}

/** FATF technical safeguard risk, excluding recommendations explicitly marked NA. */
export function fatfSafeguardsRisk(record: FatfAssessmentRecord | undefined): {
  score: number | null;
  evidenceCount: number;
} {
  if (!record) return { score: null, evidenceCount: 0 };
  const notApplicable = new Set(record.technicalNotApplicable ?? []);
  const values: number[] = [];
  let evidenceCount = 0;
  for (let index = 1; index <= 40; index += 1) {
    const key = `R${index}` as `R${number}`;
    const value = assessmentValue(record, key);
    if (value !== null) {
      values.push(value);
      evidenceCount += 1;
    } else if (notApplicable.has(key)) {
      evidenceCount += 1;
    }
  }
  // Every Recommendation must be rated or explicitly marked not applicable.
  if (evidenceCount !== 40 || values.length === 0) return { score: null, evidenceCount };
  return { score: round1(mean(values) as number), evidenceCount };
}

/**
 * Beneficial ownership is an interpretable breakout, not an additional headline
 * weight. It combines FATF IO5 effectiveness with Recommendations 24 and 25.
 */
export function beneficialOwnershipRisk(record: FatfAssessmentRecord | undefined): BeneficialOwnershipEvidence {
  const effectiveness = assessmentValue(record, "IO5");
  const companies = assessmentValue(record, "R24");
  const trustsAndArrangements = assessmentValue(record, "R25");
  const values = [effectiveness, companies, trustsAndArrangements];
  const evidenceCount = values.filter((value): value is number => value !== null).length;
  const score = evidenceCount === 3
    ? round1((effectiveness as number) * 0.6 + (companies as number) * 0.2 + (trustsAndArrangements as number) * 0.2)
    : null;
  return {
    effectiveness,
    companies,
    trustsAndArrangements,
    score,
    availability: evidenceCount === 3 ? "available" : evidenceCount > 0 ? "partial" : "unavailable",
    evidenceCount,
    formula: "60% FATF IO5 effectiveness + 20% Recommendation 24 + 20% Recommendation 25",
    sourceUrl: "https://www.fatf-gafi.org/en/publications/Mutualevaluations/Fatf-methodology.html",
    assessmentDate: record?.assessmentDate ?? null,
    note: "A register being public or restricted is shown separately; register availability alone does not establish beneficial-ownership effectiveness.",
  };
}

export function governanceSafeguardsRisk(dimensions: Partial<WgiDimensions> | undefined): {
  score: number | null;
  evidenceCount: number;
} {
  if (!dimensions) return { score: null, evidenceCount: 0 };
  const values = [dimensions.cc, dimensions.rl, dimensions.rq, dimensions.ge, dimensions.pv, dimensions.va]
    .filter((value): value is number => value !== undefined)
    .map((value) => (100 - Math.max(0, Math.min(100, value))) / 10);
  return {
    score: values.length === 6 ? round1(mean(values) as number) : null,
    evidenceCount: values.length,
  };
}

function assessmentAgeYears(assessment: FatfAssessmentRecord | undefined, asOf: Date): number | null {
  if (!assessment?.assessmentDate) return null;
  const parsed = /^\d{4}$/.test(assessment.assessmentDate)
    ? new Date(`${assessment.assessmentDate}-01-01T00:00:00Z`)
    : new Date(assessment.assessmentDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return (asOf.getTime() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function confidenceFor(states: CountryRiskSourceState[], status: CountryRiskPublicationStatus, age: number | null): CountryRiskConfidence {
  if (status !== "complete" || states.some((state) => state === "unavailable" || state === "review-required")) return "low";
  if (age === null || age > 8) return "low";
  if (states.includes("stale") || age > 5) return "medium";
  return "high";
}

function highestTier(sanctions: CountrySanctions | undefined): SanctionsTier | undefined {
  const rank: Record<SanctionsTier, number> = { targeted: 1, sectoral: 2, comprehensive: 3 };
  return sanctions?.programs.reduce<SanctionsTier | undefined>((top, program) =>
    !top || rank[program.tier] > rank[top] ? program.tier : top, undefined);
}

function sanctionsTreatment(tier: SanctionsTier | undefined, coverageComplete: boolean): CountryRiskSanctionsOverlay["treatment"] {
  if (!coverageComplete) return "unavailable";
  if (!tier) return "no-direct-programme-identified";
  return tier === "comprehensive" ? "enhanced-review" : "screening-and-transaction-review";
}

export function hasCompleteCountrySanctionsCoverage(coverage: ApprovedSanctionsCoverageCell[]): boolean {
  if (coverage.length !== IMPOSERS.length) return false;
  const byImposer = new Set(coverage.map((cell) => cell.imposer));
  return IMPOSERS.every((imposer) => byImposer.has(imposer));
}

export function computeCountryRiskV3(iso2: string, supplied: CountryRiskV3Inputs = {}): CountryRiskV3Result {
  const code = iso2.toUpperCase();
  const asOf = supplied.asOf ?? new Date();
  const assessment = supplied.assessment ?? getFatfAssessment(code);
  const governance = supplied.governance ?? getGovernanceDimensions(code);
  const sanctions = supplied.sanctions ?? getApprovedSanctions(code);
  const assessmentState = supplied.sourceStates?.aml ?? countryRiskSourceStatus("fatf-assessments", asOf).state;
  const fatfListState = supplied.sourceStates?.fatfLists ?? countryRiskSourceStatus("fatf-lists", asOf).state;
  const governanceState = supplied.sourceStates?.governance ?? countryRiskSourceStatus("world-bank-wgi", asOf).state;
  const sanctionsState = supplied.sourceStates?.sanctions ?? countryRiskSourceStatus("sanctions-regimes", asOf).state;
  const coverage = supplied.sanctionsCoverage ?? getApprovedSanctionsCoverage(code);
  const sanctionsCoverageComplete = supplied.sanctionsCoverageComplete !== undefined
    ? supplied.sanctionsCoverageComplete
    : SANCTIONS_APPROVED_SNAPSHOT.coverageComplete && hasCompleteCountrySanctionsCoverage(coverage);
  const effectiveness = fatfEffectivenessRisk(assessment);
  const safeguards = fatfSafeguardsRisk(assessment);
  const governanceValue = governanceSafeguardsRisk(governance);
  const values = [
    ["effectiveness", effectiveness.score, COUNTRY_RISK_V3_PILLAR_WEIGHTS.effectiveness],
    ["safeguards", safeguards.score, COUNTRY_RISK_V3_PILLAR_WEIGHTS.safeguards],
    ["governance", governanceValue.score, COUNTRY_RISK_V3_PILLAR_WEIGHTS.governance],
  ] as const;
  const available = values.filter(([, score]) => score !== null);
  const status: CountryRiskPublicationStatus = available.length === 3
    ? "complete"
    : available.length === 2 ? "provisional" : "insufficient-data";
  const availableWeight = available.reduce((sum, [, , weight]) => sum + weight, 0);
  const appliedWeight = (key: (typeof values)[number][0]) => {
    const entry = available.find(([candidate]) => candidate === key);
    return entry && availableWeight ? round4(entry[2] / availableWeight) : 0;
  };
  const score = status === "insufficient-data"
    ? null
    : round1(available.reduce((sum, [key, value]) => sum + (value as number) * appliedWeight(key), 0));
  let band = score === null ? null : bandFor(score);
  if (status === "provisional" && band === "low") band = "moderate";

  const fatf = getFatfStatus(code);
  const sanctionsTier = highestTier(sanctions);
  const sanctionsOverlay: CountryRiskSanctionsOverlay = {
    coverageComplete: sanctionsCoverageComplete,
    sourceState: sanctionsState,
    highestTier: sanctionsTier,
    programs: sanctionsCoverageComplete ? (sanctions?.programs ?? []) as ApprovedSanctionsProgram[] : [],
    reviewedAt: SANCTIONS_APPROVED_SNAPSHOT.effectiveAt,
    externalValidation: SANCTIONS_APPROVED_SNAPSHOT.externalValidation,
    treatment: sanctionsTreatment(sanctionsTier, sanctionsCoverageComplete),
  };
  const fatfOverlay: CountryRiskFatfOverlay = {
    listing: fatf?.listing ?? null,
    requiredAction: fatf?.requiredAction ?? null,
    lastReviewed: fatf?.lastReviewed ?? null,
    treatment: fatf?.listing === "call-for-action"
      ? fatf.requiredAction === "countermeasures" ? "countermeasures" : "enhanced-due-diligence"
      : fatf?.listing === "increased-monitoring" ? "increased-monitoring" : "none",
  };
  const limitingReasons: string[] = [];
  if (effectiveness.score === null) limitingReasons.push("FATF effectiveness ratings are incomplete");
  if (safeguards.score === null) limitingReasons.push("FATF technical safeguard ratings are incomplete");
  if (governanceValue.score === null) limitingReasons.push("World Bank governance data is incomplete");
  if (!sanctionsCoverageComplete) limitingReasons.push("Sanctions overlay coverage is not complete; no absence is assumed");
  if (assessment && assessmentAgeYears(assessment, asOf) === null) limitingReasons.push("FATF assessment date is unavailable");
  const buildPillar = (
    scoreValue: number | null,
    weight: number,
    evidenceCount: number,
    sourceState: CountryRiskSourceState,
    explanation: string,
    key: (typeof values)[number][0],
  ): CountryRiskV3Pillar => ({
    score: scoreValue,
    weight,
    appliedWeight: appliedWeight(key),
    contribution: scoreValue === null ? null : round1(scoreValue * appliedWeight(key)),
    evidenceCount,
    coverageStatus: scoreValue === null ? "unavailable" : "available",
    sourceState,
    explanation,
  });
  return {
    methodologyVersion: COUNTRY_RISK_V3_METHODOLOGY_VERSION,
    iso2: code,
    asOf: asOf.toISOString(),
    score,
    band,
    status,
    confidence: confidenceFor([fatfListState, assessmentState, governanceState], status, assessmentAgeYears(assessment, asOf)),
    pillars: {
      effectiveness: buildPillar(effectiveness.score, COUNTRY_RISK_V3_PILLAR_WEIGHTS.effectiveness, effectiveness.evidenceCount, assessmentState, "FATF effectiveness across the 11 Immediate Outcomes.", "effectiveness"),
      safeguards: buildPillar(safeguards.score, COUNTRY_RISK_V3_PILLAR_WEIGHTS.safeguards, safeguards.evidenceCount, assessmentState, "FATF technical safeguards across Recommendations 1-40, excluding explicit not-applicable ratings.", "safeguards"),
      governance: buildPillar(governanceValue.score, COUNTRY_RISK_V3_PILLAR_WEIGHTS.governance, governanceValue.evidenceCount, governanceState, "Equal-weight mean of the six inverted World Bank governance dimensions.", "governance"),
    },
    beneficialOwnership: beneficialOwnershipRisk(assessment),
    overlays: { sanctions: sanctionsOverlay, fatf: fatfOverlay },
    sanctionsCoverageComplete,
    limitingReasons,
    arithmetic: score === null
      ? "No score: fewer than two scored pillars are available."
      : `${available.map(([key, value]) => `${key} ${value} × ${round1(appliedWeight(key) * 100)}%`).join(" + ")} = ${score}; sanctions and FATF listing are overlays, not score inputs`,
  };
}

