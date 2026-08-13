import { describe, expect, it } from "vitest";
import type { EnforcementCandidate, ExistingEnforcementRecord } from "../../../src/types/coverageAgent.js";
import { runCoverageIntelligenceAgent } from "./coverageIntelligence.js";

const resolver = (regulator: string) => regulator === "FCA" ? ["fca.org.uk"] : ["asic.gov.au"];

function candidate(overrides: Partial<EnforcementCandidate> = {}): EnforcementCandidate {
  return {
    id: "candidate-1", regulator: "FCA", sourceUrl: "https://www.fca.org.uk/news/firm-a", sourceContentHash: "source-hash",
    title: "FCA fines Firm A for reporting failures", entity: "Firm A Ltd", issuedDate: "2026-08-01", amount: 100000, currency: "GBP",
    summary: "Reporting control failures", candidateKind: "enforcement", contentType: "penalty", ...overrides,
  };
}

function record(overrides: Partial<ExistingEnforcementRecord> = {}): ExistingEnforcementRecord {
  return {
    id: "record-1", regulator: "FCA", entity: "Firm A Ltd", sourceUrl: "https://www.fca.org.uk/news/firm-a", noticeUrl: null,
    sourceContentHash: "source-hash", issuedDate: "2026-08-01", amount: 100000, currency: "GBP", summary: "Reporting control failures",
    publicCaseId: "case-1", requiresAmountReview: false, amountQuality: "verified", aggregateActionId: null, ...overrides,
  };
}

describe("Coverage and Content Intelligence Agent", () => {
  it("uses source content hashes before all fuzzy matching and stays report-only", () => {
    const result = runCoverageIntelligenceAgent([candidate()], [record()], undefined, { generatedAt: "2026-08-13T10:00:00.000Z", officialDomainResolver: resolver });
    expect(result.coverageReport).toMatchObject({ mode: "report_only", totals: { exact_duplicate: 1 } });
    expect(result.coverageReport.decisions[0]).toMatchObject({ kind: "exact_duplicate", confidence: "high", matchedRecordIds: ["record-1"] });
    expect(result.articleBriefs[0].readiness).toBe("ready_to_publish");
    expect(result.missingRecordImportQueue).toEqual([]);
  });

  it("does not call a related press release a duplicate", () => {
    const result = runCoverageIntelligenceAgent(
      [candidate({ sourceUrl: "https://www.fca.org.uk/publication/firm-a-final-notice", sourceContentHash: null, contentType: "notice", issuedDate: "2026-08-10" })],
      [record({ sourceContentHash: null, issuedDate: "2026-08-01" })], undefined, { officialDomainResolver: resolver },
    );
    expect(result.coverageReport.decisions[0].kind).toBe("related_action");
    expect(result.articleBriefs[0].readiness).toBe("ready_to_publish");
  });

  it("recognises a missing official fine and creates an import queue item without mutating records", () => {
    const result = runCoverageIntelligenceAgent([candidate({ id: "missing", entity: "Firm B", sourceUrl: "https://www.fca.org.uk/news/firm-b", sourceContentHash: null })], [], undefined, { officialDomainResolver: resolver });
    expect(result.coverageReport.decisions[0].kind).toBe("missing");
    expect(result.articleBriefs[0].readiness).toBe("import_or_create_first");
    expect(result.missingRecordImportQueue).toEqual([expect.objectContaining({ candidateId: "missing", requiresHumanReview: true })]);
  });

  it("keeps aggregate participant action distinct and flags repeated aggregate amounts", () => {
    const records = [
      record({ id: "a", entity: "Participant One", sourceContentHash: null, sourceUrl: "https://www.asic.gov.au/action/1", regulator: "ASIC", amount: 1122000, currency: "AUD" }),
      record({ id: "b", entity: "Participant Two", sourceContentHash: null, sourceUrl: "https://www.asic.gov.au/action/1", regulator: "ASIC", amount: 1122000, currency: "AUD" }),
    ];
    const result = runCoverageIntelligenceAgent([candidate({ regulator: "ASIC", sourceUrl: "https://www.asic.gov.au/action/1", sourceContentHash: null, entity: "Participant Three", aggregateAction: { actionId: "action-1", totalAmount: 1122000, currency: "AUD", participantCount: 3 } })], records, undefined, { officialDomainResolver: resolver });
    expect(result.coverageReport.decisions[0].kind).toBe("aggregate_participant_action");
    expect(result.articleBriefs[0].readiness).toBe("ready_after_qa_fix");
    expect(result.qaIssueQueue).toContainEqual(expect.objectContaining({ code: "aggregate_amount_repeated", recordIds: ["a", "b"] }));
  });

  it("rejects unofficial evidence and missing penalty amounts from publish-ready output", () => {
    const result = runCoverageIntelligenceAgent([candidate({ sourceUrl: "https://example.com/copied-story", amount: null })], [], undefined, { officialDomainResolver: resolver });
    expect(result.qaIssueQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unofficial_source", severity: "error" }),
      expect.objectContaining({ code: "missing_amount", severity: "warning" }),
    ]));
    expect(result.articleBriefs[0].readiness).toBe("import_or_create_first");
  });

  it("runs current-state SEO and hub QA alongside candidate analysis", () => {
    const result = runCoverageIntelligenceAgent([], [], {
      urls: [
        { url: "https://regactions.com/methodology/enforcement", status: 500, indexed: true },
        { url: "https://regactions.com/blog/global-enforcement", title: "Global Enforcement (27 July-10", indexed: true },
        { url: "https://fcafines.memaconsultants.com/fincen", status: 200, indexed: true },
      ],
      regulatorHubs: [{ regulator: "AMF", coverageEnd: "2024", latestRecordDate: "2026-07-28" }],
    }, { officialDomainResolver: resolver });
    expect(result.qaIssueQueue.map((issue) => issue.code)).toEqual(expect.arrayContaining(["broken_url", "malformed_title", "legacy_domain_indexed", "stale_hub_metadata"]));
  });

  it("flags duplicate RegActions records sharing the same source, entity and regulator", () => {
    const result = runCoverageIntelligenceAgent([], [record({ id: "one" }), record({ id: "two" })], undefined, { officialDomainResolver: resolver });
    expect(result.qaIssueQueue).toContainEqual(expect.objectContaining({ code: "duplicate_source_record", recordIds: ["one", "two"] }));
  });

  it("does not call separate actions on a generic regulator listing URL duplicates", () => {
    const result = runCoverageIntelligenceAgent([], [
      record({ id: "jan", sourceContentHash: null, sourceUrl: "https://www.fca.org.uk/news/enforcement", issuedDate: "2026-01-01", amount: 100000 }),
      record({ id: "feb", sourceContentHash: null, sourceUrl: "https://www.fca.org.uk/news/enforcement", issuedDate: "2026-02-01", amount: 125000 }),
    ], undefined, { officialDomainResolver: resolver });
    expect(result.qaIssueQueue.find((issue) => issue.code === "duplicate_source_record")).toBeUndefined();
  });

  it("does not call equal amounts on different action dates one aggregate penalty", () => {
    const result = runCoverageIntelligenceAgent([], [
      record({ id: "jan", regulator: "ASIC", entity: "Firm One", sourceContentHash: null, sourceUrl: "https://www.asic.gov.au/media/actions", issuedDate: "2026-01-01", amount: 500000, currency: "AUD" }),
      record({ id: "feb", regulator: "ASIC", entity: "Firm Two", sourceContentHash: null, sourceUrl: "https://www.asic.gov.au/media/actions", issuedDate: "2026-02-01", amount: 500000, currency: "AUD" }),
    ], undefined, { officialDomainResolver: resolver });
    expect(result.qaIssueQueue.find((issue) => issue.code === "aggregate_amount_repeated")).toBeUndefined();
  });

  it("does not make a penalty without a verified amount publish-ready when a record exists", () => {
    const result = runCoverageIntelligenceAgent([candidate({ amount: null })], [record({ sourceContentHash: null, amount: null })], undefined, { officialDomainResolver: resolver });
    expect(result.coverageReport.decisions[0].kind).toBe("exact_duplicate");
    expect(result.articleBriefs[0].readiness).toBe("ready_after_qa_fix");
  });

  it("does not introduce double punctuation when the official summary already ends a sentence", () => {
    const result = runCoverageIntelligenceAgent([candidate({ summary: "Reporting control failures." })], [], undefined, { officialDomainResolver: resolver });
    expect(result.articleBriefs[0].cause).not.toContain("failures..");
    expect(result.articleBriefs[0].failure).toBe("Reporting control failures");
  });

  it("turns an incomplete current-state audit into a visible fail-closed QA finding", () => {
    const result = runCoverageIntelligenceAgent([], [], { baseUrl: "https://regactions.com", fetchFailures: ["FCA unified-search check returned HTTP 503"] }, { officialDomainResolver: resolver });
    expect(result.qaIssueQueue).toContainEqual(expect.objectContaining({ code: "broken_url", severity: "error", message: expect.stringContaining("Current-state audit incomplete") }));
  });

  it("does not treat intelligence-only material as a missing fine", () => {
    const result = runCoverageIntelligenceAgent([candidate({ candidateKind: "intelligence", contentType: "investigation", amount: null })], [], undefined, { officialDomainResolver: resolver });
    expect(result.coverageReport.decisions[0].kind).toBe("intelligence_only");
    expect(result.articleBriefs[0].readiness).toBe("intelligence_only");
    expect(result.missingRecordImportQueue).toEqual([]);
  });
});
