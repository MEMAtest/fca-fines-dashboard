import { describe, expect, it } from "vitest";
import { SANCTIONS_REGIME_CANDIDATES } from "../../../src/data/sanctionsRegimeCandidates.js";
import { validateCompletedSanctionsReview, type CompletedSanctionsReviewRecord } from "./sanctionsReviewImport.js";

function completed(): CompletedSanctionsReviewRecord[] {
  return SANCTIONS_REGIME_CANDIDATES.map((candidate, index) => ({
    ...candidate,
    relationship: candidate.relationship === "situation-related" ? "situation-related" : "direct-country-exposure",
    reviewDecision: candidate.relationship === "situation-related" ? "rejected" : "approved",
    finalTier: candidate.relationship === "situation-related" ? null : candidate.proposedTier,
    decisionEvidenceUrl: `https://official-evidence.example/legal/${index}`,
    reviewer: "Independent Reviewer",
    reviewerOrganisation: "Independent Compliance LLP",
    reviewedAt: "2026-07-16T12:00:00.000Z",
    reviewNote: "Decision confirmed against the operative legal measure.",
  }));
}

describe("completed sanctions review import", () => {
  it("normalises a complete independently reviewed pack for database application", () => {
    const rows = validateCompletedSanctionsReview({ candidates: SANCTIONS_REGIME_CANDIDATES, records: completed() });
    expect(rows).toHaveLength(SANCTIONS_REGIME_CANDIDATES.length);
    expect(rows.filter((row) => row.status === "rejected").length).toBeGreaterThan(0);
    expect(rows.every((row) => row.reviewed_by && row.reviewer_organisation && row.decision_evidence_url)).toBe(true);
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
      .toThrow(/measure-specific HTTPS URL/);
  });
});
