import { createHash } from "node:crypto";
import type { ApprovedCountrySanctions, ApprovedSanctionsSnapshotMetadata } from "../../../src/data/sanctionsApprovedData.js";
import type { SanctionsRegimeCandidate } from "../../../src/data/sanctionsRegimeCandidates.js";
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
}

const EXPECTED_SOURCE_IDS = new Set([
  "ofac-programmes",
  "uk-regimes",
  "eu-resources",
  "un-consolidated-list",
]);

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

export function buildPromotedSanctionsSnapshot(args: {
  candidates: SanctionsRegimeCandidate[];
  rows: SanctionsReviewRow[];
  sourceReport: SanctionsSourceAssuranceReport;
  asOf: Date;
  maximumSourceAgeHours?: number;
}): PromotedSanctionsSnapshot {
  const { candidates, rows, sourceReport, asOf } = args;
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

  const countries = new Map<string, ApprovedCountrySanctions>();
  let approvedCount = 0;
  let rejectedCount = 0;
  const reviewedDates: string[] = [];
  const canonicalDecisions: unknown[] = [];

  for (const row of [...rows].sort((a, b) => key(a).localeCompare(key(b)))) {
    if (row.status === "pending") throw new Error(`${key(row)}: pending decision blocks promotion`);
    const reviewedBy = required(row.reviewed_by, "reviewed_by", row);
    const reviewerOrganisation = required(row.reviewer_organisation, "reviewer_organisation", row);
    const reviewNote = required(row.review_note, "review_note", row);
    if (!row.reviewed_at) throw new Error(`${key(row)}: reviewed_at is required`);
    const reviewedAt = iso(row.reviewed_at);
    const decisionEvidenceUrl = required(row.decision_evidence_url, "decision_evidence_url", row);
    if (!/^https:\/\//i.test(decisionEvidenceUrl)) throw new Error(`${key(row)}: decision evidence must use HTTPS`);
    if (decisionEvidenceUrl === row.catalogue_url) {
      throw new Error(`${key(row)}: decision requires measure-specific evidence, not the generic catalogue`);
    }
    reviewedDates.push(reviewedAt);
    canonicalDecisions.push({
      key: key(row),
      status: row.status,
      relationship: row.relationship,
      proposedTier: row.proposed_tier,
      finalTier: row.final_tier,
      evidenceUrl: decisionEvidenceUrl,
      reviewedBy,
      reviewerOrganisation,
      reviewedAt,
      reviewNote,
    });
    if (row.status === "rejected") {
      if (row.final_tier !== null) throw new Error(`${key(row)}: rejected decision must not retain final_tier`);
      rejectedCount += 1;
      continue;
    }
    if (!row.final_tier) throw new Error(`${key(row)}: approved decision requires final_tier`);
    if (row.relationship !== "direct-country-exposure") {
      throw new Error(`${key(row)}: situation-related regime cannot be approved as country exposure`);
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
  const sourceReportSha256 = createHash("sha256").update(JSON.stringify(sourceReport)).digest("hex");
  const canonical = JSON.stringify({
    candidates: candidates.length,
    decisions: canonicalDecisions,
    sourceFingerprints,
    sources,
  });
  const sha256 = createHash("sha256").update(canonical).digest("hex");
  const countryRows = [...countries.values()]
    .map((country) => ({ ...country, programs: [...country.programs].sort((a, b) => a.imposer.localeCompare(b.imposer)) }))
    .sort((a, b) => a.iso2.localeCompare(b.iso2));
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
    },
    countries: countryRows,
  };
}
