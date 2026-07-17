import { createHash } from "node:crypto";
import type {
  ApprovedCountrySanctions,
  ApprovedSanctionsCoverageCell,
  ApprovedSanctionsSnapshotMetadata,
} from "../../../src/data/sanctionsApprovedData.js";
import { COUNTRIES } from "../../../src/data/countries.js";
import type { SanctionsRegimeCandidate } from "../../../src/data/sanctionsRegimeCandidates.js";
import {
  SANCTIONS_IMPOSERS,
  classifySanctionsFacts,
  type SanctionsCoverageState,
  type SanctionsLegalStatus,
  type SanctionsMeasureType,
} from "../../../src/data/sanctionsEvidence.js";
import type { SanctionsImposer, SanctionsTier } from "../../../src/data/sanctionsStatus.js";

export interface SanctionsReviewRow {
  iso2: string;
  imposer: SanctionsImposer;
  regime_name: string;
  relationship: "direct-country-exposure" | "situation-related";
  proposed_tier: SanctionsTier;
  final_tier: SanctionsTier | null;
  catalogue_url: string;
  measure_evidence_url: string;
  decision_evidence_url: string | null;
  effective_at: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewer_organisation: string | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
  legal_status: SanctionsLegalStatus | null;
  coverage_state: SanctionsCoverageState | null;
  legal_instrument_id: string | null;
  legal_instrument_url: string | null;
  official_guidance_url: string | null;
  legal_effective_from: string | Date | null;
  legal_effective_to: string | Date | null;
  source_last_updated: string | Date | null;
  evidence_locator: string | null;
  measures: SanctionsMeasureType[];
  broad_trade_prohibition: boolean | null;
  broad_financial_prohibition: boolean | null;
  material_non_designation_restriction: boolean | null;
  prepared_by: string | null;
  prepared_at: string | Date | null;
}

export interface SanctionsCatalogueReviewRow {
  imposer: SanctionsImposer;
  source_id: string;
  catalogue_url: string;
  source_fingerprint: string;
  census_sha256: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewer_organisation: string | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
}

export interface SanctionsCatalogueInventoryItem {
  imposer: SanctionsImposer;
  item_key: string;
  label: string;
  url: string;
  candidate_keys: string[];
}

export interface SanctionsCatalogueItemReviewRow extends SanctionsCatalogueInventoryItem {
  census_sha256: string;
  disposition:
    | "candidate-mapped"
    | "excluded-thematic"
    | "excluded-regional"
    | "excluded-umbrella"
    | "excluded-duplicate"
    | "excluded-inactive"
    | "excluded-other";
  reviewed_by: string;
  reviewed_at: string | Date;
  review_note: string;
}

export interface SanctionsSourceAssuranceReport {
  checkedAt: string;
  requiresHumanReview: boolean;
  results: Array<{
    id: string;
    healthy: boolean;
    changed?: boolean;
    baselineMissing?: boolean;
    fingerprint?: string;
    url?: string;
    retrievedAt?: string;
    sha256?: string;
  }>;
}

export interface PromotedSanctionsSnapshot {
  metadata: ApprovedSanctionsSnapshotMetadata;
  countries: ApprovedCountrySanctions[];
  coverage: ApprovedSanctionsCoverageCell[];
}

const EXPECTED_SOURCE_IDS = new Set([
  "ofac-programmes",
  "uk-regimes",
  "eu-resources",
  "un-consolidated-list",
]);

const SOURCE_BY_IMPOSER: Record<SanctionsImposer, string> = {
  OFAC: "ofac-programmes",
  UK: "uk-regimes",
  EU: "eu-resources",
  UN: "un-consolidated-list",
};

const COVERAGE_PRECEDENCE: SanctionsCoverageState[] = [
  "active-direct",
  "active-situation-related",
  "thematic-only",
  "inactive",
  "no-direct-regime",
];

function key(value: { iso2: string; imposer: string; regime?: string; regime_name?: string }): string {
  return `${value.iso2.trim().toUpperCase()}|${value.imposer}|${value.regime ?? value.regime_name ?? ""}`;
}

function required(value: string | null, label: string, row: SanctionsReviewRow): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${key(row)}: ${label} is required`);
  return normalized;
}

function iso(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid review timestamp: ${String(value)}`);
  return parsed.toISOString();
}

function optionalDate(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const normalized = value.trim();
  return normalized || null;
}

export function buildPromotedSanctionsSnapshot(args: {
  candidates: SanctionsRegimeCandidate[];
  rows: SanctionsReviewRow[];
  catalogueReviews: SanctionsCatalogueReviewRow[];
  censusInventory: SanctionsCatalogueInventoryItem[];
  catalogueItemReviews: SanctionsCatalogueItemReviewRow[];
  censusSha256: string;
  sourceReport: SanctionsSourceAssuranceReport;
  asOf: Date;
  maximumSourceAgeHours?: number;
}): PromotedSanctionsSnapshot {
  const {
    candidates, rows, catalogueReviews, censusInventory, catalogueItemReviews,
    censusSha256, sourceReport, asOf,
  } = args;
  const maximumSourceAgeHours = args.maximumSourceAgeHours ?? 24;
  const expected = new Set(candidates.map(key));
  const actual = new Set(rows.map(key));
  if (actual.size !== rows.length) throw new Error("Duplicate sanctions review rows found");
  const missing = [...expected].filter((candidateKey) => !actual.has(candidateKey));
  const unexpected = [...actual].filter((rowKey) => !expected.has(rowKey));
  if (missing.length || unexpected.length || rows.length !== candidates.length) {
    throw new Error(`Sanctions review coverage mismatch: missing=${missing.length}, unexpected=${unexpected.length}, rows=${rows.length}, candidates=${candidates.length}`);
  }
  const pendingRows = rows.filter((row) => row.status === "pending");
  if (pendingRows.length) {
    throw new Error(`Sanctions promotion blocked: ${pendingRows.length} pending decisions; first=${key(pendingRows[0])}`);
  }
  const unresolvedRows = rows.filter((row) => !row.coverage_state || row.coverage_state === "unknown" || !row.legal_status);
  if (unresolvedRows.length) {
    throw new Error(`Sanctions promotion blocked: ${unresolvedRows.length} unresolved legal or coverage decisions; first=${key(unresolvedRows[0])}`);
  }

  const checkedAt = new Date(sourceReport.checkedAt);
  const sourceAgeHours = (asOf.getTime() - checkedAt.getTime()) / 3_600_000;
  if (Number.isNaN(checkedAt.getTime()) || sourceAgeHours < 0 || sourceAgeHours > maximumSourceAgeHours) {
    throw new Error(`Sanctions source assurance is not current: ageHours=${sourceAgeHours}`);
  }
  if (sourceReport.requiresHumanReview) throw new Error("Sanctions source assurance requires human review");
  const reportIds = new Set(sourceReport.results.map((result) => result.id));
  if ([...EXPECTED_SOURCE_IDS].some((id) => !reportIds.has(id))) {
    throw new Error("Sanctions source assurance does not cover all four official source lanes");
  }
  for (const result of sourceReport.results) {
    if (!EXPECTED_SOURCE_IDS.has(result.id)) continue;
    if (!result.healthy || result.changed || result.baselineMissing || !result.fingerprint || !result.url || !result.retrievedAt || !result.sha256) {
      throw new Error(`${result.id}: source assurance is not approved and stable`);
    }
  }

  if (catalogueReviews.length !== SANCTIONS_IMPOSERS.length) {
    throw new Error(`Sanctions promotion requires ${SANCTIONS_IMPOSERS.length} complete catalogue attestations`);
  }
  const catalogueByImposer = new Map(catalogueReviews.map((review) => [review.imposer, review]));
  for (const imposer of SANCTIONS_IMPOSERS) {
    const review = catalogueByImposer.get(imposer);
    const source = sourceReport.results.find((result) => result.id === SOURCE_BY_IMPOSER[imposer]);
    if (!review || review.status !== "approved" || !source?.fingerprint || review.source_fingerprint !== source.fingerprint) {
      throw new Error(`${imposer}: approved catalogue attestation does not match the current source fingerprint`);
    }
    if (review.census_sha256 !== censusSha256) {
      throw new Error(`${imposer}: catalogue attestation does not match the current census`);
    }
    if (!review.reviewed_by?.trim() || !review.reviewer_organisation?.trim() || !review.review_note?.trim() || !review.reviewed_at) {
      throw new Error(`${imposer}: complete catalogue reviewer provenance is required`);
    }
  }

  const inventoryKey = (item: { imposer: string; item_key: string }) => `${item.imposer}|${item.item_key}`;
  const expectedInventory = new Map(censusInventory.map((item) => [inventoryKey(item), item]));
  const reviewedInventory = new Map(catalogueItemReviews.map((item) => [inventoryKey(item), item]));
  if (expectedInventory.size !== censusInventory.length || reviewedInventory.size !== catalogueItemReviews.length) {
    throw new Error("Sanctions catalogue item ledger contains duplicate records");
  }
  const missingInventory = [...expectedInventory.keys()].filter((itemKey) => !reviewedInventory.has(itemKey));
  const unexpectedInventory = [...reviewedInventory.keys()].filter((itemKey) => !expectedInventory.has(itemKey));
  if (missingInventory.length || unexpectedInventory.length || reviewedInventory.size !== expectedInventory.size) {
    throw new Error(`Sanctions catalogue item review mismatch: missing=${missingInventory.length}, unexpected=${unexpectedInventory.length}`);
  }
  for (const [itemKey, expectedItem] of expectedInventory) {
    const reviewedItem = reviewedInventory.get(itemKey)!;
    const catalogueReview = catalogueByImposer.get(reviewedItem.imposer)!;
    if (reviewedItem.census_sha256 !== censusSha256
      || reviewedItem.label !== expectedItem.label
      || reviewedItem.url !== expectedItem.url
      || JSON.stringify([...reviewedItem.candidate_keys].sort()) !== JSON.stringify([...expectedItem.candidate_keys].sort())) {
      throw new Error(`${itemKey}: catalogue item review does not match the current census`);
    }
    if (!reviewedItem.reviewed_by?.trim()
      || reviewedItem.reviewed_by !== catalogueReview.reviewed_by
      || !reviewedItem.reviewed_at
      || !reviewedItem.review_note?.trim()) {
      throw new Error(`${itemKey}: catalogue item reviewer provenance is incomplete or inconsistent`);
    }
    if (reviewedItem.disposition === "candidate-mapped" && reviewedItem.candidate_keys.length === 0) {
      throw new Error(`${itemKey}: candidate-mapped disposition has no candidate decisions`);
    }
    if (reviewedItem.disposition !== "candidate-mapped" && !reviewedItem.review_note.trim()) {
      throw new Error(`${itemKey}: an exclusion requires a review note`);
    }
  }

  const countries = new Map<string, ApprovedCountrySanctions>();
  let approvedCount = 0;
  let rejectedCount = 0;
  const reviewedDates: string[] = [];
  const canonicalDecisions: unknown[] = [];

  for (const row of [...rows].sort((a, b) => key(a).localeCompare(key(b)))) {
    const reviewedBy = required(row.reviewed_by, "reviewed_by", row);
    const reviewerOrganisation = required(row.reviewer_organisation, "reviewer_organisation", row);
    const reviewNote = required(row.review_note, "review_note", row);
    const preparedBy = required(row.prepared_by, "prepared_by", row);
    if (preparedBy === reviewedBy) throw new Error(`${key(row)}: preparer and reviewer must be different people`);
    if (!row.prepared_at) throw new Error(`${key(row)}: prepared_at is required`);
    if (!row.reviewed_at) throw new Error(`${key(row)}: reviewed_at is required`);
    const reviewedAt = iso(row.reviewed_at);
    const decisionEvidenceUrl = required(row.decision_evidence_url, "decision_evidence_url", row);
    if (!/^https:\/\//i.test(decisionEvidenceUrl) || decisionEvidenceUrl === row.catalogue_url) {
      throw new Error(`${key(row)}: decision requires measure-specific HTTPS evidence, not the generic catalogue`);
    }
    const legalStatus = row.legal_status!;
    const legalInstrumentId = required(row.legal_instrument_id, "legal_instrument_id", row);
    const legalInstrumentUrl = required(row.legal_instrument_url, "legal_instrument_url", row);
    if (!/^https:\/\//i.test(legalInstrumentUrl) || legalInstrumentUrl === row.catalogue_url) {
      throw new Error(`${key(row)}: legal instrument must be a measure-specific HTTPS URL`);
    }
    const legalEffectiveFrom = optionalDate(row.legal_effective_from);
    const legalEffectiveTo = optionalDate(row.legal_effective_to);
    const sourceLastUpdated = optionalDate(row.source_last_updated);
    const evidenceLocator = required(row.evidence_locator, "evidence_locator", row);
    if (row.broad_trade_prohibition === null
      || row.broad_financial_prohibition === null
      || row.material_non_designation_restriction === null) {
      throw new Error(`${key(row)}: deterministic scope facts are required`);
    }
    const classification = classifySanctionsFacts({
      legalStatus,
      relationship: row.relationship,
      measures: row.measures,
      broadTradeProhibition: row.broad_trade_prohibition,
      broadFinancialProhibition: row.broad_financial_prohibition,
      materialNonDesignationRestriction: row.material_non_designation_restriction,
    });
    reviewedDates.push(reviewedAt);
    canonicalDecisions.push({
      key: key(row),
      status: row.status,
      relationship: row.relationship,
      proposedTier: row.proposed_tier,
      finalTier: row.final_tier,
      coverageState: row.coverage_state,
      legalStatus,
      legalInstrumentId,
      legalInstrumentUrl,
      legalEffectiveFrom,
      legalEffectiveTo,
      sourceLastUpdated,
      evidenceLocator,
      measures: row.measures,
      evidenceUrl: decisionEvidenceUrl,
      preparedBy,
      reviewedBy,
      reviewerOrganisation,
      reviewedAt,
      reviewNote,
    });
    if (row.status === "rejected") {
      if (row.final_tier !== null) throw new Error(`${key(row)}: rejected decision must not retain final_tier`);
      if (row.coverage_state === "active-direct") throw new Error(`${key(row)}: rejected decision cannot retain active-direct coverage`);
      rejectedCount += 1;
      continue;
    }
    if (!row.final_tier) throw new Error(`${key(row)}: approved decision requires final_tier`);
    if (row.relationship !== "direct-country-exposure") {
      throw new Error(`${key(row)}: situation-related regime cannot be approved as country exposure`);
    }
    if (!classification.eligible || !classification.tier || row.coverage_state !== "active-direct") {
      throw new Error(`${key(row)}: approved legal facts do not support active direct country exposure`);
    }
    if (classification.tier !== row.final_tier) {
      throw new Error(`${key(row)}: final tier must equal the deterministic classification`);
    }
    approvedCount += 1;
    const iso2 = row.iso2.trim().toUpperCase();
    const country = countries.get(iso2) ?? { iso2, programs: [] };
    country.programs.push({
      imposer: row.imposer,
      tier: row.final_tier,
      program: row.regime_name,
      sourceUrl: decisionEvidenceUrl,
      reviewed: reviewedAt.slice(0, 7),
      relationship: row.relationship,
      catalogueUrl: row.catalogue_url,
      evidenceUrl: decisionEvidenceUrl,
      reviewedBy,
      reviewerOrganisation,
      reviewedAt,
      reviewNote,
      legalStatus,
      legalInstrumentId,
      legalInstrumentUrl,
      officialGuidanceUrl: row.official_guidance_url,
      legalEffectiveFrom,
      legalEffectiveTo,
      measures: row.measures,
      evidenceLocator,
    });
    countries.set(iso2, country);
  }

  const sourceFingerprints = sourceReport.results
    .filter((result) => EXPECTED_SOURCE_IDS.has(result.id))
    .map((result) => [result.id, result.fingerprint] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  const sources = sourceReport.results
    .filter((result) => EXPECTED_SOURCE_IDS.has(result.id))
    .map((result) => ({
      id: result.id,
      url: result.url!,
      retrievedAt: result.retrievedAt!,
      rawSha256: result.sha256!,
      fingerprint: result.fingerprint!,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const countryRows = [...countries.values()]
    .map((country) => ({ ...country, programs: [...country.programs].sort((a, b) => a.imposer.localeCompare(b.imposer)) }))
    .sort((a, b) => a.iso2.localeCompare(b.iso2));
  const coverage = COUNTRIES.flatMap((country) => SANCTIONS_IMPOSERS.map((imposer) => {
    const relevant = rows.filter((row) => row.iso2.trim() === country.iso2 && row.imposer === imposer);
    const states = relevant.map((row) => row.coverage_state as SanctionsCoverageState);
    const state = COVERAGE_PRECEDENCE.find((candidate) => states.includes(candidate)) ?? "no-direct-regime";
    const catalogue = catalogueByImposer.get(imposer)!;
    return {
      iso2: country.iso2,
      imposer,
      state,
      regimeCount: relevant.filter((row) => row.status === "approved").length,
      evidenceUrls: relevant.length
        ? [...new Set(relevant.map((row) => row.legal_instrument_url as string))].sort()
        : [catalogue.catalogue_url],
    } satisfies ApprovedSanctionsCoverageCell;
  }));
  if (coverage.some((cell) => cell.state === "unknown")) {
    throw new Error("Sanctions promotion blocked: derived country coverage contains unknown cells");
  }

  const sourceReportSha256 = createHash("sha256").update(JSON.stringify(sourceReport)).digest("hex");
  const canonical = JSON.stringify({
    candidates: candidates.length,
    decisions: canonicalDecisions,
    catalogueReviews: [...catalogueReviews].sort((a, b) => a.imposer.localeCompare(b.imposer)),
    catalogueItemReviews: [...catalogueItemReviews].sort((a, b) => inventoryKey(a).localeCompare(inventoryKey(b))),
    censusSha256,
    coverage,
    sourceFingerprints,
    sources,
  });
  const sha256 = createHash("sha256").update(canonical).digest("hex");
  const sortedReviewedDates = reviewedDates.sort();
  const effectiveAt = sortedReviewedDates[sortedReviewedDates.length - 1]?.slice(0, 10) ?? asOf.toISOString().slice(0, 10);
  return {
    metadata: {
      version: `sanctions-${effectiveAt}-${sha256.slice(0, 12)}`,
      coverageComplete: true,
      effectiveAt,
      generatedAt: asOf.toISOString(),
      sha256,
      sourceReportSha256,
      candidateCount: candidates.length,
      approvedCount,
      rejectedCount,
      countryCount: countryRows.length,
      sources,
      coverageCellCount: coverage.length,
      approvalMode: "deterministic-evidence",
      externalValidation: "not-independently-validated",
    },
    countries: countryRows,
    coverage,
  };
}
