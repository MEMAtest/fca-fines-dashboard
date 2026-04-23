import type { UKEnforcementDomain } from "../../../src/data/ukEnforcement.js";

export interface UKEnforcementSeedRecord {
  regulator: string;
  regulatorFullName: string;
  sourceDomain: UKEnforcementDomain;
  firmIndividual: string;
  firmCategory: string | null;
  amount: number | null;
  currency: string;
  dateIssued: string;
  breachType: string;
  breachCategories: string[];
  summary: string;
  noticeUrl: string;
  sourceUrl: string;
  sourceWindowNote: string;
  aliases?: string[];
}

export const UK_ENFORCEMENT_SEED_RECORDS: UKEnforcementSeedRecord[] = [
  {
    regulator: "PRA",
    regulatorFullName: "Prudential Regulation Authority",
    sourceDomain: "prudential",
    firmIndividual: "U K Insurance Limited",
    firmCategory: "Insurer",
    amount: 10625000,
    currency: "GBP",
    dateIssued: "2026-03-11",
    breachType: "Prudential reporting and controls",
    breachCategories: ["PRUDENTIAL_REPORTING", "SYSTEMS_CONTROLS"],
    summary:
      "PRA imposed a GBP 10,625,000 penalty on U K Insurance Limited for Solvency II balance-sheet miscalculation and related control failings.",
    noticeUrl:
      "https://www.bankofengland.co.uk/news/2026/march/pra-fines-uk-insurance-limited",
    sourceUrl:
      "https://www.bankofengland.co.uk/news/2026/march/pra-fines-uk-insurance-limited",
    sourceWindowNote: "Official PRA announcement seeded pending archive loader.",
    aliases: ["Direct Line Group", "Aviva"],
  },
  {
    regulator: "PRA",
    regulatorFullName: "Prudential Regulation Authority",
    sourceDomain: "prudential",
    firmIndividual: "The Bank of London Group Limited and Oplyse Holdings Limited",
    firmCategory: "Banking group",
    amount: 2000000,
    currency: "GBP",
    dateIssued: "2026-03-24",
    breachType: "Integrity, capital, and open cooperation failures",
    breachCategories: ["PRUDENTIAL_CAPITAL", "INTEGRITY", "REPORTING"],
    summary:
      "PRA fined The Bank of London Group Limited and Oplyse Holdings Limited GBP 2,000,000 for misleading the PRA over capital positions and related prudential failings.",
    noticeUrl:
      "https://www.bankofengland.co.uk/news/2026/march/pra-fines-bol-and-oplyse-holdings",
    sourceUrl:
      "https://www.bankofengland.co.uk/news/2026/march/pra-fines-bol-and-oplyse-holdings",
    sourceWindowNote: "Official PRA announcement seeded pending archive loader.",
    aliases: ["Bank of London", "Oplyse", "The Bank of London"],
  },
  {
    regulator: "PSR",
    regulatorFullName: "Payment Systems Regulator",
    sourceDomain: "payments",
    firmIndividual: "Bank of Ireland UK plc",
    firmCategory: "Payment service provider",
    amount: 3779300,
    currency: "GBP",
    dateIssued: "2026-02-19",
    breachType: "Confirmation of Payee implementation delay",
    breachCategories: ["PAYMENTS", "FRAUD_CONTROLS", "CONSUMER_PROTECTION"],
    summary:
      "PSR fined Bank of Ireland UK plc GBP 3,779,300 for failing to implement Confirmation of Payee send requirements by the required deadline.",
    noticeUrl:
      "https://www.psr.org.uk/news-and-updates/latest-news/news/psr-fines-bank-of-ireland-uk-over-37m-for-failing-to-implement-confirmation-of-payee/",
    sourceUrl:
      "https://www.psr.org.uk/information-for-firms/enforcement/enforcement-cases/",
    sourceWindowNote: "Official PSR case seeded pending case-page loader.",
    aliases: ["BOIUK", "Bank of Ireland UK"],
  },
  {
    regulator: "OFSI",
    regulatorFullName: "Office of Financial Sanctions Implementation",
    sourceDomain: "sanctions",
    firmIndividual: "Colorcon Limited",
    firmCategory: "UK registered company",
    amount: 152750,
    currency: "GBP",
    dateIssued: "2025-09-30",
    breachType: "Russia financial sanctions breach",
    breachCategories: ["SANCTIONS", "RUSSIA_SANCTIONS"],
    summary:
      "OFSI imposed a GBP 152,750 monetary penalty on Colorcon Limited for breaches of the Russia financial sanctions regime.",
    noticeUrl:
      "https://www.gov.uk/government/publications/imposition-of-monetary-penalty-colorcon-limited",
    sourceUrl:
      "https://www.gov.uk/government/collections/enforcement-of-financial-sanctions",
    sourceWindowNote: "Official GOV.UK OFSI penalty seeded pending collection loader.",
  },
  {
    regulator: "OFSI",
    regulatorFullName: "Office of Financial Sanctions Implementation",
    sourceDomain: "sanctions",
    firmIndividual: "Wise Payments Limited",
    firmCategory: "Payments firm",
    amount: null,
    currency: "GBP",
    dateIssued: "2023-08-31",
    breachType: "Financial sanctions disclosure",
    breachCategories: ["SANCTIONS", "RUSSIA_SANCTIONS", "DISCLOSURE"],
    summary:
      "OFSI published a disclosure naming Wise Payments Limited for a breach of regulation 12 of the Russia sanctions regulations; no monetary penalty was imposed.",
    noticeUrl:
      "https://www.gov.uk/government/publications/disclosure-notice-31-august-2023",
    sourceUrl:
      "https://www.gov.uk/government/collections/enforcement-of-financial-sanctions",
    sourceWindowNote: "Official GOV.UK OFSI disclosure seeded pending collection loader.",
    aliases: ["Wise", "Wise Payments", "TransferWise", "Kristo Kaarmann", "Kristo Käärmann"],
  },
  {
    regulator: "ICO",
    regulatorFullName: "Information Commissioner's Office",
    sourceDomain: "data_protection",
    firmIndividual: "Advanced Computer Software Group Limited",
    firmCategory: "Software provider",
    amount: 3076320,
    currency: "GBP",
    dateIssued: "2025-03-26",
    breachType: "Data security and ransomware controls",
    breachCategories: ["DATA_PROTECTION", "CYBER_SECURITY", "SYSTEMS_CONTROLS"],
    summary:
      "ICO fined Advanced Computer Software Group Limited GBP 3,076,320 for security failings linked to a 2022 ransomware incident.",
    noticeUrl:
      "https://ico.org.uk/action-weve-taken/enforcement/2025/03/advanced-computer-software-group-limited/",
    sourceUrl: "https://ico.org.uk/action-weve-taken/enforcement/",
    sourceWindowNote: "Official ICO enforcement page seeded pending search loader.",
    aliases: ["Advanced", "Advanced Computer Software"],
  },
  {
    regulator: "CMA",
    regulatorFullName: "Competition and Markets Authority",
    sourceDomain: "competition_consumer",
    firmIndividual: "Euro Car Parks Limited",
    firmCategory: "Consumer-facing business",
    amount: 473000,
    currency: "GBP",
    dateIssued: "2026-02-13",
    breachType: "Failure to comply with information notice",
    breachCategories: ["CONSUMER_PROTECTION", "INFORMATION_NOTICE"],
    summary:
      "CMA imposed a GBP 473,000 penalty on Euro Car Parks Limited for failing to comply with a legal information notice.",
    noticeUrl:
      "https://www.gov.uk/government/publications/euro-car-parks-ltd-fixed-penalty",
    sourceUrl:
      "https://www.gov.uk/government/news/cma-fines-euro-car-parks-473k-for-failure-to-comply-with-legal-information-notice",
    sourceWindowNote: "Official GOV.UK CMA penalty seeded pending decisions loader.",
  },
  {
    regulator: "FRC",
    regulatorFullName: "Financial Reporting Council",
    sourceDomain: "audit_reporting",
    firmIndividual: "KPMG LLP",
    firmCategory: "Audit firm",
    amount: 14400000,
    currency: "GBP",
    dateIssued: "2022-07-25",
    breachType: "Misleading information in audit-quality reviews",
    breachCategories: ["AUDIT", "MISLEADING_INFORMATION", "GOVERNANCE"],
    summary:
      "FRC announced sanctions against KPMG LLP including a GBP 14,400,000 fine after reduction for self-reporting, cooperation, and admissions.",
    noticeUrl:
      "https://www.frc.org.uk/news-and-events/news/2022/07/sanctions-against-kpmg-and-others-in-connection-with-regenersis-carillion-audits/",
    sourceUrl: "https://www.frc.org.uk/library/enforcement/enforcement-cases/",
    sourceWindowNote: "Official FRC outcome seeded pending sanctions loader.",
    aliases: ["KPMG", "KPMG UK", "Carillion", "Regenersis"],
  },
  {
    regulator: "TPR",
    regulatorFullName: "The Pensions Regulator",
    sourceDomain: "pensions",
    firmIndividual: "NOW: Pensions Ltd and NOW: Pension Trustee Ltd",
    firmCategory: "Master trust provider and trustee",
    amount: 100000,
    currency: "GBP",
    dateIssued: "2025-07-18",
    breachType: "Failure to report significant events and breaches of law",
    breachCategories: ["PENSIONS", "REPORTING", "GOVERNANCE"],
    summary:
      "TPR issued penalties totalling GBP 100,000 to NOW: Pensions Ltd and NOW: Pension Trustee Ltd for reporting failures linked to statutory communications.",
    noticeUrl:
      "https://www.thepensionsregulator.gov.uk/en/media-hub/press-releases/2025-press-releases/master-trust-and-its-trustee-handed-100k-penalty",
    sourceUrl:
      "https://www.thepensionsregulator.gov.uk/document-library/enforcement-activity/regulatory-intervention-reports/now-pensions-regulatory-intervention-report",
    sourceWindowNote: "Official TPR intervention report seeded pending enforcement-report loader.",
    aliases: ["NOW Pensions", "NOW: Pensions", "NPL", "NPTL"],
  },
];
