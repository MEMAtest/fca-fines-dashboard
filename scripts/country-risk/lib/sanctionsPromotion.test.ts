import { describe, expect, it } from "vitest";
import { computeCountryRiskV2 } from "../../../src/data/countryRiskV2.js";
import { SANCTIONS_REGIME_CANDIDATES } from "../../../src/data/sanctionsRegimeCandidates.js";
import {
  buildPromotedSanctionsSnapshot,
  type SanctionsReviewRow,
  type SanctionsSourceAssuranceReport,
} from "./sanctionsPromotion.js";

const AS_OF = new Date("2026-07-16T12:00:00.000Z");
const SOURCE_IDS = ["ofac-programmes", "uk-regimes", "eu-resources", "un-consolidated-list"];

function sourceReport(overrides: Partial<SanctionsSourceAssuranceReport> = {}): SanctionsSourceAssuranceReport {
  return {
    checkedAt: "2026-07-16T11:00:00.000Z",
    requiresHumanReview: false,
    results: SOURCE_IDS.map((id) => ({
      id,
      url: `https://official.example/${id}`,
      retrievedAt: "2026-07-16T11:00:00.000Z",
      sha256: "a".repeat(64),
      healthy: true,
      changed: false,
      baselineMissing: false,
      fingerprint: `${id}-stable`,
    })),
    ...overrides,
  };
}

function rows(approvedIso2: string[] = []): SanctionsReviewRow[] {
  const approved = new Set(approvedIso2);
  return SANCTIONS_REGIME_CANDIDATES.map((candidate, index) => {
    const status = approved.has(candidate.iso2) ? "approved" as const : "rejected" as const;
    return {
      iso2: candidate.iso2,
      imposer: candidate.imposer,
      regime_name: candidate.regime,
      relationship: candidate.relationship,
      proposed_tier: candidate.proposedTier,
      final_tier: status === "approved" ? candidate.proposedTier : null,
      catalogue_url: candidate.catalogueUrl,
      measure_evidence_url: candidate.measureEvidenceUrl,
      decision_evidence_url: `https://official-evidence.example/legal-measure/${index}`,
      effective_at: candidate.reviewedAsOf,
      status,
      reviewed_by: "Independent Reviewer",
      reviewer_organisation: "Independent Compliance LLP",
      reviewed_at: "2026-07-16T10:00:00.000Z",
      review_note: status === "approved" ? "Confirmed against the operative legal measure." : "No direct current geographic exposure after legal review.",
    };
  });
}

describe("sanctions snapshot promotion gate", () => {
  it("fails closed when any classification remains pending", () => {
    const reviewRows = rows();
    reviewRows[0] = { ...reviewRows[0], status: "pending", reviewed_by: null };
    expect(() => buildPromotedSanctionsSnapshot({
      candidates: SANCTIONS_REGIME_CANDIDATES,
      rows: reviewRows,
      sourceReport: sourceReport(),
      asOf: AS_OF,
    })).toThrow(/1 pending decisions/);
  });

  it("rejects generic catalogue links as approval evidence", () => {
    const reviewRows = rows([SANCTIONS_REGIME_CANDIDATES[0].iso2]);
    reviewRows[0] = { ...reviewRows[0], decision_evidence_url: reviewRows[0].catalogue_url };
    expect(() => buildPromotedSanctionsSnapshot({
      candidates: SANCTIONS_REGIME_CANDIDATES,
      rows: reviewRows,
      sourceReport: sourceReport(),
      asOf: AS_OF,
    })).toThrow(/measure-specific evidence/);
  });

  it("does not score a situation-related regime as country exposure", () => {
    const candidateIndex = SANCTIONS_REGIME_CANDIDATES.findIndex((candidate) => candidate.relationship === "situation-related");
    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    const reviewRows = rows([SANCTIONS_REGIME_CANDIDATES[candidateIndex].iso2]);
    expect(() => buildPromotedSanctionsSnapshot({
      candidates: SANCTIONS_REGIME_CANDIDATES,
      rows: reviewRows,
      sourceReport: sourceReport(),
      asOf: AS_OF,
    })).toThrow(/situation-related regime cannot be approved as country exposure/);
  });

  it("rejects source drift even after classifications are complete", () => {
    const drifted = sourceReport();
    drifted.results[2].changed = true;
    expect(() => buildPromotedSanctionsSnapshot({
      candidates: SANCTIONS_REGIME_CANDIDATES,
      rows: rows(),
      sourceReport: drifted,
      asOf: AS_OF,
    })).toThrow(/eu-resources: source assurance is not approved and stable/);
  });

  it("creates a complete, hashed snapshot and drives reviewed country scores", () => {
    const snapshot = buildPromotedSanctionsSnapshot({
      candidates: SANCTIONS_REGIME_CANDIDATES,
      rows: rows(["RU", "SY", "KP"]),
      sourceReport: sourceReport(),
      asOf: AS_OF,
    });
    expect(snapshot.metadata).toMatchObject({
      coverageComplete: true,
      candidateCount: SANCTIONS_REGIME_CANDIDATES.length,
      countryCount: 3,
    });
    expect(snapshot.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.metadata.sources).toHaveLength(4);
    expect(snapshot.metadata.sources[0].rawSha256).toMatch(/^[a-f0-9]{64}$/);

    const currentStates = { aml: "current", governance: "current", sanctions: "current" } as const;
    const score = (iso2: string) => computeCountryRiskV2(iso2, {
      sanctions: snapshot.countries.find((country) => country.iso2 === iso2),
      sanctionsCoverageComplete: true,
      sourceStates: currentStates,
      asOf: AS_OF,
    });
    const russia = score("RU");
    const syria = score("SY");
    const northKorea = score("KP");
    expect(russia.pillars.sanctions.score).toBeGreaterThanOrEqual(6);
    expect(syria.floors).toContainEqual(expect.objectContaining({ reason: "fatf-grey", minimum: 6 }));
    expect(northKorea.score).toBeGreaterThanOrEqual(9);
    expect(northKorea.floors).toContainEqual(expect.objectContaining({ reason: "fatf-black", minimum: 9 }));
  });
});
