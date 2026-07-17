import type {
  CountryRiskConfidence,
  CountryRiskFloor,
  CountryRiskPublicationStatus,
  CountryRiskV2Result,
} from "./countryRiskV2.js";
import type { CountryRiskSourceStatus } from "./countryRiskSources.js";

export const COUNTRY_RISK_PILLAR_LABELS = {
  aml: "Financial crime controls",
  governance: "Government effectiveness and rule of law",
  sanctions: "International sanctions",
} as const;

const PILLAR_EXPLANATIONS = {
  aml: "How effectively the country prevents money laundering and terrorist financing, using FATF assessments.",
  governance: "How well public institutions, regulation, accountability and the rule of law work, using World Bank data.",
  sanctions: "The reach of active country-level sanctions imposed by the UN, UK, EU and US.",
} as const;

const MISSING_REASON_LABELS: Record<string, string> = {
  "FATF mutual-evaluation ratings unavailable": "Financial crime controls information is unavailable.",
  "World Bank governance data unavailable": "Government effectiveness and rule of law information is unavailable.",
  "Sanctions regime coverage is not yet complete": "International sanctions information is still being checked.",
  "World Bank WGI snapshot is stale": "The World Bank information is awaiting an update.",
  "FATF monitored-jurisdiction verification is stale": "The FATF country-list check is awaiting an update.",
  "FATF monitored-jurisdiction verification requires review": "A change to the FATF country lists is being checked.",
  "FATF assessment date is unavailable": "The date of the FATF assessment is unavailable.",
  "FATF assessment is more than eight years old": "The FATF assessment is more than eight years old.",
  "FATF assessment is more than five years old": "The FATF assessment is more than five years old.",
};

export function publicCountryRiskStatusLabel(status: CountryRiskPublicationStatus): string {
  if (status === "complete") return "Full information available";
  if (status === "provisional") return "Some information unavailable";
  return "Not enough information to score";
}

export function publicCountryRiskStatusExplanation(status: CountryRiskPublicationStatus): string {
  if (status === "complete") {
    return "All three parts of the score are available.";
  }
  if (status === "provisional") {
    return "One of the three parts is unavailable. The available parts are rebalanced, and the result will not be labelled Low risk while information is missing.";
  }
  return "Fewer than two parts are available, so no headline score is published. Missing information is never treated as zero risk.";
}

export function publicCountryRiskConfidenceLabel(confidence: CountryRiskConfidence): string {
  if (confidence === "high") return "Strong data coverage";
  if (confidence === "medium") return "Some evidence is older";
  return "Limited supporting information";
}

function floorSubject(floor: CountryRiskFloor): string {
  if (floor.reason === "fatf-grey") return "FATF grey-list status";
  if (floor.reason === "fatf-black") return "FATF call-for-action status";
  if (floor.reason === "sanctions-sectoral") return "sector-wide international sanctions";
  return "comprehensive international sanctions";
}

export function publicFloorExplanation(floor: CountryRiskFloor): string {
  const subject = floorSubject(floor);
  if (floor.status === "applied") {
    return `${subject} means the score cannot be lower than ${floor.minimum.toFixed(1)}. This minimum set the final score.`;
  }
  if (floor.status === "non-binding") {
    return `${subject} sets a minimum of ${floor.minimum.toFixed(1)}, but the calculated score was already higher.`;
  }
  return `${subject} would set a minimum of ${floor.minimum.toFixed(1)} once enough information is available to publish a score.`;
}

export interface CountryRiskPublicExplanation {
  statusLabel: string;
  statusExplanation: string;
  confidenceLabel: string;
  pillars: Array<{
    key: keyof typeof COUNTRY_RISK_PILLAR_LABELS;
    label: string;
    explanation: string;
    score: number | null;
    appliedWeight: number;
  }>;
  missingInformation: string[];
  floorMessages: string[];
  sanctionsZeroExplanation: string | null;
}

export function buildCountryRiskPublicExplanation(result: CountryRiskV2Result): CountryRiskPublicExplanation {
  const pillarKeys = ["aml", "governance", "sanctions"] as const;
  return {
    statusLabel: publicCountryRiskStatusLabel(result.status),
    statusExplanation: publicCountryRiskStatusExplanation(result.status),
    confidenceLabel: publicCountryRiskConfidenceLabel(result.confidence),
    pillars: pillarKeys.map((key) => ({
      key,
      label: COUNTRY_RISK_PILLAR_LABELS[key],
      explanation: PILLAR_EXPLANATIONS[key],
      score: result.pillars[key].score,
      appliedWeight: result.pillars[key].appliedWeight,
    })),
    missingInformation: result.limitingReasons.map((reason) => MISSING_REASON_LABELS[reason] ?? reason),
    floorMessages: result.floors.map(publicFloorExplanation),
    sanctionsZeroExplanation:
      result.pillars.sanctions.score === 0 && result.pillars.sanctions.coverageStatus === "available"
        ? "International sanctions contributes 0.0 because the complete UN, UK, EU and US review found no direct country-level sanctions programme. People or organisations connected to the country may still appear on sanctions lists."
        : null,
  };
}

export function latestCountryRiskSourceCheck(sources: CountryRiskSourceStatus[]): string | null {
  const timestamps = sources
    .map((source) => source.retrievedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  return timestamps.length ? timestamps[timestamps.length - 1].value : null;
}
