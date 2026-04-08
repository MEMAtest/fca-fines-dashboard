/**
 * Country-to-Regulator Mapping
 *
 * Maps ISO 3166-1 alpha-2 country codes to regulator coverage data
 * for interactive globe visualization.
 */

import { LIVE_REGULATOR_NAV_ITEMS } from './regulatorCoverage.js';

export interface CountryRegulatorInfo {
  code: string;
  fullName: string;
  region: string;
  count: number;
}

export interface CountryInfo {
  countryCode: string;
  countryName: string;
  flag?: string;
  regulators: CountryRegulatorInfo[];
  region: string;
  hasData: boolean;
  totalRecords: number;
}

/**
 * Build mapping from country codes to regulators
 */
function buildCountryMapping(): Map<string, CountryInfo> {
  const mapping = new Map<string, CountryInfo>();

  // Group live regulators by country code
  LIVE_REGULATOR_NAV_ITEMS.forEach(reg => {
    const existing = mapping.get(reg.countryCode);

    if (existing) {
      // Add to existing country
      existing.regulators.push({
        code: reg.code,
        fullName: reg.fullName,
        region: reg.region,
        count: reg.count,
      });
      existing.totalRecords += reg.count;
    } else {
      // Create new country entry
      mapping.set(reg.countryCode, {
        countryCode: reg.countryCode,
        countryName: reg.country,
        flag: reg.flag,
        regulators: [{
          code: reg.code,
          fullName: reg.fullName,
          region: reg.region,
          count: reg.count,
        }],
        region: reg.region,
        hasData: true,
        totalRecords: reg.count,
      });
    }
  });

  return mapping;
}

// Build mapping at module load time
const COUNTRY_REGULATOR_MAP = buildCountryMapping();

/**
 * Get regulator info for a country code
 *
 * @param countryCode - ISO 3166-1 alpha-2 country code (e.g., "GB", "US", "DE")
 * @returns Country info with regulators, or null if no coverage
 */
export function getRegulatorsForCountry(countryCode: string): CountryInfo | null {
  return COUNTRY_REGULATOR_MAP.get(countryCode) || null;
}

/**
 * Get all countries with regulator coverage
 *
 * @returns Array of ISO 3166-1 alpha-2 country codes
 */
export function getCoveredCountries(): string[] {
  return Array.from(COUNTRY_REGULATOR_MAP.keys());
}

/**
 * Get total number of countries with coverage
 */
export function getCoveredCountryCount(): number {
  return COUNTRY_REGULATOR_MAP.size;
}

/**
 * Get all country info objects
 */
export function getAllCountryInfo(): CountryInfo[] {
  return Array.from(COUNTRY_REGULATOR_MAP.values());
}
