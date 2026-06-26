/**
 * Editorial Calendar Config — Machine-readable version of docs/editorial-calendar.md
 *
 * 24 articles, Jun–Nov 2026, 4-pillar rotation:
 *   Week 1: Recurring  (monthly FCA tracker)
 *   Week 2: Thematic   (deep-dive analysis)
 *   Week 3: Persona    (sector / practitioner)
 *   Week 4: Comparison / Forensic
 */

export type ArticleType = "monthly" | "thematic" | "persona" | "comparison" | "forensic";

export type MonthlyConfig    = { type: "monthly"; year: number; month: number };
export type ThematicConfig   = { type: "thematic"; keywords: string[]; regulators?: string[]; yearsSince?: number };
export type PersonaConfig    = { type: "persona"; firmCategory: string; sectorKeywords: string[] };
export type ComparisonConfig = { type: "comparison"; regulators: [string, string]; since?: number };
export type ForensicConfig   = {
  type: "forensic";
  scope: "biggest-fine" | "biggest-aml" | "biggest-greenwashing";
  dateRange: [string, string];
  breachKeywords?: string[];
};

export type DataConfig = MonthlyConfig | ThematicConfig | PersonaConfig | ComparisonConfig | ForensicConfig;

export interface CalendarEntry {
  slug: string;
  type: ArticleType;
  dateISO: string;
  titleGuidance: string;
  category: string;
  dataConfig: DataConfig;
  /** If set, engine checks data before attempting generation and skips if not met. */
  prerequisite?: string;
}

export const CALENDAR_ENTRIES: CalendarEntry[] = [
  // ── June 2026 ──────────────────────────────────────────────────────────────
  {
    slug: "fca-fines-april-2026",
    type: "monthly",
    dateISO: "2026-06-01",
    titleGuidance: "FCA enforcement April 2026 — complete monthly tracker of all actions, fines and supervisory measures",
    category: "FCA Fines 2026",
    dataConfig: { type: "monthly", year: 2026, month: 4 },
  },
  {
    slug: "dora-enforcement-18-months",
    type: "thematic",
    dateISO: "2026-06-09",
    titleGuidance: "DORA at 18 months: why enforcement hasn't started yet and what's coming for financial firms",
    category: "Thematic Analysis",
    dataConfig: {
      type: "thematic",
      keywords: ["DORA", "digital operational resilience", "ICT", "operational resilience", "third-party"],
      regulators: ["ESMA", "ECB", "BaFin", "AMF", "FCA"],
      yearsSince: 3,
    },
  },
  {
    slug: "payments-firms-fca-aml-enforcement",
    type: "persona",
    dateISO: "2026-06-16",
    titleGuidance: "FCA payments firm enforcement: why it's permissions not fines — and what payments and e-money firms need to know",
    category: "Sector Analysis",
    dataConfig: {
      type: "persona",
      firmCategory: "Payments firm",
      sectorKeywords: ["payment", "e-money", "safeguarding", "PSR", "EMI", "electronic money"],
    },
  },
  {
    slug: "fca-vs-sec-enforcement-differences",
    type: "comparison",
    dateISO: "2026-06-23",
    titleGuidance: "FCA vs SEC enforcement: 5 structural differences that actually matter for compliance teams",
    category: "Thematic Analysis",
    dataConfig: { type: "comparison", regulators: ["FCA", "SEC"], since: 2022 },
  },

  // ── July 2026 ───────────────────────────────────────────────────────────────
  {
    slug: "fca-fines-may-2026",
    type: "monthly",
    dateISO: "2026-07-01",
    titleGuidance: "FCA enforcement May 2026 — complete monthly tracker with all fines, bans and supervisory actions",
    category: "FCA Fines 2026",
    dataConfig: { type: "monthly", year: 2026, month: 5 },
  },
  {
    slug: "consumer-duty-three-years-enforcement",
    type: "thematic",
    dateISO: "2026-07-14",
    titleGuidance: "Consumer Duty three years in: why the FCA hasn't fined anyone yet — and what changes in the next 12 months",
    category: "Thematic Analysis",
    dataConfig: {
      type: "thematic",
      keywords: ["consumer duty", "consumer protection", "fair value", "suitability", "conduct of business"],
      regulators: ["FCA"],
      yearsSince: 3,
    },
  },
  {
    slug: "wealth-managers-consumer-duty-enforcement",
    type: "persona",
    dateISO: "2026-07-21",
    titleGuidance: "Wealth managers and Consumer Duty: why this sector is at the front of the FCA enforcement queue",
    category: "Sector Analysis",
    dataConfig: {
      type: "persona",
      firmCategory: "Investment firm",
      sectorKeywords: ["wealth", "investment management", "advisory", "discretionary", "consumer duty", "suitability", "portfolio"],
    },
  },
  {
    slug: "biggest-fine-h1-2026-forensic",
    type: "forensic",
    dateISO: "2026-07-28",
    titleGuidance: "Anatomy of H1 2026's biggest fine — timeline, regulator findings, penalty methodology and sector implications",
    category: "Case Study",
    dataConfig: { type: "forensic", scope: "biggest-fine", dateRange: ["2026-01-01", "2026-06-30"] },
    prerequisite: "H1 2026 enforcement data",
  },

  // ── August 2026 ─────────────────────────────────────────────────────────────
  {
    slug: "h1-2026-enforcement-halftime",
    type: "thematic",
    dateISO: "2026-08-04",
    titleGuidance: "H1 2026 global enforcement halftime: 10 things we learned from the first six months across 30+ regulators",
    category: "Trends Analysis",
    dataConfig: {
      type: "thematic",
      keywords: ["enforcement", "fine", "penalty", "ban", "censure", "prohibition"],
      yearsSince: 1,
    },
    prerequisite: "H1 2026 enforcement data",
  },
  {
    slug: "sanctions-enforcement-ofsi-ofac-eu",
    type: "comparison",
    dateISO: "2026-08-11",
    titleGuidance: "OFSI, OFAC and EU sanctions enforcement: a side-by-side compliance map for UK and international firms",
    category: "Thematic Analysis",
    dataConfig: { type: "comparison", regulators: ["FCA", "ESMA"], since: 2022 },
  },
  {
    slug: "crypto-firms-global-enforcement-mica-fca-mas",
    type: "persona",
    dateISO: "2026-08-18",
    titleGuidance: "Crypto firms under MiCA, FCA and MAS: what enforcement looks like now and what's coming",
    category: "Sector Analysis",
    dataConfig: {
      type: "persona",
      firmCategory: "Investment firm",
      sectorKeywords: ["crypto", "digital asset", "MiCA", "virtual asset", "stablecoin", "DeFi", "token"],
    },
  },
  {
    slug: "bafin-vs-fca-uk-german-firms",
    type: "comparison",
    dateISO: "2026-08-25",
    titleGuidance: "BaFin vs FCA: what UK firms with German operations need to know about enforcement differences and dual-regulation risk",
    category: "Regional Benchmark",
    dataConfig: { type: "comparison", regulators: ["FCA", "BaFin"], since: 2022 },
  },

  // ── September 2026 ──────────────────────────────────────────────────────────
  {
    slug: "fca-fines-july-2026",
    type: "monthly",
    dateISO: "2026-09-01",
    titleGuidance: "FCA fines and enforcement July 2026 — complete monthly tracker",
    category: "FCA Fines 2026",
    dataConfig: { type: "monthly", year: 2026, month: 7 },
    prerequisite: "July 2026 FCA enforcement data",
  },
  {
    slug: "greenwashing-enforcement-2026",
    type: "thematic",
    dateISO: "2026-09-09",
    titleGuidance: "Greenwashing enforcement in 2026: which regulators are actually fining, for what, and how large",
    category: "Thematic Analysis",
    dataConfig: {
      type: "thematic",
      keywords: ["greenwashing", "ESG", "sustainable finance", "green", "climate", "SDR", "SFDR", "net zero"],
      regulators: ["FCA", "ESMA", "SEC", "ASIC", "MAS"],
      yearsSince: 3,
    },
  },
  {
    slug: "insurance-conduct-failures-2026",
    type: "persona",
    dateISO: "2026-09-16",
    titleGuidance: "Insurance sector conduct failures in 2026 enforcement data: patterns, key cases and compliance implications",
    category: "Sector Analysis",
    dataConfig: {
      type: "persona",
      firmCategory: "Consumer credit firm",
      sectorKeywords: ["insurance", "insurer", "broker", "claims handling", "premium finance", "conduct", "GI", "general insurance"],
    },
  },
  {
    slug: "biggest-greenwashing-fine-2026-forensic",
    type: "forensic",
    dateISO: "2026-09-23",
    titleGuidance: "Anatomy of 2026's biggest greenwashing fine — what the regulator found, how the penalty was set, and what ESG teams must do",
    category: "Case Study",
    dataConfig: {
      type: "forensic",
      scope: "biggest-greenwashing",
      dateRange: ["2025-01-01", "2026-09-01"],
      breachKeywords: ["greenwashing", "ESG", "sustainable", "green", "climate"],
    },
    prerequisite: "A greenwashing enforcement action must exist in the database",
  },

  // ── October 2026 ────────────────────────────────────────────────────────────
  {
    slug: "fca-fines-august-2026",
    type: "monthly",
    dateISO: "2026-10-01",
    titleGuidance: "FCA fines and enforcement August 2026 — complete monthly tracker",
    category: "FCA Fines 2026",
    dataConfig: { type: "monthly", year: 2026, month: 8 },
    prerequisite: "August 2026 FCA enforcement data",
  },
  {
    slug: "whistleblower-driven-enforcement-global",
    type: "thematic",
    dateISO: "2026-10-07",
    titleGuidance: "Whistleblower-driven enforcement across SEC, FCA and beyond: from protected disclosure to final notice",
    category: "Thematic Analysis",
    dataConfig: {
      type: "thematic",
      keywords: ["whistleblow", "whistleblower", "protected disclosure", "informant", "tip-off", "FINRA"],
      regulators: ["SEC", "FCA", "CFTC", "FINRA"],
      yearsSince: 4,
    },
  },
  {
    slug: "investment-firms-market-abuse-global",
    type: "persona",
    dateISO: "2026-10-14",
    titleGuidance: "Investment firms and market abuse enforcement across FCA, SEC, AMF and SFC — patterns, key cases, risk indicators",
    category: "Sector Analysis",
    dataConfig: {
      type: "persona",
      firmCategory: "Investment firm",
      sectorKeywords: ["market abuse", "insider dealing", "insider trading", "manipulation", "front running", "spoofing", "layering"],
    },
  },
  {
    slug: "finma-vs-mas-wealth-enforcement",
    type: "comparison",
    dateISO: "2026-10-21",
    titleGuidance: "FINMA vs MAS: wealth management and private banking enforcement compared — what international firms need to know",
    category: "Regional Benchmark",
    dataConfig: { type: "comparison", regulators: ["FINMA", "MAS"], since: 2021 },
  },

  // ── November 2026 ───────────────────────────────────────────────────────────
  {
    slug: "fca-fines-september-2026",
    type: "monthly",
    dateISO: "2026-11-03",
    titleGuidance: "FCA fines and enforcement September 2026 — complete monthly tracker",
    category: "FCA Fines 2026",
    dataConfig: { type: "monthly", year: 2026, month: 9 },
    prerequisite: "September 2026 FCA enforcement data",
  },
  {
    slug: "ai-automated-decisioning-enforcement",
    type: "thematic",
    dateISO: "2026-11-10",
    titleGuidance: "AI and automated decisioning: the first wave of global enforcement — what regulators are targeting and why",
    category: "Thematic Analysis",
    dataConfig: {
      type: "thematic",
      keywords: ["AI", "artificial intelligence", "algorithm", "automated decision", "model risk", "robo-advice", "machine learning"],
      regulators: ["FCA", "SEC", "ESMA", "MAS", "ASIC"],
      yearsSince: 3,
    },
  },
  {
    slug: "banking-operational-resilience-dora-enforcement",
    type: "persona",
    dateISO: "2026-11-17",
    titleGuidance: "Banks and operational resilience in the DORA era: what enforcement data tells boards and CROs",
    category: "Sector Analysis",
    dataConfig: {
      type: "persona",
      firmCategory: "Bank",
      sectorKeywords: ["operational resilience", "DORA", "ICT", "third party", "outsourcing", "systems and controls", "IT failure"],
    },
  },
  {
    slug: "biggest-aml-fine-2026-forensic",
    type: "forensic",
    dateISO: "2026-11-24",
    titleGuidance: "Anatomy of 2026's largest AML fine — the regulator's findings, how the penalty was calculated, and the compliance lessons",
    category: "Case Study",
    dataConfig: {
      type: "forensic",
      scope: "biggest-aml",
      dateRange: ["2026-01-01", "2026-11-01"],
      breachKeywords: ["AML", "money laundering", "anti-money", "KYC", "financial crime"],
    },
    prerequisite: "An AML enforcement action for 2026 must exist in the database",
  },
];

/** Return calendar entries whose slugs are not yet in blogArticles.ts */
export function getMissingEntries(existingSlugs: Set<string>): CalendarEntry[] {
  return CALENDAR_ENTRIES.filter(e => !existingSlugs.has(e.slug));
}

/** Return calendar entries due within N days from now */
export function getEntriesDueWithin(days: number, existingSlugs: Set<string>): CalendarEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  return getMissingEntries(existingSlugs).filter(e => e.dateISO <= cutoffISO);
}
