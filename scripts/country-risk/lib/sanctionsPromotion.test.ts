import { describe, expect, it } from "vitest";
import { computeCountryRiskV2 } from "../../../src/data/countryRiskV2.js";
import { SANCTIONS_REGIME_CANDIDATES } from "../../../src/data/sanctionsRegimeCandidates.js";
import { COUNTRIES } from "../../../src/data/countries.js";
import { SANCTIONS_IMPOSERS } from "../../../src/data/sanctionsEvidence.js";
import type { SanctionsMeasureType } from "../../../src/data/sanctionsEvidence.js";
import {
  buildPromotedSanctionsSnapshot,
  type SanctionsCatalogueInventoryItem,
  type SanctionsCatalogueItemReviewRow,
  type SanctionsCatalogueReviewRow,
  type SanctionsReviewRow,
  type SanctionsSourceAssuranceReport,
} from "./sanctionsPromotion.js";

const AS_OF = new Date("2026-07-16T12:00:00.000Z");
const CENSUS_SHA256 = "c".repeat(64);
const SOURCE_IDS = ["ofac-programmes", "uk-regimes", "eu-resources", "un-consolidated-list"];
const SOURCE_BY_IMPOSER = {
  OFAC: "ofac-programmes",
  UK: "uk-regimes",
  EU: "eu-resources",
  UN: "un-consolidated-list",
} as const;

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

function catalogueReviews(): SanctionsCatalogueReviewRow[] {
  return Object.entries(SOURCE_BY_IMPOSER).map(([imposer, sourceId]) => ({
    imposer: imposer as keyof typeof SOURCE_BY_IMPOSER,
    source_id: sourceId,
    catalogue_url: `https://official.example/${sourceId}`,
    source_fingerprint: `${sourceId}-stable`,
    census_sha256: CENSUS_SHA256,
    status: "approved",
    reviewed_by: "Independent Reviewer",
    reviewer_organisation: "Independent Compliance LLP",
    reviewed_at: "2026-07-16T10:00:00.000Z",
    review_note: "The complete official catalogue and all dispositions were reviewed.",
  }));
}

function censusInventory(): SanctionsCatalogueInventoryItem[] {
  return Object.keys(SOURCE_BY_IMPOSER).map((imposer) => {
    const candidate = SANCTIONS_REGIME_CANDIDATES.find((item) => item.imposer === imposer)!;
    return {
      imposer: imposer as keyof typeof SOURCE_BY_IMPOSER,
      item_key: `catalogue-item-${imposer}`,
      label: `${imposer} official item`,
      url: `https://official.example/item/${imposer}`,
      candidate_keys: [`${candidate.iso2}|${candidate.imposer}|${candidate.regime}`],
    };
  });
}

function catalogueItemReviews(): SanctionsCatalogueItemReviewRow[] {
  return censusInventory().map((item) => ({
    ...item,
    census_sha256: CENSUS_SHA256,
    disposition: "candidate-mapped",
    reviewed_by: "Independent Reviewer",
    reviewed_at: "2026-07-16T10:00:00.000Z",
    review_note: "Mapped to the identified regime-country decision.",
  }));
}

function factsFor(tier: "targeted" | "sectoral" | "comprehensive"): {
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

function rows(approvedIso2: string[] = []): SanctionsReviewRow[] {
  const approved = new Set(approvedIso2);
  return SANCTIONS_REGIME_CANDIDATES.map((candidate, index) => {
    const status = approved.has(candidate.iso2) ? "approved" as const : "rejected" as const;
    const facts = factsFor(candidate.proposedTier);
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
      review_note: status === "approved" ? "Confirmed against the operative legal measure." : "Excluded after legal review.",
      legal_status: status === "approved" || candidate.relationship === "situation-related" ? "active" : "terminated",
      coverage_state: status === "approved"
        ? "active-direct"
        : candidate.relationship === "situation-related" ? "active-situation-related" : "inactive",
      legal_instrument_id: `LEGAL-${index}`,
      legal_instrument_url: `https://official-evidence.example/legal-instrument/${index}`,
      official_guidance_url: candidate.measureEvidenceUrl,
      legal_effective_from: "2026-01-01",
      legal_effective_to: null,
      source_last_updated: "2026-07-16",
      evidence_locator: `Article ${index + 1}`,
      measures: facts.measures,
      broad_trade_prohibition: facts.broadTrade,
      broad_financial_prohibition: facts.broadFinancial,
      material_non_designation_restriction: facts.material,
      prepared_by: "Evidence Analyst",
      prepared_at: "2026-07-16T09:00:00.000Z",
    };
  });
}

function build(reviewRows: SanctionsReviewRow[], report = sourceReport()) {
  return buildPromotedSanctionsSnapshot({
    candidates: SANCTIONS_REGIME_CANDIDATES,
    rows: reviewRows,
    catalogueReviews: catalogueReviews(),
    censusInventory: censusInventory(),
    catalogueItemReviews: catalogueItemReviews(),
    censusSha256: CENSUS_SHA256,
    sourceReport: report,
    asOf: AS_OF,
  });
}

describe("sanctions snapshot promotion gate", () => {
  it("fails closed when any classification remains pending", () => {
    const reviewRows = rows();
    reviewRows[0] = { ...reviewRows[0], status: "pending", reviewed_by: null };
    expect(() => build(reviewRows)).toThrow(/1 pending decisions/);
  });

  it("rejects generic catalogue links as approval evidence", () => {
    const reviewRows = rows([SANCTIONS_REGIME_CANDIDATES[0].iso2]);
    reviewRows[0] = { ...reviewRows[0], decision_evidence_url: reviewRows[0].catalogue_url };
    expect(() => build(reviewRows)).toThrow(/measure-specific HTTPS evidence/);
  });

  it("does not score a situation-related regime as country exposure", () => {
    const candidateIndex = SANCTIONS_REGIME_CANDIDATES.findIndex((candidate) => candidate.relationship === "situation-related");
    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    const reviewRows = rows([SANCTIONS_REGIME_CANDIDATES[candidateIndex].iso2]);
    expect(() => build(reviewRows)).toThrow(/situation-related regime cannot be approved as country exposure/);
  });

  it("rejects source drift even after classifications are complete", () => {
    const drifted = sourceReport();
    drifted.results[2].changed = true;
    expect(() => build(rows(), drifted)).toThrow(/eu-resources: source assurance is not approved and stable/);
  });

  it("blocks promotion when the item-by-item catalogue ledger is incomplete", () => {
    expect(() => buildPromotedSanctionsSnapshot({
      candidates: SANCTIONS_REGIME_CANDIDATES,
      rows: rows(),
      catalogueReviews: catalogueReviews(),
      censusInventory: censusInventory(),
      catalogueItemReviews: catalogueItemReviews().slice(1),
      censusSha256: CENSUS_SHA256,
      sourceReport: sourceReport(),
      asOf: AS_OF,
    })).toThrow(/catalogue item review mismatch/);
  });

  it("creates a complete, hashed snapshot with full coverage cells and drives reviewed country scores", () => {
    // Derived, not hardcoded: the coverage grid is every country x every imposer,
    // so adding a jurisdiction to countries.ts must not break this test.
    const expectedCells = COUNTRIES.length * SANCTIONS_IMPOSERS.length;
    const snapshot = build(rows(["RU", "SY", "KP"]));
    expect(snapshot.metadata).toMatchObject({
      coverageComplete: true,
      candidateCount: SANCTIONS_REGIME_CANDIDATES.length,
      countryCount: 3,
      coverageCellCount: expectedCells,
    });
    expect(snapshot.coverage).toHaveLength(expectedCells);
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
