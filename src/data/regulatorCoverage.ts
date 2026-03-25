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
  navOrder: number;
  overviewPath: string;
  years: string;
  count: number;
  dataQuality: string;
  note: string | null;
  earliestYear: number;
  latestYear: number;
  defaultCurrency: 'GBP' | 'EUR';
  maturity: 'anchor' | 'emerging' | 'limited';
  dashboardEnabled: boolean;
  officialSources: RegulatorOfficialSource[];
}

export interface RegulatorOfficialSource {
  label: string;
  url: string;
  description: string;
}

export const REGULATOR_COVERAGE: Record<string, RegulatorCoverage> = {
  FCA: {
    code: 'FCA',
    name: 'FCA',
    fullName: 'Financial Conduct Authority',
    country: 'United Kingdom',
    countryCode: 'GB',
    flag: '🇬🇧',
    navOrder: 1,
    overviewPath: '/regulators/fca',
    years: '2013-2026',
    count: 308,
    dataQuality: '100%',
    note: 'Complete historical dataset - 14 years of comprehensive coverage',
    earliestYear: 2013,
    latestYear: 2026,
    defaultCurrency: 'GBP',
    maturity: 'anchor',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'FCA news and enforcement stories',
        url: 'https://www.fca.org.uk/news/news-stories',
        description: 'Official FCA news, final notices, and enforcement announcements.',
      },
      {
        label: 'FCA annual reports',
        url: 'https://www.fca.org.uk/publications/annual-reports',
        description: 'Regulator reporting, statistics, and supervisory priorities.',
      },
      {
        label: 'FCA Handbook',
        url: 'https://www.handbook.fca.org.uk/',
        description: 'Primary rulebook and guidance behind published enforcement outcomes.',
      },
    ],
  },
  BaFin: {
    code: 'BaFin',
    name: 'BaFin',
    fullName: 'Federal Financial Supervisory Authority',
    country: 'Germany',
    countryCode: 'DE',
    flag: '🇩🇪',
    navOrder: 2,
    overviewPath: '/regulators/bafin',
    years: '2023-2026',
    count: 246,
    dataQuality: '100%',
    note: null,
    earliestYear: 2023,
    latestYear: 2026,
    defaultCurrency: 'EUR',
    maturity: 'emerging',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'BaFin measures and sanctions',
        url: 'https://www.bafin.de/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html',
        description: 'Primary BaFin page for published measures and sanctions.',
      },
      {
        label: 'BaFin databases and registers',
        url: 'https://www.bafin.de/EN/PublikationenDaten/Datenbanken/datenbanken_node_en.html',
        description: 'BaFin data portals and searchable official registers.',
      },
      {
        label: 'BaFin annual reports',
        url: 'https://www.bafin.de/EN/DieBaFin/AufgabenGeschichte/Jahresbericht/jahresbericht_node_en.html',
        description: 'Official reports for enforcement context and supervisory themes.',
      },
    ],
  },
  DNB: {
    code: 'DNB',
    name: 'DNB',
    fullName: 'De Nederlandsche Bank',
    country: 'Netherlands',
    countryCode: 'NL',
    flag: '🇳🇱',
    navOrder: 7,
    overviewPath: '/regulators/dnb',
    years: '2023-2024',
    count: 3,
    dataQuality: '100%',
    note: 'Test data - major enforcement actions (ABN AMRO €480M, ING, Rabobank)',
    earliestYear: 2023,
    latestYear: 2024,
    defaultCurrency: 'EUR',
    maturity: 'limited',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'DNB enforcement overview',
        url: 'https://www.dnb.nl/en/sector-information/enforcement/',
        description: 'Official enforcement landing page used for published DNB actions.',
      },
      {
        label: 'DNB supervision and enforcement',
        url: 'https://www.dnb.nl/en/supervision/enforcement/',
        description: 'Supervisory enforcement page with sanctions and policy context.',
      },
      {
        label: 'DNB annual reports',
        url: 'https://www.dnb.nl/en/publications/annual-reports/',
        description: 'Official reports covering supervisory focus and market context.',
      },
    ],
  },
  CBI: {
    code: 'CBI',
    name: 'CBI',
    fullName: 'Central Bank of Ireland',
    country: 'Ireland',
    countryCode: 'IE',
    flag: '🇮🇪',
    navOrder: 5,
    overviewPath: '/regulators/cbi',
    years: '2021-2025',
    count: 119,
    dataQuality: '100%',
    note: null,
    earliestYear: 2021,
    latestYear: 2025,
    defaultCurrency: 'EUR',
    maturity: 'emerging',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'CBI enforcement actions',
        url: 'https://www.centralbank.ie/news-media/legal-notices/enforcement-actions',
        description: 'Published enforcement actions and legal notices from the Central Bank of Ireland.',
      },
      {
        label: 'CBI enforcement and regulation',
        url: 'https://www.centralbank.ie/regulation/enforcement',
        description: 'Enforcement framework, sanctions context, and supervisory references.',
      },
      {
        label: 'CBI annual reports',
        url: 'https://www.centralbank.ie/news/publications/annual-reports',
        description: 'Annual reporting and supervisory trend context from the Central Bank of Ireland.',
      },
    ],
  },
  SFC: {
    code: 'SFC',
    name: 'SFC',
    fullName: 'Securities and Futures Commission',
    country: 'Hong Kong',
    countryCode: 'HK',
    flag: '🇭🇰',
    navOrder: 6,
    overviewPath: '/regulators/sfc',
    years: '2020-2026',
    count: 221,
    dataQuality: '100%',
    note: null,
    earliestYear: 2020,
    latestYear: 2026,
    defaultCurrency: 'GBP',
    maturity: 'emerging',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'SFC press releases',
        url: 'https://www.sfc.hk/en/RSS-Feeds/Press-releases',
        description: 'Official SFC press releases RSS feed with enforcement actions.',
      },
      {
        label: 'SFC enforcement actions',
        url: 'https://www.sfc.hk/en/Regulatory-functions/Enforcement/Enforcement-actions',
        description: 'SFC enforcement framework and enforcement news.',
      },
      {
        label: 'SFC enforcement statistics',
        url: 'https://www.sfc.hk/en/Regulatory-functions/Enforcement/Enforcement-actions/Enforcement-statistics',
        description: 'Statistics on enforcement proceedings and investigations.',
      },
    ],
  },
  AMF: {
    code: 'AMF',
    name: 'AMF',
    fullName: 'Autorité des marchés financiers',
    country: 'France',
    countryCode: 'FR',
    flag: '🇫🇷',
    navOrder: 3,
    overviewPath: '/regulators/amf',
    years: '2023-2024',
    count: 112,
    dataQuality: '100%',
    note: null,
    earliestYear: 2023,
    latestYear: 2024,
    defaultCurrency: 'EUR',
    maturity: 'emerging',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'AMF enforcement committee releases',
        url: 'https://www.amf-france.org/en/news-publications/news-releases/enforcement-committee-news-releases',
        description: 'Primary AMF page for enforcement committee announcements and sanctions.',
      },
      {
        label: 'AMF sanctions and enforcement',
        url: 'https://www.amf-france.org/en/sanctions-and-enforcement',
        description: 'Official enforcement section with sanctions publications and procedures.',
      },
      {
        label: 'AMF reports and research',
        url: 'https://www.amf-france.org/en/news-publications/publications/reports-and-research',
        description: 'Annual reports and supporting publications for broader market context.',
      },
    ],
  },
  CNMV: {
    code: 'CNMV',
    name: 'CNMV',
    fullName: 'Comisión Nacional del Mercado de Valores',
    country: 'Spain',
    countryCode: 'ES',
    flag: '🇪🇸',
    navOrder: 4,
    overviewPath: '/regulators/cnmv',
    years: '2023-2024',
    count: 94,
    dataQuality: '100%',
    note: null,
    earliestYear: 2023,
    latestYear: 2024,
    defaultCurrency: 'EUR',
    maturity: 'emerging',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'CNMV disciplinary penalties register',
        url: 'https://www.cnmv.es/portal/Consultas/RegistroSanciones/verRegSanciones.aspx?lang=en',
        description: 'Official CNMV register for published disciplinary penalties.',
      },
      {
        label: 'CNMV sanctions register home',
        url: 'https://www.cnmv.es/portal/Consultas/RegistroSanciones/iniregsanciones.aspx?lang=en',
        description: 'CNMV sanctions register entry page and search start point.',
      },
      {
        label: 'CNMV annual publications',
        url: 'https://www.cnmv.es/portal/Publicaciones/PublicacionesGN.aspx?id=19',
        description: 'Official CNMV reports and publications for regulatory context.',
      },
    ],
  },
  AFM: {
    code: 'AFM',
    name: 'AFM',
    fullName: 'Authority for the Financial Markets',
    country: 'Netherlands',
    countryCode: 'NL',
    flag: '🇳🇱',
    navOrder: 8,
    overviewPath: '/regulators/afm',
    years: '2023-2024',
    count: 4,
    dataQuality: '100%',
    note: 'Test data - major enforcement actions (ABN AMRO, ING, DEGIRO, Rabobank)',
    earliestYear: 2023,
    latestYear: 2024,
    defaultCurrency: 'EUR',
    maturity: 'limited',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'AFM enforcement decisions',
        url: 'https://www.afm.nl/en/sector/registers/enforcementdecisions',
        description: 'Official AFM register of enforcement decisions and publications.',
      },
      {
        label: 'AFM sanctions register',
        url: 'https://www.afm.nl/en/sector/registers/sancties',
        description: 'Public sanctions register published by the AFM.',
      },
      {
        label: 'AFM annual report',
        url: 'https://www.afm.nl/en/over-afm/jaarverslag',
        description: 'Supervisory priorities and annual reporting from the AFM.',
      },
    ],
  },
  ESMA: {
    code: 'ESMA',
    name: 'ESMA',
    fullName: 'European Securities and Markets Authority',
    country: 'European Union',
    countryCode: 'EU',
    flag: '🇪🇺',
    navOrder: 8,
    overviewPath: '/regulators/esma',
    years: '2022-2025',
    count: 3,
    dataQuality: '100%',
    note: 'EU-wide regulator - limited sample size',
    earliestYear: 2022,
    latestYear: 2025,
    defaultCurrency: 'EUR',
    maturity: 'limited',
    dashboardEnabled: true,
    officialSources: [
      {
        label: 'ESMA sanctions and enforcement',
        url: 'https://www.esma.europa.eu/esmas-activities/supervision-and-convergence/sanctions-and-enforcement',
        description: 'Official ESMA sanctions and enforcement page.',
      },
      {
        label: 'ESMA sanctions workbook',
        url: 'https://www.esma.europa.eu/sites/default/files/library/sanctions_measures.xlsx',
        description: 'Published ESMA sanctions and measures data workbook.',
      },
      {
        label: 'ESMA annual reports',
        url: 'https://www.esma.europa.eu/publications-and-data/annual-reports',
        description: 'Authority-wide reporting and supervisory context from ESMA.',
      },
    ],
  },
};

export const REGULATOR_NAV_ITEMS = Object.values(REGULATOR_COVERAGE).sort(
  (left, right) => left.navOrder - right.navOrder
);

export const REGULATOR_CODES = REGULATOR_NAV_ITEMS.map((coverage) => coverage.code);

/**
 * Production-ready regulators with real data parsers.
 * ESMA is excluded until real scrapers are implemented.
 * AFM and DNB use test data (4 and 3 records respectively) - Phase 5.
 * Use this for: navigation, filters, homepage stats, blog articles, SEO prerender.
 */
export const PUBLIC_REGULATOR_CODES = ['FCA', 'BaFin', 'AMF', 'CNMV', 'CBI', 'SFC', 'AFM', 'DNB'] as const;

export const PUBLIC_REGULATOR_NAV_ITEMS = REGULATOR_NAV_ITEMS.filter(
  (coverage) => PUBLIC_REGULATOR_CODES.includes(coverage.code as any)
);

export function getRegulatorCoverage(code: string): RegulatorCoverage | null {
  // Case-insensitive lookup
  const entry = Object.entries(REGULATOR_COVERAGE).find(
    ([key]) => key.toUpperCase() === code.toUpperCase()
  );
  return entry ? entry[1] : null;
}

export function isValidRegulatorCode(code: string): boolean {
  // Case-insensitive validation against PUBLIC regulators only
  // AFM, DNB, ESMA routes will return 404 until real parsers exist
  return PUBLIC_REGULATOR_CODES.some(key => key.toUpperCase() === code.toUpperCase());
}
