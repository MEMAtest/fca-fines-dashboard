import type { SnapshotSeedRecord } from "./dfsaSnapshot.ts";

/**
 * Verified official JFSC civil-financial-penalty manifest.
 *
 * The JFSC public site presents a managed challenge to datacentre traffic and
 * does not currently clear in the GitHub Actions browser lane. These records
 * preserve the latest verified official sanctions without treating contextual,
 * maximum or pre-discount values as the penalty imposed.
 */
export const JFSC_ARCHIVE_RECORDS: SnapshotSeedRecord[] = [
  {
    dateIssued: "2025-07-31",
    firmIndividual: "Garfield Bennett Trust Company Limited",
    amount: 86_803.19,
    currency: "GBP",
    title: "Garfield Bennett Trust Company Limited",
    summary:
      "The JFSC imposed a civil financial penalty of GBP 86,803.19 on Garfield Bennett Trust Company Limited for significant and material contraventions of trust company business and AML/CFT requirements.",
    sourceUrl:
      "https://www.jerseyfsc.org/news-and-events/garfield-bennett-trust-company-limited/",
    breachType: "Civil financial penalty",
    breachCategories: ["AML", "CONTROLS", "PUBLIC_STATEMENT"],
  },
  {
    dateIssued: "2024-09-20",
    firmIndividual: "Belasko Jersey Limited",
    amount: 19_211.73,
    currency: "GBP",
    title: "Belasko Jersey Limited",
    summary:
      "The JFSC imposed a civil financial penalty of GBP 19,211.73 on Belasko Jersey Limited for AML/CFT systems and controls contraventions.",
    sourceUrl:
      "https://www.jerseyfsc.org/news-and-events/belasko-jersey-limited/",
    breachType: "Civil financial penalty",
    breachCategories: ["AML", "CONTROLS", "PUBLIC_STATEMENT"],
  },
  {
    dateIssued: "2022-08-04",
    firmIndividual: "Lloyds Bank Corporate Markets Plc, Jersey Branch",
    amount: 498_000,
    currency: "GBP",
    title: "Lloyds Bank Corporate Markets Plc, Jersey Branch",
    summary:
      "The JFSC imposed a civil financial penalty of GBP 498,000 on Lloyds Bank Corporate Markets Plc, Jersey Branch for regulatory and AML/CFT breaches involving correspondent banking controls.",
    sourceUrl:
      "https://www.jerseyfsc.org/news-and-events/lloyds-bank-corporate-markets-plc-jersey-branch-lbcm-jersey-branch/",
    breachType: "Civil financial penalty",
    breachCategories: ["AML", "CONTROLS", "PUBLIC_STATEMENT"],
  },
  {
    dateIssued: "2022-06-17",
    firmIndividual:
      "IQ EQ (Jersey) Limited (formerly, First Names (Jersey) Limited)",
    amount: 803_661.17,
    currency: "GBP",
    title: "IQ EQ (Jersey) Limited (formerly, First Names (Jersey) Limited)",
    summary:
      "The JFSC imposed a civil financial penalty of GBP 803,661.17 on IQ EQ (Jersey) Limited for AML/CFT, governance, systems and controls breaches.",
    sourceUrl:
      "https://www.jerseyfsc.org/news-and-events/iq-eq-jersey-limited-formerly-first-names-jersey-limited/",
    breachType: "Civil financial penalty",
    breachCategories: ["AML", "CONTROLS", "PUBLIC_STATEMENT"],
  },
  {
    dateIssued: "2020-05-14",
    firmIndividual: "Equity Trust (Jersey) Limited",
    amount: 115_575,
    currency: "GBP",
    title: "Equity Trust (Jersey) Limited",
    summary:
      "The JFSC imposed a civil financial penalty of GBP 115,575 on Equity Trust (Jersey) Limited for trust company business and AML/CFT control breaches.",
    sourceUrl:
      "https://www.jerseyfsc.org/news-and-events/equity-trust-jersey-limited-equity/",
    breachType: "Civil financial penalty",
    breachCategories: ["AML", "CONTROLS", "PUBLIC_STATEMENT"],
  },
  {
    dateIssued: "2019-07-17",
    firmIndividual: "Sanne Fiduciary Services Limited",
    amount: 381_010,
    currency: "GBP",
    title: "JFSC enforces first financial penalty on local firm",
    summary:
      "The JFSC imposed a civil financial penalty of GBP 381,010 on Sanne Fiduciary Services Limited for an historic contravention of the JFSC Codes of Practice.",
    sourceUrl:
      "https://www.jerseyfsc.org/news-and-events/jfsc-enforces-first-financial-penalty-on-local-firm/",
    breachType: "Civil financial penalty",
    breachCategories: ["CONTROLS", "PUBLIC_STATEMENT"],
  },
];
