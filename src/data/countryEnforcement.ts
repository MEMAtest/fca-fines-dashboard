/**
 * Country → enforcement coverage, derived from the live public regulator set.
 *
 * RegActions' unique layer: which regulators operate in a given country and how
 * many enforcement actions we track for them. This is the crawlable, static
 * "evidence" summary (regulator list + tracked-action counts). The richer live
 * rollup (amounts, breach mix, top cases, year trend) is fetched from the API
 * on the client, keyed by the same ISO2 country_code.
 *
 * Enforcement is DISPLAYED, never fed into the risk score (a strong, active
 * regulator must not read as "high risk").
 */

import {
  PUBLIC_REGULATOR_NAV_ITEMS,
  type RegulatorCoverage,
} from "./regulatorCoverage.js";
import { getCountryByIso2, type Country } from "./countries.js";

export interface CountryRegulator {
  code: string;
  fullName: string;
  count: number;
  years: string;
  overviewPath: string;
}

export interface CountryEnforcementSummary {
  iso2: string;
  regulators: CountryRegulator[];
  regulatorCount: number;
  trackedActions: number; // sum of tracked action counts across the country's regulators
}

// Group the live public regulators by their ISO2 jurisdiction, skipping the
// "EU" pseudo-jurisdiction (ESMA/ECB) which is not a country.
const BY_COUNTRY = new Map<string, RegulatorCoverage[]>();
for (const reg of PUBLIC_REGULATOR_NAV_ITEMS) {
  const iso2 = reg.countryCode;
  if (!iso2 || !getCountryByIso2(iso2)) continue; // skip EU / unknown
  const list = BY_COUNTRY.get(iso2) ?? [];
  list.push(reg);
  BY_COUNTRY.set(iso2, list);
}

/** ISO2 codes of every country with at least one live regulator we track. */
export const ENFORCEMENT_COVERED_ISO2: string[] = [...BY_COUNTRY.keys()].sort();

export function hasEnforcementCoverage(iso2: string): boolean {
  return BY_COUNTRY.has(iso2.toUpperCase());
}

export function getRegulatorsForCountry(iso2: string): CountryRegulator[] {
  const list = BY_COUNTRY.get(iso2.toUpperCase()) ?? [];
  return list
    .map((r) => ({
      code: r.code,
      fullName: r.fullName,
      count: r.count,
      years: r.years,
      overviewPath: r.overviewPath,
    }))
    .sort((a, b) => b.count - a.count);
}

export function getCountryEnforcementSummary(
  iso2: string,
): CountryEnforcementSummary | undefined {
  const code = iso2.toUpperCase();
  if (!BY_COUNTRY.has(code)) return undefined;
  const regulators = getRegulatorsForCountry(code);
  return {
    iso2: code,
    regulators,
    regulatorCount: regulators.length,
    trackedActions: regulators.reduce((sum, r) => sum + (r.count || 0), 0),
  };
}

/** All enforcement-covered countries as resolved Country objects. */
export function enforcementCoveredCountries(): Country[] {
  return ENFORCEMENT_COVERED_ISO2.map((iso2) => getCountryByIso2(iso2)!).filter(
    Boolean,
  );
}
