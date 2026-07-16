import { CPI_SOURCE, CPI_YEAR } from "./cpiData.js";
import { FATF_LAST_PLENARY, FATF_LIST_SHA256, FATF_SOURCE_URL, FATF_VERIFIED_AT } from "./fatfStatus.js";
import {
  FATF_ASSESSMENT_EFFECTIVE_AT,
  FATF_ASSESSMENT_RETRIEVED_AT,
  FATF_ASSESSMENT_SOURCE,
  FATF_ASSESSMENT_SHA256,
} from "./fatfAssessmentData.js";
import { GOVERNANCE_RETRIEVED_AT, GOVERNANCE_SHA256, GOVERNANCE_SOURCE, GOVERNANCE_VINTAGE } from "./governanceData.js";
import { SANCTIONS_APPROVED_SNAPSHOT } from "./sanctionsApprovedData.js";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
  SANCTIONS_REGIME_CANDIDATES,
} from "./sanctionsRegimeCandidates.js";

export type CountryRiskSourceState = "current" | "stale" | "review-required" | "unavailable";

export interface CountryRiskSourceStatus {
  id: "fatf-lists" | "fatf-assessments" | "world-bank-wgi" | "sanctions-regimes" | "transparency-cpi";
  name: string;
  sourceUrl: string;
  scored: boolean;
  cadence: "daily" | "weekly" | "monthly" | "annual";
  state: CountryRiskSourceState;
  effectiveAt: string | null;
  retrievedAt: string | null;
  sha256: string | null;
  note: string;
}

const COUNTRY_RISK_SOURCE_BASE: CountryRiskSourceStatus[] = [
  {
    id: "fatf-lists",
    name: "FATF monitored jurisdictions",
    sourceUrl: FATF_SOURCE_URL,
    scored: true,
    cadence: "weekly",
    state: "current",
    effectiveAt: FATF_LAST_PLENARY,
    retrievedAt: FATF_VERIFIED_AT,
    sha256: FATF_LIST_SHA256,
    note: `The official black and grey list statements were reverified on ${FATF_VERIFIED_AT}; future status changes still require approval before publication.`,
  },
  {
    id: "fatf-assessments",
    name: "FATF consolidated assessment ratings",
    sourceUrl: FATF_ASSESSMENT_SOURCE,
    scored: true,
    cadence: "monthly",
    state: FATF_ASSESSMENT_RETRIEVED_AT ? "current" : "unavailable",
    effectiveAt: FATF_ASSESSMENT_EFFECTIVE_AT,
    retrievedAt: FATF_ASSESSMENT_RETRIEVED_AT,
    sha256: FATF_ASSESSMENT_SHA256,
    note: FATF_ASSESSMENT_RETRIEVED_AT
      ? "Official 2013 and 2022 methodology workbooks passed schema and coverage validation."
      : "Official binary download is challenge-protected; an approved workbook must be supplied to the fail-closed importer.",
  },
  {
    id: "world-bank-wgi",
    name: "World Bank Worldwide Governance Indicators",
    sourceUrl: GOVERNANCE_SOURCE,
    scored: true,
    cadence: "annual",
    state: Number(GOVERNANCE_VINTAGE) >= 2024 ? "current" : "stale",
    effectiveAt: GOVERNANCE_VINTAGE,
    retrievedAt: GOVERNANCE_RETRIEVED_AT,
    sha256: GOVERNANCE_SHA256,
    note: Number(GOVERNANCE_VINTAGE) >= 2024
      ? "The checked-in WGI 2024 snapshot passed coverage validation."
      : "The checked-in snapshot is stale until the WGI 2024 revision is ingested and validated.",
  },
  {
    id: "sanctions-regimes",
    name: "UN, UK, EU and US geographic sanctions regimes",
    sourceUrl: "https://scsanctions.un.org/resources/xml/en/name/consolidated.xml",
    scored: true,
    cadence: "daily",
    state: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete ? "current" : "review-required",
    effectiveAt: SANCTIONS_APPROVED_SNAPSHOT.effectiveAt ?? SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    retrievedAt: SANCTIONS_APPROVED_SNAPSHOT.generatedAt ?? SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    sha256: SANCTIONS_APPROVED_SNAPSHOT.sha256,
    note: SANCTIONS_APPROVED_SNAPSHOT.coverageComplete
      ? `Approved snapshot ${SANCTIONS_APPROVED_SNAPSHOT.version} contains ${SANCTIONS_APPROVED_SNAPSHOT.approvedCount} classifications across ${SANCTIONS_APPROVED_SNAPSHOT.countryCount} countries; rejected candidates remain retained in the promotion hash.`
      : `Official catalogues now cover ${SANCTIONS_REGIME_CANDIDATES.length} candidate imposer-country records across ${SANCTIONS_CANDIDATE_COUNTRY_COUNT} countries. Tier and country-nexus decisions await independent compliance approval; absence remains unknown in v2.`,
  },
  {
    id: "transparency-cpi",
    name: "Transparency International Corruption Perceptions Index",
    sourceUrl: CPI_SOURCE,
    scored: false,
    cadence: "annual",
    state: Number(CPI_YEAR) >= 2025 ? "current" : "stale",
    effectiveAt: CPI_YEAR,
    retrievedAt: null,
    sha256: null,
    note: "Displayed unchanged and used for divergence validation only under CC BY-ND 4.0.",
  },
];

const MAX_AGE_DAYS: Partial<Record<CountryRiskSourceStatus["id"], number>> = {
  "fatf-lists": 14,
  "fatf-assessments": 45,
  "world-bank-wgi": 400,
  "sanctions-regimes": 2,
};

export function countryRiskSourcesAsOf(asOf: Date): CountryRiskSourceStatus[] {
  return COUNTRY_RISK_SOURCE_BASE.map((source) => {
    const maximumAge = MAX_AGE_DAYS[source.id];
    if (source.state !== "current" || maximumAge === undefined || !source.retrievedAt) return { ...source };
    const retrievedAt = new Date(source.retrievedAt);
    const ageDays = (asOf.getTime() - retrievedAt.getTime()) / 86_400_000;
    if (Number.isNaN(retrievedAt.getTime()) || ageDays < -1 || ageDays > maximumAge) {
      return {
        ...source,
        state: "stale" as const,
        note: `${source.note} Freshness warning: last retrieval is outside the ${maximumAge}-day operational threshold.`,
      };
    }
    return { ...source };
  });
}

export const COUNTRY_RISK_SOURCES: CountryRiskSourceStatus[] = countryRiskSourcesAsOf(new Date());

export function countryRiskSourceStatus(id: CountryRiskSourceStatus["id"], asOf = new Date()): CountryRiskSourceStatus {
  const source = countryRiskSourcesAsOf(asOf).find((item) => item.id === id);
  if (!source) throw new Error(`Unknown country-risk source: ${id}`);
  return source;
}
