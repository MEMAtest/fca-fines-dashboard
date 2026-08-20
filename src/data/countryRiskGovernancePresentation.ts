import {
  GOVERNANCE_RETRIEVED_AT,
  GOVERNANCE_SOURCE,
  GOVERNANCE_VINTAGE,
  getGovernanceDimensions,
  type WgiDimensions,
} from "./governanceData.js";

const DOMAIN_META: Array<{ key: keyof WgiDimensions; label: string }> = [
  { key: "cc", label: "Corruption and integrity" },
  { key: "rl", label: "Rule of law" },
  { key: "rq", label: "Regulatory quality" },
  { key: "ge", label: "Government effectiveness" },
  { key: "pv", label: "Political stability" },
  { key: "va", label: "Voice and accountability" },
];

export interface CountryRiskGovernanceEvidenceRow {
  key: keyof WgiDimensions;
  label: string;
  percentile: number;
  risk: number;
  source: string;
  vintage: string;
  checkedAt: string;
}

/** Supporting WGI evidence in the same 0-10 risk direction as the public score. */
export function buildCountryRiskGovernanceEvidenceRows(iso2: string): CountryRiskGovernanceEvidenceRow[] {
  const dimensions = getGovernanceDimensions(iso2);
  if (!dimensions) return [];
  return DOMAIN_META.flatMap(({ key, label }) => {
    const percentile = dimensions[key];
    if (percentile === undefined) return [];
    return [{
      key,
      label,
      percentile,
      risk: Math.round(((100 - Math.max(0, Math.min(100, percentile))) / 10) * 10) / 10,
      source: GOVERNANCE_SOURCE,
      vintage: GOVERNANCE_VINTAGE,
      checkedAt: GOVERNANCE_RETRIEVED_AT.slice(0, 10),
    }];
  });
}
