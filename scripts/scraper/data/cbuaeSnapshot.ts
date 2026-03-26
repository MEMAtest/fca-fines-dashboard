import type { ArchiveSeedRecord } from "./dfsaSnapshot.js";

/**
 * Curated official archive manifest for CBUAE enforcement records.
 * The public enforcement index is challenge-protected in this environment, but its
 * downloadable official PDFs are directly accessible and have been used to widen
 * the historical archive beyond the original seed set.
 */
export const CBUAE_SNAPSHOT_RECORDS: ArchiveSeedRecord[] = [
  {
    dateIssued: "2025-12-23",
    firmIndividual: "Omda Exchange",
    amount: 10000000,
    currency: "AED",
    title:
      "CBUAE revokes the licence of Omda Exchange and imposes a financial sanction of AED 10 million",
    summary:
      "The Central Bank of the UAE revoked the licence of Omda Exchange, struck it off the register, and imposed a financial sanction of AED 10 million following AML and regulatory failures.",
    sourceUrl:
      "https://www.centralbank.ae/en/news-and-publications/news-and-insights/press-release/cbuae-revokes-the-licence-of-omda-exchange-and-imposes-a-financial-sanction-of-aed-10-million/",
    breachType: "AML and regulatory failures by exchange house",
    breachCategories: ["AML", "CONTROLS", "LICENSING"],
  },
  {
    dateIssued: "2025-08-20",
    firmIndividual: "Malik Exchange",
    amount: 2000000,
    currency: "AED",
    title:
      "CBUAE revokes the licence of Malik Exchange and imposes a financial sanction of AED 2 million",
    summary:
      "The Central Bank of the UAE revoked the licence of Malik Exchange and imposed a financial sanction of AED 2 million after identifying AML and compliance failures.",
    sourceUrl:
      "https://www.centralbank.ae/en/news-and-publications/news-and-insights/press-release/cbuae-revokes-the-licence-of-malik-exchange-and-imposes-a-financial-sanction-of-aed-2-million/",
    breachType: "AML and compliance failures by exchange house",
    breachCategories: ["AML", "CONTROLS", "LICENSING"],
  },
  {
    dateIssued: "2025-08-06",
    firmIndividual: "A finance company operating in the UAE",
    amount: 600000,
    currency: "AED",
    title:
      "CBUAE Imposes a Financial Sanction on a Finance Company Operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 600,000 on a finance company operating in the UAE for compliance failings identified through supervisory work.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Compliance failings at finance company",
    breachCategories: ["AML", "CONTROLS", "FINANCE_COMPANY"],
  },
  {
    dateIssued: "2025-08-01",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 10700000,
    currency: "AED",
    title:
      "CBUAE Imposes a Financial Sanction of AED 10.7 million on an Exchange House",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 10.7 million on an exchange house operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by exchange house",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2025-07-21",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 800000,
    currency: "AED",
    title: "CBUAE Imposes a Financial Sanction on an Exchange House",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 800,000 on an exchange house operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by exchange house",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2025-07-16",
    firmIndividual: "A branch of a foreign bank operating in the UAE",
    amount: 600000,
    currency: "AED",
    title: "CBUAE Imposes a Financial Sanction on a Branch of a Foreign Bank",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 600,000 on a branch of a foreign bank for Market Conduct and Consumer Protection failings.",
    sourceUrl:
      "https://www.centralbank.ae/media/2kemuyt4/cbuae-imposes-a-financial-sanction-on-a-branch-of-a-foreign-bank-en.pdf",
    breachType: "Market conduct and consumer protection failures",
    breachCategories: ["BANKING", "MARKET_CONDUCT", "CONSUMER_PROTECTION"],
  },
  {
    dateIssued: "2025-07-10",
    firmIndividual: "A bank operating in the UAE",
    amount: 3000000,
    currency: "AED",
    title: "CBUAE imposes a financial sanction of AED 3 million on a bank",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 3 million on a bank operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by bank",
    breachCategories: ["BANKING", "CONTROLS"],
  },
  {
    dateIssued: "2025-07-07",
    firmIndividual: "Three exchange houses operating in the UAE",
    amount: 4100000,
    currency: "AED",
    title:
      "CBUAE imposes financial sanctions of AED 4.1 million on three Exchange Houses",
    summary:
      "The Central Bank of the UAE imposed aggregate financial sanctions of AED 4.1 million on three exchange houses operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by exchange houses",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2025-06-25",
    firmIndividual: "The Islamic window of a bank operating in the UAE",
    amount: 3502214,
    currency: "AED",
    title:
      "CBUAE Suspends the Onboarding of New Customers in the Islamic Window of a Bank for Six Months and Imposes a Financial Sanction",
    summary:
      "The Central Bank of the UAE suspended new customer onboarding in the Islamic window of a bank for six months and imposed a financial sanction of AED 3,502,214.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Control failings in Islamic window operations",
    breachCategories: ["BANKING", "CONTROLS", "ISLAMIC_FINANCE"],
  },
  {
    dateIssued: "2025-06-10",
    firmIndividual: "Six exchange houses operating in the UAE",
    amount: 12300000,
    currency: "AED",
    title:
      "CBUAE imposes financial sanctions of AED 12.3 million on six Exchange Houses",
    summary:
      "The Central Bank of the UAE imposed aggregate financial sanctions of AED 12.3 million on six exchange houses operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by exchange houses",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2025-06-02",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 3500000,
    currency: "AED",
    title: "CBUAE Imposes a Financial Sanction on an Exchange House",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 3.5 million on an exchange house operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by exchange house",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2025-06-24",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 2000000,
    currency: "AED",
    title:
      "CBUAE imposes a financial sanction of AED 2 million on an exchange house",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 2 million on an exchange house operating in the UAE.",
    sourceUrl:
      "https://www.centralbank.ae/en/news-and-publications/news-and-insights/press-release/cbuae-imposes-a-financial-sanction-of-aed-2-million-on-an-exchange-house/",
    breachType: "Regulatory failures by exchange house",
    breachCategories: ["AML", "CONTROLS"],
  },
  {
    dateIssued: "2025-06-17",
    firmIndividual: "Sundus Exchange",
    amount: 10000000,
    currency: "AED",
    title:
      "CBUAE revokes the licence of Sundus Exchange and imposes a financial sanction of AED 10 million",
    summary:
      "The Central Bank of the UAE revoked the licence of Sundus Exchange and imposed a financial sanction of AED 10 million.",
    sourceUrl:
      "https://www.centralbank.ae/en/news-and-publications/news-and-insights/press-release/cbuae-revokes-the-licence-of-sundus-exchange-and-imposes-a-financial-sanction-of-aed-10-million/",
    breachType: "Regulatory failures by exchange house",
    breachCategories: ["AML", "CONTROLS", "LICENSING"],
  },
  {
    dateIssued: "2025-05-28",
    firmIndividual: "Two branches of foreign banks operating in the UAE",
    amount: 18100000,
    currency: "AED",
    title:
      "CBUAE imposes financial sanctions of AED 18.1 million on two branches of foreign banks operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed aggregate financial sanctions of AED 18.1 million on two branches of foreign banks, including AED 10.6 million on one branch and AED 7.5 million on the other, for AML framework failures.",
    sourceUrl:
      "https://www.centralbank.ae/en/news-and-publications/news-and-insights/press-release/cbuae-imposes-financial-sanctions-of-aed-18-1-million-on-two-branches-of-foreign-banks-operating-in-the-uae/",
    breachType: "AML framework failures at bank branches",
    breachCategories: ["AML", "BANKING", "CONTROLS"],
  },
  {
    dateIssued: "2025-05-20",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 200000000,
    currency: "AED",
    title:
      "CBUAE imposes a financial sanction of AED 200 million on an Exchange House",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 200 million on an exchange house operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Serious regulatory failures by exchange house",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2025-05-12",
    firmIndividual: "Five insurance brokers operating in the UAE",
    amount: null,
    currency: "AED",
    title:
      "CBUAE Imposes Administrative and Financial Sanctions on Five Insurance Brokers Operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed administrative and financial sanctions on five insurance brokers operating in the UAE.",
    sourceUrl:
      "https://www.centralbank.ae/en/news-and-publications/news-and-insights/press-release/cbuae-imposes-administrative-and-financial-sanctions-on-five-insurance-brokers-operating-in-the-uae/",
    breachType: "Administrative and financial sanctions on insurance brokers",
    breachCategories: ["INSURANCE", "CONTROLS", "ENFORCEMENT"],
  },
  {
    dateIssued: "2025-04-21",
    firmIndividual: "A bank operating in the UAE",
    amount: null,
    currency: "AED",
    title: "CBUAE Imposes a Financial Sanction on a Bank Operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction on a bank operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by bank",
    breachCategories: ["BANKING", "CONTROLS"],
  },
  {
    dateIssued: "2025-03-25",
    firmIndividual:
      "Five banks and two insurance companies operating in the UAE",
    amount: null,
    currency: "AED",
    title:
      "CBUAE Imposes Financial Sanctions on 5 Banks and 2 Insurance Companies for CRS/FATCA Violations",
    summary:
      "The Central Bank of the UAE imposed financial sanctions on five banks and two insurance companies for CRS/FATCA reporting violations.",
    sourceUrl:
      "https://www.centralbank.ae/ar/news-and-publications/news-and-insights/press-release/cbuae-imposes-financial-sanctions-on-5-banks-and-2-insurance-companies-for-crs-fatca-violations/",
    breachType: "CRS and FATCA reporting violations",
    breachCategories: ["REPORTING", "BANKING", "INSURANCE"],
  },
  {
    dateIssued: "2024-09-16",
    firmIndividual: "A bank operating in the UAE",
    amount: 5000000,
    currency: "AED",
    title: "CBUAE Imposes a Financial Sanction on a Bank Operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 5 million on a bank operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by bank",
    breachCategories: ["BANKING", "CONTROLS"],
  },
  {
    dateIssued: "2024-08-22",
    firmIndividual: "Muthoot Exchange",
    amount: null,
    currency: "AED",
    title: "CBUAE revokes the licence of Muthoot Exchange",
    summary:
      "The Central Bank of the UAE revoked the licence of Muthoot Exchange after finding that it failed to maintain the required paid-up capital and equity levels.",
    sourceUrl:
      "https://www.centralbank.ae/media/b5sngj5g/cbuae-revokes-the-licence-of-muthoot-exchange-en.pdf",
    breachType: "Licence revocation following capital deficiencies",
    breachCategories: ["LICENSING", "CAPITAL", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2024-08-02",
    firmIndividual: "A bank operating in the UAE",
    amount: 5800000,
    currency: "AED",
    title: "CBUAE Imposes a Financial Sanction on a Bank Operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 5.8 million on a bank operating in the UAE.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType: "Regulatory failures by bank",
    breachCategories: ["BANKING", "CONTROLS"],
  },
  {
    dateIssued: "2023-02-02",
    firmIndividual: "A finance company operating in the UAE",
    amount: 1800000,
    currency: "AED",
    title: "CBUAE imposes sanctions on a finance company operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 1.8 million and operational requirements on a finance company after finding repeated AML and governance violations.",
    sourceUrl:
      "https://www.centralbank.ae/media/cz4pl0gn/cbuae-imposes-sanctions-on-a-finance-company-operating-in-the-uae_en.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/cz4pl0gn/cbuae-imposes-sanctions-on-a-finance-company-operating-in-the-uae_en.pdf",
    breachType: "Repeated AML violations and governance failings",
    breachCategories: ["AML", "GOVERNANCE", "CONTROLS"],
  },
  {
    dateIssued: "2023-08-10",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 4800000,
    currency: "AED",
    title:
      "CBUAE imposes a financial sanction on an exchange house operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 4.8 million on an exchange house after an examination found weak risk analysis and enhanced due diligence controls designed to prevent money laundering and terrorist financing.",
    sourceUrl:
      "https://centralbank.ae/media/s1dnjwdp/cbuae-imposes-financial-sanction-on-an-exchange-house-operating-in-the-uae-en.pdf",
    officialDocumentUrl:
      "https://centralbank.ae/media/s1dnjwdp/cbuae-imposes-financial-sanction-on-an-exchange-house-operating-in-the-uae-en.pdf",
    breachType: "Weak AML risk analysis and due diligence framework",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2022-12-09",
    firmIndividual: "An exchange house operating in the UAE",
    amount: null,
    currency: "AED",
    title:
      "CBUAE imposes financial sanction on an exchange house operating in the UAE",
    summary:
      "The Central Bank of the UAE published a financial-sanction notice against an exchange house operating in the UAE. The current archive evidence confirms a monetary sanction, but the amount is not yet normalised in this manifest.",
    sourceUrl: "https://www.centralbank.ae/en/our-operations/enforcement/",
    breachType:
      "Financial sanction on exchange house under the official enforcement archive",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2021-12-30",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 600000,
    currency: "AED",
    title:
      "CBUAE imposes a financial sanction an exchange house operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a fine of AED 600,000 on an exchange house for using a civilian vehicle to transport cash instead of a cash-in-transit agent and for failing to report a material development to the regulator.",
    sourceUrl:
      "https://www.centralbank.ae/media/niuljk31/cbuae-imposes-a-financial-sanction-an-exchange-house-operating-in-the-uae-en_1.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/niuljk31/cbuae-imposes-a-financial-sanction-an-exchange-house-operating-in-the-uae-en_1.pdf",
    breachType: "Cash transport and reporting failures by exchange house",
    breachCategories: ["EXCHANGE_HOUSE", "REPORTING", "CONTROLS"],
  },
  {
    dateIssued: "2021-12-27",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 352000,
    currency: "AED",
    title:
      "CBUAE imposes a financial sanction an exchange house operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 352,000 on an exchange house for failing to achieve appropriate levels of compliance in its AML and sanctions compliance framework.",
    sourceUrl:
      "https://www.centralbank.ae/media/bfooxwjb/cbuae-imposes-a-financial-sanction-an-exchange-house-operating-in-the-uae-en.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/bfooxwjb/cbuae-imposes-a-financial-sanction-an-exchange-house-operating-in-the-uae-en.pdf",
    breachType: "AML and sanctions compliance framework failures",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2021-12-15",
    firmIndividual: "Six Hawala providers operating in the UAE",
    amount: 350000,
    currency: "AED",
    title:
      "CBUAE imposes financial sanctions on six Hawala providers operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed total financial sanctions of AED 350,000 on six Hawala providers for failing to provide timely registrations on the GoAML reporting system.",
    sourceUrl:
      "https://www.centralbank.ae/media/owmlzf4x/cbuae-imposes-financial-sanctions-on-6-hawala-providers-operating-in-the-uae_en.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/owmlzf4x/cbuae-imposes-financial-sanctions-on-6-hawala-providers-operating-in-the-uae_en.pdf",
    breachType: "GoAML registration failures by Hawala providers",
    breachCategories: ["AML", "REPORTING", "HAWALA"],
  },
  {
    dateIssued: "2021-12-14",
    firmIndividual: "A bank operating in the UAE",
    amount: 19500000,
    currency: "AED",
    title:
      "CBUAE imposes monitoring and financial sanctions on a bank operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed monitoring measures and a financial sanction of AED 19.5 million on a bank for long-running failures in its AML and sanctions compliance framework.",
    sourceUrl:
      "https://www.centralbank.ae/media/kdkhnqqu/cbuae-imposes-monitoring-and-financial-sanctions-on-a-bank-operating-in-the-uae_en.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/kdkhnqqu/cbuae-imposes-monitoring-and-financial-sanctions-on-a-bank-operating-in-the-uae_en.pdf",
    breachType: "Extended AML and sanctions compliance framework failures",
    breachCategories: ["AML", "BANKING", "CONTROLS"],
  },
  {
    dateIssued: "2021-10-04",
    firmIndividual: "Six exchange houses operating in the UAE",
    amount: 17311000,
    currency: "AED",
    title:
      "CBUAE imposes financial sanctions on six exchange houses operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed total financial sanctions of AED 17,311,000 on six exchange houses for failing to achieve appropriate levels of compliance in their AML and sanctions compliance frameworks.",
    sourceUrl:
      "https://www.centralbank.ae/media/pmzbtpo0/cbuae-imposes-financial-sanctions-on-six-exchange-houses-operating-in-the-uae_en.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/pmzbtpo0/cbuae-imposes-financial-sanctions-on-six-exchange-houses-operating-in-the-uae_en.pdf",
    breachType:
      "AML and sanctions compliance framework failures across exchange houses",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2021-05-18",
    firmIndividual: "S&S Brokerage House",
    amount: null,
    currency: "AED",
    title:
      "The CBUAE imposes an administrative sanction on S&S Brokerage House",
    summary:
      "The Central Bank of the UAE imposed an administrative sanction on S&S Brokerage House, revoked its licence, and struck it off the register after it ceased carrying on one or more licensed financial activities for more than one year.",
    sourceUrl:
      "https://www.centralbank.ae/media/aczkq5ek/the-cbuae-imposes-an-administrative-sanction-on-s-s-brokerage-house-en_0.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/aczkq5ek/the-cbuae-imposes-an-administrative-sanction-on-s-s-brokerage-house-en_0.pdf",
    breachType:
      "Administrative sanction and licence revocation of brokerage house",
    breachCategories: ["BROKERAGE", "LICENSING", "ENFORCEMENT"],
  },
  {
    dateIssued: "2021-04-22",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 496000,
    currency: "AED",
    title:
      "CBUAE imposes financial sanction on an exchange house operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 496,000 on an exchange house after examination findings showed a weak AML/CFT compliance framework and a poor compliance history.",
    sourceUrl:
      "https://centralbank.ae/media/so0pwu0b/cbuae-imposes-financial-sanction-on-an-exchange-house-operating-in-the-uae_en.pdf",
    officialDocumentUrl:
      "https://centralbank.ae/media/so0pwu0b/cbuae-imposes-financial-sanction-on-an-exchange-house-operating-in-the-uae_en.pdf",
    breachType: "Weak AML/CFT compliance framework at exchange house",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2021-02-25",
    firmIndividual: "A non-authorised individual related to an exchange house",
    amount: 600000,
    currency: "AED",
    title:
      "CBUAE imposes financial and administrative sanctions on a non-authorised individual related to an exchange house",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 600,000 on a non-authorised individual related to an exchange house and prohibited him from future functions connected to licensed financial institutions.",
    sourceUrl:
      "https://www.centralbank.ae/media/ngnf42pu/cbuae-imposes-sanction-on-an-individual.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/ngnf42pu/cbuae-imposes-sanction-on-an-individual.pdf",
    breachType:
      "Unauthorised individual conduct linked to exchange house activity",
    breachCategories: [
      "INDIVIDUAL_ACCOUNTABILITY",
      "EXCHANGE_HOUSE",
      "LICENSING",
    ],
  },
  {
    dateIssued: "2021-02-10",
    firmIndividual: "An exchange house operating in the UAE",
    amount: 504000,
    currency: "AED",
    title:
      "CBUAE imposes financial sanction on an exchange house operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed a financial sanction of AED 504,000 on an exchange house for weak AML/CFT controls, taking into account the exchange house’s poor compliance history.",
    sourceUrl:
      "https://www.centralbank.ae/media/v0jecpbf/cbuae-imposes-administrative-sanction-on-an-exchange-house-operating-in-the-uae-en.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/v0jecpbf/cbuae-imposes-administrative-sanction-on-an-exchange-house-operating-in-the-uae-en.pdf",
    breachType: "Weak AML/CFT compliance framework at exchange house",
    breachCategories: ["AML", "CONTROLS", "EXCHANGE_HOUSE"],
  },
  {
    dateIssued: "2021-01-31",
    firmIndividual: "11 banks operating in the UAE",
    amount: 45758333,
    currency: "AED",
    title: "CBUAE imposes financial sanctions on 11 banks operating in the UAE",
    summary:
      "The Central Bank of the UAE imposed total financial sanctions of AED 45,758,333 on 11 banks for failures to achieve appropriate levels of compliance in their AML and sanctions compliance frameworks.",
    sourceUrl:
      "https://www.centralbank.ae/media/m0qkf3ot/cbuae-imposes-financial-sanctions-on-11-banks-operating-in-the-uae_en.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/m0qkf3ot/cbuae-imposes-financial-sanctions-on-11-banks-operating-in-the-uae_en.pdf",
    breachType: "AML and sanctions compliance framework failures across banks",
    breachCategories: ["AML", "BANKING", "CONTROLS"],
  },
  {
    dateIssued: "2021-01-23",
    firmIndividual: "A finance company operating in the UAE",
    amount: null,
    currency: "AED",
    title:
      "CBUAE imposes administrative sanction on a Finance Company operating in the UAE",
    summary:
      "The Central Bank of the UAE issued a caution against a finance company for failing to rotate its external auditor within the mandated period and for non-compliance with the Finance Companies Regulation and related instructions.",
    sourceUrl:
      "https://www.centralbank.ae/media/oxxbomlu/cbuae-imposes-administrative-sanctions-on-a-finance-company-operating-in-the-uae.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/oxxbomlu/cbuae-imposes-administrative-sanctions-on-a-finance-company-operating-in-the-uae.pdf",
    breachType:
      "Administrative sanction for auditor rotation and governance failings",
    breachCategories: ["GOVERNANCE", "FINANCE_COMPANY", "AUDIT_FAILINGS"],
  },
  {
    dateIssued: "2020-03-03",
    firmIndividual: "A bank operating in the UAE",
    amount: null,
    currency: "AED",
    title:
      "Notification of Enforcement Action Administrative Sanction imposed on a Bank operating in the UAE",
    summary:
      "The Central Bank of the UAE issued a caution against a bank for non-compliance with central bank instructions concerning the execution of a court order relating to the release of attachments to performance bonds.",
    sourceUrl:
      "https://www.centralbank.ae/media/uihlmioz/notification-of-enforcement-action-administrative-sanction-imposed-on-a.pdf",
    officialDocumentUrl:
      "https://www.centralbank.ae/media/uihlmioz/notification-of-enforcement-action-administrative-sanction-imposed-on-a.pdf",
    breachType:
      "Administrative sanction for failure to comply with court-order execution instructions",
    breachCategories: ["BANKING", "ENFORCEMENT", "COMPLIANCE_ORDER"],
  },
];
