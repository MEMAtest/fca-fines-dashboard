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
      "Official FCA fines, final notices, public censures, prohibitions, and restrictions.",
    officialSources: [
      {
        label: "FCA final notices and enforcement press releases",
        url: "https://www.fca.org.uk/publications/search-results?category=final%20notices",
        description: "FCA final notices, decision notices, supervisory notices, public censures, prohibitions, and linked enforcement announcements.",
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
      "Official Bank of England PRA enforcement actions and linked notices.",
    officialSources: [
      {
        label: "Bank of England enforcement actions",
        url: "https://www.bankofengland.co.uk/prudential-regulation/the-bank-of-england-enforcement",
        description: "Official PRA enforcement actions, financial penalties, public censures, and notices.",
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
      "Official PSR enforcement cases and decision notices.",
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
      "Official GOV.UK OFSI financial sanctions enforcement notices.",
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
      "Official ICO monetary penalties, enforcement notices, and reprimands.",
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
      "Official CMA cases, decisions, penalties, and enforcement announcements.",
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
      "Official FRC enforcement cases, sanctions, and outcome notices.",
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
      "Official TPR penalty notices and enforcement publications.",
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
