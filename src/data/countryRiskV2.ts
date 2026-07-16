import { getFatfAssessment, type FatfAssessmentRecord } from "./fatfAssessmentData.js";
import { getFatfStatus } from "./fatfStatus.js";
import { getGovernanceDimensions, type WgiDimensions } from "./governanceData.js";
import { getApprovedSanctions, SANCTIONS_APPROVED_SNAPSHOT } from "./sanctionsApprovedData.js";
import type { CountrySanctions, SanctionsTier } from "./sanctionsStatus.js";
import { countryRiskSourceStatus, type CountryRiskSourceState } from "./countryRiskSources.js";
import { bandFor, type RiskBand } from "./countryRiskScore.js";

export const COUNTRY_RISK_METHODOLOGY_VERSION = "2.0.0";
export const COUNTRY_RISK_PILLAR_WEIGHTS = { aml: 0.5, governance: 0.3, sanctions: 0.2 } as const;
export const COUNTRY_RISK_FLOORS = {
  fatfGrey: 6,
  fatfBlack: 9,
  sanctionsSectoral: 6,
  sanctionsComprehensive: 8,
} as const;

export type CountryRiskPublicationStatus = "complete" | "provisional" | "insufficient-data";
export type CountryRiskConfidence = "high" | "medium" | "low";
export type CountryRiskCoverageStatus = "available" | "unavailable";

export interface CountryRiskPillar {
  score: number | null;
  weight: number;
  appliedWeight: number;
  evidenceCount: number;
  coverageStatus: CountryRiskCoverageStatus;
  sourceState: CountryRiskSourceState;
  explanation: string;
}

export interface CountryRiskFloor {
  reason: "fatf-grey" | "fatf-black" | "sanctions-sectoral" | "sanctions-comprehensive";
  minimum: number;
  applied: boolean;
  status: "applied" | "non-binding" | "not-evaluated";
}

export interface CountryRiskRegulatoryFlag {
  type: "fatf-grey" | "fatf-black" | "sanctions-targeted" | "sanctions-sectoral" | "sanctions-comprehensive";
  label: string;
}

export interface CountryRiskV2Result {
  methodologyVersion: typeof COUNTRY_RISK_METHODOLOGY_VERSION;
  iso2: string;
  asOf: string;
  score: number | null;
  preFloorScore: number | null;
  band: RiskBand | null;
  bandAdjustment: {
    reason: "provisional-low-suppression";
    from: RiskBand;
    to: RiskBand;
    explanation: string;
  } | null;
  status: CountryRiskPublicationStatus;
  confidence: CountryRiskConfidence;
  pillars: {
    aml: CountryRiskPillar;
    governance: CountryRiskPillar;
    sanctions: CountryRiskPillar;
  };
  floors: CountryRiskFloor[];
  regulatoryFlags: CountryRiskRegulatoryFlag[];
  limitingReasons: string[];
  arithmetic: string;
}

export interface CountryRiskV2Inputs {
  assessment?: FatfAssessmentRecord;
  governance?: Partial<WgiDimensions>;
  sanctions?: CountrySanctions;
  sanctionsCoverageComplete?: boolean;
  sourceStates?: Partial<Record<"fatfLists" | "aml" | "governance" | "sanctions", CountryRiskSourceState>>;
  pillarWeights?: { aml: number; governance: number; sanctions: number };
  asOf?: Date;
}

const EFFECTIVENESS_RISK = { HE: 0, SE: 3.33, ME: 6.67, LE: 10 } as const;
const TECHNICAL_RISK = { C: 0, LC: 3.33, PC: 6.67, NC: 10 } as const;
const SANCTIONS_RISK: Record<SanctionsTier, number> = {
  targeted: 3.33,
  sectoral: 6.67,
  comprehensive: 10,
};
const IMPOSERS = ["OFAC", "UK", "EU", "UN"] as const;

const round1 = (value: number) => Math.round(value * 10) / 10;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function fatfAssessmentRisk(record: FatfAssessmentRecord | undefined): {
  score: number | null;
  effectiveness: number | null;
  technicalCompliance: number | null;
  evidenceCount: number;
} {
  if (!record) return { score: null, effectiveness: null, technicalCompliance: null, evidenceCount: 0 };
  const effectivenessValues = Object.values(record.effectiveness)
    .filter((value): value is keyof typeof EFFECTIVENESS_RISK => value !== undefined)
    .map((value) => EFFECTIVENESS_RISK[value]);
  const technicalValues = Object.values(record.technicalCompliance)
    .filter((value): value is keyof typeof TECHNICAL_RISK => value !== undefined)
    .map((value) => TECHNICAL_RISK[value]);
  const effectiveness = mean(effectivenessValues);
  const technicalCompliance = mean(technicalValues);
  if (effectiveness === null && technicalCompliance === null) {
    return { score: null, effectiveness, technicalCompliance, evidenceCount: 0 };
  }
  const weighted: Array<[number, number]> = [];
  if (effectiveness !== null) weighted.push([effectiveness, 0.7]);
  if (technicalCompliance !== null) weighted.push([technicalCompliance, 0.3]);
  const totalWeight = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  return {
    score: round1(weighted.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight),
    effectiveness: effectiveness === null ? null : round1(effectiveness),
    technicalCompliance: technicalCompliance === null ? null : round1(technicalCompliance),
    evidenceCount: effectivenessValues.length + technicalValues.length + (record.technicalNotApplicable?.length ?? 0),
  };
}

export function governancePillarRisk(dimensions: Partial<WgiDimensions> | undefined): {
  score: number | null;
  evidenceCount: number;
} {
  if (!dimensions) return { score: null, evidenceCount: 0 };
  const percentiles = [dimensions.cc, dimensions.rl, dimensions.rq, dimensions.ge, dimensions.pv, dimensions.va]
    .filter((value): value is number => value !== undefined);
  return {
    score: percentiles.length === 6
      ? round1(mean(percentiles.map((value) => (100 - Math.max(0, Math.min(100, value))) / 10)) as number)
      : null,
    evidenceCount: percentiles.length,
  };
}

export function sanctionsPillarRisk(
  sanctions: CountrySanctions | undefined,
  coverageComplete: boolean,
): { score: number | null; evidenceCount: number; highestTier?: SanctionsTier } {
  // A partial catalogue cannot prove a zero for absent countries or a complete
  // breadth calculation for present ones. Keep the whole pillar fail-closed
  // until all four imposer catalogues and classifications are approved.
  if (!coverageComplete) return { score: null, evidenceCount: 0 };
  const perImposer = IMPOSERS.map((imposer) => {
    const tiers = sanctions?.programs.filter((program) => program.imposer === imposer).map((program) => program.tier) ?? [];
    return tiers.length ? Math.max(...tiers.map((tier) => SANCTIONS_RISK[tier])) : 0;
  });
  const allTiers = sanctions?.programs.map((program) => program.tier) ?? [];
  const highestTier = allTiers.sort((a, b) => SANCTIONS_RISK[b] - SANCTIONS_RISK[a])[0];
  const highest = Math.max(...perImposer);
  return {
    score: round1(0.7 * highest + 0.3 * (mean(perImposer) as number)),
    evidenceCount: sanctions?.programs.length ?? 0,
    highestTier,
  };
}

function assessmentAgeYears(assessment: FatfAssessmentRecord | undefined, asOf: Date): number | null {
  if (!assessment?.assessmentDate) return null;
  const value = /^\d{4}$/.test(assessment.assessmentDate)
    ? new Date(`${assessment.assessmentDate}-01-01T00:00:00Z`)
    : new Date(assessment.assessmentDate);
  if (Number.isNaN(value.getTime())) return null;
  return (asOf.getTime() - value.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function confidenceFor(
  states: CountryRiskSourceState[],
  status: CountryRiskPublicationStatus,
  assessmentAge: number | null,
): CountryRiskConfidence {
  if (status !== "complete" || states.includes("unavailable") || states.includes("review-required")) return "low";
  if (assessmentAge === null || assessmentAge > 8) return "low";
  if (states.includes("stale") || assessmentAge > 5) return "medium";
  return "high";
}

export function computeCountryRiskV2(iso2: string, supplied: CountryRiskV2Inputs = {}): CountryRiskV2Result {
  const code = iso2.toUpperCase();
  const asOf = supplied.asOf ?? new Date();
  const assessment = supplied.assessment ?? getFatfAssessment(code);
  const governance = supplied.governance ?? getGovernanceDimensions(code);
  const sanctions = supplied.sanctions ?? getApprovedSanctions(code);
  const assessmentState = supplied.sourceStates?.aml ?? countryRiskSourceStatus("fatf-assessments", asOf).state;
  const fatfListState = supplied.sourceStates?.fatfLists ?? countryRiskSourceStatus("fatf-lists", asOf).state;
  const governanceState = supplied.sourceStates?.governance ?? countryRiskSourceStatus("world-bank-wgi", asOf).state;
  const sanctionsState = supplied.sourceStates?.sanctions ?? countryRiskSourceStatus("sanctions-regimes", asOf).state;
  const sanctionsCoverageComplete = supplied.sanctionsCoverageComplete ?? SANCTIONS_APPROVED_SNAPSHOT.coverageComplete;
  const weights = supplied.pillarWeights ?? COUNTRY_RISK_PILLAR_WEIGHTS;
  if (Object.values(weights).some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error("Country-risk pillar weights must be finite and non-negative");
  }
  if (weights.aml + weights.governance + weights.sanctions <= 0) {
    throw new Error("Country-risk pillar weights must have a positive total");
  }
  const assessmentAge = assessmentAgeYears(assessment, asOf);

  const amlValue = fatfAssessmentRisk(assessment);
  if (amlValue.evidenceCount !== 51) amlValue.score = null;
  const governanceValue = governancePillarRisk(governance);
  const sanctionsValue = sanctionsPillarRisk(sanctions, sanctionsCoverageComplete);
  const pillarValues = [
    ["aml", amlValue.score, weights.aml],
    ["governance", governanceValue.score, weights.governance],
    ["sanctions", sanctionsValue.score, weights.sanctions],
  ] as const;
  const available = pillarValues.filter(([, score]) => score !== null);
  const status: CountryRiskPublicationStatus =
    available.length === 3 ? "complete" : available.length === 2 ? "provisional" : "insufficient-data";
  const availableWeight = available.reduce((sum, [, , weight]) => sum + weight, 0);
  const normalizedWeight = (key: (typeof pillarValues)[number][0]) => {
    const item = available.find(([candidate]) => candidate === key);
    return item && availableWeight ? item[2] / availableWeight : 0;
  };
  const appliedWeight = (key: (typeof pillarValues)[number][0]) => round4(normalizedWeight(key));

  const floorRules: Array<Omit<CountryRiskFloor, "applied" | "status">> = [];
  const fatf = getFatfStatus(code);
  const regulatoryFlags: CountryRiskRegulatoryFlag[] = [];
  if (fatf?.listing === "call-for-action") regulatoryFlags.push({
    type: "fatf-black",
    label: `FATF call for action${fatf.requiredAction ? ` — ${fatf.requiredAction === "enhanced-due-diligence" ? "enhanced due diligence" : "countermeasures"}` : ""}`,
  });
  if (fatf?.listing === "increased-monitoring") regulatoryFlags.push({ type: "fatf-grey", label: "FATF increased monitoring" });
  if (sanctionsValue.highestTier) regulatoryFlags.push({
    type: `sanctions-${sanctionsValue.highestTier}`,
    label: `${sanctionsValue.highestTier[0].toUpperCase()}${sanctionsValue.highestTier.slice(1)} geographic sanctions exposure`,
  });
  if (fatf?.listing === "call-for-action") floorRules.push({ reason: "fatf-black", minimum: COUNTRY_RISK_FLOORS.fatfBlack });
  if (fatf?.listing === "increased-monitoring") floorRules.push({ reason: "fatf-grey", minimum: COUNTRY_RISK_FLOORS.fatfGrey });
  if (sanctionsValue.highestTier === "comprehensive") floorRules.push({ reason: "sanctions-comprehensive", minimum: COUNTRY_RISK_FLOORS.sanctionsComprehensive });
  if (sanctionsValue.highestTier === "sectoral") floorRules.push({ reason: "sanctions-sectoral", minimum: COUNTRY_RISK_FLOORS.sanctionsSectoral });

  let score: number | null = null;
  let preFloorScore: number | null = null;
  if (status !== "insufficient-data") {
    const weighted = available.reduce((sum, [key, value]) => sum + (value as number) * normalizedWeight(key), 0);
    preFloorScore = Math.min(10, round1(Math.max(weighted, 0)));
    score = Math.min(10, round1(Math.max(preFloorScore, ...floorRules.map((floor) => floor.minimum), 0)));
  }
  const floors: CountryRiskFloor[] = floorRules.map((floor) => ({
    ...floor,
    applied: preFloorScore !== null && score !== null && floor.minimum === score && score > preFloorScore,
    status: preFloorScore === null || score === null
      ? "not-evaluated"
      : floor.minimum === score && score > preFloorScore
        ? "applied"
        : "non-binding",
  }));
  let band = score === null ? null : bandFor(score);
  const bandAdjustment = status === "provisional" && band === "low"
    ? {
        reason: "provisional-low-suppression" as const,
        from: band,
        to: "moderate" as const,
        explanation: "A provisional score cannot be labelled Low while one risk pillar is unavailable.",
      }
    : null;
  if (bandAdjustment) band = bandAdjustment.to;

  const limitingReasons: string[] = [];
  if (amlValue.score === null) limitingReasons.push("FATF mutual-evaluation ratings unavailable");
  if (governanceValue.score === null) limitingReasons.push("World Bank governance data unavailable");
  if (sanctionsValue.score === null) limitingReasons.push("Sanctions regime coverage is not yet complete");
  if (governanceState === "stale") limitingReasons.push("World Bank WGI snapshot is stale");
  if (fatfListState === "stale") limitingReasons.push("FATF monitored-jurisdiction verification is stale");
  if (fatfListState === "unavailable" || fatfListState === "review-required") limitingReasons.push("FATF monitored-jurisdiction verification requires review");
  if (assessment && assessmentAge === null) limitingReasons.push("FATF assessment date is unavailable");
  if (assessmentAge !== null && assessmentAge > 8) limitingReasons.push("FATF assessment is more than eight years old");
  else if (assessmentAge !== null && assessmentAge > 5) limitingReasons.push("FATF assessment is more than five years old");

  const pillars = {
    aml: {
      score: amlValue.score,
      weight: weights.aml,
      appliedWeight: appliedWeight("aml"),
      evidenceCount: amlValue.evidenceCount,
      coverageStatus: amlValue.score === null ? "unavailable" as const : "available" as const,
      sourceState: assessmentState,
      explanation: "FATF effectiveness (70%) and technical compliance (30%).",
    },
    governance: {
      score: governanceValue.score,
      weight: weights.governance,
      appliedWeight: appliedWeight("governance"),
      evidenceCount: governanceValue.evidenceCount,
      coverageStatus: governanceValue.score === null ? "unavailable" as const : "available" as const,
      sourceState: governanceState,
      explanation: "Equal-weight mean of the six inverted World Bank WGI percentiles.",
    },
    sanctions: {
      score: sanctionsValue.score,
      weight: weights.sanctions,
      appliedWeight: appliedWeight("sanctions"),
      evidenceCount: sanctionsValue.evidenceCount,
      coverageStatus: sanctionsValue.score === null ? "unavailable" as const : "available" as const,
      sourceState: sanctionsState,
      explanation: "70% highest regime scope plus 30% mean across UN, UK, EU and US.",
    },
  };

  return {
    methodologyVersion: COUNTRY_RISK_METHODOLOGY_VERSION,
    iso2: code,
    asOf: asOf.toISOString(),
    score,
    preFloorScore,
    band,
    bandAdjustment,
    status,
    confidence: confidenceFor([fatfListState, assessmentState, governanceState, sanctionsState], status, assessmentAge),
    pillars,
    floors,
    regulatoryFlags,
    limitingReasons,
    arithmetic:
      score === null
        ? "No score: fewer than two scored pillars are available."
        : `${available.map(([key, value]) => `${key} ${value} × ${round1(appliedWeight(key) * 100)}%`).join(" + ")} = ${preFloorScore}${floors.length ? `; ${floors.map((floor) => `${floor.reason} floor ${floor.minimum} ${floor.status}`).join(", ")}` : ""}; final ${score}`,
  };
}
