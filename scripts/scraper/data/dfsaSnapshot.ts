/**
 * Curated official archive manifest for DFSA enforcement records.
 * The DFSA archive page is challenge-protected in this environment, so discovery is
 * maintained here from verified official decision notices and DFSA publications.
 */
export interface ArchiveSeedRecord {
  dateIssued: string;
  firmIndividual: string;
  amount: number | null;
  currency: string;
  title: string;
  summary: string;
  sourceUrl: string;
  officialDocumentUrl?: string;
  breachType: string;
  breachCategories: string[];
}

export type SnapshotSeedRecord = ArchiveSeedRecord;

export const DFSA_SNAPSHOT_RECORDS: ArchiveSeedRecord[] = [
  {
    dateIssued: "2026-02-06",
    firmIndividual: "Ark Capital Management (Dubai) Limited",
    amount: 504000,
    currency: "USD",
    title:
      "The DFSA fines Ark Capital Management (Dubai) Limited USD 504,000 for market abuse systems and change of control reporting failings",
    summary:
      "The DFSA imposed a fine of USD 504,000 on Ark Capital Management (Dubai) Limited for inadequate market abuse systems and controls and for failing to notify the DFSA of a proposed change in control.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-ark-capital-management-dubai-limited-usd-504000-market-abuse-systems-and-change-control-reporting-failings",
    breachType: "Market abuse systems and change of control reporting failures",
    breachCategories: ["MARKET_ABUSE", "CONTROLS", "REPORTING"],
  },
  {
    dateIssued: "2026-02-02",
    firmIndividual: "Ed Broking (MENA) Limited",
    amount: 455176,
    currency: "USD",
    title:
      "The DFSA fines reinsurance broker USD 455,176 for engaging in misleading and deceptive conduct",
    summary:
      "The DFSA imposed a fine of USD 455,176 on Ed Broking (MENA) Limited for misleading cedent insurers and reinsurers, using altered documents, and failing to ensure communications were clear, fair, and not misleading.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-reinsurance-broker-usd-455176-engaging-misleading-and-deceptive-conduct",
    breachType: "Misleading and deceptive conduct in reinsurance broking",
    breachCategories: ["MISLEADING_CONDUCT", "DISCLOSURE", "CONTROLS"],
  },
  {
    dateIssued: "2025-02-10",
    firmIndividual: "Al Ramz Capital LLC",
    amount: 25000,
    currency: "USD",
    title:
      "Financial Markets Tribunal upholds the DFSA’s decision to impose a fine on Al Ramz Capital LLC of USD 25,000 for failing to immediately report suspicious transactions on NASDAQ Dubai",
    summary:
      "The Financial Markets Tribunal upheld the DFSA’s decision to impose a USD 25,000 fine on Al Ramz Capital LLC for failing to immediately report suspicious transactions that it executed on Nasdaq Dubai on behalf of a client.",
    sourceUrl:
      "https://www.dfsa.ae/news/financial-markets-tribunal-upholds-dfsas-decision-impose-fine-al-ramz-capital-llc-usd-25000-failing-immediately-report-suspiciou",
    breachType: "Failure to report suspicious transactions",
    breachCategories: ["MARKET_ABUSE", "REPORTING", "SURVEILLANCE"],
  },
  {
    dateIssued: "2025-01-24",
    firmIndividual: "Al Ramz Capital LLC",
    amount: 25000,
    currency: "USD",
    title:
      "DFSA decision to fine Al Ramz Capital LLC for failure to report suspicious transactions referred to the Financial Markets Tribunal",
    summary:
      "The DFSA published a Decision Notice against Al Ramz Capital LLC recording that it failed to report suspicious transactions and imposing a provisional financial penalty of USD 25,000.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-decision-fine-al-ramz-capital-llc-failure-report-suspicious-transactions-referred-financial-markets-tribunal",
    breachType: "Failure to report suspicious transactions",
    breachCategories: ["MARKET_ABUSE", "REPORTING", "SURVEILLANCE"],
  },
  {
    dateIssued: "2024-10-03",
    firmIndividual: "OCS International Finance Limited",
    amount: 720905,
    currency: "USD",
    title:
      "DFSA investigation reveals OCS International Finance Limited mismanaged USD 46 million of client funds and imposes fine on Firm and its CEO",
    summary:
      "The DFSA imposed a fine of USD 720,905 on OCS International Finance Limited after finding it mismanaged client money, misled a bank and the DFSA, and obstructed the investigation.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-investigation-reveals-ocs-international-finance-limited-mismanaged-usd-46-million-client-funds-and-imposes-fine-firm-and-it",
    breachType: "Client money mismanagement and misleading conduct",
    breachCategories: ["CLIENT_MONEY", "MISLEADING_CONDUCT", "CONTROLS"],
  },
  {
    dateIssued: "2024-10-03",
    firmIndividual: "Mr Christian Franz Thurner",
    amount: 186003,
    currency: "USD",
    title:
      "DFSA investigation reveals OCS International Finance Limited mismanaged USD 46 million of client funds and imposes fine on Firm and its CEO",
    summary:
      "The DFSA imposed a fine of USD 186,003 on Mr Christian Franz Thurner and prohibited him from holding executive or employee positions in regulated entities after finding he knowingly participated in OCS contraventions and obstructed the investigation.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-investigation-reveals-ocs-international-finance-limited-mismanaged-usd-46-million-client-funds-and-imposes-fine-firm-and-it",
    breachType: "Knowing participation in firm contraventions and obstruction",
    breachCategories: [
      "OBSTRUCTION",
      "MISLEADING_CONDUCT",
      "INDIVIDUAL_ACCOUNTABILITY",
    ],
  },
  {
    dateIssued: "2024-06-19",
    firmIndividual: "Mr Daniyar Japarkulov",
    amount: 140000,
    currency: "USD",
    title:
      "The DFSA fines the CEO of Symphony Services Limited and prohibits him from future DIFC roles",
    summary:
      "The DFSA imposed a fine of USD 140,000 on Mr Daniyar Japarkulov for being knowingly concerned in Symphony Services Limited contraventions, including misleading the DFSA and obstructing an inspection, and imposed a prohibition and restriction order.",
    sourceUrl:
      "https://365343652932-web-server-storage.s3.eu-west-2.amazonaws.com/files/5317/2129/3317/Mr_Daniyar_Japarkulov_Decision_Notice_Redacted.pdf",
    officialDocumentUrl:
      "https://365343652932-web-server-storage.s3.eu-west-2.amazonaws.com/files/5317/2129/3317/Mr_Daniyar_Japarkulov_Decision_Notice_Redacted.pdf",
    breachType:
      "Knowingly concerned in false or misleading information and obstruction contraventions",
    breachCategories: [
      "MISLEADING_CONDUCT",
      "OBSTRUCTION",
      "INDIVIDUAL_ACCOUNTABILITY",
    ],
  },
  {
    dateIssued: "2024-06-07",
    firmIndividual: "Symphony Services Limited",
    amount: 210000,
    currency: "USD",
    title:
      "The DFSA fines Symphony Services Limited and withdraws its DNFBP registration",
    summary:
      "The DFSA imposed a USD 210,000 fine on Symphony Services Limited for creating and backdating compliance records, providing false or misleading information to the DFSA, and obstructing a DFSA inspection, and withdrew its DNFBP registration.",
    sourceUrl:
      "https://365343652932-web-server-storage.s3.eu-west-2.amazonaws.com/files/2817/2129/3216/SSL_Decision_Notice_Redacted.pdf",
    officialDocumentUrl:
      "https://365343652932-web-server-storage.s3.eu-west-2.amazonaws.com/files/2817/2129/3216/SSL_Decision_Notice_Redacted.pdf",
    breachType:
      "False or misleading information and obstruction of the regulator",
    breachCategories: ["MISLEADING_CONDUCT", "OBSTRUCTION", "AML"],
  },
  {
    dateIssued: "2024-05-16",
    firmIndividual: "Sarwa Digital Wealth Limited",
    amount: 191100,
    currency: "USD",
    title:
      "The DFSA fines Sarwa Digital Wealth Limited for unauthorised offering and misleading investor communications",
    summary:
      "The DFSA imposed a fine of USD 191,100 on Sarwa Digital Wealth Limited for offering securities from the DIFC without an approved prospectus and for withholding adverse financial information while giving investors a misleading picture of performance and prospects.",
    sourceUrl:
      "https://365343652932-web-server-storage.s3.eu-west-2.amazonaws.com/files/9617/1637/3664/Sarwa_DIFC_Decision_Notice_-_redacted.pdf",
    officialDocumentUrl:
      "https://365343652932-web-server-storage.s3.eu-west-2.amazonaws.com/files/9617/1637/3664/Sarwa_DIFC_Decision_Notice_-_redacted.pdf",
    breachType:
      "Unauthorised offering of securities and misleading investor disclosures",
    breachCategories: [
      "UNAUTHORISED_ACTIVITY",
      "DISCLOSURE",
      "MISLEADING_CONDUCT",
    ],
  },
  {
    dateIssued: "2024-11-05",
    firmIndividual: "Vedas International Marketing Management",
    amount: 100000,
    currency: "USD",
    title:
      "The DFSA fines Vedas International Marketing Management for Unauthorised and Misleading Financial Promotions",
    summary:
      "The DFSA imposed a financial penalty of USD 100,000 on Vedas International Marketing Management for unauthorised financial promotions and misleading statements about DFSA regulation of promoted entities.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-vedas-international-marketing-management-unauthorised-and-misleading-financial-promotions",
    breachType: "Unauthorised and misleading financial promotions",
    breachCategories: [
      "UNAUTHORISED_ACTIVITY",
      "MISLEADING_CONDUCT",
      "PROMOTIONS",
    ],
  },
  {
    dateIssued: "2024-08-20",
    firmIndividual: "Mr Peter Georgiou",
    amount: 980020,
    currency: "USD",
    title:
      "The DFSA fines former private banker USD 980,020 for misleading and deceptive conduct",
    summary:
      "The DFSA imposed a fine of USD 980,020 on Mr Peter Georgiou for misleading and deceptive conduct, including false communications, misleading information to his employer, and involvement in AML control failings at Mirabaud (Middle East) Limited.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-former-private-banker-usd-980020-misleading-and-deceptive-conduct",
    breachType: "Misleading conduct and involvement in AML breaches",
    breachCategories: [
      "MISLEADING_CONDUCT",
      "AML",
      "INDIVIDUAL_ACCOUNTABILITY",
    ],
  },
  {
    dateIssued: "2023-08-01",
    firmIndividual: "Mirabaud (Middle East) Limited",
    amount: 3022500,
    currency: "USD",
    title:
      "DFSA fines bank Mirabaud USD 3 million for anti-money laundering controls failings",
    summary:
      "The DFSA imposed a fine of USD 3,022,500 on Mirabaud (Middle East) Limited for inadequate AML systems and controls, including failures to identify suspicious transactions and reassess customer due diligence information.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-bank-mirabaud-usd-3-million-anti-money-laundering-controls-failings",
    breachType: "AML systems and controls failings",
    breachCategories: ["AML", "CONTROLS", "CUSTOMER_DUE_DILIGENCE"],
  },
  {
    dateIssued: "2022-11-03",
    firmIndividual: "KPMG LLP",
    amount: 1500000,
    currency: "USD",
    title:
      "DFSA FINES KPMG LLP USD 1.5 MILLION AND FORMER KPMG LLP AUDIT PARTNER USD 500,000 FOR ABRAAJ CAPITAL LIMITED AUDIT FAILINGS",
    summary:
      "The DFSA imposed a fine of USD 1,500,000 on KPMG LLP for serious audit failings in relation to Abraaj Capital Limited, including failures to perform fundamental audit procedures and identify longstanding deficiencies.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-kpmg-llp-usd-15-million-and-former-kpmg-llp-audit-partner-usd-500000-abraaj-audit-capital-limited-failings",
    breachType: "Audit failings in Abraaj Capital Limited engagement",
    breachCategories: ["AUDIT_FAILINGS", "GATEKEEPER_FAILURE", "CONTROLS"],
  },
  {
    dateIssued: "2022-11-03",
    firmIndividual: "Mr Milind Navalkar",
    amount: 500000,
    currency: "USD",
    title:
      "DFSA FINES KPMG LLP USD 1.5 MILLION AND FORMER KPMG LLP AUDIT PARTNER USD 500,000 FOR ABRAAJ CAPITAL LIMITED AUDIT FAILINGS",
    summary:
      "The DFSA imposed a fine of USD 500,000 on former KPMG LLP Audit Partner Milind Navalkar for professional competence and due care failures connected with audits of Abraaj Capital Limited.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-kpmg-llp-usd-15-million-and-former-kpmg-llp-audit-partner-usd-500000-abraaj-audit-capital-limited-failings",
    breachType: "Professional competence and due care failures in audit work",
    breachCategories: [
      "AUDIT_FAILINGS",
      "INDIVIDUAL_ACCOUNTABILITY",
      "GATEKEEPER_FAILURE",
    ],
  },
  {
    dateIssued: "2022-01-24",
    firmIndividual: "Mr Gilles Rollet",
    amount: 175000,
    currency: "USD",
    title:
      "DFSA fine of USD 175,000 and ban against Gilles Rollet for serious misconduct upheld by the Financial Markets Tribunal",
    summary:
      "The Financial Markets Tribunal upheld the DFSA’s enforcement action against Gilles Rollet, including a USD 175,000 fine, for misleading the DFSA and involvement in unlawful cash service activity at La Tresorerie Limited.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fine-usd-175000-and-ban-against-gilles-rollet-serious-misconduct-upheld-financial-markets-tribunal",
    breachType: "Serious misconduct and misleading the regulator",
    breachCategories: [
      "MISLEADING_CONDUCT",
      "AML",
      "INDIVIDUAL_ACCOUNTABILITY",
    ],
  },
  {
    dateIssued: "2020-02-25",
    firmIndividual: "Enness Limited",
    amount: 105000,
    currency: "USD",
    title: "DFSA Fines Company USD 105,000 for Unauthorised Activity",
    summary:
      "The DFSA fined Enness Limited USD 105,000 for carrying on mortgage arranging and advising activities outside the scope of its DIFC Representative Office licence.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-company-usd-105000-unauthorised-activity",
    breachType: "Unauthorised activity outside licence permissions",
    breachCategories: ["UNAUTHORISED_ACTIVITY", "LICENSING", "CONTROLS"],
  },
  {
    dateIssued: "2018-07-16",
    firmIndividual: "Al Ramz Capital LLC",
    amount: 205200,
    currency: "USD",
    title:
      "DFSA fines Al Ramz and former employee for failing to cooperate and provide information regarding an investigation",
    summary:
      "The DFSA fined Al Ramz Capital LLC USD 205,200 for serious failures to provide complete and accurate information relevant to a DFSA investigation into trading on NASDAQ Dubai.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-al-ramz-and-former-employee-failing-cooperate-and-provide-information-regarding-investigation",
    breachType: "Failure to cooperate with investigation",
    breachCategories: ["OBSTRUCTION", "MISLEADING_CONDUCT", "INVESTIGATION"],
  },
  {
    dateIssued: "2018-07-16",
    firmIndividual: "Mr Najim Al Attar",
    amount: 32640,
    currency: "USD",
    title:
      "DFSA fines Al Ramz and former employee for failing to cooperate and provide information regarding an investigation",
    summary:
      "The DFSA fined former Al Ramz employee Mr Najim Al Attar USD 32,640 for serious failures to provide complete and accurate information relevant to a DFSA investigation.",
    sourceUrl:
      "https://www.dfsa.ae/news/dfsa-fines-al-ramz-and-former-employee-failing-cooperate-and-provide-information-regarding-investigation",
    breachType: "Failure to cooperate with investigation",
    breachCategories: [
      "OBSTRUCTION",
      "MISLEADING_CONDUCT",
      "INDIVIDUAL_ACCOUNTABILITY",
    ],
  },
  {
    dateIssued: "2016-09-26",
    firmIndividual: "Clements (Dubai) Limited",
    amount: 85191,
    currency: "USD",
    title: "DFSA Fines Clements (Dubai) Limited",
    summary:
      "The DFSA imposed a fine of USD 85,191 on Clements (Dubai) Limited for prohibited insurance intermediation activity outside the DIFC and inadequate systems and controls.",
    sourceUrl: "https://www.dfsa.ae/news/dfsa-fines-clements-dubai-limited",
    breachType: "Prohibited insurance intermediation activity",
    breachCategories: ["UNAUTHORISED_ACTIVITY", "INSURANCE", "CONTROLS"],
  },
];
