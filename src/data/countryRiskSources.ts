import { CPI_SOURCE, CPI_YEAR } from "./cpiData.js";
import { FATF_LAST_PLENARY, FATF_LIST_SHA256, FATF_SOURCE_URL, FATF_VERIFIED_AT } from "./fatfStatus.js";
import {
  FATF_ASSESSMENT_EFFECTIVE_AT,
  FATF_ASSESSMENT_RETRIEVED_AT,
  FATF_ASSESSMENT_SOURCE,
  FATF_ASSESSMENT_SHA256,
} from "./fatfAssessmentData.js";
import { GOVERNANCE_RETRIEVED_AT, GOVERNANCE_SOURCE, GOVERNANCE_VINTAGE } from "./governanceData.js";
import {
  SANCTIONS_CANDIDATE_COUNTRY_COUNT,
  SANCTIONS_CANDIDATE_SCORING_READY,
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

export const COUNTRY_RISK_SOURCES: CountryRiskSourceStatus[] = [
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
    sha256: null,
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
    state: SANCTIONS_CANDIDATE_SCORING_READY ? "current" : "review-required",
    effectiveAt: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    retrievedAt: SANCTIONS_CATALOGUE_REVIEWED_AS_OF,
    sha256: null,
    note: SANCTIONS_CANDIDATE_SCORING_READY
      ? `Approved geographic-regime coverage contains ${SANCTIONS_REGIME_CANDIDATES.length} imposer-country records across ${SANCTIONS_CANDIDATE_COUNTRY_COUNT} countries.`
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

export function countryRiskSourceStatus(id: CountryRiskSourceStatus["id"]): CountryRiskSourceStatus {
  const source = COUNTRY_RISK_SOURCES.find((item) => item.id === id);
  if (!source) throw new Error(`Unknown country-risk source: ${id}`);
  return source;
}
