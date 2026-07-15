import { CPI_SOURCE, CPI_YEAR } from "./cpiData.js";
import { FATF_LAST_PLENARY, FATF_SOURCE_URL } from "./fatfStatus.js";
import {
  FATF_ASSESSMENT_RETRIEVED_AT,
  FATF_ASSESSMENT_SOURCE,
  FATF_ASSESSMENT_SHA256,
} from "./fatfAssessmentData.js";
import { GOVERNANCE_RETRIEVED_AT, GOVERNANCE_SOURCE, GOVERNANCE_VINTAGE } from "./governanceData.js";
import { SANCTIONS_REVIEWED } from "./sanctionsStatus.js";

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
    state: "review-required",
    effectiveAt: FATF_LAST_PLENARY,
    retrievedAt: FATF_LAST_PLENARY,
    sha256: null,
    note: "The curated plenary snapshot is current, but weekly verification evidence is not yet persisted; changes require approval before publication.",
  },
  {
    id: "fatf-assessments",
    name: "FATF consolidated assessment ratings",
    sourceUrl: FATF_ASSESSMENT_SOURCE,
    scored: true,
    cadence: "monthly",
    state: FATF_ASSESSMENT_RETRIEVED_AT ? "current" : "unavailable",
    effectiveAt: FATF_ASSESSMENT_RETRIEVED_AT,
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
    state: "review-required",
    effectiveAt: SANCTIONS_REVIEWED,
    retrievedAt: null,
    sha256: null,
    note: "Existing classifications are conservative and incomplete; absence is treated as unknown in v2.",
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
