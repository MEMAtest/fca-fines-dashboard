import type { SqlClient } from "../db.js";
import { getSqlClient } from "../db.js";
import {
  buildFcaFineCasePath as buildSharedFcaFineCasePath,
  normaliseFcaFineFirmSlug,
} from "../../src/utils/fcaFineCasePath.js";

export const FCA_FINE_CASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FcaFineSourceStatus =
  | "verified_detail"
  | "verified_publication"
  | "official_unverified"
  | "listing_only"
  | "missing";

export type FcaFineSourceReviewStatus =
  | "clear"
  | "needs_review"
  | "dismissed";

export type FcaFineCaseIndexabilityReason =
  | "invalid_case_id"
  | "missing_firm"
  | "invalid_date"
  | "date_parts_mismatch"
  | "non_positive_amount"
  | "amount_review_required"
  | "missing_summary"
  | "thin_summary"
  | "missing_breach_context"
  | "missing_official_source"
  | "case_source_not_specific"
  | "unverified_source"
  | "source_check_missing"
  | "source_check_failed"
  | "source_domain_mismatch"
  | "source_needs_review";

export interface FcaFineCaseQualityAssessment {
  indexable: boolean;
  reasons: FcaFineCaseIndexabilityReason[];
  warnings: FcaFineCaseIndexabilityReason[];
  summaryWordCount: number;
  evidenceStrength: "verified" | "official_unverified" | "weak" | "missing";
}

export interface FcaFineCaseSeoRow {
  caseId: string;
  year: number;
  firmSlug: string;
  firm: string;
  dateIssued: string;
  amount: number;
  breach: string | null;
  categories: string[];
  summary: string;
  sourceUrl: string | null;
  sourceStatus: FcaFineSourceStatus | null;
  sourceCheckedAt: string | null;
  indexable: boolean;
  indexabilityReasons: FcaFineCaseIndexabilityReason[];
}

export interface FcaFineRelatedCase extends FcaFineCaseSeoRow {
  canonicalPath: string;
  relationship: "same_entity" | "same_evidence" | "same_entity_and_evidence";
}

export interface FcaFineCaseRecord extends FcaFineCaseSeoRow {
  canonicalPath: string;
  regulator: "FCA";
  month: number;
  noticeUrl: string | null;
  listingSourceUrl: string | null;
  resolvedSourceUrl: string | null;
  sourceHttpStatus: number | null;
  sourceOfficialDomainMatch: boolean | null;
  sourceContentHash: string | null;
  sourceLastVerifiedAt: string | null;
  sourceNextCheckAt: string | null;
  sourceConsecutiveFailures: number;
  sourceReviewStatus: FcaFineSourceReviewStatus | null;
  sourceReviewReason: string | null;
  amountQuality: string | null;
  requiresAmountReview: boolean;
  amountVerificationUrl: string | null;
  amountOverrideReason: string | null;
  duplicateCount: number;
  createdAt: string | null;
  quality: FcaFineCaseQualityAssessment;
  relatedCases: FcaFineRelatedCase[];
}

type RawCaseRow = Record<string, unknown>;

interface QualityInput {
  caseId: string;
  firm: string;
  amount: number;
  dateIssued: string;
  year: number;
  month: number;
  summary: string;
  breach: string | null;
  categories: string[];
  sourceUrl: string | null;
  sourceStatus: FcaFineSourceStatus | null;
  sourceCheckedAt: string | null;
  sourceHttpStatus: number | null;
  sourceOfficialDomainMatch: boolean | null;
  sourceReviewStatus: FcaFineSourceReviewStatus | null;
  requiresAmountReview: boolean;
}

const CASE_COLUMNS = `
  public_case_id,
  regulator,
  firm_individual,
  trusted_amount_gbp,
  date_issued,
  year_issued,
  month_issued,
  summary,
  breach_type,
  breach_categories,
  notice_url,
  source_url,
  source_link_status,
  source_checked_at,
  source_http_status,
  source_official_domain_match,
  source_content_hash,
  source_resolved_url,
  source_last_verified_at,
  source_next_check_at,
  source_consecutive_failures,
  source_review_status,
  source_review_reason,
  amount_quality,
  requires_amount_review,
  amount_verification_url,
  amount_override_reason,
  duplicate_count,
  created_at
`;

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function dateOnly(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    // PostgreSQL DATE values are calendar dates without a timezone. The pg
    // driver materialises them at local midnight, so toISOString() moves dates
    // in British Summer Time back to the previous UTC day. Preserve the
    // driver's calendar components instead.
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = nullableString(value);
  if (!text) return "";
  return text.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? text;
}

function isoTimestamp(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }
  const text = nullableString(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? text : parsed.toISOString();
}

function sourceStatus(value: unknown): FcaFineSourceStatus | null {
  const status = nullableString(value);
  return status === "verified_detail" ||
    status === "verified_publication" ||
    status === "official_unverified" ||
    status === "listing_only" ||
    status === "missing"
    ? status
    : null;
}

function sourceReviewStatus(value: unknown): FcaFineSourceReviewStatus | null {
  const status = nullableString(value);
  return status === "clear" || status === "needs_review" || status === "dismissed"
    ? status
    : null;
}

function titleCasePublicationSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

/**
 * A small number of imported FCA news rows carry the article headline in the
 * party field. Where an official case-level publication is available, its
 * filename provides a more accurate, source-grounded entity name.
 */
export function normaliseFcaFineEntityName(
  value: unknown,
  caseSourceUrl: string | null,
): string {
  const raw = nullableString(value) ?? "";
  if (!/^FCA\b/i.test(raw) || !caseSourceUrl) return raw;

  try {
    const url = new URL(caseSourceUrl);
    if (url.hostname !== "fca.org.uk" && !url.hostname.endsWith(".fca.org.uk")) {
      return raw;
    }
    const filename = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      .replace(/\.pdf$/i, "")
      .replace(/-\d{4}$/i, "")
      .trim();
    return filename ? titleCasePublicationSlug(filename) : raw;
  } catch {
    return raw;
  }
}

export function isValidFcaFineCaseId(value: unknown): value is string {
  return typeof value === "string" && FCA_FINE_CASE_ID_PATTERN.test(value);
}

/**
 * The legacy FCA source stored most category arrays as a JSON string inside
 * JSONB. Accept both representations, plus pg-native arrays, without allowing
 * malformed values to break a public case page or the SEO build.
 */
export function parseFcaFineCategories(value: unknown): string[] {
  let current = value;

  for (let depth = 0; depth < 2 && typeof current === "string"; depth += 1) {
    const text = current.trim();
    if (!text) return [];
    try {
      current = JSON.parse(text);
    } catch {
      current = [text];
      break;
    }
  }

  if (!Array.isArray(current)) return [];
  return Array.from(
    new Set(
      current
        .map((item) => nullableString(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

function isOfficialFcaUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "fca.org.uk" || host.endsWith(".fca.org.uk"));
  } catch {
    return false;
  }
}

function summaryWordCount(summary: string): number {
  return summary.trim().split(/\s+/).filter(Boolean).length;
}

function isAnnualFcaListingUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return /^\/news\/news-stories\/\d{4}-fines\/?$/i.test(
      new URL(value).pathname,
    );
  } catch {
    return false;
  }
}

/**
 * Fail closed for facts that make a public case page unsafe or materially
 * incomplete. A valid official FCA URL is sufficient evidence provenance for
 * indexation; incomplete automated check metadata is surfaced as a warning so
 * it can be remediated without hiding almost the whole historic archive.
 */
export function assessFcaFineCaseIndexability(
  record: QualityInput,
): FcaFineCaseQualityAssessment {
  const reasons: FcaFineCaseIndexabilityReason[] = [];
  const warnings: FcaFineCaseIndexabilityReason[] = [];
  const words = summaryWordCount(record.summary);

  if (!isValidFcaFineCaseId(record.caseId)) reasons.push("invalid_case_id");
  if (record.firm.trim().length < 2) reasons.push("missing_firm");
  if (!Number.isFinite(record.amount) || record.amount <= 0) reasons.push("non_positive_amount");
  if (record.requiresAmountReview) reasons.push("amount_review_required");

  const issuedAt = /^\d{4}-\d{2}-\d{2}$/.test(record.dateIssued)
    ? new Date(`${record.dateIssued}T00:00:00Z`)
    : null;
  if (!issuedAt || Number.isNaN(issuedAt.valueOf())) {
    reasons.push("invalid_date");
  } else if (
    issuedAt.getUTCFullYear() !== record.year ||
    issuedAt.getUTCMonth() + 1 !== record.month
  ) {
    reasons.push("date_parts_mismatch");
  }

  if (words === 0) reasons.push("missing_summary");
  else if (words < 20) warnings.push("thin_summary");
  if (!record.breach && record.categories.length === 0) reasons.push("missing_breach_context");

  if (!isOfficialFcaUrl(record.sourceUrl)) reasons.push("missing_official_source");
  if (
    record.sourceStatus === "missing" ||
    record.sourceStatus === "listing_only" ||
    isAnnualFcaListingUrl(record.sourceUrl)
  ) {
    reasons.push("case_source_not_specific");
  }
  if (record.sourceStatus !== "verified_detail" && record.sourceStatus !== "verified_publication") {
    warnings.push("unverified_source");
  }
  if (!record.sourceCheckedAt) warnings.push("source_check_missing");
  if (record.sourceHttpStatus !== null && (record.sourceHttpStatus < 200 || record.sourceHttpStatus >= 400)) {
    warnings.push("source_check_failed");
  }
  if (record.sourceOfficialDomainMatch === false) reasons.push("source_domain_mismatch");
  if (record.sourceReviewStatus === "needs_review") reasons.push("source_needs_review");

  const evidenceStrength =
    record.sourceStatus === "verified_detail" || record.sourceStatus === "verified_publication"
      ? "verified"
      : record.sourceStatus === "official_unverified"
        ? "official_unverified"
        : record.sourceStatus === "listing_only"
          ? "weak"
          : "missing";

  return {
    indexable: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
    warnings: Array.from(new Set(warnings)),
    summaryWordCount: words,
    evidenceStrength,
  };
}

interface MappedCase extends QualityInput {
  firmSlug: string;
  noticeUrl: string | null;
  listingSourceUrl: string | null;
  resolvedSourceUrl: string | null;
  sourceContentHash: string | null;
  sourceLastVerifiedAt: string | null;
  sourceNextCheckAt: string | null;
  sourceConsecutiveFailures: number;
  sourceReviewReason: string | null;
  amountQuality: string | null;
  amountVerificationUrl: string | null;
  amountOverrideReason: string | null;
  duplicateCount: number;
  createdAt: string | null;
}

export function mapFcaFineCaseRow(row: RawCaseRow): MappedCase {
  const noticeUrl = nullableString(row.notice_url);
  const listingSourceUrl = nullableString(row.source_url);
  const resolvedSourceUrl = nullableString(row.source_resolved_url);
  const firm = normaliseFcaFineEntityName(
    row.firm_individual,
    noticeUrl ?? resolvedSourceUrl,
  );

  return {
    caseId: nullableString(row.public_case_id) ?? "",
    firm,
    firmSlug: normaliseFcaFineFirmSlug(firm),
    amount: numberValue(row.trusted_amount_gbp),
    dateIssued: dateOnly(row.date_issued),
    year: numberValue(row.year_issued),
    month: numberValue(row.month_issued),
    summary: nullableString(row.summary) ?? "",
    breach: nullableString(row.breach_type),
    categories: parseFcaFineCategories(row.breach_categories),
    sourceUrl: resolvedSourceUrl ?? noticeUrl ?? listingSourceUrl,
    noticeUrl,
    listingSourceUrl,
    resolvedSourceUrl,
    sourceStatus: sourceStatus(row.source_link_status),
    sourceCheckedAt: isoTimestamp(row.source_checked_at),
    sourceHttpStatus: row.source_http_status === null || row.source_http_status === undefined
      ? null
      : numberValue(row.source_http_status),
    sourceOfficialDomainMatch: row.source_official_domain_match === null || row.source_official_domain_match === undefined
      ? null
      : booleanValue(row.source_official_domain_match),
    sourceContentHash: nullableString(row.source_content_hash),
    sourceLastVerifiedAt: isoTimestamp(row.source_last_verified_at),
    sourceNextCheckAt: isoTimestamp(row.source_next_check_at),
    sourceConsecutiveFailures: numberValue(row.source_consecutive_failures),
    sourceReviewStatus: sourceReviewStatus(row.source_review_status),
    sourceReviewReason: nullableString(row.source_review_reason),
    amountQuality: nullableString(row.amount_quality),
    requiresAmountReview: booleanValue(row.requires_amount_review),
    amountVerificationUrl: nullableString(row.amount_verification_url),
    amountOverrideReason: nullableString(row.amount_override_reason),
    duplicateCount: numberValue(row.duplicate_count),
    createdAt: isoTimestamp(row.created_at),
  };
}

function toSeoRow(mapped: MappedCase): FcaFineCaseSeoRow {
  const quality = assessFcaFineCaseIndexability(mapped);
  return {
    caseId: mapped.caseId,
    year: mapped.year,
    firmSlug: mapped.firmSlug,
    firm: mapped.firm,
    dateIssued: mapped.dateIssued,
    amount: mapped.amount,
    breach: mapped.breach,
    categories: mapped.categories,
    summary: mapped.summary,
    sourceUrl: mapped.sourceUrl,
    sourceStatus: mapped.sourceStatus,
    sourceCheckedAt: mapped.sourceCheckedAt,
    indexable: quality.indexable,
    indexabilityReasons: quality.reasons,
  };
}

export function buildFcaFineCasePath(
  record: Pick<FcaFineCaseSeoRow, "caseId" | "year" | "firm">,
): string {
  if (!isValidFcaFineCaseId(record.caseId)) {
    throw new Error("FCA fine case ID must be a valid UUID");
  }
  if (!Number.isInteger(record.year) || record.year < 2000 || record.year > 2100) {
    throw new Error("FCA fine case year is invalid");
  }
  return buildSharedFcaFineCasePath({
    year: record.year,
    firm: record.firm,
    caseId: record.caseId.toLowerCase(),
  });
}

function normaliseEvidenceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase() || null;
  }
}

function relatedCaseRelationship(primary: MappedCase, related: MappedCase): FcaFineRelatedCase["relationship"] {
  const sameEntity = primary.firm.trim().toLowerCase() === related.firm.trim().toLowerCase();
  const sameEvidence = Boolean(
    normaliseEvidenceUrl(primary.sourceUrl) &&
    normaliseEvidenceUrl(primary.sourceUrl) === normaliseEvidenceUrl(related.sourceUrl),
  );
  if (sameEntity && sameEvidence) return "same_entity_and_evidence";
  return sameEntity ? "same_entity" : "same_evidence";
}

export async function listFcaMonetaryCasesForSeo(
  sql: SqlClient = getSqlClient(),
): Promise<FcaFineCaseSeoRow[]> {
  const rows = await sql(`
    SELECT ${CASE_COLUMNS}
    FROM public.all_regulatory_fines_trusted
    WHERE upper(regulator) = 'FCA'
      AND trusted_amount_gbp > 0
    ORDER BY date_issued DESC NULLS LAST, public_case_id ASC
  `);

  return rows.map((row) => toSeoRow(mapFcaFineCaseRow(row)));
}

export async function getFcaFineCaseById(
  publicCaseId: string,
  sql: SqlClient = getSqlClient(),
): Promise<FcaFineCaseRecord | null> {
  if (!isValidFcaFineCaseId(publicCaseId)) return null;

  const rows = await sql(
    `SELECT ${CASE_COLUMNS}
     FROM public.all_regulatory_fines_trusted
     WHERE upper(regulator) = 'FCA'
       AND trusted_amount_gbp > 0
       AND public_case_id = $1
     LIMIT 1`,
    [publicCaseId.toLowerCase()],
  );
  if (!rows[0]) return null;

  const primary = mapFcaFineCaseRow(rows[0]);
  const relatedRows = await sql(
    `SELECT ${CASE_COLUMNS}
     FROM public.all_regulatory_fines_trusted
     WHERE upper(regulator) = 'FCA'
       AND trusted_amount_gbp > 0
       AND public_case_id <> $1
       AND (
         lower(trim(firm_individual)) = lower(trim($2))
         OR public.normalise_regulatory_evidence_url(
           COALESCE(NULLIF(notice_url, ''), NULLIF(source_url, ''), '')
         ) = public.normalise_regulatory_evidence_url(COALESCE($3, ''))
       )
     ORDER BY
       CASE WHEN lower(trim(firm_individual)) = lower(trim($2)) THEN 0 ELSE 1 END,
       date_issued DESC NULLS LAST,
       public_case_id ASC
     LIMIT 8`,
    [primary.caseId, primary.firm, primary.sourceUrl],
  );

  const quality = assessFcaFineCaseIndexability(primary);
  const seo = toSeoRow(primary);
  const recordBase = {
    ...seo,
    canonicalPath: buildFcaFineCasePath(seo),
    regulator: "FCA" as const,
    month: primary.month,
    noticeUrl: primary.noticeUrl,
    listingSourceUrl: primary.listingSourceUrl,
    resolvedSourceUrl: primary.resolvedSourceUrl,
    sourceHttpStatus: primary.sourceHttpStatus,
    sourceOfficialDomainMatch: primary.sourceOfficialDomainMatch,
    sourceContentHash: primary.sourceContentHash,
    sourceLastVerifiedAt: primary.sourceLastVerifiedAt,
    sourceNextCheckAt: primary.sourceNextCheckAt,
    sourceConsecutiveFailures: primary.sourceConsecutiveFailures,
    sourceReviewStatus: primary.sourceReviewStatus,
    sourceReviewReason: primary.sourceReviewReason,
    amountQuality: primary.amountQuality,
    requiresAmountReview: primary.requiresAmountReview,
    amountVerificationUrl: primary.amountVerificationUrl,
    amountOverrideReason: primary.amountOverrideReason,
    duplicateCount: primary.duplicateCount,
    createdAt: primary.createdAt,
    quality,
  };

  return {
    ...recordBase,
    relatedCases: relatedRows.map((row) => {
      const related = mapFcaFineCaseRow(row);
      const relatedSeo = toSeoRow(related);
      return {
        ...relatedSeo,
        canonicalPath: buildFcaFineCasePath(relatedSeo),
        relationship: relatedCaseRelationship(primary, related),
      };
    }),
  };
}
