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
    legalStatus: "active",
    legalInstrumentId: "Executive Order 1",
    legalInstrumentUrl: "https://example.test/legal/1",
    officialGuidanceUrl: candidate.measureEvidenceUrl,
    legalEffectiveFrom: null,
    legalEffectiveTo: null,
    sourceLastUpdated: "2026-07-17",
    evidenceLocator: "Official programme page",
    measures: ["asset-freeze"],
    broadTradeProhibition: false,
    broadFinancialProhibition: false,
    materialNonDesignationRestriction: false,
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
    expect(result.basis).toBe("prepared-legal-facts");
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

  it("falls back to the catalogue tier when no legal facts were prepared, and says so", () => {
    // The evidence preparer only returns legal facts for EU regimes; OFAC, UK
    // and UN records always arrive with nulls. Requiring them made 67 of the
    // 117 records undecidable and froze the pipeline from 20 August. The tier
    // decides those records, and `basis` records that it did.
    const decision = decideSanctionsRecord(candidate, record({
      legalStatus: null,
      measures: null,
      broadTradeProhibition: null,
      broadFinancialProhibition: null,
      materialNonDesignationRestriction: null,
    }), "2026-07-17T10:00:00.000Z");
    expect(decision.basis).toBe("current-catalogue-and-published-tier-rule");
    expect(decision.record.finalTier).toBe(candidate.proposedTier);
  });

  it("prefers prepared evidence over the tier where both are available", () => {
    const decision = decideSanctionsRecord(candidate, record(), "2026-07-17T10:00:00.000Z");
    expect(decision.basis).toBe("prepared-legal-facts");
  });

  it("still fails closed where the catalogue asserts no tier at all", () => {
    expect(() => decideSanctionsRecord(
      { ...candidate, proposedTier: undefined as never },
      record({ proposedTier: undefined as never }),
      "2026-07-17T10:00:00.000Z",
    )).toThrow(/cannot be decided|no longer matches/);
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

describe("every catalogue candidate stays decidable", () => {
  // The regression this guards: "fail-closed sanctions" (a5651e3) required
  // legal facts the evidence preparer only produces for EU regimes, so 67 of
  // the 117 candidates became undecidable and the weekly promotion died on
  // 23 August with the sanctions data frozen at 16 August. A gate that no
  // input can satisfy is not a safe gate, it is an outage.
  const preparedFor = (candidate: SanctionsRegimeCandidate, euStyleFacts: boolean): DeterministicReviewRecord => ({
    ...candidate,
    country: candidate.iso2,
    reviewDecision: null,
    finalTier: null,
    coverageState: null,
    legalStatus: euStyleFacts ? "active" : null,
    legalInstrumentId: "instrument",
    legalInstrumentUrl: candidate.measureEvidenceUrl,
    officialGuidanceUrl: candidate.measureEvidenceUrl,
    legalEffectiveFrom: null,
    legalEffectiveTo: null,
    sourceLastUpdated: null,
    evidenceLocator: "locator",
    measures: euStyleFacts ? ["asset-freeze"] : null,
    broadTradeProhibition: euStyleFacts ? false : null,
    broadFinancialProhibition: euStyleFacts ? false : null,
    materialNonDesignationRestriction: euStyleFacts ? false : null,
    decisionEvidenceUrl: candidate.measureEvidenceUrl,
    preparationEvidence: { sourceSha256: "a".repeat(64), retrievedAt: "2026-07-17T09:00:00.000Z" },
  } as unknown as DeterministicReviewRecord);

  it("decides a non-EU candidate whose legal facts are all null", () => {
    for (const tier of ["targeted", "sectoral", "comprehensive"] as const) {
      const item = { ...candidate, proposedTier: tier };
      const decision = decideSanctionsRecord(item, preparedFor(item, false), "2026-07-17T10:00:00.000Z");
      expect(decision.record.finalTier, tier).toBe(tier);
      expect(decision.basis, tier).toBe("current-catalogue-and-published-tier-rule");
    }
  });

  it("maps each tier to the scope it means by definition", () => {
    const scopeFor = (tier: "targeted" | "sectoral" | "comprehensive") => {
      const item = { ...candidate, proposedTier: tier };
      const { record: decided } = decideSanctionsRecord(item, preparedFor(item, false), "2026-07-17T10:00:00.000Z");
      return {
        trade: decided.broadTradeProhibition,
        finance: decided.broadFinancialProhibition,
        material: decided.materialNonDesignationRestriction,
      };
    };
    expect(scopeFor("comprehensive")).toEqual({ trade: true, finance: true, material: true });
    expect(scopeFor("sectoral")).toEqual({ trade: false, finance: false, material: true });
    expect(scopeFor("targeted")).toEqual({ trade: false, finance: false, material: false });
  });
});
