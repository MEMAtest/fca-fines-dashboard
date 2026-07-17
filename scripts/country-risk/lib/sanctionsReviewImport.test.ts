import { describe, expect, it } from "vitest";
import { SANCTIONS_REGIME_CANDIDATES } from "../../../src/data/sanctionsRegimeCandidates.js";
import type { SanctionsMeasureType } from "../../../src/data/sanctionsEvidence.js";
import {
  validateCompletedSanctionsReview,
  validateSanctionsCatalogueReviews,
  validateSanctionsInventoryDispositions,
  type CompletedSanctionsReviewRecord,
} from "./sanctionsReviewImport.js";

function facts(tier: "targeted" | "sectoral" | "comprehensive"): {
  measures: SanctionsMeasureType[];
  broadTrade: boolean;
  broadFinancial: boolean;
  material: boolean;
} {
  if (tier === "comprehensive") return {
    measures: ["import-restriction", "financial-restriction"],
    broadTrade: true,
    broadFinancial: true,
    material: true,
  };
  if (tier === "sectoral") return {
    measures: ["arms-embargo"],
    broadTrade: false,
    broadFinancial: false,
    material: true,
  };
  return {
    measures: ["asset-freeze"],
    broadTrade: false,
    broadFinancial: false,
    material: false,
  };
}

function completed(): CompletedSanctionsReviewRecord[] {
  return SANCTIONS_REGIME_CANDIDATES.map((candidate, index) => {
    const rejected = candidate.relationship === "situation-related";
    const scope = facts(candidate.proposedTier);
    return {
      ...candidate,
      relationship: candidate.relationship,
      reviewDecision: rejected ? "rejected" : "approved",
      finalTier: rejected ? null : candidate.proposedTier,
      coverageState: rejected ? "active-situation-related" : "active-direct",
      legalStatus: "active",
      legalInstrumentId: `LEGAL-${index}`,
      legalInstrumentUrl: `https://official-evidence.example/instrument/${index}`,
      officialGuidanceUrl: candidate.measureEvidenceUrl,
      legalEffectiveFrom: "2026-01-01",
      legalEffectiveTo: null,
      sourceLastUpdated: "2026-07-16",
      evidenceLocator: `Article ${index + 1}`,
      measures: scope.measures,
      broadTradeProhibition: scope.broadTrade,
      broadFinancialProhibition: scope.broadFinancial,
      materialNonDesignationRestriction: scope.material,
      preparedBy: "Evidence Analyst",
      preparedAt: "2026-07-16T09:00:00.000Z",
      decisionEvidenceUrl: `https://official-evidence.example/legal/${index}`,
      reviewer: "Independent Reviewer",
      reviewerOrganisation: "Independent Compliance LLP",
      reviewedAt: "2026-07-16T12:00:00.000Z",
      reviewNote: "Decision confirmed against the operative legal measure.",
    };
  });
}

describe("completed sanctions review import", () => {
  it("normalises a complete independently reviewed pack for database application", () => {
    const rows = validateCompletedSanctionsReview({ candidates: SANCTIONS_REGIME_CANDIDATES, records: completed() });
    expect(rows).toHaveLength(SANCTIONS_REGIME_CANDIDATES.length);
    expect(rows.filter((row) => row.status === "rejected").length).toBeGreaterThan(0);
    expect(rows.every((row) => row.reviewed_by && row.reviewer_organisation && row.legal_instrument_url)).toBe(true);
    expect(rows.every((row) => row.prepared_by !== row.reviewed_by)).toBe(true);
  });

  it("rejects incomplete packs", () => {
    expect(() => validateCompletedSanctionsReview({
      candidates: SANCTIONS_REGIME_CANDIDATES,
      records: completed().slice(1),
    })).toThrow(/coverage mismatch/);
  });

  it("rejects approvals that use a generic catalogue as evidence", () => {
    const records = completed();
    const directIndex = records.findIndex((record) => record.relationship === "direct-country-exposure");
    records[directIndex].decisionEvidenceUrl = records[directIndex].catalogueUrl;
    expect(() => validateCompletedSanctionsReview({ candidates: SANCTIONS_REGIME_CANDIDATES, records }))
      .toThrow(/measure-specific/);
  });

  it("binds all four catalogue attestations to current fingerprints and census", () => {
    const ids = {
      OFAC: "ofac-programmes",
      UK: "uk-regimes",
      EU: "eu-resources",
      UN: "un-consolidated-list",
    } as const;
    const sourceFingerprints = new Map(Object.values(ids).map((id) => [id, `${id}-fingerprint`]));
    const reviews = Object.entries(ids).map(([imposer, sourceId]) => ({
      imposer: imposer as keyof typeof ids,
      sourceId,
      catalogueUrl: `https://official.example/${sourceId}`,
      sourceFingerprint: `${sourceId}-fingerprint`,
      censusSha256: "c".repeat(64),
      reviewDecision: "approved" as const,
      reviewer: "Independent Reviewer",
      reviewerOrganisation: "Independent Compliance LLP",
      reviewedAt: "2026-07-16T12:00:00.000Z",
      reviewNote: "Every inventory item was mapped or explicitly excluded.",
    }));
    expect(validateSanctionsCatalogueReviews({ reviews, sourceFingerprints, censusSha256: "c".repeat(64) })).toHaveLength(4);
    expect(() => validateSanctionsCatalogueReviews({
      reviews,
      sourceFingerprints,
      censusSha256: "different-census",
    })).toThrow(/census fingerprint/);
  });

  it("requires a final disposition for every official catalogue item", () => {
    const expected = [{
      imposer: "OFAC" as const,
      itemKey: "official-item-1",
      label: "Official item",
      url: "https://official.example/item/1",
      proposedDisposition: "proposed-exclusion" as const,
      candidateKeys: [],
      rationale: "Thematic programme.",
    }];
    const catalogueReviews = [{
      imposer: "OFAC" as const,
      source_id: "ofac-programmes",
      catalogue_url: "https://official.example/ofac",
      source_fingerprint: "fingerprint",
      census_sha256: "census",
      status: "approved" as const,
      reviewed_by: "Independent Reviewer",
      reviewer_organisation: "Independent Compliance LLP",
      reviewed_at: "2026-07-16T12:00:00.000Z",
      review_note: "Complete catalogue reviewed.",
    }];
    expect(() => validateSanctionsInventoryDispositions({
      expected,
      completed: [{ ...expected[0], finalDisposition: null, reviewerNote: null }],
      catalogueReviews,
      censusSha256: "census",
    })).toThrow(/finalDisposition/);
    expect(validateSanctionsInventoryDispositions({
      expected,
      completed: [{
        ...expected[0],
        finalDisposition: "excluded-thematic",
        reviewerNote: "Confirmed as a non-geographic thematic programme.",
      }],
      catalogueReviews,
      censusSha256: "census",
    })).toHaveLength(1);
  });
});
