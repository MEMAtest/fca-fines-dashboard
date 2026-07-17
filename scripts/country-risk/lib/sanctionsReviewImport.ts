import type { SanctionsRegimeCandidate, SanctionsRegimeRelationship } from "../../../src/data/sanctionsRegimeCandidates.js";
import {
  classifySanctionsFacts,
  coverageStateForRejectedDecision,
  type SanctionsCoverageState,
  type SanctionsLegalStatus,
  type SanctionsMeasureType,
} from "../../../src/data/sanctionsEvidence.js";
import type { SanctionsImposer, SanctionsTier } from "../../../src/data/sanctionsStatus.js";
import type {
  SanctionsCatalogueItemReviewRow,
  SanctionsCatalogueReviewRow,
  SanctionsReviewRow,
} from "./sanctionsPromotion.js";

export interface CompletedSanctionsReviewRecord {
  iso2: string;
  imposer: SanctionsImposer;
  regime: string;
  proposedTier: SanctionsTier;
  relationship: SanctionsRegimeRelationship;
  catalogueUrl: string;
  measureEvidenceUrl: string;
  reviewedAsOf: string;
  reviewDecision: "approved" | "rejected" | null;
  finalTier: SanctionsTier | null;
  coverageState: SanctionsCoverageState | null;
  legalStatus: SanctionsLegalStatus | null;
  legalInstrumentId: string | null;
  legalInstrumentUrl: string | null;
  officialGuidanceUrl: string | null;
  legalEffectiveFrom: string | null;
  legalEffectiveTo: string | null;
  sourceLastUpdated: string | null;
  evidenceLocator: string | null;
  measures: SanctionsMeasureType[] | null;
  broadTradeProhibition: boolean | null;
  broadFinancialProhibition: boolean | null;
  materialNonDesignationRestriction: boolean | null;
  preparedBy: string | null;
  preparedAt: string | null;
  decisionEvidenceUrl: string | null;
  reviewer: string | null;
  reviewerOrganisation: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface CompletedSanctionsCatalogueReview {
  imposer: SanctionsImposer;
  sourceId: string;
  catalogueUrl: string;
  sourceFingerprint: string | null;
  censusSha256: string | null;
  reviewDecision: "approved" | "rejected" | null;
  reviewer: string | null;
  reviewerOrganisation: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface CompletedSanctionsInventoryDisposition {
  imposer: SanctionsImposer;
  itemKey: string;
  label: string;
  url: string;
  proposedDisposition: "candidate-mapped" | "proposed-exclusion";
  candidateKeys: string[];
  rationale: string;
  finalDisposition:
    | "candidate-mapped"
    | "excluded-thematic"
    | "excluded-regional"
    | "excluded-umbrella"
    | "excluded-duplicate"
    | "excluded-inactive"
    | "excluded-other"
    | null;
  reviewerNote: string | null;
}

const MEASURES = new Set<SanctionsMeasureType>([
  "asset-freeze", "travel-ban", "arms-embargo", "import-restriction",
  "export-restriction", "financial-restriction", "services-restriction",
  "transport-restriction", "commodity-restriction",
]);

function key(value: { iso2: string; imposer: string; regime: string }): string {
  return `${value.iso2.trim().toUpperCase()}|${value.imposer}|${value.regime}`;
}

function text(value: string | null, label: string, recordKey: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${recordKey}: ${label} is required`);
  return normalized;
}

function timestamp(value: string | null, label: string, recordKey: string): string {
  const normalized = text(value, label, recordKey);
  if (Number.isNaN(new Date(normalized).getTime())) throw new Error(`${recordKey}: ${label} is invalid`);
  return new Date(normalized).toISOString();
}

function httpsUrl(value: string | null, label: string, recordKey: string, genericUrl?: string): string {
  const normalized = text(value, label, recordKey);
  if (!/^https:\/\//i.test(normalized)) throw new Error(`${recordKey}: ${label} must use HTTPS`);
  if (genericUrl && normalized === genericUrl) throw new Error(`${recordKey}: ${label} must be measure-specific`);
  return normalized;
}

export function validateCompletedSanctionsReview(args: {
  candidates: SanctionsRegimeCandidate[];
  records: CompletedSanctionsReviewRecord[];
}): SanctionsReviewRow[] {
  const expected = new Map(args.candidates.map((candidate) => [key(candidate), candidate]));
  const actual = new Map<string, CompletedSanctionsReviewRecord>();
  for (const record of args.records) {
    const recordKey = key(record);
    if (actual.has(recordKey)) throw new Error(`${recordKey}: duplicate review record`);
    actual.set(recordKey, record);
  }
  const missing = [...expected.keys()].filter((candidateKey) => !actual.has(candidateKey));
  const unexpected = [...actual.keys()].filter((recordKey) => !expected.has(recordKey));
  if (missing.length || unexpected.length || actual.size !== expected.size) {
    throw new Error(`Completed sanctions review coverage mismatch: missing=${missing.length}, unexpected=${unexpected.length}, records=${actual.size}, candidates=${expected.size}`);
  }

  return [...expected.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([candidateKey, candidate]) => {
    const record = actual.get(candidateKey)!;
    if (record.proposedTier !== candidate.proposedTier
      || record.catalogueUrl !== candidate.catalogueUrl
      || record.measureEvidenceUrl !== candidate.measureEvidenceUrl
      || record.reviewedAsOf !== candidate.reviewedAsOf) {
      throw new Error(`${candidateKey}: candidate provenance does not match the generated review pack`);
    }
    if (record.reviewDecision !== "approved" && record.reviewDecision !== "rejected") {
      throw new Error(`${candidateKey}: reviewDecision must be approved or rejected`);
    }
    if (!record.legalStatus) throw new Error(`${candidateKey}: legalStatus is required`);
    if (!record.coverageState) throw new Error(`${candidateKey}: coverageState is required`);
    if (!Array.isArray(record.measures) || record.measures.some((measure) => !MEASURES.has(measure))) {
      throw new Error(`${candidateKey}: measures must contain only supported measure types`);
    }
    if (record.broadTradeProhibition === null
      || record.broadFinancialProhibition === null
      || record.materialNonDesignationRestriction === null) {
      throw new Error(`${candidateKey}: deterministic scope facts are required`);
    }
    const legalInstrumentId = text(record.legalInstrumentId, "legalInstrumentId", candidateKey);
    const legalInstrumentUrl = httpsUrl(record.legalInstrumentUrl, "legalInstrumentUrl", candidateKey, candidate.catalogueUrl);
    const legalEffectiveFrom = text(record.legalEffectiveFrom, "legalEffectiveFrom", candidateKey);
    const evidenceLocator = text(record.evidenceLocator, "evidenceLocator", candidateKey);
    const preparedBy = text(record.preparedBy, "preparedBy", candidateKey);
    const preparedAt = timestamp(record.preparedAt, "preparedAt", candidateKey);
    const reviewer = text(record.reviewer, "reviewer", candidateKey);
    const reviewerOrganisation = text(record.reviewerOrganisation, "reviewerOrganisation", candidateKey);
    const reviewedAt = timestamp(record.reviewedAt, "reviewedAt", candidateKey);
    const reviewNote = text(record.reviewNote, "reviewNote", candidateKey);
    const decisionEvidenceUrl = httpsUrl(record.decisionEvidenceUrl, "decisionEvidenceUrl", candidateKey, candidate.catalogueUrl);
    if (preparedBy === reviewer) throw new Error(`${candidateKey}: preparer and reviewer must be different people`);

    const classification = classifySanctionsFacts({
      legalStatus: record.legalStatus,
      relationship: record.relationship,
      measures: record.measures,
      broadTradeProhibition: record.broadTradeProhibition,
      broadFinancialProhibition: record.broadFinancialProhibition,
      materialNonDesignationRestriction: record.materialNonDesignationRestriction,
    });
    let coverageState = record.coverageState;
    if (record.reviewDecision === "approved") {
      if (!classification.eligible || !classification.tier) {
        throw new Error(`${candidateKey}: legal facts do not support approval as direct country exposure`);
      }
      if (coverageState !== "active-direct") throw new Error(`${candidateKey}: approved decision requires active-direct coverage`);
      if (!record.finalTier) throw new Error(`${candidateKey}: approved decision requires finalTier`);
      if (record.finalTier !== classification.tier) {
        throw new Error(`${candidateKey}: finalTier must equal the deterministic classification; correct the legal facts instead of overriding the tier`);
      }
    } else {
      if (record.finalTier !== null) throw new Error(`${candidateKey}: rejected decision must use finalTier=null`);
      coverageState = coverageStateForRejectedDecision(classification, coverageState);
      if (classification.eligible) {
        throw new Error(`${candidateKey}: rejected decision conflicts with eligible legal facts; correct the status, nexus or scope facts`);
      }
    }
    return {
      iso2: candidate.iso2,
      imposer: candidate.imposer,
      regime_name: candidate.regime,
      relationship: record.relationship,
      proposed_tier: candidate.proposedTier,
      final_tier: record.finalTier,
      catalogue_url: candidate.catalogueUrl,
      measure_evidence_url: candidate.measureEvidenceUrl,
      decision_evidence_url: decisionEvidenceUrl,
      effective_at: candidate.reviewedAsOf,
      status: record.reviewDecision,
      reviewed_by: reviewer,
      reviewer_organisation: reviewerOrganisation,
      reviewed_at: reviewedAt,
      review_note: reviewNote,
      legal_status: record.legalStatus,
      coverage_state: coverageState,
      legal_instrument_id: legalInstrumentId,
      legal_instrument_url: legalInstrumentUrl,
      official_guidance_url: record.officialGuidanceUrl?.trim() || null,
      legal_effective_from: legalEffectiveFrom,
      legal_effective_to: record.legalEffectiveTo?.trim() || null,
      source_last_updated: record.sourceLastUpdated?.trim() || null,
      evidence_locator: evidenceLocator,
      measures: record.measures,
      broad_trade_prohibition: record.broadTradeProhibition,
      broad_financial_prohibition: record.broadFinancialProhibition,
      material_non_designation_restriction: record.materialNonDesignationRestriction,
      prepared_by: preparedBy,
      prepared_at: preparedAt,
    };
  });
}

export function validateSanctionsCatalogueReviews(args: {
  reviews: CompletedSanctionsCatalogueReview[];
  sourceFingerprints: Map<string, string>;
  censusSha256: string;
}): SanctionsCatalogueReviewRow[] {
  const expected = new Set(["OFAC", "UK", "EU", "UN"]);
  if (args.reviews.length !== expected.size || new Set(args.reviews.map((review) => review.imposer)).size !== expected.size) {
    throw new Error("Catalogue review must contain exactly one attestation for OFAC, UK, EU and UN");
  }
  return args.reviews.map((review) => {
    const recordKey = `catalogue|${review.imposer}`;
    if (!expected.has(review.imposer)) throw new Error(`${recordKey}: unexpected imposer`);
    const expectedFingerprint = args.sourceFingerprints.get(review.sourceId);
    if (!expectedFingerprint || review.sourceFingerprint !== expectedFingerprint) {
      throw new Error(`${recordKey}: source fingerprint does not match the reviewed assurance report`);
    }
    if (review.censusSha256 !== args.censusSha256) {
      throw new Error(`${recordKey}: census fingerprint does not match the reviewed census report`);
    }
    if (review.reviewDecision !== "approved") throw new Error(`${recordKey}: complete catalogue approval is required`);
    return {
      imposer: review.imposer,
      source_id: text(review.sourceId, "sourceId", recordKey),
      catalogue_url: httpsUrl(review.catalogueUrl, "catalogueUrl", recordKey),
      source_fingerprint: expectedFingerprint,
      census_sha256: args.censusSha256,
      status: "approved",
      reviewed_by: text(review.reviewer, "reviewer", recordKey),
      reviewer_organisation: text(review.reviewerOrganisation, "reviewerOrganisation", recordKey),
      reviewed_at: timestamp(review.reviewedAt, "reviewedAt", recordKey),
      review_note: text(review.reviewNote, "reviewNote", recordKey),
    };
  });
}

export function validateSanctionsInventoryDispositions(args: {
  expected: Omit<CompletedSanctionsInventoryDisposition, "finalDisposition" | "reviewerNote">[];
  completed: CompletedSanctionsInventoryDisposition[];
  catalogueReviews: SanctionsCatalogueReviewRow[];
  censusSha256: string;
}): SanctionsCatalogueItemReviewRow[] {
  const dispositionKey = (item: { imposer: string; itemKey: string }) => `${item.imposer}|${item.itemKey}`;
  const expected = new Map(args.expected.map((item) => [dispositionKey(item), item]));
  const completed = new Map(args.completed.map((item) => [dispositionKey(item), item]));
  if (expected.size !== args.expected.length || completed.size !== args.completed.length) {
    throw new Error("Catalogue disposition ledger contains duplicate items");
  }
  const missing = [...expected.keys()].filter((itemKey) => !completed.has(itemKey));
  const unexpected = [...completed.keys()].filter((itemKey) => !expected.has(itemKey));
  if (missing.length || unexpected.length || expected.size !== completed.size) {
    throw new Error(`Catalogue disposition coverage mismatch: missing=${missing.length}, unexpected=${unexpected.length}`);
  }
  const reviewByImposer = new Map(args.catalogueReviews.map((review) => [review.imposer, review]));
  return [...expected.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([itemKey, source]) => {
    const item = completed.get(itemKey)!;
    if (item.label !== source.label
      || item.url !== source.url
      || item.proposedDisposition !== source.proposedDisposition
      || item.rationale !== source.rationale
      || JSON.stringify([...item.candidateKeys].sort()) !== JSON.stringify([...source.candidateKeys].sort())) {
      throw new Error(`${itemKey}: completed disposition does not match the generated census`);
    }
    if (!item.finalDisposition) throw new Error(`${itemKey}: finalDisposition is required`);
    if (source.candidateKeys.length && item.finalDisposition !== "candidate-mapped") {
      throw new Error(`${itemKey}: mapped catalogue item must retain candidate-mapped disposition; reject the candidate decisions instead`);
    }
    if (!source.candidateKeys.length && item.finalDisposition === "candidate-mapped") {
      throw new Error(`${itemKey}: excluded catalogue item cannot be marked candidate-mapped`);
    }
    const reviewerNote = text(item.reviewerNote, "reviewerNote", itemKey);
    const review = reviewByImposer.get(item.imposer);
    if (!review?.reviewed_by || !review.reviewed_at) {
      throw new Error(`${itemKey}: approved catalogue reviewer provenance is required`);
    }
    return {
      imposer: item.imposer,
      item_key: item.itemKey,
      label: item.label,
      url: httpsUrl(item.url, "url", itemKey),
      candidate_keys: [...item.candidateKeys].sort(),
      census_sha256: args.censusSha256,
      disposition: item.finalDisposition,
      reviewed_by: review.reviewed_by,
      reviewed_at: review.reviewed_at,
      review_note: reviewerNote,
    };
  });
}
