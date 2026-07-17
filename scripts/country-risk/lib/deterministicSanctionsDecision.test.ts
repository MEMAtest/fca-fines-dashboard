import { describe, expect, it } from "vitest";
import type { SanctionsRegimeCandidate } from "../../../src/data/sanctionsRegimeCandidates.js";
import { completeInventoryDisposition, decideSanctionsRecord, type DeterministicReviewRecord } from "./deterministicSanctionsDecision.js";

const candidate: SanctionsRegimeCandidate = {
  iso2: "AA",
  imposer: "OFAC",
  regime: "Example sanctions",
  proposedTier: "targeted",
  relationship: "direct-country-exposure",
  catalogueUrl: "https://example.test/catalogue",
  measureEvidenceUrl: "https://example.test/programme",
  rationale: "Designation-led programme.",
  reviewedAsOf: "2026-07-17",
  reviewStatus: "pending-independent-review",
};

function record(overrides: Partial<DeterministicReviewRecord> = {}): DeterministicReviewRecord {
  return {
    ...candidate,
    reviewDecision: null,
    finalTier: null,
    coverageState: null,
    legalStatus: null,
    legalInstrumentId: "Executive Order 1",
    legalInstrumentUrl: "https://example.test/legal/1",
    officialGuidanceUrl: candidate.measureEvidenceUrl,
    legalEffectiveFrom: null,
    legalEffectiveTo: null,
    sourceLastUpdated: "2026-07-17",
    evidenceLocator: "Official programme page",
    measures: [],
    broadTradeProhibition: null,
    broadFinancialProhibition: null,
    materialNonDesignationRestriction: null,
    preparedBy: null,
    preparedAt: null,
    decisionEvidenceUrl: "https://example.test/legal/1",
    reviewer: null,
    reviewerOrganisation: null,
    reviewedAt: null,
    reviewNote: null,
    preparationEvidence: {
      sourceSha256: "a".repeat(64),
      retrievedAt: "2026-07-17T09:00:00.000Z",
      pageTitle: "Example sanctions",
      warnings: [],
    },
    ...overrides,
  };
}

describe("deterministic sanctions decisions", () => {
  it("turns a current designation-led catalogue record into targeted exposure", () => {
    const result = decideSanctionsRecord(candidate, record(), "2026-07-17T10:00:00.000Z");
    expect(result.basis).toBe("current-catalogue-and-published-tier-rule");
    expect(result.record).toMatchObject({
      reviewDecision: "approved",
      finalTier: "targeted",
      coverageState: "active-direct",
      legalStatus: "active",
      broadTradeProhibition: false,
      broadFinancialProhibition: false,
      materialNonDesignationRestriction: false,
    });
    expect(result.record.measures).toContain("asset-freeze");
  });

  it("excludes a situation-related regime from country exposure", () => {
    const situation = { ...candidate, relationship: "situation-related" as const };
    const result = decideSanctionsRecord(situation, record({ relationship: "situation-related" }), "2026-07-17T10:00:00.000Z");
    expect(result.basis).toBe("situation-related-exclusion");
    expect(result.record).toMatchObject({
      reviewDecision: "rejected",
      finalTier: null,
      coverageState: "active-situation-related",
    });
  });

  it("classifies catalogue exclusions deterministically", () => {
    expect(completeInventoryDisposition({
      imposer: "OFAC",
      itemKey: "global-magnitsky",
      label: "Global Magnitsky Sanctions",
      url: "https://example.test/global-magnitsky",
      proposedDisposition: "proposed-exclusion",
      candidateKeys: [],
      rationale: "Thematic human-rights programme.",
      finalDisposition: null,
      reviewerNote: null,
    }).finalDisposition).toBe("excluded-thematic");
  });
});
