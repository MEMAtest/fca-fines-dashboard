import {
  computeCountryRiskV2,
  COUNTRY_RISK_METHODOLOGY_VERSION as COUNTRY_RISK_V2_METHODOLOGY_VERSION,
  type CountryRiskV2Inputs,
  type CountryRiskV2Result,
} from "./countryRiskV2.js";
import {
  computeCountryRiskV3,
  COUNTRY_RISK_V3_METHODOLOGY_VERSION,
  type CountryRiskV3Inputs,
  type CountryRiskV3Result,
} from "./countryRiskV3.js";

/** The version used for all current country-risk views and APIs. */
export const CURRENT_COUNTRY_RISK_METHODOLOGY = "v3" as const;
export const CURRENT_COUNTRY_RISK_METHODOLOGY_VERSION = COUNTRY_RISK_V3_METHODOLOGY_VERSION;

export type CountryRiskMethodology = "v2" | "v3";
export type CountryRiskCurrentResult = CountryRiskV3Result;

export interface CountryRiskMethodologyMetadata {
  key: CountryRiskMethodology;
  version: string;
  current: boolean;
  label: string;
}

export const COUNTRY_RISK_METHODOLOGIES: Record<CountryRiskMethodology, CountryRiskMethodologyMetadata> = {
  v2: {
    key: "v2",
    version: COUNTRY_RISK_V2_METHODOLOGY_VERSION,
    current: false,
    label: "Country risk v2 (historical)",
  },
  v3: {
    key: "v3",
    version: COUNTRY_RISK_V3_METHODOLOGY_VERSION,
    current: true,
    label: "Country risk v3",
  },
};

/** Resolve an explicit API/history selector; no unknown version silently falls back. */
export function resolveCountryRiskMethodology(value: string | null | undefined): CountryRiskMethodology {
  if (!value || value === "current" || value === "latest" || value === "v3" || value === COUNTRY_RISK_V3_METHODOLOGY_VERSION) return "v3";
  if (value === "v2" || value === COUNTRY_RISK_V2_METHODOLOGY_VERSION) return "v2";
  throw new Error(`Unsupported country-risk methodology: ${value}`);
}

export function computeCountryRiskCurrent(iso2: string, supplied: CountryRiskV3Inputs = {}): CountryRiskCurrentResult {
  return computeCountryRiskV3(iso2, supplied);
}

export function computeCountryRiskByMethodology(
  iso2: string,
  methodology: CountryRiskMethodology,
  supplied: CountryRiskV3Inputs | CountryRiskV2Inputs = {},
): CountryRiskV3Result | CountryRiskV2Result {
  if (methodology === "v3") return computeCountryRiskV3(iso2, supplied as CountryRiskV3Inputs);
  return computeCountryRiskV2(iso2, supplied as CountryRiskV2Inputs);
}

