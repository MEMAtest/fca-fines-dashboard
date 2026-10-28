import { describe, expect, it } from "vitest";
import { buildArticleEvidenceContract, getArticleEvidenceContractIssues, hasGroundedCyberConcept, renderArticleEvidenceMethodology } from "./articleEvidenceContract.js";
import type { EnforcementRecord } from "./articleData.js";
import { prepareEvidenceRecords } from "./articleData.js";
import { preserveAboutDataContract } from "./editorialWorkflow.js";
import { assertFreshArticleQuality, getArticleQualityWordRange, runQualityGate } from "./articleQuality.js";

function record(overrides: Partial<EnforcementRecord> = {}): EnforcementRecord {
  return {
    id: "r1", regulator: "FCA", firm_individual: "Example Ltd", amount: 125000, currency: "GBP", amount_gbp: 125000,
    date_issued: "2026-10-01", breach_type: "AML controls failure", summary: "The firm was fined GBP 125,000 for AML control failures.",
    notice_url: "https://www.fca.org.uk/news/press-releases/example", source_url: "", amount_verified: true,
    ...overrides,
  };
}

// Minimal regression snapshots of the published defects at parent SHA c01841d.
// Keep these excerpts/source rows frozen here so publication fixes cannot erase tests.
const legacyCyber = {
  title: "Cyber and Operational Resilience: Escalating Enforcement Actions",
  excerpt: "Regulators are increasingly imposing penalties for failures in cyber controls, operational integrity, and financial reporting.",
  content: `The enforcement data reveals distinct patterns in regulatory action. A clear trajectory of escalating penalties is evident in the case of ZhongDe Waste Technology AG.\n\nThis analysis uses 30 topic-filtered actions linked to official regulatory sources across 10 regulators: HKMA, BaFin, CSSF, SEBI, FSMA, SEC, OSC, FCA, FINRA, OCC. The records cover 2021-12-20 to 2026-05-22. 8 records contain a monetary penalty verified against the evidence contract.\n\nA further fine of EUR 50,000 was imposed on ZhongDe Waste Technology AG in May 2026. A further fine of EUR 50,000 was imposed on ZhongDe Waste Technology AG in May 2026.`,
  keywords: ["cyber", "operational resilience", "technology"],
  sourceRecords: [
    record({ id: "cyber-name-only", firm_individual: "C5Haven Cyber Ltd", raw_firm_individual: "C5Haven Cyber Ltd", breach_type: "AML controls", summary: "C5Haven Cyber Ltd failed to maintain AML controls.", amount: 0, amount_verified: false }),
    record({ id: "cyber-grounded", firm_individual: "Equiniti Trust Company LLC", breach_type: "Cyber intrusion", summary: "The firm failed to protect client funds against a cyber intrusion.", amount: 0, amount_verified: false }),
  ],
};

const legacyOctoberRecords = Array.from({ length: 9 }, (_, index) => record({
  id: `october-${index + 1}`,
  regulator: index < 3 ? "BaFin" : index < 6 ? "SEC" : "FRB",
  date_issued: index === 0 ? "2026-09-22" : index === 8 ? "2026-10-02" : "2026-09-28",
  firm_individual: `October Firm ${index + 1}`,
  amount: index === 0 ? 12500 : 0,
  amount_verified: index === 0,
  currency: index === 0 ? "EUR" : "UNKNOWN",
  breach_type: index === 0 ? "Reporting failures; fine imposed" : "Regulatory action",
}));

describe("article evidence contract", () => {
  it("restores the authoritative 25-record/date-window About the Data block after copy editing", () => {
    const records = Array.from({ length: 25 }, (_, index) => record({
      id: `blocked-run-${index + 1}`,
      date_issued: index === 0 ? "2025-12-17" : index === 24 ? "2026-10-08" : `2026-01-${String(index).padStart(2, "0")}`,
      regulator: index < 10 ? "FINRA" : "FCA",
    }));
    const rejectedCopy = `## Overview\n\nA supported article overview.\n\n## About the Data\n\nThis analysis uses 5 unique source records. The evidence dates run from 2026-02-24 to 2026-08-18.\n\nThis additional methodology note and its citation must survive copy editing: [official FCA record](https://www.fca.org.uk/news).\n\n## Key Takeaways\n\n- A source-grounded takeaway.`;
    const restored = preserveAboutDataContract(rejectedCopy, records);
    expect(restored).toContain("25 unique source records");
    expect(restored).toContain("2025-12-17 to 2026-10-08");
    expect(restored).not.toMatch(/\b5 unique source records\b/);
    expect(restored).not.toContain("2026-02-24 to 2026-08-18");
    expect(restored).toContain("This additional methodology note and its citation must survive copy editing");
    expect(restored).toContain("[official FCA record](https://www.fca.org.uk/news)");
    expect(getArticleEvidenceContractIssues(restored, records, buildArticleEvidenceContract(records))).toEqual([]);

    const conflictingElsewhere = `This analysis uses 5 records from 2026-02-24 to 2026-08-18.\n\n${restored}`;
    expect(getArticleEvidenceContractIssues(conflictingElsewhere, records)).toContain(
      "Declared evidence-record count does not match the evidence contract (25 unique records)",
    );
    expect(getArticleEvidenceContractIssues(conflictingElsewhere, records)).toContain(
      "Declared evidence date window does not match the contract (2025-12-17 to 2026-10-08)",
    );
  });
  it("leaves a missing About the Data section untouched and lets the existing evidence gate reject it", () => {
    const records = [record()];
    const content = "## Overview\n\nA grounded overview with sufficient detail.";
    expect(preserveAboutDataContract(content, records)).toBe(content);
    const report = runQualityGate({ title: "Test", excerpt: "Test excerpt", keywords: ["test"], content }, records, { minimumWords: 0, maximumWords: 1000 }, buildArticleEvidenceContract(records));
    expect(report.checks.find((check) => check.id === "section_structure")).toMatchObject({
      passed: false,
      message: expect.stringContaining("About the Data section missing"),
    });
  });
  it("inserts methodology into an empty CRLF About the Data section without joining the next heading", () => {
    const records = [record()];
    const content = "## About the Data\r\n\r\n## Key Takeaways\r\n\r\nA retained takeaway paragraph.";
    const restored = preserveAboutDataContract(content, records);
    expect(restored).toContain("## About the Data\r\n\r\nThis analysis uses 1 unique source records");
    expect(restored).toContain("## Key Takeaways\r\n\r\nA retained takeaway paragraph.");
    expect(restored).toMatch(/distinct source amounts\..*\r\n\r\n## Key Takeaways/s);
  });
  it("fails the frozen published cyber defect snapshot for entity-name relevance, escalation, and duplicate sentence", () => {
    const report = runQualityGate(legacyCyber, legacyCyber.sourceRecords, { minimumWords: 0, maximumWords: 10_000 });
    const checks = new Map(report.checks.map((check) => [check.id, check]));
    expect(checks.get("grounded_cyber_topic")?.passed).toBe(false);
    expect(checks.get("article_evidence_contract")?.message).toContain("Comparative trend language requires");
    expect(checks.get("no_duplicates")?.passed).toBe(false);
  });

  it("catches the frozen October article's six-versus-nine and two-versus-three methodology drift", () => {
    const content = "This analysis includes six regulatory actions from BaFin and the SEC, spanning from 22 September 2026 to 2 October 2026. One record includes a verified monetary penalty.";
    const issues = getArticleEvidenceContractIssues(content, legacyOctoberRecords, buildArticleEvidenceContract(legacyOctoberRecords));
    expect(issues).toContain("Declared evidence-record count does not match the evidence contract (9 unique records)");
    expect(issues).toContain("Declared regulator list does not match the evidence contract (3 distinct regulators)");
  });

  it("catches the frozen AML article's unknown-as-non-monetary and unsupported-global framing", () => {
    const records = [record({ id: "aml-unknown", firm_individual: "Mount Pritchard and District Community Club Ltd", amount: 0,
      amount_verified: false, currency: "UNKNOWN", breach_type: "Civil penalty orders", summary: "AUSTRAC applied for civil penalty orders against the club." })];
    const content = "Global AML Enforcement: Key Trends and Regulatory Expectations. Data from 30 enforcement actions demonstrates a sustained, global regulatory focus. Other regulators have pursued significant non-monetary actions.";
    const issues = getArticleEvidenceContractIssues(content, records, buildArticleEvidenceContract(records));
    expect(issues).toContain("Unverified penalty amounts cannot be categorised collectively as non-monetary actions");
    expect(issues).toContain("Whole-market or whole-period assertion exceeds the selected source-record snapshot");
    expect(getArticleEvidenceContractIssues("Mount Pritchard is not a non-monetary case; the amount is unknown.", records, buildArticleEvidenceContract(records)))
      .not.toContain("Unknown penalty amount for Mount Pritchard and District Community Club Ltd is described as non-monetary");
  });

  it("reconciles unique record IDs, regulators, dates and verified amounts deterministically", () => {
    const records = [record(), record({ id: "r2", regulator: "SEC", date_issued: "2026-10-19", amount: 125000 })];
    expect(buildArticleEvidenceContract(records)).toEqual({
      version: 1,
      recordIds: ["r1", "r2"],
      uniqueRecordCount: 2,
      regulators: ["FCA", "SEC"],
      dateWindow: { start: "2026-10-01", end: "2026-10-19" },
      verifiedAmountRecordCount: 2,
      verifiedAmountCount: 1,
      periodRecordCounts: [{ period: "2026-10", recordCount: 2 }],
    });
  });

  it("validates the exact generated methodology summary fields independently", () => {
    const source = [
      record({ id: "r1", regulator: "FCA", date_issued: "2026-09-22", amount: 50000 }),
      record({ id: "r2", regulator: "SEC", firm_individual: "Second Ltd", date_issued: "2026-10-02", amount: 75000 }),
    ];
    const contract = buildArticleEvidenceContract(source);
    const generated = renderArticleEvidenceMethodology(contract);
    expect(getArticleEvidenceContractIssues(generated, source, contract)).toEqual([]);
    const mutations = [
      generated.replace("2 unique source records", "3 unique source records"),
      generated.replace("across 2 regulators", "across 3 regulators"),
      generated.replace("2026-10-02", "2026-10-03"),
      generated.replace("2 source records have", "1 source records have"),
      generated.replace("2 distinct source amounts", "3 distinct source amounts"),
    ];
    const expectedIssues = [
      "Declared evidence-record count does not match the evidence contract (2 unique records)",
      "Declared regulator count does not match the evidence contract (2 distinct regulators)",
      "Declared evidence date window does not match the contract (2026-09-22 to 2026-10-02)",
      "Declared verified-amount record count does not match the evidence contract (2 verified records)",
      "Declared verified-amount count does not match the evidence contract (2 verified records; 2 distinct amounts)",
    ];
    mutations.forEach((content, index) => {
      expect(getArticleEvidenceContractIssues(content, source, contract), `mutated methodology ${index}`).toContain(expectedIssues[index]);
    });
    expect(getArticleEvidenceContractIssues(mutations[3]!, source, contract))
      .not.toContain("Declared evidence-record count does not match the evidence contract (2 unique records)");
  });

  it("retains strict rejection of inaccurate article-level evidence scope while accepting exact deterministic methodology", () => {
    const source = Array.from({ length: 19 }, (_, index) => record({
      id: `aml-${index + 1}`,
      regulator: ["FINRA", "CBUAE", "OCC", "SFC", "CBI"][index % 5]!,
      firm_individual: `AML Firm ${index + 1}`,
      date_issued: index === 0 ? "2025-11-06" : index === 18 ? "2026-10-08" : "2026-03-15",
      amount: 0,
      amount_verified: false,
      currency: "UNKNOWN",
      breach_type: "AML control failure",
      summary: "The regulator identified a control failure.",
    }));
    const contract = buildArticleEvidenceContract(source);
    const badModelScope = "This selected sample includes 20 cases across 4 regulators. Records cover 2025-11-05 to 2026-10-08.";
    expect(getArticleEvidenceContractIssues(badModelScope, source, contract)).toEqual(expect.arrayContaining([
      "Declared regulator count does not match the evidence contract (5 distinct regulators)",
      "Declared evidence-record count does not match the evidence contract (19 unique records)",
      "Declared evidence date window does not match the contract (2025-11-06 to 2026-10-08)",
    ]));
    expect(getArticleEvidenceContractIssues(renderArticleEvidenceMethodology(contract), source, contract)).toEqual([]);
  });

  it("rejects entity-name-only cyber relevance, unknown-as-non-monetary labels, and unsupported snapshot trends", () => {
    const source = [record({
      firm_individual: "C5Haven Cyber Ltd",
      amount: 0,
      amount_verified: false,
      breach_type: "AML controls failure",
      summary: "The firm failed to apply AML controls; no penalty amount was disclosed.",
    })];
    const contract = buildArticleEvidenceContract(source);
    const issues = getArticleEvidenceContractIssues(
      "Cyber enforcement is escalating. C5Haven Cyber Ltd received a non-monetary penalty.", source, contract,
    );
    expect(issues).toContain("Comparative trend language requires an explicitly scoped monthly action-count comparison that matches the source records; a multi-period snapshot alone is insufficient");
    expect(issues).toContain("Unknown penalty amount for C5Haven Cyber Ltd is described as non-monetary");
  });

  it("allows explicitly bounded analysis with source-backed periods and does not require five cases", () => {
    const source = [
      record({ date_issued: "2026-09-14" }),
      record({ id: "r2", firm_individual: "Second Ltd", date_issued: "2026-10-14", amount: 90000 }),
    ];
    expect(getArticleEvidenceContractIssues(
      "In this selected two-month sample, the cases show different approaches; it is not a market-wide trend.",
      source, buildArticleEvidenceContract(source),
    )).toEqual([]);
  });

  it("flags a stale or missing contract", () => {
    const source = [record()];
    const contract = buildArticleEvidenceContract(source);
    expect(getArticleEvidenceContractIssues("A bounded case analysis.", source, { ...contract, uniqueRecordCount: 9 })[0])
      .toMatch(/missing, stale, or inconsistent/);
  });

  it("reconciles article-level regulator and record counts with the evidence contract", () => {
    const source = [record(), record({ id: "r2", regulator: "SEC", firm_individual: "Second Ltd", date_issued: "2026-10-19" })];
    const contract = buildArticleEvidenceContract(source);
    expect(getArticleEvidenceContractIssues("This sample covers 2 regulators and 2 records.", source, contract)).toEqual([]);
    expect(getArticleEvidenceContractIssues("This October dataset spans 6 regulators and contains 9 cases.", source, contract))
      .toEqual(expect.arrayContaining([
        "Declared regulator count does not match the evidence contract (2 distinct regulators)",
        "Declared evidence-record count does not match the evidence contract (2 unique records)",
      ]));
    expect(getArticleEvidenceContractIssues("This selected dataset contains thirty actions across two regulators.", source, contract))
      .toContain("Declared evidence-record count does not match the evidence contract (2 unique records)");
  });

  it("reconciles regulator names, verified-record counts, distinct amounts, and date window", () => {
    const source = [
      record({ id: "fca", regulator: "FCA", date_issued: "2026-09-22" }),
      record({ id: "sec", regulator: "SEC", date_issued: "2026-10-02", amount: 125000 }),
    ];
    const contract = buildArticleEvidenceContract(source);
    expect(getArticleEvidenceContractIssues("This analysis uses 2 actions across 2 regulators: FCA and SEC. Records cover 22 September 2026 to 2 October 2026. Two records have a verified penalty amount, comprising one distinct source amount.", source, contract)).toEqual([]);
    expect(getArticleEvidenceContractIssues("This analysis uses 2 actions across 2 regulators: AFM and SEC. Records cover 22 September 2026 to 2 October 2026. One record has a verified penalty amount, comprising one distinct source amount.", source, contract))
      .toContain("Declared regulator names do not match the evidence contract (2 distinct regulators)");
    expect(getArticleEvidenceContractIssues("This analysis uses 2 actions across 2 regulators: FCA and SEC. Records cover 22 September 2026 to 3 October 2026. One record has a verified penalty amount, comprising one distinct source amount.", source, contract))
      .toContain("Declared evidence date window does not match the contract (2026-09-22 to 2026-10-02)");
    expect(renderArticleEvidenceMethodology(contract)).toContain("2026-09-22 to 2026-10-02");
  });

  it("keeps Austrian FMA and New Zealand FMA aliases distinct", () => {
    const source = [
      record({ id: "at", regulator: "FMAAT", firm_individual: "Austrian Ltd" }),
      record({ id: "nz", regulator: "FMANZ", firm_individual: "New Zealand Ltd" }),
    ];
    const contract = buildArticleEvidenceContract(source);
    expect(getArticleEvidenceContractIssues("This analysis uses 2 records across 2 regulators: Austria's Financial Market Authority and FMA New Zealand.", source, contract)).toEqual([]);
    expect(getArticleEvidenceContractIssues("This analysis uses 2 records across 2 regulators: FMA New Zealand and Financial Markets Authority New Zealand.", source, contract))
      .toContain("Declared regulator names do not match the evidence contract (2 distinct regulators)");
  });

  it("parses spelled-out methodology counts and permits only source-matched comparative baselines", () => {
    const source = [
      record({ id: "sep1", date_issued: "2026-09-14" }),
      record({ id: "oct1", regulator: "SEC", date_issued: "2026-10-14" }),
      record({ id: "oct2", date_issued: "2026-10-18" }),
    ];
    const contract = buildArticleEvidenceContract(source);
    expect(getArticleEvidenceContractIssues("This selected sample includes three cases across two regulators.", source, contract)).toEqual([]);
    expect(getArticleEvidenceContractIssues("This selected sample covers six actions and two regulators.", source, contract))
      .toContain("Declared evidence-record count does not match the evidence contract (3 unique records)");
    expect(getArticleEvidenceContractIssues("In this selected sample actions rose from 1 action during September 2026 to 2 actions during October 2026.", source, contract)).toEqual([]);
    expect(getArticleEvidenceContractIssues("In this selected sample actions rose from 2 actions during September 2026 to 1 action during October 2026.", source, contract))
      .toContain("Comparative trend language requires an explicitly scoped monthly action-count comparison that matches the source records; a multi-period snapshot alone is insufficient");
    expect(getArticleEvidenceContractIssues("The selected sample is not a trend and does not establish escalation.", source, contract)).toEqual([]);
    expect(getArticleEvidenceContractIssues("Cyber enforcement is escalating. This selected sample does not establish a trend.", source, contract))
      .toContain("Comparative trend language requires an explicitly scoped monthly action-count comparison that matches the source records; a multi-period snapshot alone is insufficient");
    expect(getArticleEvidenceContractIssues("The selected sample is not across the entire market.", source, contract)).toEqual([]);
  });

  it("grounds cyber concepts in breach or summary text, never in a firm name", () => {
    const source = [record({ firm_individual: "C5Haven Cyber Ltd", breach_type: "AML controls", summary: "AML control failures.", amount_verified: false, amount: 0 })];
    const article = { title: "Cyber enforcement", excerpt: "A bounded review of regulatory enforcement findings and selected enforcement evidence.", content: "Cybersecurity enforcement is increasing.", keywords: [] };
    const check = (records: EnforcementRecord[]) => runQualityGate(article, records, { minimumWords: 0, maximumWords: 500 }).checks.find((item) => item.id === "grounded_cyber_topic");
    expect(check(source)?.passed).toBe(false);
    expect(check([{ ...source[0]!, summary: "The regulator found failures in cybersecurity and incident response controls." }])?.passed).toBe(true);
  });

  it("strips repeated entity names before grounding and requires every source for focused cyber articles", () => {
    const nameOnly = record({
      firm_individual: "C5Haven Cyber Ltd", amount: 0, amount_verified: false,
      summary: "C5Haven Cyber Ltd failed to maintain AML controls.",
    });
    const grounded = record({ id: "r2", firm_individual: "Secure Payments Ltd", amount: 0, amount_verified: false,
      breach_type: "Cyber incident disclosure", summary: "The firm failed to report a cyber intrusion to the regulator." });
    const focusedArticle = { title: "Cyber enforcement review", excerpt: "A review of cyber controls", content: "The selected cases raise questions about cybersecurity reporting.", keywords: [] };
    const focusedCheck = runQualityGate(focusedArticle, [nameOnly, grounded], { minimumWords: 0, maximumWords: 500 }).checks.find((item) => item.id === "grounded_cyber_topic");
    expect(focusedCheck?.passed).toBe(false);
    const roundup = { ...focusedArticle, title: "Monthly enforcement review", excerpt: "A selected monthly review of official action." };
    const roundupCheck = runQualityGate(roundup, [nameOnly, grounded], { minimumWords: 0, maximumWords: 500 }).checks.find((item) => item.id === "grounded_cyber_topic");
    expect(roundupCheck?.passed).toBe(true);
  });

  it("filters entity-name-only and generic-technology matches before cyber source sampling", () => {
    const nameOnly = record({ id: "name", firm_individual: "C5Haven Cyber Ltd", breach_type: "Technology controls", summary: "C5Haven Cyber Ltd failed AML controls." });
    const grounded = record({ id: "grounded", firm_individual: "Secure Payments Ltd", breach_type: "Cyber incident", summary: "The regulator identified a cyber intrusion." });
    expect(prepareEvidenceRecords([nameOnly, grounded], ["cyber", "technology"]).map((item) => item.id)).toEqual(["grounded"]);
  });

  it("uses shared taxonomy grounding for ICT, technology risk, and operational resilience records", () => {
    const concepts = [
      { id: "ict-risk", phrase: "ICT risk", breach_type: "ICT risk management failure", summary: "The firm failed to manage ICT risk controls." },
      { id: "technology-risk", phrase: "technology risk", breach_type: "Technology risk governance", summary: "The firm failed to oversee technology risk." },
      { id: "operational-resilience", phrase: "operational resilience", breach_type: "Operational resilience failures", summary: "The firm's operational resilience arrangements were inadequate." },
    ];
    for (const concept of concepts) {
      const eligible = record({ ...concept, firm_individual: `Ordinary Firm ${concept.id}`, amount: 0, amount_verified: false });
      expect(hasGroundedCyberConcept(eligible), concept.id).toBe(true);
      expect(prepareEvidenceRecords([eligible], [concept.phrase]).map((item) => item.id), concept.id).toEqual([concept.id]);
    }

    const nameOnly = record({ id: "taxonomy-name-only", firm_individual: "Cyber ICT Resilience Ltd", breach_type: "Generic technology controls", summary: "The firm failed AML controls." });
    expect(hasGroundedCyberConcept(nameOnly)).toBe(false);
    expect(prepareEvidenceRecords([nameOnly], ["ICT"]).map((item) => item.id)).toEqual([]);
  });

  it("does not let a cached passing quality report bypass the publication-boundary grounding check", () => {
    const cachedQualityReport = { passed: true };
    const nameOnly = record({
      firm_individual: "C5Haven Cyber Ltd",
      breach_type: "AML controls",
      summary: "C5Haven Cyber Ltd failed AML controls.",
      amount: 0,
      amount_verified: false,
    });
    expect(cachedQualityReport.passed).toBe(true);
    expect(() => assertFreshArticleQuality({
      title: "Cyber enforcement review",
      excerpt: "A review of cyber controls",
      content: "Selected cases raise questions about cybersecurity reporting.",
      keywords: ["cyber"],
    }, [nameOnly], "evidence-brief", buildArticleEvidenceContract([nameOnly]), { minimumWords: 0, maximumWords: 500 }))
      .toThrow(/grounded_cyber_topic/);
  });

  it("rejects missing IDs and conflicting duplicate record IDs", () => {
    expect(() => buildArticleEvidenceContract([record({ id: "" })])).toThrow(/without an ID/);
    expect(() => buildArticleEvidenceContract([record(), record({ summary: "Conflicting source record data." })])).toThrow(/conflicting source records/);
  });

  it("detects a duplicated sentence even when surrounding paragraphs differ", () => {
    const repeated = "The regulator imposed a financial penalty after identifying serious weaknesses in the firm's anti-money laundering controls.";
    const article = {
      title: "A limited enforcement review",
      excerpt: "A bounded review of regulatory enforcement findings and selected evidence.",
      content: `${repeated}\n\nA separate analysis paragraph adds context.\n\n${repeated}`,
      keywords: [],
    };
    const check = runQualityGate(article, [record()], { minimumWords: 0, maximumWords: 500 }).checks.find((item) => item.id === "no_duplicates");
    expect(check?.passed).toBe(false);
    expect(check?.message).toContain("Repeated sentence");
  });

  it("uses the bounded evidence-brief word range without relaxing other article types", () => {
    expect(getArticleQualityWordRange("evidence-brief")).toEqual({ minimumWords: 500, maximumWords: 1000 });
    expect(getArticleQualityWordRange("thematic")).toEqual({ minimumWords: 1100, maximumWords: 1600 });
    const checkAt = (count: number) => runQualityGate({
      title: "A limited enforcement review",
      excerpt: "This bounded evidence brief reviews selected official enforcement records and explains their limits.",
      content: Array.from({ length: count }, () => "analysis").join(" "),
      keywords: [],
    }, [], getArticleQualityWordRange("evidence-brief")).checks.find((item) => item.id === "word_count")?.passed;
    expect(checkAt(567)).toBe(true);
    expect(checkAt(499)).toBe(false);
    expect(checkAt(1001)).toBe(false);
  });
});
