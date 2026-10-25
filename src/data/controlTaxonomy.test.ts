import { describe, expect, it } from "vitest";
import {
  CONTROL_DEFINITIONS,
  CONTROL_EVIDENCE_ALIASES,
  CONTROL_TAXONOMY_VERSION,
  buildApprovedControlEvidencePredicate,
  matchControlEvidence,
  resolveControlQuery,
} from "./controlTaxonomy.js";

describe("control failure taxonomy", () => {
  it("publishes a versioned, stable, sufficiently granular definition set", () => {
    expect(CONTROL_TAXONOMY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(CONTROL_DEFINITIONS.length).toBeGreaterThanOrEqual(17);
    expect(new Set(CONTROL_DEFINITIONS.map(({ code }) => code)).size).toBe(CONTROL_DEFINITIONS.length);
    expect(CONTROL_DEFINITIONS.find(({ code }) => code === "AML_CASH_CONTROLS")).toBeDefined();
    expect(CONTROL_DEFINITIONS.find(({ code }) => code === "CLIENT_MONEY_ASSETS")).toBeDefined();
    expect(CONTROL_EVIDENCE_ALIASES.AML_CASH_CONTROLS).toContain("cash transactions");
    expect(CONTROL_EVIDENCE_ALIASES.AML_CASH_CONTROLS).not.toContain("aml");
  });

  it.each([
    ["cash", ["AML_CASH_CONTROLS"], "", false],
    ["fines for cash failures", ["AML_CASH_CONTROLS"], "", true],
    ["fines issued for cash failures", ["AML_CASH_CONTROLS"], "", true],
    ["cash threshold reporting failures", ["AML_CASH_CONTROLS"], "", false],
    ["currency transaction reporting failures", ["AML_CASH_CONTROLS"], "", false],
    ["AML cash failures", ["AML_CASH_CONTROLS"], "", false],
    ["CASS failures", ["CLIENT_MONEY_ASSETS"], "", false],
    ["show me fines for customer due diligence failures", ["CDD_KYC"], "", true],
    ["record retention failures", ["RECORDKEEPING_RETENTION"], "", false],
    ["regulatory transaction reporting failures", ["REGULATORY_TRANSACTION_REPORTING"], "", false],
    ["CASS failures at Acme Bank in Ireland", ["CLIENT_MONEY_ASSETS"], "acme bank ireland", false],
    ["fines for AML risk assessment failures in France", ["AML_RISK_ASSESSMENT"], "france", true],
  ])("resolves natural-language query %j", (query, codes, residualQuery, finesOnly) => {
    expect(resolveControlQuery(query as string)).toEqual({
      controls: codes,
      residualQuery,
      finesOnly,
    });
  });

  it("resolves multiple controls while preserving meaningful respondent and jurisdiction words", () => {
    expect(resolveControlQuery("fines for CASS and sanctions screening at Acme Bank in Ireland")).toEqual({
      controls: ["SANCTIONS_SCREENING", "CLIENT_MONEY_ASSETS"],
      residualQuery: "acme bank ireland",
      finesOnly: true,
    });
  });

  it("builds a parameterized predicate over approved indexed evidence only", () => {
    expect(buildApprovedControlEvidencePredicate(["AML_CASH_CONTROLS", "unknown"], 4)).toEqual({
      sql: "control_evidence.control_code = ANY($4::text[]) AND control_evidence.taxonomy_version = $5 AND control_evidence.review_status = 'approved'",
      values: [["AML_CASH_CONTROLS"], CONTROL_TAXONOMY_VERSION],
    });
    expect(buildApprovedControlEvidencePredicate(["unknown"])).toEqual({
      sql: "FALSE",
      values: [[], CONTROL_TAXONOMY_VERSION],
    });
  });

  it("does not resolve generic AML as physical-cash evidence", () => {
    expect(resolveControlQuery("AML fines" )).toBeNull();
    expect(matchControlEvidence({ breachType: "AML failures", summary: "The firm had weak AML systems." })).toEqual([]);
  });

  it("keeps sanctions intent explicit rather than interpreting punitive sanctions as screening", () => {
    expect(resolveControlQuery("sanctions against XYZ")).toBeNull();
    expect(resolveControlQuery("sanctions screening failures")?.controls).toEqual(["SANCTIONS_SCREENING"]);
  });

  it("does not interpret entity names or partial hyphen tokens as bare-cash control intent", () => {
    expect(resolveControlQuery("Cash Converters Limited")).toBeNull();
    expect(resolveControlQuery("Cash App")).toBeNull();
    expect(resolveControlQuery("Cashflow in Minutes")).toBeNull();
    expect(resolveControlQuery("-cash")).toBeNull();
    expect(resolveControlQuery("cash in UK")?.controls).toEqual(["AML_CASH_CONTROLS"]);
  });

  it.each([
    ["cashflow failures", "", "", ""],
    ["CashApp failed to maintain controls", "", "", ""],
    ["Cashflow Bank customer-money accounting", "", "", ""],
    ["Cyberstar failed to maintain controls", "", "", ""],
  ])("does not use entity names or cash lookalikes as evidence", (summary, breachType, category) => {
    expect(matchControlEvidence({ summary: summary as string, breachType: breachType as string, breachCategories: [category as string] })).toEqual([]);
  });

  it("keeps physical cash, CASS/client money and similar controls distinct", () => {
    expect(matchControlEvidence({ summary: "The firm failed to monitor cash deposits and cash withdrawals." }).map(({ code }) => code)).toEqual(["AML_CASH_CONTROLS"]);
    expect(matchControlEvidence({ summary: "The firm failed to segregate client money and reconcile client money accounts." }).map(({ code }) => code)).toEqual(["CLIENT_MONEY_ASSETS"]);
    expect(matchControlEvidence({ summary: "Cashflow failed to reconcile client money." }).map(({ code }) => code)).toEqual(["CLIENT_MONEY_ASSETS"]);
  });

  it("distinguishes cash threshold/currency transaction reporting from SAR/STR and regulatory transaction reporting", () => {
    expect(matchControlEvidence({ summary: "The firm failed to submit currency transaction reports for reportable cash activity." }).map(({ code }) => code)).toEqual(["AML_CASH_CONTROLS"]);
    expect(matchControlEvidence({ summary: "The firm failed to submit suspicious transaction reports." }).map(({ code }) => code)).toEqual(["SAR_STR_REPORTING"]);
    expect(matchControlEvidence({ summary: "The firm submitted inaccurate transaction reports to the regulator." }).map(({ code }) => code)).toEqual(["REGULATORY_TRANSACTION_REPORTING"]);
  });

  it("classifies MiFIR Article 26 notification failures as regulatory reporting, not AML transaction monitoring", () => {
    const llbMifir = "The Austrian Financial Market Authority (FMA) imposed a fine of EUR 28,000 upon LLB Bank AG. The bank omitted over a lengthy period of time to notify the FMA about the transactions it conducted in financial instruments pursuant to Article 26 of the Markets in Financial Instruments Regulation (MiFIR–Regulation (EU) 600/2014) as quickly as possible and at latest at the end of the following working day. The data transmitted by way of transaction monitoring notifications are an integral part of the FMA’s market surveillance activities. The penal order is final.";
    const codes = matchControlEvidence({ summary: llbMifir }).map(({ code }) => code);
    expect(codes).toContain("REGULATORY_TRANSACTION_REPORTING");
    expect(codes).not.toContain("TRANSACTION_MONITORING");

    const withSeparateAmlFinding = `${llbMifir} Separately, the firm's transaction monitoring system failed to generate suspicious activity alerts.`;
    expect(matchControlEvidence({ summary: withSeparateAmlFinding }).map(({ code }) => code)).toContain("TRANSACTION_MONITORING");
  });

  it("requires AML, structuring/reporting, suspicion, or a concrete cash-control failure context", () => {
    const hsbcFundsSummary = "The SFC reprimanded and fined HSBC Investment Funds (Hong Kong) Limited and HSBC Global Asset Management (Hong Kong) Limited for breaches relating to cash management for SFC-authorized funds. The funds maintained cash deposits with connected entities.";
    expect(matchControlEvidence({
      firmIndividual: "HSBC Investment Funds (Hong Kong) Limited",
      summary: hsbcFundsSummary,
    }).map(({ code }) => code)).not.toContain("AML_CASH_CONTROLS");
    expect(matchControlEvidence({
      summary: "The firm failed to monitor cash deposits and cash withdrawals.",
    }).map(({ code }) => code)).toEqual(["AML_CASH_CONTROLS"]);
  });

  it("recognizes real structuring, FIC Act cash-threshold, and AML cash-deposit findings", () => {
    // FINRA BrokerCheck, Christian Gonzalez, Docket 2024082947801:
    // https://files.brokercheck.finra.org/individual/individual_5550494.pdf
    const christianGonzalez = "The findings stated that Gonzalez received Bank Secrecy Act training that financial institutions must report cash transactions over $10,000 and that structuring was prohibited under the BSA. Gonzalez made cash deposits in a firm account totaling $58,970; each individual deposit was below $10,000, evading federal reporting requirements that would have caused the firm to file Currency Transaction Reports (CTRs).";
    expect(matchControlEvidence({ summary: christianGonzalez }).map(({ code }) => code)).toContain("AML_CASH_CONTROLS");

    // South African Reserve Bank Prudential Authority, FIC Act sanctions:
    // https://www.resbank.co.za/en/home/what-we-do/Prudentialregulation/Administrative-sanctions
    expect(matchControlEvidence({
      breachType: "Non-compliance found with section 28 (Cash transactions above prescribed limit)",
    }).map(({ code }) => code)).toContain("AML_CASH_CONTROLS");

    // SFC Statement of Disciplinary Action, Sino-Rich, Ref. 21PR29:
    // https://apps.sfc.hk/edistributionWeb/api/news/openAppendix?appendix=0&lang=EN&refNo=21PR29
    const sinoRich = "The SFC found that Sino-Rich failed to establish and implement adequate AML/CTF procedures to detect, process and approve cash deposits made by its clients, and failed to conduct proper enquiries on suspicious cash deposits or report them to the Joint Financial Intelligence Unit.";
    expect(matchControlEvidence({ summary: sinoRich }).map(({ code }) => code)).toContain("AML_CASH_CONTROLS");
  });

  it("does not confuse an MLRO appointment or generic recordkeeping with control failures", () => {
    expect(matchControlEvidence({
      summary: "The firm failed to appoint a Money Laundering Reporting Officer and failed to retain records in line with record keeping requirements.",
    }).map(({ code }) => code)).toEqual(["RECORDKEEPING_RETENTION"]);
    expect(matchControlEvidence({
      summary: "The firm failed to retain customer due diligence records and AML decision records.",
    }).map(({ code }) => code)).toEqual(["AML_RECORDKEEPING"]);
  });

  it("recognizes specified South African AML reporting, training and governance duty failures", () => {
    const africanBank = "Non-compliance found with section 43 (Training relating to anti-money laundering and counter financing of terrorism compliance); section 29 (Suspicious and unusual transaction reporting); section 42A (Governance of anti-money laundering and counter financing of terrorism compliance).";
    expect(matchControlEvidence({ summary: africanBank }).map(({ code }) => code)).toEqual([
      "SAR_STR_REPORTING",
      "AML_TRAINING",
      "GOVERNANCE_OVERSIGHT",
    ]);
    const discoveryLife = "Non-compliance found with section 28 (Cash transactions above prescribed limit); section 42 (Risk management and compliance programme); section 43 (Employee training relating to anti-money laundering and counter financing of terrorism compliance); section 42A(2) (Governance of anti-money laundering and counter financing of terrorism compliance).";
    expect(matchControlEvidence({ summary: discoveryLife }).map(({ code }) => code)).toEqual([
      "AML_CASH_CONTROLS",
      "AML_TRAINING",
      "GOVERNANCE_OVERSIGHT",
    ]);
  });

  it("does not treat an inspection objective to assess suitability as a suitability failure", () => {
    const inspectionObjective = "During an inspection carried out by the FIN-FSA in 2021–2022. The company provided investment advice to clients via tied agents, and the objective of the inspection was to ascertain the company's conduct with respect to suitability assessment. The inspection examined at which stage the suitability assessment was performed.";
    expect(matchControlEvidence({
      firmIndividual: "Alexandria Group Plc",
      summary: inspectionObjective,
    }).map(({ code }) => code)).not.toContain("SUITABILITY_ADVICE");

    expect(matchControlEvidence({
      summary: "The inspection objective was to assess suitability. The inspector found that the advice was unsuitable for the customer.",
    }).map(({ code }) => code)).toContain("SUITABILITY_ADVICE");
    expect(matchControlEvidence({ breachType: "Unsuitable investment advice" }).map(({ code }) => code)).toContain("SUITABILITY_ADVICE");
  });

  it("rejects explicit contrary findings and boilerplate duties", () => {
    expect(matchControlEvidence({ summary: "No deficiencies in cash handling; the fine concerned complaints handling." }).map(({ code }) => code)).toEqual(["COMPLAINTS_HANDLING"]);
    expect(matchControlEvidence({ summary: "Firms must maintain transaction monitoring and cash threshold reporting." })).toEqual([]);
  });

  it("classifies specific AML controls without treating generic AML language as each control", () => {
    const result = matchControlEvidence({
      breachType: "Failure to conduct enhanced due diligence",
      summary: "The firm did not establish the source of funds and did not file suspicious activity reports.",
    });
    expect(result.map(({ code }) => code)).toEqual(["AML_EDD", "SOURCE_OF_FUNDS_WEALTH", "SAR_STR_REPORTING"]);
    expect(matchControlEvidence({ summary: "AML policies were inadequate." })).toEqual([]);
  });

  it("returns bounded passages with evidence-field provenance and removes the full respondent name", () => {
    const [match] = matchControlEvidence({
      firmIndividual: "North Star Financial Group",
      summary: "North Star Financial Group failed to perform sanctions screening for high-risk customers.",
    });
    expect(match).toMatchObject({ code: "SANCTIONS_SCREENING", field: "summary" });
    expect(match.passage).not.toContain("North Star Financial Group");
    expect(match.passage.length).toBeLessThanOrEqual(600);
  });

  it("fails closed on copied respondent lists with control terms", () => {
    expect(matchControlEvidence({
      firmIndividual: "North Star Bank",
      summary: "Firms: North Star Bank, Silver Moon Capital and Acme Trust. No sanctions screening was performed.",
    })).toEqual([]);
    expect(matchControlEvidence({
      firmIndividual: "Casha Microfinance Bank",
      summary: "The list of the affected MFBs is as follows: Lagos: Casha Microfinance Bank, Silverline MFB, Acme Microfinance Bank. Cash threshold reporting was absent.",
    })).toEqual([]);
  });

  it("accepts the FCA NatWest cash-monitoring passage and ordinary comma-rich prose", () => {
    const natwestParagraph = "Some of the bank’s employees, who were responsible for handling these cash deposits, reported their suspicions to bank staff responsible for investigating suspected money laundering, however no appropriate action was ever taken. The ‘red flags’ that were reported included significant amounts of Scottish bank notes deposited throughout England, deposits of notes carrying a prominent musty smell, and individuals acting suspiciously when depositing cash in NatWest branches. In addition, the bank’s automated transaction monitoring system incorrectly recognised some cash deposits as cheque deposits. As cheques carry a lower money laundering risk than cash, this was a significant gap in the bank’s monitoring of a large number of customers depositing cash, of which Fowler Oldfield was one.";
    expect(matchControlEvidence({
      firmIndividual: "National Westminster Bank plc",
      summary: natwestParagraph,
    }).map(({ code }) => code)).toEqual(["AML_CASH_CONTROLS", "TRANSACTION_MONITORING"]);
    expect(matchControlEvidence({
      summary: "Some of the bank’s employees, who handled cash deposits, reported their suspicions to senior staff, however no appropriate action was taken. The automated transaction monitoring system also incorrectly recognised those cash deposits as cheques.",
    }).map(({ code }) => code)).toEqual(["AML_CASH_CONTROLS", "TRANSACTION_MONITORING"]);
  });

  it("preserves the existing cyber-control query and evidence behavior", () => {
    expect(resolveControlQuery("cyber")).toMatchObject({ controls: ["CYBER_OPERATIONAL_RESILIENCE"] });
    expect(matchControlEvidence({ summary: "A ransomware incident exposed customer data after weak information security controls." }).map(({ code }) => code)).toEqual(["CYBER_OPERATIONAL_RESILIENCE"]);
    expect(matchControlEvidence({ firmIndividual: "Cyberstar", summary: "Administrative breach of filing rules." })).toEqual([]);
  });
});
