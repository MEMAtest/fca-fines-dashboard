/**
 * Data coverage information for each regulator
 * Based on database analysis from 2026-03-20
 */

export interface RegulatorCoverage {
  code: string;
  name: string;
  fullName: string;
  country: string;
  countryCode: string;
  flag: string;
  years: string;
  count: number;
  dataQuality: string;
  note: string | null;
  earliestYear: number;
  latestYear: number;
  defaultCurrency: 'GBP' | 'EUR';
  maturity: 'anchor' | 'emerging' | 'limited';
  dashboardEnabled: boolean;
}

export const REGULATOR_COVERAGE: Record<string, RegulatorCoverage> = {
  FCA: {
    code: 'FCA',
    name: 'FCA',
    fullName: 'Financial Conduct Authority',
    country: 'United Kingdom',
    countryCode: 'GB',
    flag: '🇬🇧',
    years: '2013-2026',
    count: 308,
    dataQuality: '100%',
    note: 'Complete historical dataset - 14 years of comprehensive coverage',
    earliestYear: 2013,
    latestYear: 2026,
    defaultCurrency: 'GBP',
    maturity: 'anchor',
    dashboardEnabled: true,
  },
  BaFin: {
    code: 'BaFin',
    name: 'BaFin',
    fullName: 'Federal Financial Supervisory Authority',
    country: 'Germany',
    countryCode: 'DE',
    flag: '🇩🇪',
    years: '2023-2026',
    count: 21,
    dataQuality: '24%',
    note: null, // User decision: don't show BaFin data quality warning
    earliestYear: 2023,
    latestYear: 2026,
    defaultCurrency: 'EUR',
    maturity: 'emerging',
    dashboardEnabled: true,
  },
  DNB: {
    code: 'DNB',
    name: 'DNB',
    fullName: 'De Nederlandsche Bank',
    country: 'Netherlands',
    countryCode: 'NL',
    flag: '🇳🇱',
    years: '2023-2024',
    count: 3,
    dataQuality: '100%',
    note: 'Very limited sample size - emerging data collection',
    earliestYear: 2023,
    latestYear: 2024,
    defaultCurrency: 'EUR',
    maturity: 'limited',
    dashboardEnabled: true,
  },
  CBI: {
    code: 'CBI',
    name: 'CBI',
    fullName: 'Central Bank of Ireland',
    country: 'Ireland',
    countryCode: 'IE',
    flag: '🇮🇪',
    years: '2021-2025',
    count: 5,
    dataQuality: '100%',
    note: null,
    earliestYear: 2021,
    latestYear: 2025,
    defaultCurrency: 'EUR',
    maturity: 'emerging',
    dashboardEnabled: true,
  },
  AMF: {
    code: 'AMF',
    name: 'AMF',
    fullName: 'Autorité des marchés financiers',
    country: 'France',
    countryCode: 'FR',
    flag: '🇫🇷',
    years: '2023-2024',
    count: 3,
    dataQuality: '100%',
    note: 'Limited coverage - emerging data collection',
    earliestYear: 2023,
    latestYear: 2024,
    defaultCurrency: 'EUR',
    maturity: 'limited',
    dashboardEnabled: true,
  },
  CNMV: {
    code: 'CNMV',
    name: 'CNMV',
    fullName: 'Comisión Nacional del Mercado de Valores',
    country: 'Spain',
    countryCode: 'ES',
    flag: '🇪🇸',
    years: '2023-2024',
    count: 4,
    dataQuality: '100%',
    note: 'Limited coverage - emerging data collection',
    earliestYear: 2023,
    latestYear: 2024,
    defaultCurrency: 'EUR',
    maturity: 'limited',
    dashboardEnabled: true,
  },
  AFM: {
    code: 'AFM',
    name: 'AFM',
    fullName: 'Authority for the Financial Markets',
    country: 'Netherlands',
    countryCode: 'NL',
    flag: '🇳🇱',
    years: '2023-2024',
    count: 4,
    dataQuality: '100%',
    note: 'Limited coverage - emerging data collection',
    earliestYear: 2023,
    latestYear: 2024,
    defaultCurrency: 'EUR',
    maturity: 'limited',
    dashboardEnabled: true,
  },
  ESMA: {
    code: 'ESMA',
    name: 'ESMA',
    fullName: 'European Securities and Markets Authority',
    country: 'European Union',
    countryCode: 'EU',
    flag: '🇪🇺',
    years: '2022-2025',
    count: 3,
    dataQuality: '100%',
    note: 'EU-wide regulator - limited sample size',
    earliestYear: 2022,
    latestYear: 2025,
    defaultCurrency: 'EUR',
    maturity: 'limited',
    dashboardEnabled: true,
  },
};

export const REGULATOR_CODES = Object.keys(REGULATOR_COVERAGE);

export function getRegulatorCoverage(code: string): RegulatorCoverage | null {
  // Case-insensitive lookup
  const entry = Object.entries(REGULATOR_COVERAGE).find(
    ([key]) => key.toUpperCase() === code.toUpperCase()
  );
  return entry ? entry[1] : null;
}

export function isValidRegulatorCode(code: string): boolean {
  // Case-insensitive validation
  return REGULATOR_CODES.some(key => key.toUpperCase() === code.toUpperCase());
}
