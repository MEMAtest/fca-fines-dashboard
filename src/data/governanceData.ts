/**
 * World Bank Worldwide Governance Indicators (WGI) — snapshot.
 *
 * Single mean-percentile per country (0–100, HIGHER = BETTER governance), the
 * average of the six WGI dimensions (Voice & Accountability, Political Stability,
 * Government Effectiveness, Regulatory Quality, Rule of Law, Control of
 * Corruption). This is the scored governance pillar of the Country Risk Score.
 *
 * WGI is CC BY 4.0 (World Bank) — derivative/commercial use permitted with
 * attribution. This snapshot approximates the WGI ~2024 release for the country
 * set that currently gets pages; it is REFRESHED to exact API values by
 * `scripts/ingest-wgi.ts` (the World Bank API isn't reachable from every build
 * sandbox). Countries without an entry fall back to FATF+Sanctions-only scoring.
 */

export const GOVERNANCE_SOURCE =
  "https://www.worldbank.org/en/publication/worldwide-governance-indicators";
export const GOVERNANCE_VINTAGE = "2024";
export const GOVERNANCE_LICENCE = "CC BY 4.0 — World Bank WGI";

/** iso2 -> mean WGI percentile (0–100, higher = better governance). */
export const GOVERNANCE_PERCENTILE: Record<string, number> = {
  // Very high governance
  NO: 98, FI: 98, CH: 97, DK: 97, SE: 96, NZ: 96, SG: 95, LU: 95, NL: 94,
  DE: 92, CA: 92, AU: 92, IE: 92, AT: 91, MC: 90,
  // High
  GB: 89, BE: 88, HK: 87, JP: 87, US: 85, FR: 84, EE: 84, ES: 80, PT: 82,
  MT: 80, KR: 80, CZ: 78, CY: 72, IL: 72, AE: 74, PL: 71,
  // Upper-mid
  IT: 66, MY: 63, KW: 55, ZA: 55, NA: 57, BG: 52, IN: 50,
  // Mid
  BR: 48, GH: 48, MA: 47, TH: 52, ID: 48, VN: 45, SN: 44, PH: 42, MX: 40,
  BA: 40, KE: 35, NP: 34, CU: 30,
  // Lower
  EG: 30, CI: 34, DZ: 26, BO: 25, PG: 26, LA: 24, BD: 24, PK: 22, CM: 20,
  NG: 19, BY: 20, RU: 18, AO: 18, LB: 16,
  // Very low
  IQ: 12, IR: 11, VE: 6, MM: 8, HT: 8, CD: 8, SY: 4, YE: 4, AF: 4, SS: 3,
  KP: 2, LY: 5, SO: 2,
};

export function getGovernancePercentile(iso2: string): number | undefined {
  return GOVERNANCE_PERCENTILE[iso2.toUpperCase()];
}

export function hasGovernanceData(iso2: string): boolean {
  return iso2.toUpperCase() in GOVERNANCE_PERCENTILE;
}
