export type UKEnforcementDomain =
  | "financial_conduct"
  | "prudential"
  | "payments"
  | "sanctions"
  | "data_protection"
  | "competition_consumer"
  | "audit_reporting"
  | "pensions";

export interface UKEnforcementOfficialSource {
  label: string;
  url: string;
  description: string;
}

export interface UKEnforcementRegulator {
  code: string;
  name: string;
  fullName: string;
  domain: UKEnforcementDomain;
  stage: "live" | "seeded" | "pipeline";
  sourceWindowNote: string;
  officialSources: UKEnforcementOfficialSource[];
}

export const UK_ENFORCEMENT_DOMAIN_LABELS: Record<UKEnforcementDomain, string> =
  {
    financial_conduct: "Financial Conduct",
    prudential: "Prudential",
    payments: "Payments",
    sanctions: "Sanctions",
    data_protection: "Data Protection",
    competition_consumer: "Competition & Consumer",
    audit_reporting: "Audit & Reporting",
    pensions: "Pensions",
  };

export const UK_ENFORCEMENT_REGULATORS: UKEnforcementRegulator[] = [
  {
    code: "FCA",
    name: "FCA",
    fullName: "Financial Conduct Authority",
    domain: "financial_conduct",
    stage: "live",
    sourceWindowNote:
      "Existing FCA fines and final notices provide the live financial-conduct feed.",
    officialSources: [
      {
        label: "FCA enforcement and fines",
        url: "https://www.fca.org.uk/news/news-stories",
        description: "FCA news, final notices, and published fines.",
      },
    ],
  },
  {
    code: "PRA",
    name: "PRA",
    fullName: "Prudential Regulation Authority",
    domain: "prudential",
    stage: "live",
    sourceWindowNote:
      "Scraped from official Bank of England news API and PRA announcement pages.",
    officialSources: [
      {
        label: "Bank of England PRA news",
        url: "https://www.bankofengland.co.uk/news/prudential-regulation",
        description: "Official PRA enforcement announcements and final notices.",
      },
    ],
  },
  {
    code: "PSR",
    name: "PSR",
    fullName: "Payment Systems Regulator",
    domain: "payments",
    stage: "live",
    sourceWindowNote:
      "Scraped from the official PSR enforcement cases page.",
    officialSources: [
      {
        label: "PSR enforcement cases",
        url: "https://www.psr.org.uk/information-for-firms/enforcement/enforcement-cases/",
        description: "Official PSR enforcement cases and decision notices.",
      },
    ],
  },
  {
    code: "OFSI",
    name: "OFSI",
    fullName: "Office of Financial Sanctions Implementation",
    domain: "sanctions",
    stage: "live",
    sourceWindowNote:
      "Scraped from the official GOV.UK OFSI enforcement collection.",
    officialSources: [
      {
        label: "OFSI enforcement decisions",
        url: "https://www.gov.uk/government/collections/enforcement-of-financial-sanctions",
        description: "Financial sanctions decisions and monetary penalties.",
      },
    ],
  },
  {
    code: "ICO",
    name: "ICO",
    fullName: "Information Commissioner's Office",
    domain: "data_protection",
    stage: "live",
    sourceWindowNote:
      "Scraped from the official ICO enforcement search API for monetary penalties.",
    officialSources: [
      {
        label: "ICO enforcement action",
        url: "https://ico.org.uk/action-weve-taken/enforcement/",
        description: "ICO monetary penalties, enforcement notices, and reprimands.",
      },
    ],
  },
  {
    code: "CMA",
    name: "CMA",
    fullName: "Competition and Markets Authority",
    domain: "competition_consumer",
    stage: "live",
    sourceWindowNote:
      "Scraped from the official GOV.UK search API for CMA fine and penalty publications; older GOV.UK headlines can use case labels rather than exact respondent names.",
    officialSources: [
      {
        label: "CMA cases and decisions",
        url: "https://www.gov.uk/government/organisations/competition-and-markets-authority",
        description: "Official CMA cases, decisions, penalties, and press releases.",
      },
    ],
  },
  {
    code: "FRC",
    name: "FRC",
    fullName: "Financial Reporting Council",
    domain: "audit_reporting",
    stage: "live",
    sourceWindowNote:
      "Scraped from the official FRC enforcement cases table and linked sanctions/outcome pages.",
    officialSources: [
      {
        label: "FRC enforcement cases",
        url: "https://www.frc.org.uk/library/enforcement/enforcement-cases/",
        description: "FRC audit, accountancy, and actuarial enforcement cases.",
      },
    ],
  },
  {
    code: "TPR",
    name: "TPR",
    fullName: "The Pensions Regulator",
    domain: "pensions",
    stage: "live",
    sourceWindowNote:
      "Scraped from the official TPR penalty notice tables; broader intervention and determination reports stay excluded until fine-only amount classification is reliable.",
    officialSources: [
      {
        label: "TPR enforcement activity",
        url: "https://www.thepensionsregulator.gov.uk/en/document-library/enforcement-activity",
        description: "Official TPR enforcement reports and notices.",
      },
    ],
  },
];

export const UK_ENFORCEMENT_REGULATOR_CODES = UK_ENFORCEMENT_REGULATORS.map(
  (regulator) => regulator.code,
);

export const UK_ENFORCEMENT_DOMAIN_OPTIONS = Object.entries(
  UK_ENFORCEMENT_DOMAIN_LABELS,
).map(([value, label]) => ({
  value: value as UKEnforcementDomain,
  label,
}));

export function getUKEnforcementRegulator(code: string) {
  const normalized = code.trim().toUpperCase();
  return UK_ENFORCEMENT_REGULATORS.find(
    (regulator) => regulator.code === normalized,
  );
}
