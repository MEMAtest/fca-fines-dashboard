import type { SanctionsRegimeCandidate, SanctionsRegimeRelationship } from "../../../src/data/sanctionsRegimeCandidates.js";
import type { SanctionsImposer, SanctionsTier } from "../../../src/data/sanctionsStatus.js";
import type { SanctionsReviewRow } from "./sanctionsPromotion.js";

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
  decisionEvidenceUrl: string | null;
  reviewer: string | null;
  reviewerOrganisation: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

function key(value: { iso2: string; imposer: string; regime: string }): string {
  return `${value.iso2.trim().toUpperCase()}|${value.imposer}|${value.regime}`;
}

function text(value: string | null, label: string, record: CompletedSanctionsReviewRecord): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${key(record)}: ${label} is required`);
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
    const reviewer = text(record.reviewer, "reviewer", record);
    const reviewerOrganisation = text(record.reviewerOrganisation, "reviewerOrganisation", record);
    const reviewedAt = text(record.reviewedAt, "reviewedAt", record);
    if (Number.isNaN(new Date(reviewedAt).getTime())) throw new Error(`${candidateKey}: reviewedAt is invalid`);
    const reviewNote = text(record.reviewNote, "reviewNote", record);
    const decisionEvidenceUrl = text(record.decisionEvidenceUrl, "decisionEvidenceUrl", record);
    if (!/^https:\/\//i.test(decisionEvidenceUrl) || decisionEvidenceUrl === candidate.catalogueUrl) {
      throw new Error(`${candidateKey}: decisionEvidenceUrl must be a measure-specific HTTPS URL`);
    }
    if (record.reviewDecision === "approved") {
      if (!record.finalTier) throw new Error(`${candidateKey}: approved decision requires finalTier`);
      if (record.relationship !== "direct-country-exposure") {
        throw new Error(`${candidateKey}: situation-related record must be rejected rather than scored as country exposure`);
      }
    } else if (record.finalTier !== null) {
      throw new Error(`${candidateKey}: rejected decision must use finalTier=null`);
    }
    return {
      iso2: candidate.iso2,
      imposer: candidate.imposer,
      regime_name: candidate.regime,
      relationship: record.relationship,
      proposed_tier: candidate.proposedTier,
      final_tier: record.finalTier,
      catalogue_url: candidate.catalogueUrl,
      measure_evidence_url: record.measureEvidenceUrl,
      decision_evidence_url: decisionEvidenceUrl,
      effective_at: candidate.reviewedAsOf,
      status: record.reviewDecision,
      reviewed_by: reviewer,
      reviewer_organisation: reviewerOrganisation,
      reviewed_at: reviewedAt,
      review_note: reviewNote,
    };
  });
}
