/**
 * Data coverage information for each regulator
 * Based on database analysis from 2026-03-20 plus validated expansion research
 */

export interface RegulatorCoverage {
  code: string;
  name: string;
  fullName: string;
  country: string;
  countryCode: string;
  regionCluster:
    | "UK"
    | "EU"
    | "EEA"
    | "Switzerland"
    | "EU-level"
    | "Global";
  countryCluster: string | null;
  rolloutPhase: 1 | 2 | 3 | null;
  region:
    | "UK"
    | "Europe"
    | "APAC"
    | "MENA"
    | "Offshore"
    | "North America"
    | "Latin America"
    | "Africa";
  strategicBucket:
    | "core"
    | "europe_eea_expansion"
    | "gulf_and_ifc"
    | "offshore_wealth_centres"
    | "high_signal_global";
  sourceType: "regulator" | "sro";
  scrapeMode:
    | "table"
    | "archive"
    | "detail_pages"
    | "search_register"
    | "open_data"
    | "mixed";
  priorityTier: 1 | 2 | 3;
  stage: "live" | "internal" | "pipeline";
  blogEnabled: boolean;
  flag: string;
  navOrder: number;
  overviewPath: string;
  years: string;
  count: number;
  dataQuality: string;
  note: string | null;
  earliestYear: number;
  latestYear: number;
  nativeCurrency: string;
  defaultCurrency: "GBP" | "EUR";
  coverageStatus: "anchor" | "growing" | "emerging";
  maturity: "anchor" | "emerging" | "limited";
  operationalConfidence: "standard" | "lower";
  automationLevel: "automated" | "curated_archive" | "sparse_source";
  feedContract: RegulatorFeedContract;
  dashboardEnabled: boolean;
  officialSources: RegulatorOfficialSource[];
}

export interface RegulatorFeedContract {
  cadence: "daily" | "fragile";
  collectionMethod: string;
  sourceContractSummary: string;
  zeroResultPolicy: "investigate" | "sparse_source";
  staleAfterDays: number;
  minimumHealthyRecords: number;
  operatorAction: string;
}

export interface RegulatorOfficialSource {
  label: string;
  url: string;
  description: string;
}

type RegulatorCoverageSeed = Omit<
  RegulatorCoverage,
  | "regionCluster"
  | "countryCluster"
  | "rolloutPhase"
  | "operationalConfidence"
  | "automationLevel"
  | "feedContract"
>;

export interface CoverageRoadmapPhase {
  id: string;
  phase: 1 | 2 | 3;
  label: string;
  title: string;
  targetWindow: string;
  description: string;
  spotlight: string;
  codes: string[];
}

const PIPELINE_NOTE =
  "Official enforcement source validated. Ingestion and editorial coverage are not yet live.";

const LOW_CONFIDENCE_LIVE_REGULATOR_SET = new Set([
  "DFSA",
  "CBUAE",
  "JFSC",
  "CIRO",
  "FMAAT",
  "FINMA",
  "CMVM",
  "MFSA",
  "AUSTRAC",
]);

const CURATED_ARCHIVE_REGULATOR_SET = new Set(["DFSA", "CBUAE"]);
const SPARSE_SOURCE_REGULATOR_SET = new Set(["JFSC"]);

const EUROPE_EEA_PHASE_CODE_MAP = {
  1: ["CONSOB", "BDI", "FINMA", "ACPR", "CSSF", "FSMA", "FMAAT"],
  2: ["CNBCZ", "CMVM", "BDP", "CYSEC", "FISE", "FTDK", "FINFSA", "FTNO"],
  3: ["MFSA", "IVASS"],
} as const satisfies Record<1 | 2 | 3, string[]>;

const EUROPE_EEA_PHASE_BY_CODE = Object.fromEntries(
  Object.entries(EUROPE_EEA_PHASE_CODE_MAP).flatMap(([phase, codes]) =>
    codes.map((code) => [code, Number(phase)]),
  ),
) as Partial<Record<string, 1 | 2 | 3>>;

const COUNTRY_CLUSTER_BY_CODE: Partial<Record<string, string>> = {
  FINMA: "Switzerland",
  CONSOB: "Italy",
  BDI: "Italy",
  IVASS: "Italy",
  ACPR: "France",
  CSSF: "Luxembourg",
  FSMA: "Belgium",
  FMAAT: "Austria",
  CNBCZ: "Central Europe",
  CMVM: "Portugal",
  BDP: "Portugal",
  CYSEC: "Cyprus",
  FISE: "Nordics",
  FTDK: "Nordics",
  FINFSA: "Nordics",
  FTNO: "Nordics",
  MFSA: "Malta",
};

const REGULATOR_COVERAGE_SEED: Record<string, RegulatorCoverageSeed> = {
  FCA: {
    code: "FCA",
    name: "FCA",
    fullName: "Financial Conduct Authority",
    country: "United Kingdom",
    countryCode: "GB",
    region: "UK",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "mixed",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇬🇧",
    navOrder: 1,
    overviewPath: "/regulators/fca",
    years: "2013-2026",
    count: 308,
    dataQuality: "100%",
    note: "Complete historical dataset - 14 years of comprehensive coverage",
    earliestYear: 2013,
    latestYear: 2026,
    nativeCurrency: "GBP",
    defaultCurrency: "GBP",
    coverageStatus: "anchor",
    maturity: "anchor",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FCA news and enforcement stories",
        url: "https://www.fca.org.uk/news/news-stories",
        description:
          "Official FCA news, final notices, and enforcement announcements.",
      },
      {
        label: "FCA annual reports",
        url: "https://www.fca.org.uk/publications/annual-reports",
        description:
          "Regulator reporting, statistics, and supervisory priorities.",
      },
      {
        label: "FCA Handbook",
        url: "https://www.handbook.fca.org.uk/",
        description:
          "Primary rulebook and guidance behind published enforcement outcomes.",
      },
    ],
  },
  BaFin: {
    code: "BaFin",
    name: "BaFin",
    fullName: "Federal Financial Supervisory Authority",
    country: "Germany",
    countryCode: "DE",
    region: "Europe",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "mixed",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇩🇪",
    navOrder: 2,
    overviewPath: "/regulators/bafin",
    years: "2023-2026",
    count: 246,
    dataQuality: "100%",
    note: null,
    earliestYear: 2020,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "BaFin measures and sanctions",
        url: "https://www.bafin.de/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html",
        description: "Primary BaFin page for published measures and sanctions.",
      },
      {
        label: "BaFin databases and registers",
        url: "https://www.bafin.de/EN/PublikationenDaten/Datenbanken/datenbanken_node_en.html",
        description: "BaFin data portals and searchable official registers.",
      },
      {
        label: "BaFin annual reports",
        url: "https://www.bafin.de/EN/DieBaFin/AufgabenGeschichte/Jahresbericht/jahresbericht_node_en.html",
        description:
          "Official reports for enforcement context and supervisory themes.",
      },
    ],
  },
  AMF: {
    code: "AMF",
    name: "AMF",
    fullName: "Autorité des marchés financiers",
    country: "France",
    countryCode: "FR",
    region: "Europe",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇫🇷",
    navOrder: 3,
    overviewPath: "/regulators/amf",
    years: "2023-2024",
    count: 112,
    dataQuality: "100%",
    note: null,
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "AMF enforcement committee releases",
        url: "https://www.amf-france.org/en/news-publications/news-releases/enforcement-committee-news-releases",
        description:
          "Primary AMF page for enforcement committee announcements and sanctions.",
      },
      {
        label: "AMF sanctions and enforcement",
        url: "https://www.amf-france.org/en/sanctions-and-enforcement",
        description:
          "Official enforcement section with sanctions publications and procedures.",
      },
      {
        label: "AMF reports and research",
        url: "https://www.amf-france.org/en/news-publications/publications/reports-and-research",
        description:
          "Annual reports and supporting publications for broader market context.",
      },
    ],
  },
  CNMV: {
    code: "CNMV",
    name: "CNMV",
    fullName: "Comisión Nacional del Mercado de Valores",
    country: "Spain",
    countryCode: "ES",
    region: "Europe",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "search_register",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇪🇸",
    navOrder: 4,
    overviewPath: "/regulators/cnmv",
    years: "2023-2024",
    count: 94,
    dataQuality: "100%",
    note: null,
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CNMV disciplinary penalties register",
        url: "https://www.cnmv.es/portal/Consultas/RegistroSanciones/verRegSanciones.aspx?lang=en",
        description:
          "Official CNMV register for published disciplinary penalties.",
      },
      {
        label: "CNMV sanctions register home",
        url: "https://www.cnmv.es/portal/Consultas/RegistroSanciones/iniregsanciones.aspx?lang=en",
        description:
          "CNMV sanctions register entry page and search start point.",
      },
      {
        label: "CNMV annual publications",
        url: "https://www.cnmv.es/portal/Publicaciones/PublicacionesGN.aspx?id=19",
        description:
          "Official CNMV reports and publications for regulatory context.",
      },
    ],
  },
  CBI: {
    code: "CBI",
    name: "CBI",
    fullName: "Central Bank of Ireland",
    country: "Ireland",
    countryCode: "IE",
    region: "Europe",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇮🇪",
    navOrder: 5,
    overviewPath: "/regulators/cbi",
    years: "2021-2025",
    count: 119,
    dataQuality: "100%",
    note: null,
    earliestYear: 2021,
    latestYear: 2025,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CBI enforcement actions",
        url: "https://www.centralbank.ie/news-media/legal-notices/enforcement-actions",
        description:
          "Published enforcement actions and legal notices from the Central Bank of Ireland.",
      },
      {
        label: "CBI enforcement and regulation",
        url: "https://www.centralbank.ie/regulation/enforcement",
        description:
          "Enforcement framework, sanctions context, and supervisory references.",
      },
      {
        label: "CBI annual reports",
        url: "https://www.centralbank.ie/news/publications/annual-reports",
        description:
          "Annual reporting and supervisory trend context from the Central Bank of Ireland.",
      },
    ],
  },
  SFC: {
    code: "SFC",
    name: "SFC",
    fullName: "Securities and Futures Commission",
    country: "Hong Kong",
    countryCode: "HK",
    region: "APAC",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇭🇰",
    navOrder: 6,
    overviewPath: "/regulators/sfc",
    years: "2020-2026",
    count: 221,
    dataQuality: "100%",
    note: null,
    earliestYear: 2020,
    latestYear: 2026,
    nativeCurrency: "HKD",
    defaultCurrency: "GBP",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "SFC press releases",
        url: "https://www.sfc.hk/en/RSS-Feeds/Press-releases",
        description:
          "Official SFC press releases RSS feed with enforcement actions.",
      },
      {
        label: "SFC enforcement actions",
        url: "https://www.sfc.hk/en/Regulatory-functions/Enforcement/Enforcement-actions",
        description: "SFC enforcement framework and enforcement news.",
      },
      {
        label: "SFC enforcement statistics",
        url: "https://www.sfc.hk/en/Regulatory-functions/Enforcement/Enforcement-actions/Enforcement-statistics",
        description:
          "Statistics on enforcement proceedings and investigations.",
      },
    ],
  },
  AFM: {
    code: "AFM",
    name: "AFM",
    fullName: "Authority for the Financial Markets",
    country: "Netherlands",
    countryCode: "NL",
    region: "Europe",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "search_register",
    priorityTier: 2,
    stage: "live",
    blogEnabled: true,
    flag: "🇳🇱",
    navOrder: 7,
    overviewPath: "/regulators/afm",
    years: "2023-2024",
    count: 4,
    dataQuality: "100%",
    note: "Test data - major enforcement actions (ABN AMRO, ING, DEGIRO, Rabobank)",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "AFM enforcement decisions",
        url: "https://www.afm.nl/en/sector/registers/enforcementdecisions",
        description:
          "Official AFM register of enforcement decisions and publications.",
      },
      {
        label: "AFM sanctions register",
        url: "https://www.afm.nl/en/sector/registers/sancties",
        description: "Public sanctions register published by the AFM.",
      },
      {
        label: "AFM annual report",
        url: "https://www.afm.nl/en/over-afm/jaarverslag",
        description:
          "Supervisory priorities and annual reporting from the AFM.",
      },
    ],
  },
  DNB: {
    code: "DNB",
    name: "DNB",
    fullName: "De Nederlandsche Bank",
    country: "Netherlands",
    countryCode: "NL",
    region: "Europe",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 2,
    stage: "live",
    blogEnabled: true,
    flag: "🇳🇱",
    navOrder: 8,
    overviewPath: "/regulators/dnb",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "Test data - major enforcement actions (ABN AMRO €480M, ING, Rabobank)",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "DNB enforcement overview",
        url: "https://www.dnb.nl/en/sector-information/enforcement/",
        description:
          "Official enforcement landing page used for published DNB actions.",
      },
      {
        label: "DNB supervision and enforcement",
        url: "https://www.dnb.nl/en/supervision/enforcement/",
        description:
          "Supervisory enforcement page with sanctions and policy context.",
      },
      {
        label: "DNB annual reports",
        url: "https://www.dnb.nl/en/publications/annual-reports/",
        description:
          "Official reports covering supervisory focus and market context.",
      },
    ],
  },
  ESMA: {
    code: "ESMA",
    name: "ESMA",
    fullName: "European Securities and Markets Authority",
    country: "European Union",
    countryCode: "EU",
    region: "Europe",
    strategicBucket: "core",
    sourceType: "regulator",
    scrapeMode: "open_data",
    priorityTier: 2,
    stage: "internal",
    blogEnabled: true,
    flag: "🇪🇺",
    navOrder: 9,
    overviewPath: "/regulators/esma",
    years: "2022-2025",
    count: 3,
    dataQuality: "100%",
    note: "EU-wide regulator - limited sample size",
    earliestYear: 2022,
    latestYear: 2025,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "ESMA sanctions and enforcement",
        url: "https://www.esma.europa.eu/esmas-activities/supervision-and-convergence/sanctions-and-enforcement",
        description: "Official ESMA sanctions and enforcement page.",
      },
      {
        label: "ESMA sanctions workbook",
        url: "https://www.esma.europa.eu/sites/default/files/library/sanctions_measures.xlsx",
        description: "Published ESMA sanctions and measures data workbook.",
      },
      {
        label: "ESMA annual reports",
        url: "https://www.esma.europa.eu/publications-and-data/annual-reports",
        description:
          "Authority-wide reporting and supervisory context from ESMA.",
      },
    ],
  },
  ECB: {
    code: "ECB",
    name: "ECB",
    fullName: "European Central Bank Banking Supervision",
    country: "Euro Area",
    countryCode: "EU",
    region: "Europe",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "search_register",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇪🇺",
    navOrder: 10,
    overviewPath: "/regulators/ecb",
    years: "2017-2026",
    count: 36,
    dataQuality: "Tested live loader",
    note: "Live sanctions register published to production dashboard coverage.",
    earliestYear: 2017,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "ECB supervisory sanctions",
        url: "https://www.bankingsupervision.europa.eu/framework/supervisory-sanctions/html/index.en.html",
        description: "Official ECB banking supervision sanctions register.",
      },
    ],
  },
  DFSA: {
    code: "DFSA",
    name: "DFSA",
    fullName: "Dubai Financial Services Authority",
    country: "Dubai International Financial Centre",
    countryCode: "AE",
    region: "MENA",
    strategicBucket: "gulf_and_ifc",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇦🇪",
    navOrder: 11,
    overviewPath: "/regulators/dfsa",
    years: "2016-2026",
    count: 19,
    dataQuality: "Official archive manifest",
    note: "Curated from the official DFSA regulatory-actions archive and verified decision notices. The public index is challenge-protected in this environment, so archive discovery is maintained via official document manifests.",
    earliestYear: 2016,
    latestYear: 2026,
    nativeCurrency: "USD",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "DFSA regulatory actions",
        url: "https://www.dfsa.ae/what-we-do/enforcement/regulatory-actions",
        description:
          "Official DFSA enforcement and regulatory actions archive.",
      },
    ],
  },
  FSRA: {
    code: "FSRA",
    name: "FSRA",
    fullName: "Financial Services Regulatory Authority",
    country: "Abu Dhabi Global Market",
    countryCode: "AE",
    region: "MENA",
    strategicBucket: "gulf_and_ifc",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇦🇪",
    navOrder: 12,
    overviewPath: "/regulators/fsra",
    years: "2025-2026",
    count: 10,
    dataQuality: "Tested live loader",
    note: "Live regulatory actions archive published to production dashboard coverage.",
    earliestYear: 2025,
    latestYear: 2026,
    nativeCurrency: "USD",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FSRA regulatory actions",
        url: "https://www.adgm.com/operating-in-adgm/additional-obligations-of-financial-services-entities/enforcement/regulatory-actions",
        description: "Official ADGM FSRA regulatory actions archive.",
      },
    ],
  },
  CBUAE: {
    code: "CBUAE",
    name: "CBUAE",
    fullName: "Central Bank of the United Arab Emirates",
    country: "United Arab Emirates",
    countryCode: "AE",
    region: "MENA",
    strategicBucket: "gulf_and_ifc",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇦🇪",
    navOrder: 13,
    overviewPath: "/regulators/cbuae",
    years: "2020-2025",
    count: 36,
    dataQuality: "Official archive manifest",
    note: "Curated from the official CBUAE enforcement archive and downloadable sanction PDFs. The public index is challenge-protected in this environment, but direct official PDFs are accessible and used to widen historical coverage.",
    earliestYear: 2023,
    latestYear: 2025,
    nativeCurrency: "AED",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CBUAE enforcement actions",
        url: "https://www.centralbank.ae/en/our-operations/enforcement/",
        description:
          "Official enforcement and financial penalties page from the UAE central bank.",
      },
    ],
  },
  JFSC: {
    code: "JFSC",
    name: "JFSC",
    fullName: "Jersey Financial Services Commission",
    country: "Jersey",
    countryCode: "JE",
    region: "Offshore",
    strategicBucket: "offshore_wealth_centres",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇯🇪",
    navOrder: 14,
    overviewPath: "/regulators/jfsc",
    years: "2021-2021",
    count: 1,
    dataQuality: "Tested live loader",
    note: "Full sitemap/detail scan tested. The public statements surface currently exposes one explicit monetary penalty notice.",
    earliestYear: 2021,
    latestYear: 2021,
    nativeCurrency: "GBP",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "JFSC enforcement",
        url: "https://www.jerseyfsc.org/about-us/our-teams/enforcement/",
        description: "Official Jersey FSC enforcement page and case archive.",
      },
    ],
  },
  GFSC: {
    code: "GFSC",
    name: "GFSC",
    fullName: "Guernsey Financial Services Commission",
    country: "Guernsey",
    countryCode: "GG",
    region: "Offshore",
    strategicBucket: "offshore_wealth_centres",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇬🇬",
    navOrder: 15,
    overviewPath: "/regulators/gfsc",
    years: "2005-2026",
    count: 28,
    dataQuality: "Tested live loader",
    note: "Live public statements loader tested. Historical penalties include firm and individual outcomes.",
    earliestYear: 2005,
    latestYear: 2026,
    nativeCurrency: "GBP",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "GFSC public statements",
        url: "https://www.gfsc.gg/commission/enforcement/public-statements",
        description: "Official GFSC enforcement and public statements page.",
      },
    ],
  },
  CIRO: {
    code: "CIRO",
    name: "CIRO",
    fullName: "Canadian Investment Regulatory Organization",
    country: "Canada",
    countryCode: "CA",
    region: "North America",
    strategicBucket: "high_signal_global",
    sourceType: "sro",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇨🇦",
    navOrder: 16,
    overviewPath: "/regulators/ciro",
    years: "2019-2026",
    count: 279,
    dataQuality: "Tested live loader",
    note: "Self-regulatory organization. Live decision-notice listing loader tested across the full current public archive; many historical records are non-monetary outcomes with null amounts.",
    earliestYear: 2019,
    latestYear: 2026,
    nativeCurrency: "CAD",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CIRO enforcement",
        url: "https://www.ciro.ca/rules-and-enforcement/enforcement",
        description: "Official CIRO enforcement and disciplinary actions page.",
      },
    ],
  },
  SEC: {
    code: "SEC",
    name: "SEC",
    fullName: "U.S. Securities and Exchange Commission",
    country: "United States",
    countryCode: "US",
    region: "North America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇺🇸",
    navOrder: 17,
    overviewPath: "/regulators/sec",
    years: "2012-2026",
    count: 1797,
    dataQuality: "Tested live loader",
    note: "Live SEC press release enforcement loader published across the current official archive from 2012 onwards. Many charge-only releases retain null amounts until a monetary order or settlement amount is stated.",
    earliestYear: 2012,
    latestYear: 2026,
    nativeCurrency: "USD",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "SEC press releases",
        url: "https://www.sec.gov/newsroom/press-releases",
        description:
          "Official SEC press release archive, including enforcement announcements and settlements.",
      },
      {
        label: "SEC enforcement and litigation",
        url: "https://www.sec.gov/enforcement-litigation",
        description: "Official SEC enforcement and litigation hub.",
      },
      {
        label: "SEC enforcement results",
        url: "https://www.sec.gov/newsroom/enforcement-results-fy23",
        description: "Official SEC enforcement-results reporting and context.",
      },
    ],
  },
  SEBI: {
    code: "SEBI",
    name: "SEBI",
    fullName: "Securities and Exchange Board of India",
    country: "India",
    countryCode: "IN",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "search_register",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇮🇳",
    navOrder: 18,
    overviewPath: "/regulators/sebi",
    years: "2022-2026",
    count: 408,
    dataQuality: "Tested live loader",
    note: "Live SEBI orders feed tested across the full current public listing. Amount extraction now follows embedded PDFs and targets operative penalty language, but non-monetary orders remain in coverage and will keep null amounts.",
    earliestYear: 2022,
    latestYear: 2026,
    nativeCurrency: "INR",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "SEBI enforcement orders",
        url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=2&smid=133&ssid=9",
        description: "Official SEBI enforcement orders index.",
      },
    ],
  },
  TWFSC: {
    code: "TWFSC",
    name: "Taiwan FSC",
    fullName: "Financial Supervisory Commission",
    country: "Taiwan",
    countryCode: "TW",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇹🇼",
    navOrder: 19,
    overviewPath: "/regulators/twfsc",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "Taiwan financial regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "TWD",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Taiwan FSC enforcement",
        url: "https://www.fsc.gov.tw/en/home.jsp?id=95&parentpath=0,2",
        description: "Official Taiwan FSC enforcement publications page.",
      },
    ],
  },
  CVM: {
    code: "CVM",
    name: "CVM",
    fullName: "Comissão de Valores Mobiliários",
    country: "Brazil",
    countryCode: "BR",
    region: "Latin America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "open_data",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇧🇷",
    navOrder: 20,
    overviewPath: "/regulators/cvm",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "Brazil securities regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "BRL",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CVM sanctions dataset",
        url: "https://dados.cvm.gov.br/dataset/processo-sancionador",
        description: "Official open-data dataset for CVM sanction proceedings.",
      },
    ],
  },
  CNBV: {
    code: "CNBV",
    name: "CNBV",
    fullName: "Comisión Nacional Bancaria y de Valores",
    country: "Mexico",
    countryCode: "MX",
    region: "Latin America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 2,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇲🇽",
    navOrder: 21,
    overviewPath: "/regulators/cnbv",
    years: "2023-2024",
    count: 4,
    dataQuality: "100%",
    note: "Mexico banking regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "MXN",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CNBV sanctions",
        url: "https://www.gob.mx/cnbv/acciones-y-programas/sanciones-impuestas-en-la-cnbv",
        description: "Official CNBV sanctions publications page.",
      },
    ],
  },
  CMF: {
    code: "CMF",
    name: "CMF",
    fullName: "Comisión para el Mercado Financiero",
    country: "Chile",
    countryCode: "CL",
    region: "Latin America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "search_register",
    priorityTier: 2,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇨🇱",
    navOrder: 22,
    overviewPath: "/regulators/cmf",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "Chile financial regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "CLP",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CMF sanctions register",
        url: "https://www.cmfchile.cl/institucional/sanciones/sanciones_mercados.php",
        description: "Official CMF sanctions search page.",
      },
    ],
  },
  HKMA: {
    code: "HKMA",
    name: "HKMA",
    fullName: "Hong Kong Monetary Authority",
    country: "Hong Kong",
    countryCode: "HK",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇭🇰",
    navOrder: 23,
    overviewPath: "/regulators/hkma",
    years: "2015-2025",
    count: 23,
    dataQuality: "Tested live loader",
    note:
      "Official HKMA disciplinary and penalty notices via the HKMA public API with detail-page enrichment. Joint SFC and Insurance Authority collaboration notices are excluded, and multi-bank HKMA notices are split into firm-level actions where the source names each bank.",
    earliestYear: 2015,
    latestYear: 2025,
    nativeCurrency: "HKD",
    defaultCurrency: "GBP",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "HKMA enforcement press releases",
        url: "https://www.hkma.gov.hk/eng/news-and-media/press-releases/enforcement/",
        description:
          "Official HKMA enforcement actions and penalty notices.",
      },
      {
        label: "HKMA public press-release API",
        url: "https://api.hkma.gov.hk/public/press-releases?lang=en",
        description:
          "Official HKMA API used to enumerate enforcement press releases and link through to the source notices.",
      },
    ],
  },
  ASIC: {
    code: "ASIC",
    name: "ASIC",
    fullName: "Australian Securities and Investments Commission",
    country: "Australia",
    countryCode: "AU",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "table",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇦🇺",
    navOrder: 24,
    overviewPath: "/regulators/asic",
    years: "2012-2026",
    count: 112,
    dataQuality: "100%",
    note:
      "Official infringement-register coverage with linked ASIC media releases where available.",
    earliestYear: 2012,
    latestYear: 2026,
    nativeCurrency: "AUD",
    defaultCurrency: "GBP",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "ASIC infringement notices register",
        url: "https://www.asic.gov.au/online-services/search-asic-registers/infringement-notices-register/",
        description:
          "Official register of paid ASIC infringement notices with entity names, dates, notice PDFs, and linked media releases.",
      },
      {
        label: "ASIC media releases",
        url: "https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/",
        description:
          "Official ASIC media-release archive used to enrich infringement-notice summaries and disclosed amounts.",
      },
    ],
  },
  AUSTRAC: {
    code: "AUSTRAC",
    name: "AUSTRAC",
    fullName: "Australian Transaction Reports and Analysis Centre",
    country: "Australia",
    countryCode: "AU",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇦🇺",
    navOrder: 58,
    overviewPath: "/regulators/austrac",
    years: "2009-2025",
    count: 66,
    dataQuality: "Tested live loader",
    note:
      "Official browser-fetched enforcement-actions coverage across court proceedings, undertakings, infringement notices, and remedial directions.",
    earliestYear: 2009,
    latestYear: 2025,
    nativeCurrency: "AUD",
    defaultCurrency: "GBP",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "AUSTRAC enforcement actions taken",
        url: "https://www.austrac.gov.au/about-us/record-our-actions/enforcement-actions-taken",
        description:
          "Official AUSTRAC enforcement-actions page covering court proceedings, enforceable undertakings, infringement notices, and remedial directions.",
      },
      {
        label: "AUSTRAC media release RSS",
        url: "https://www.austrac.gov.au/news-and-media/media-release",
        description:
          "Official AUSTRAC media-release surface that advertises the media RSS feed for freshness monitoring.",
      },
    ],
  },
  MAS: {
    code: "MAS",
    name: "MAS",
    fullName: "Monetary Authority of Singapore",
    country: "Singapore",
    countryCode: "SG",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇸🇬",
    navOrder: 25,
    overviewPath: "/regulators/mas",
    years: "2023-2026",
    count: 21,
    dataQuality: "Tested live loader",
    note:
      "Official MAS enforcement releases distributed via the Singapore Government Press Centre, with attached notice PDFs used where available. Count reflects discrete enforcement notices after excluding MAS quarterly roundup posts.",
    earliestYear: 2023,
    latestYear: 2026,
    nativeCurrency: "SGD",
    defaultCurrency: "GBP",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "MAS enforcement actions",
        url: "https://www.mas.gov.sg/regulation/enforcement/enforcement-actions",
        description:
          "Official MAS enforcement actions and regulatory outcomes archive.",
      },
      {
        label: "Singapore Government Press Centre MAS releases",
        url: "https://www.sgpc.gov.sg/agency/monetary-authority-of-singapore",
        description:
          "Official Singapore Government press-release distribution surface used to access MAS enforcement releases and attached PDFs.",
      },
    ],
  },
  OCC: {
    code: "OCC",
    name: "OCC",
    fullName: "Office of the Comptroller of the Currency",
    country: "United States",
    countryCode: "US",
    region: "North America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "search_register",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇺🇸",
    navOrder: 26,
    overviewPath: "/regulators/occ",
    years: "1987-2026",
    count: 6026,
    dataQuality: "Tested live loader",
    note: "Live OCC enforcement-actions register published from the official JSON export of the public search tool.",
    earliestYear: 1987,
    latestYear: 2026,
    nativeCurrency: "USD",
    defaultCurrency: "GBP",
    coverageStatus: "extensive",
    maturity: "standard",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "OCC enforcement actions",
        url: "https://www.occ.treas.gov/topics/laws-and-regulations/enforcement-actions/index-enforcement-actions.html",
        description: "Official OCC enforcement-actions index and search tool.",
      },
    ],
  },
  FINCEN: {
    code: "FINCEN",
    name: "FinCEN",
    fullName: "Financial Crimes Enforcement Network",
    country: "United States",
    countryCode: "US",
    region: "North America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇺🇸",
    navOrder: 26.5,
    overviewPath: "/regulators/fincen",
    years: "1999-2026",
    count: 118,
    dataQuality: "Tested live loader",
    note: "Live FinCEN enforcement actions archive published from the official table of civil money penalties and related AML/BSA actions.",
    earliestYear: 1999,
    latestYear: 2026,
    nativeCurrency: "USD",
    defaultCurrency: "GBP",
    coverageStatus: "growing",
    maturity: "standard",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FinCEN enforcement actions",
        url: "https://www.fincen.gov/news/enforcement-actions",
        description:
          "Official FinCEN enforcement actions archive covering civil money penalties and related AML/BSA enforcement outcomes.",
      },
    ],
  },
  FINMA: {
    code: "FINMA",
    name: "FINMA",
    fullName: "Swiss Financial Market Supervisory Authority",
    country: "Switzerland",
    countryCode: "CH",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: true,
    flag: "🇨🇭",
    navOrder: 27,
    overviewPath: "/regulators/finma",
    years: "2018-2025",
    count: 23,
    dataQuality: "Tested browser loader",
    note:
      "Official FINMA named final-rulings feed under Article 34 FINMASA, covering published cease-and-desist orders and related final enforcement rulings naming those involved.",
    earliestYear: 2018,
    latestYear: 2025,
    nativeCurrency: "CHF",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FINMA publication of final rulings naming those involved",
        url: "https://www.finma.ch/en/enforcement/enforcement-tools/publication-of-final-rulings/",
        description:
          "Official FINMA Article 34 FINMASA archive of final rulings naming those involved.",
      },
    ],
  },
  SESC: {
    code: "SESC",
    name: "SESC",
    fullName: "Securities and Exchange Surveillance Commission",
    country: "Japan",
    countryCode: "JP",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇯🇵",
    navOrder: 28,
    overviewPath: "/regulators/sesc",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "Japan securities regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "JPY",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "SESC enforcement actions",
        url: "https://www.fsa.go.jp/sesc/english/aboutsesc/actions.html",
        description:
          "Official SESC administrative actions and enforcement archive.",
      },
    ],
  },
  FSCA: {
    code: "FSCA",
    name: "FSCA",
    fullName: "Financial Sector Conduct Authority",
    country: "South Africa",
    countryCode: "ZA",
    region: "Africa",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 2,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇿🇦",
    navOrder: 29,
    overviewPath: "/regulators/fsca",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "South Africa regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "ZAR",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FSCA enforcement actions",
        url: "https://www.fsca.co.za/Enforcement%20Actions/Pages/default.aspx",
        description:
          "Official FSCA enforcement actions and administrative penalties archive.",
      },
    ],
  },
  FMANZ: {
    code: "FMANZ",
    name: "FMA NZ",
    fullName: "Financial Markets Authority",
    country: "New Zealand",
    countryCode: "NZ",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 2,
    stage: "live",
    blogEnabled: true,
    flag: "🇳🇿",
    navOrder: 30,
    overviewPath: "/regulators/fmanz",
    years: "2015-2026",
    count: 99,
    dataQuality: "100%",
    note:
      "Official FMA case-index coverage with linked judgments, warnings, orders, and entity-level enforcement histories.",
    earliestYear: 2015,
    latestYear: 2026,
    nativeCurrency: "NZD",
    defaultCurrency: "GBP",
    coverageStatus: "growing",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FMA enforcement cases index",
        url: "https://www.fma.govt.nz/about-us/enforcement/cases/0/",
        description:
          "Official FMA New Zealand enforcement case index with entity case pages, judgments, orders, and warnings.",
      },
    ],
  },
  CSRC: {
    code: "CSRC",
    name: "CSRC",
    fullName: "China Securities Regulatory Commission",
    country: "China",
    countryCode: "CN",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "search_register",
    priorityTier: 2,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇨🇳",
    navOrder: 31,
    overviewPath: "/regulators/csrc",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "China regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "CNY",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CSRC official site",
        url: "https://www.csrc.gov.cn/",
        description:
          "Official CSRC site where administrative penalties and enforcement decisions are published.",
      },
    ],
  },
  FDIC: {
    code: "FDIC",
    name: "FDIC",
    fullName: "Federal Deposit Insurance Corporation",
    country: "United States",
    countryCode: "US",
    region: "North America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 2,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇺🇸",
    navOrder: 32,
    overviewPath: "/regulators/fdic",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "US banking regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "USD",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FDIC press releases",
        url: "https://www.fdic.gov/news/press-releases",
        description:
          "Official FDIC press releases, including monthly enforcement decisions and orders publications.",
      },
    ],
  },
  FRB: {
    code: "FRB",
    name: "FRB",
    fullName: "Federal Reserve Board",
    country: "United States",
    countryCode: "US",
    region: "North America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 2,
    stage: "pipeline",
    blogEnabled: true,
    flag: "🇺🇸",
    navOrder: 33,
    overviewPath: "/regulators/frb",
    years: "2023-2024",
    count: 4,
    dataQuality: "100%",
    note: "US Federal Reserve - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "USD",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Federal Reserve enforcement actions",
        url: "https://www.federalreserve.gov/supervisionreg/enforcement-actions-about.htm",
        description:
          "Official Federal Reserve enforcement actions archive and order index.",
      },
    ],
  },
  CMASA: {
    code: "CMASA",
    name: "Saudi CMA",
    fullName: "Capital Market Authority",
    country: "Saudi Arabia",
    countryCode: "SA",
    region: "MENA",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 2,
    stage: "live",
    blogEnabled: true,
    flag: "🇸🇦",
    navOrder: 34,
    overviewPath: "/regulators/cmasa",
    years: "2023-2024",
    count: 3,
    dataQuality: "100%",
    note: "Saudi Arabia regulator - test data",
    earliestYear: 2023,
    latestYear: 2024,
    nativeCurrency: "SAR",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Saudi CMA enforcement",
        url: "https://cma.org.sa/en/RulesRegulations/Pages/Enforcement.aspx",
        description:
          "Official Capital Market Authority enforcement and regulations page.",
      },
    ],
  },
  OSC: {
    code: "OSC",
    name: "OSC",
    fullName: "Ontario Securities Commission",
    country: "Canada",
    countryCode: "CA",
    region: "North America",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: false,
    flag: "🇨🇦",
    navOrder: 35,
    overviewPath: "/regulators/osc",
    years: "Pending",
    count: 0,
    dataQuality: "Validated",
    note: PIPELINE_NOTE,
    earliestYear: 0,
    latestYear: 0,
    nativeCurrency: "CAD",
    defaultCurrency: "GBP",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "OSC enforcement news and releases",
        url: "https://www.osc.ca/en/news-events/news",
        description:
          "Official Ontario Securities Commission news, proceedings, and sanctions-related publications.",
      },
      {
        label: "OSC sanctions and monetary sanctions information",
        url: "https://www.osc.ca/en/news-events/news/osc-publishes-information-monetary-sanctions-its-website",
        description:
          "Official OSC publication on sanctions and monetary sanctions disclosure.",
      },
    ],
  },
  CONSOB: {
    code: "CONSOB",
    name: "CONSOB",
    fullName: "Commissione Nazionale per le Società e la Borsa",
    country: "Italy",
    countryCode: "IT",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "search_register",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: false,
    flag: "🇮🇹",
    navOrder: 36,
    overviewPath: "/regulators/consob",
    years: "Pending",
    count: 0,
    dataQuality: "Validated",
    note: PIPELINE_NOTE,
    earliestYear: 0,
    latestYear: 0,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CONSOB sanctions",
        url: "https://www.consob.it/it/web/area-pubblica/sanzioni",
        description:
          "Official CONSOB public sanctions and disciplinary publications.",
      },
    ],
  },
  BDI: {
    code: "BDI",
    name: "Bank of Italy",
    fullName: "Banca d'Italia",
    country: "Italy",
    countryCode: "IT",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇮🇹",
    navOrder: 37,
    overviewPath: "/regulators/bdi",
    years: "2021-2026",
    count: 153,
    dataQuality: "Tested live loader",
    note: "Live sanctions archive loader tested against the official year archive and downloadable Banca d'Italia decision PDFs.",
    earliestYear: 2021,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Banca d'Italia sanctions",
        url: "https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/",
        description:
          "Official Banca d'Italia administrative and supervisory sanctions archive.",
      },
    ],
  },
  ACPR: {
    code: "ACPR",
    name: "ACPR",
    fullName: "Autorité de contrôle prudentiel et de résolution",
    country: "France",
    countryCode: "FR",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇫🇷",
    navOrder: 38,
    overviewPath: "/regulators/acpr",
    years: "2011-2025",
    count: 75,
    dataQuality: "Tested live loader",
    note: "Live sanctions compendium loader tested. Monetary extraction is partial because older ACPR decisions often expose penalty amounts only inside downloadable decision files.",
    earliestYear: 2011,
    latestYear: 2025,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "ACPR recueil des sanctions",
        url: "https://acpr.banque-france.fr/fr/reglementation/recueil-des-sanctions",
        description:
          "Official ACPR sanctions compendium and prudential enforcement archive.",
      },
    ],
  },
  CSSF: {
    code: "CSSF",
    name: "CSSF",
    fullName: "Commission de Surveillance du Secteur Financier",
    country: "Luxembourg",
    countryCode: "LU",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "mixed",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇱🇺",
    navOrder: 39,
    overviewPath: "/regulators/cssf",
    years: "2020-2026",
    count: 163,
    dataQuality: "Tested live loader",
    note: "Live administrative-sanctions search loader tested against the official CSSF document archive. Monetary extraction is partial and depends on document-level disclosures.",
    earliestYear: 2020,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CSSF sanctions search",
        url: "https://www.cssf.lu/en/search/sanction",
        description:
          "Official CSSF document search exposing administrative sanction publications and downloadable decision files.",
      },
    ],
  },
  FSMA: {
    code: "FSMA",
    name: "FSMA Belgium",
    fullName: "Financial Services and Markets Authority",
    country: "Belgium",
    countryCode: "BE",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇧🇪",
    navOrder: 40,
    overviewPath: "/regulators/fsma",
    years: "2008-2026",
    count: 182,
    dataQuality: "Tested live loader",
    note: "Live administrative sanctions and settlement archive loader tested. Public coverage excludes anonymised and non-nominative notices from the FSMA archive.",
    earliestYear: 2008,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FSMA administrative sanctions",
        url: "https://www.fsma.be/fr/reglements-transactionnels",
        description:
          "Official FSMA administrative sanctions and settlement decisions archive.",
      },
    ],
  },
  FMAAT: {
    code: "FMAAT",
    name: "FMA Austria",
    fullName: "Financial Market Authority Austria",
    country: "Austria",
    countryCode: "AT",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇦🇹",
    navOrder: 41,
    overviewPath: "/regulators/fmaat",
    years: "2018-2026",
    count: 118,
    dataQuality: "Tested live loader",
    note:
      "Live FMA Austria sanctions loader tested against the official archive and detail notices. Public coverage excludes anonymous natural-person and descriptor-only management notices.",
    earliestYear: 2018,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FMA Austria sanctions announcements",
        url: "https://www.fma.gv.at/en/category/news-en/sanction/",
        description:
          "Official FMA Austria sanctions and enforcement announcements archive.",
      },
    ],
  },
  CNBCZ: {
    code: "CNBCZ",
    name: "Czech National Bank",
    fullName: "Czech National Bank",
    country: "Czech Republic",
    countryCode: "CZ",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 2,
    stage: "live",
    blogEnabled: false,
    flag: "🇨🇿",
    navOrder: 42,
    overviewPath: "/regulators/cnbcz",
    years: "2009-2026",
    count: 1742,
    dataQuality: "Tested live loader",
    note: "Live final-decisions loader tested against the official dynamic Czech National Bank archive. Daily runs should be constrained to recent years and a PDF-enrichment budget because older decisions often require downloadable files for monetary extraction.",
    earliestYear: 2009,
    latestYear: 2026,
    nativeCurrency: "CZK",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Czech National Bank final decisions and sanctions",
        url: "https://www.cnb.cz/en/supervision-financial-market/cnb-final-decisions/",
        description:
          "Official Czech National Bank supervision and final decisions archive.",
      },
    ],
  },
  CMVM: {
    code: "CMVM",
    name: "CMVM",
    fullName: "Comissão do Mercado de Valores Mobiliários",
    country: "Portugal",
    countryCode: "PT",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 2,
    stage: "live",
    blogEnabled: false,
    flag: "🇵🇹",
    navOrder: 43,
    overviewPath: "/regulators/cmvm",
    years: "1999-2026",
    count: 133,
    dataQuality: "Tested browser search loader",
    note:
      "Live CMVM enforcement-search loader tested against the official portal search and official content pages. Public coverage mixes named decisions with anonymous or bulletin-style contraordenação publications where CMVM does not identify respondents in the headline.",
    earliestYear: 1999,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CMVM sanctions and supervision",
        url: "https://www.cmvm.pt/",
        description:
          "Official CMVM site where supervision, sanctions, and market-enforcement publications are published.",
      },
    ],
  },
  BDP: {
    code: "BDP",
    name: "Banco de Portugal",
    fullName: "Banco de Portugal",
    country: "Portugal",
    countryCode: "PT",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 2,
    stage: "pipeline",
    blogEnabled: false,
    flag: "🇵🇹",
    navOrder: 44,
    overviewPath: "/regulators/bdp",
    years: "Pending",
    count: 0,
    dataQuality: "Validated",
    note: PIPELINE_NOTE,
    earliestYear: 0,
    latestYear: 0,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Banco de Portugal administrative offence proceedings",
        url: "https://www.bportugal.pt/en/page/administrative-offence-proceedings",
        description:
          "Official Banco de Portugal page for administrative offence proceedings and sanctions context.",
      },
    ],
  },
  CYSEC: {
    code: "CYSEC",
    name: "CySEC",
    fullName: "Cyprus Securities and Exchange Commission",
    country: "Cyprus",
    countryCode: "CY",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 2,
    stage: "live",
    blogEnabled: false,
    flag: "🇨🇾",
    navOrder: 45,
    overviewPath: "/regulators/cysec",
    years: "2013-2026",
    count: 1116,
    dataQuality: "Tested live loader",
    note: "Live CySEC board-decisions loader tested against the official decisions archive and linked first-party PDF notices. Public coverage excludes Greek-language duplicate listings when an English equivalent decision is already published.",
    earliestYear: 2013,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CySEC administrative sanctions",
        url: "https://www.cysec.gov.cy/en-GB/public-info/decisions/",
        description:
          "Official CySEC public decisions and sanctions archive.",
      },
    ],
  },
  FISE: {
    code: "FISE",
    name: "Finansinspektionen",
    fullName: "Finansinspektionen",
    country: "Sweden",
    countryCode: "SE",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 2,
    stage: "live",
    blogEnabled: false,
    flag: "🇸🇪",
    navOrder: 46,
    overviewPath: "/regulators/fise",
    years: "2014-2026",
    count: 39,
    dataQuality: "Tested live loader",
    note: "Live sanctions archive loader tested against the official Finansinspektionen sanctions site. Public coverage excludes non-nominative or sector-wide notices where no sanctioned entity is named.",
    earliestYear: 2014,
    latestYear: 2026,
    nativeCurrency: "SEK",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Finansinspektionen sanctions for financial firms",
        url: "https://www.fi.se/en/published/sanctions/financial-firms/",
        description:
          "Official Finansinspektionen sanctions archive for financial firms.",
      },
    ],
  },
  FTDK: {
    code: "FTDK",
    name: "Finanstilsynet Denmark",
    fullName: "Danish Financial Supervisory Authority",
    country: "Denmark",
    countryCode: "DK",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 2,
    stage: "live",
    blogEnabled: false,
    flag: "🇩🇰",
    navOrder: 47,
    overviewPath: "/regulators/ftdk",
    years: "2013-2026",
    count: 51,
    dataQuality: "Tested live loader",
    note: "Live judgments-and-fines loader tested against the official Finanstilsynet decisions archive and first-party JSON search endpoint. Public coverage excludes non-nominative cases when the sanctioned party is not named in the published decision text.",
    earliestYear: 2013,
    latestYear: 2026,
    nativeCurrency: "DKK",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Finanstilsynet inspections and decisions",
        url: "https://www.finanstilsynet.dk/tilsyn/inspektion-og-afgoerelser",
        description:
          "Official Danish FSA inspection findings, decisions, and sanctions archive.",
      },
    ],
  },
  FINFSA: {
    code: "FINFSA",
    name: "FIN-FSA",
    fullName: "Finnish Financial Supervisory Authority",
    country: "Finland",
    countryCode: "FI",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "mixed",
    priorityTier: 2,
    stage: "live",
    blogEnabled: false,
    flag: "🇫🇮",
    navOrder: 48,
    overviewPath: "/regulators/finfsa",
    years: "2013-2026",
    count: 44,
    dataQuality: "Tested live loader",
    note: "Live FIN-FSA sanctions loader tested against the official English press-release archive. Public coverage includes named penalty-payment, public-warning, and conditional-fine cases, and excludes non-nominative grouped natural-person notices.",
    earliestYear: 2013,
    latestYear: 2026,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FIN-FSA sanctions press releases",
        url: "https://www.finanssivalvonta.fi/en/publications-and-press-releases/Press-release/",
        description:
          "Official FIN-FSA press release archive containing penalty-payment, public-warning, and related sanctions announcements.",
      },
    ],
  },
  FTNO: {
    code: "FTNO",
    name: "Finanstilsynet Norway",
    fullName: "Financial Supervisory Authority of Norway",
    country: "Norway",
    countryCode: "NO",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 2,
    stage: "live",
    blogEnabled: false,
    flag: "🇳🇴",
    navOrder: 49,
    overviewPath: "/regulators/ftno",
    years: "2023-2026",
    count: 40,
    dataQuality: "Tested live loader",
    note: "Live market-conduct sanctions loader tested against the official Finanstilsynet Norway pages and linked decision PDFs. Public coverage excludes anonymous violation-penalty notices that do not name the sanctioned party.",
    earliestYear: 2023,
    latestYear: 2026,
    nativeCurrency: "NOK",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "Finanstilsynet Norway market conduct sanctions",
        url: "https://www.finanstilsynet.no/en/supervision/market-conduct/general-information-about-sanctioning-for-infringement-of-the-market-conduct-regulations/",
        description:
          "Official Finanstilsynet Norway sanctions guidance and published market-conduct action context.",
      },
    ],
  },
  MFSA: {
    code: "MFSA",
    name: "MFSA",
    fullName: "Malta Financial Services Authority",
    country: "Malta",
    countryCode: "MT",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 3,
    stage: "live",
    blogEnabled: false,
    flag: "🇲🇹",
    navOrder: 50,
    overviewPath: "/regulators/mfsa",
    years: "2007-2024",
    count: 52,
    dataQuality: "Tested browser archive loader",
    note:
      "Live MFSA browser-cleared enforcement loader tested against the official archive table and current publications. Feed runs in the fragile lane because the public pages sit behind a JavaScript challenge and rely on browser clearance before extraction.",
    earliestYear: 2007,
    latestYear: 2024,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "MFSA enforcement directorate",
        url: "https://www.mfsa.mt/our-work/enforcement/",
        description:
          "Official MFSA enforcement directorate and administrative-action publications.",
      },
      {
        label: "MFSA administrative measures and penalties",
        url: "https://www.mfsa.mt/news/administrative-measures-and-penalties/",
        description:
          "Official MFSA current administrative measures and penalties publications.",
      },
      {
        label: "MFSA administrative measures and penalties archive",
        url: "https://www.mfsa.mt/news/administrative-measures-and-penalties/administrative-measures-and-penalties-archive/",
        description:
          "Official MFSA archive table of administrative measures and penalties.",
      },
    ],
  },
  IVASS: {
    code: "IVASS",
    name: "IVASS",
    fullName: "Institute for the Supervision of Insurance",
    country: "Italy",
    countryCode: "IT",
    region: "Europe",
    strategicBucket: "europe_eea_expansion",
    sourceType: "regulator",
    scrapeMode: "archive",
    priorityTier: 3,
    stage: "live",
    blogEnabled: false,
    flag: "🇮🇹",
    navOrder: 51,
    overviewPath: "/regulators/ivass",
    years: "2018-2024",
    count: 111,
    dataQuality: "Tested annual aggregate workbook loader",
    note: "Official IVASS insurer-level annual sanctions aggregates parsed from annual workbook Table 1 files. Counts represent annual insurer aggregates, not individual case notices.",
    earliestYear: 2018,
    latestYear: 2024,
    nativeCurrency: "EUR",
    defaultCurrency: "EUR",
    coverageStatus: "growing",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "IVASS insurer sanctions archive",
        url: "https://www.ivass.it/consumatori/sanzioni/index.html",
        description:
          "Official IVASS sanctions archive with annual and semiannual insurer-level sanction workbooks.",
      },
    ],
  },
  FINRA: {
    code: "FINRA",
    name: "FINRA",
    fullName: "Financial Industry Regulatory Authority",
    country: "United States",
    countryCode: "US",
    region: "North America",
    strategicBucket: "high_signal_global",
    sourceType: "sro",
    scrapeMode: "search_register",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: false,
    flag: "🇺🇸",
    navOrder: 52,
    overviewPath: "/regulators/finra",
    years: "Pending",
    count: 0,
    dataQuality: "Validated",
    note: PIPELINE_NOTE,
    earliestYear: 0,
    latestYear: 0,
    nativeCurrency: "USD",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FINRA Disciplinary Actions Online",
        url: "https://www.finra.org/rules-guidance/oversight-enforcement/finra-disciplinary-actions-online",
        description:
          "Searchable database of FINRA enforcement actions from 2005 to present. Includes AWCs, settlements, and decisions.",
      },
      {
        label: "Monthly Disciplinary Actions",
        url: "https://www.finra.org/rules-guidance/oversight-enforcement/disciplinary-actions",
        description:
          "Monthly PDF reports of all FINRA disciplinary actions and settlements.",
      },
    ],
  },
  SC: {
    code: "SC",
    name: "SC",
    fullName: "Securities Commission Malaysia",
    country: "Malaysia",
    countryCode: "MY",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "live",
    blogEnabled: false,
    flag: "🇲🇾",
    navOrder: 53,
    overviewPath: "/regulators/sc",
    years: "2022-2026",
    count: 88,
    dataQuality: "Tested live loader",
    note: "Live SC Malaysia enforcement actions archive published from the official yearly administrative-actions tables.",
    earliestYear: 2022,
    latestYear: 2026,
    nativeCurrency: "MYR",
    defaultCurrency: "EUR",
    coverageStatus: "growing",
    maturity: "standard",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "SC Enforcement Actions",
        url: "https://www.sc.com.my/regulation/enforcement/actions",
        description:
          "Official Securities Commission Malaysia enforcement actions and administrative sanctions by year.",
      },
    ],
  },
  "FSC-KR": {
    code: "FSC-KR",
    name: "FSC-KR",
    fullName: "Financial Services Commission (Korea)",
    country: "South Korea",
    countryCode: "KR",
    region: "APAC",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: false,
    flag: "🇰🇷",
    navOrder: 54,
    overviewPath: "/regulators/fsc-kr",
    years: "Pending",
    count: 0,
    dataQuality: "Validated",
    note: PIPELINE_NOTE,
    earliestYear: 0,
    latestYear: 0,
    nativeCurrency: "KRW",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "FSC Press Releases",
        url: "https://www.fsc.go.kr/eng/pr010101/",
        description:
          "Official FSC Korea press releases including administrative sanctions and enforcement actions.",
      },
    ],
  },
  CIMA: {
    code: "CIMA",
    name: "CIMA",
    fullName: "Cayman Islands Monetary Authority",
    country: "Cayman Islands",
    countryCode: "KY",
    region: "Offshore",
    strategicBucket: "offshore_wealth_centres",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: false,
    flag: "🇰🇾",
    navOrder: 55,
    overviewPath: "/regulators/cima",
    years: "Pending",
    count: 0,
    dataQuality: "Validated",
    note: PIPELINE_NOTE,
    earliestYear: 0,
    latestYear: 0,
    nativeCurrency: "KYD",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CIMA Enforcement Notices",
        url: "https://www.cima.ky/enforcement-notices",
        description:
          "Official CIMA enforcement notices and regulatory actions.",
      },
      {
        label: "CIMA Administrative Fines",
        url: "https://www.cima.ky/administrative-fines",
        description:
          "Published administrative fines imposed by CIMA under the Administrative Fines Regulations.",
      },
    ],
  },
  BMA: {
    code: "BMA",
    name: "BMA",
    fullName: "Bermuda Monetary Authority",
    country: "Bermuda",
    countryCode: "BM",
    region: "Offshore",
    strategicBucket: "offshore_wealth_centres",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: false,
    flag: "🇧🇲",
    navOrder: 56,
    overviewPath: "/regulators/bma",
    years: "Pending",
    count: 0,
    dataQuality: "Validated",
    note: PIPELINE_NOTE,
    earliestYear: 0,
    latestYear: 0,
    nativeCurrency: "BMD",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "emerging",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "BMA Enforcement Actions",
        url: "https://www.bma.bm/enforcement-action",
        description:
          "Official BMA list of enforcement actions and disciplinary measures.",
      },
    ],
  },
  CBN: {
    code: "CBN",
    name: "CBN",
    fullName: "Central Bank of Nigeria",
    country: "Nigeria",
    countryCode: "NG",
    region: "Africa",
    strategicBucket: "high_signal_global",
    sourceType: "regulator",
    scrapeMode: "detail_pages",
    priorityTier: 1,
    stage: "pipeline",
    blogEnabled: false,
    flag: "🇳🇬",
    navOrder: 57,
    overviewPath: "/regulators/cbn",
    years: "Pending",
    count: 0,
    dataQuality: "Validated",
    note: PIPELINE_NOTE,
    earliestYear: 0,
    latestYear: 0,
    nativeCurrency: "NGN",
    defaultCurrency: "EUR",
    coverageStatus: "emerging",
    maturity: "limited",
    dashboardEnabled: true,
    officialSources: [
      {
        label: "CBN Press Releases",
        url: "https://www.cbn.gov.ng/Out/PressRelease/PressRelease.asp",
        description:
          "Official CBN press releases including license revocations and enforcement actions.",
      },
    ],
  },
};

function buildRegionCluster(
  code: string,
  coverage: RegulatorCoverageSeed,
): RegulatorCoverage["regionCluster"] {
  if (coverage.region === "UK") return "UK";
  if (code === "FINMA") return "Switzerland";
  if (coverage.region === "Europe" && coverage.country === "European Union") {
    return "EU-level";
  }
  if (coverage.region === "Europe" && coverage.countryCode === "NO") {
    return "EEA";
  }
  if (coverage.region === "Europe") return "EU";
  return "Global";
}

export const REGULATOR_COVERAGE: Record<string, RegulatorCoverage> =
  Object.fromEntries(
    Object.entries(REGULATOR_COVERAGE_SEED).map(([code, coverage]) => [
      code,
      {
        ...coverage,
        regionCluster: buildRegionCluster(code, coverage),
        countryCluster: COUNTRY_CLUSTER_BY_CODE[code] ?? null,
        rolloutPhase: EUROPE_EEA_PHASE_BY_CODE[code] ?? null,
        operationalConfidence: LOW_CONFIDENCE_LIVE_REGULATOR_SET.has(code)
          ? "lower"
          : "standard",
        dashboardEnabled:
          coverage.stage === "live" ? coverage.dashboardEnabled : false,
        automationLevel: SPARSE_SOURCE_REGULATOR_SET.has(code)
          ? "sparse_source"
          : CURATED_ARCHIVE_REGULATOR_SET.has(code)
            ? "curated_archive"
            : "automated",
        feedContract: buildFeedContract(code, coverage),
      },
    ]),
  ) as Record<string, RegulatorCoverage>;

export const REGULATOR_NAV_ITEMS = Object.values(REGULATOR_COVERAGE).sort(
  (left, right) => left.navOrder - right.navOrder,
);

export const REGULATOR_CODES = REGULATOR_NAV_ITEMS.map(
  (coverage) => coverage.code,
);

export const REGULATOR_STAGE_COUNTS = {
  live: REGULATOR_NAV_ITEMS.filter((coverage) => coverage.stage === "live")
    .length,
  internal: REGULATOR_NAV_ITEMS.filter(
    (coverage) => coverage.stage === "internal",
  ).length,
  pipeline: REGULATOR_NAV_ITEMS.filter(
    (coverage) => coverage.stage === "pipeline",
  ).length,
  total: REGULATOR_NAV_ITEMS.length,
} as const;

export const LIVE_REGULATOR_NAV_ITEMS = REGULATOR_NAV_ITEMS.filter(
  (coverage) => coverage.stage === "live",
);

export const INTERNAL_REGULATOR_NAV_ITEMS = REGULATOR_NAV_ITEMS.filter(
  (coverage) => coverage.stage === "internal",
);

export const PIPELINE_REGULATOR_NAV_ITEMS = REGULATOR_NAV_ITEMS.filter(
  (coverage) => coverage.stage === "pipeline",
);

export const EUROPE_EEA_COVERAGE_PHASES: CoverageRoadmapPhase[] = [
  {
    id: "phase-1",
    phase: 1,
    label: "Phase 1",
    title: "Core Europe credibility gap",
    targetWindow: "2026 Q2",
    description:
      "Close the obvious Europe holes first: Italy, Switzerland, France banking completion, Luxembourg, Belgium, and Austria.",
    spotlight: "Italy first",
    codes: [...EUROPE_EEA_PHASE_CODE_MAP[1]],
  },
  {
    id: "phase-2",
    phase: 2,
    label: "Phase 2",
    title: "Europe breadth and regional depth",
    targetWindow: "2026 Q3",
    description:
      "Expand into Portugal, Czechia, Cyprus, and the Nordics to remove the Europe middle-gap.",
    spotlight: "Nordics cluster",
    codes: [...EUROPE_EEA_PHASE_CODE_MAP[2]],
  },
  {
    id: "phase-3",
    phase: 3,
    label: "Phase 3",
    title: "Strategic completeness",
    targetWindow: "2026 Q4",
    description:
      "Round out Europe with Malta and broader Italy remit coverage once the core banking and securities layer is in place.",
    spotlight: "Specialist markets",
    codes: [...EUROPE_EEA_PHASE_CODE_MAP[3]],
  },
];

/**
 * Production-ready regulators with live hubs and dashboards.
 * Use this for navigation, filters, homepage stats, blog articles, and SEO prerendering.
 */
export const PUBLIC_REGULATOR_NAV_ITEMS = LIVE_REGULATOR_NAV_ITEMS;

export const PUBLIC_REGULATOR_CODES = PUBLIC_REGULATOR_NAV_ITEMS.map(
  (coverage) => coverage.code,
);

export const PUBLIC_EU_REGULATOR_CODES = PUBLIC_REGULATOR_NAV_ITEMS.filter(
  (coverage) => coverage.region === "Europe",
).map((coverage) => coverage.code);

export const BLOG_REGULATOR_CODES = PUBLIC_REGULATOR_NAV_ITEMS.filter(
  (coverage) => coverage.blogEnabled,
).map((coverage) => coverage.code);

export const LOWER_CONFIDENCE_LIVE_REGULATOR_CODES =
  LIVE_REGULATOR_NAV_ITEMS.filter(
    (coverage) => coverage.operationalConfidence === "lower",
  ).map((coverage) => coverage.code);

export const DAILY_LIVE_REGULATOR_CODES = LIVE_REGULATOR_NAV_ITEMS.filter(
  (coverage) => coverage.operationalConfidence === "standard",
).map((coverage) => coverage.code);

export const FRAGILE_LIVE_REGULATOR_CODES =
  LOWER_CONFIDENCE_LIVE_REGULATOR_CODES;

export function getRegulatorCoverage(code: string): RegulatorCoverage | null {
  const entry = Object.entries(REGULATOR_COVERAGE).find(
    ([key]) => key.toUpperCase() === code.toUpperCase(),
  );
  return entry ? entry[1] : null;
}

export function isValidRegulatorCode(code: string): boolean {
  const coverage = getRegulatorCoverage(code);
  return Boolean(
    coverage && coverage.stage === "live" && coverage.dashboardEnabled,
  );
}

export function hasPublicRegulatorHub(code: string): boolean {
  const coverage = getRegulatorCoverage(code);
  return Boolean(coverage && coverage.stage === "live");
}

function buildFeedContract(
  code: string,
  coverage: RegulatorCoverageSeed,
): RegulatorFeedContract {
  const cadence = LOW_CONFIDENCE_LIVE_REGULATOR_SET.has(code)
    ? "fragile"
    : "daily";
  const staleAfterDays = cadence === "fragile" ? 10 : 3;

  if (SPARSE_SOURCE_REGULATOR_SET.has(code)) {
    return {
      cadence,
      collectionMethod: "Sparse official public statements feed",
      sourceContractSummary:
        "Official source publishes very few explicit monetary penalties, so low volume can be normal even when the feed is healthy.",
      zeroResultPolicy: "sparse_source",
      staleAfterDays,
      minimumHealthyRecords: Math.max(1, Math.floor(coverage.count * 0.8)),
      operatorAction:
        "Confirm whether the source has published any new monetary penalties before treating unchanged volume as an issue.",
    };
  }

  if (CURATED_ARCHIVE_REGULATOR_SET.has(code)) {
    return {
      cadence,
      collectionMethod: "Curated official-document archive ingestion",
      sourceContractSummary:
        "The public index is challenge-protected, so collection relies on verified official documents and maintained archive manifests.",
      zeroResultPolicy: "investigate",
      staleAfterDays,
      minimumHealthyRecords: Math.max(1, Math.floor(coverage.count * 0.5)),
      operatorAction:
        "Review manifest freshness, confirm new official notices, and widen the maintained archive if publication patterns have changed.",
    };
  }

  return {
    cadence,
    collectionMethod: "Automated official-source scraping",
    sourceContractSummary:
      coverage.stage === "live"
        ? "Collection runs directly from the regulator’s official public source without a maintained manifest."
        : "Official source validated but not yet promoted into the live automation set.",
    zeroResultPolicy: "investigate",
    staleAfterDays,
    minimumHealthyRecords:
      coverage.stage === "live" ? Math.max(1, Math.floor(coverage.count * 0.5)) : 0,
    operatorAction:
      "Investigate selector drift, source changes, or an upstream publication gap before treating the feed as healthy.",
  };
}
