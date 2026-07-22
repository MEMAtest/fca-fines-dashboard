export interface FineRecord {
  id?: string;
  canonical_case_id?: string;
  fine_reference: string | null;
  firm_individual: string;
  firm_category: string | null;
  regulator: string;
  final_notice_url: string | null;
  summary: string;
  breach_type: string | null;
  breach_categories: string[];
  amount: number;
  date_issued: string;
  year_issued: number;
  month_issued: number;
  created_at?: string;
  updated_at?: string;
  // Unified API fields (optional for backward compatibility)
  regulator_full_name?: string;
  country_code?: string;
  country_name?: string;
  amount_eur?: number;
  amount_gbp?: number;
  duplicate_count?: number;
  amount_quality?: string;
  requires_amount_review?: boolean;
  amount_verification_url?: string | null;
  amount_override_reason?: string | null;
  source_url?: string | null;
  listing_url?: string | null;
  detail_url?: string | null;
  official_publication_url?: string | null;
  source_link_status?:
    | 'verified_detail'
    | 'verified_publication'
    | 'official_unverified'
    | 'listing_only'
    | 'missing';
  source_link_label?: string | null;
  source_checked_at?: string | null;
  source_http_status?: number | null;
  source_official_domain_match?: boolean | null;
  source_content_hash?: string | null;
}

export type FcaFineCaseSourceStatus =
  | 'verified_detail'
  | 'verified_publication'
  | 'official_unverified'
  | 'listing_only'
  | 'missing';

export type FcaFineCaseIndexabilityReason =
  | 'invalid_case_id'
  | 'missing_firm'
  | 'invalid_date'
  | 'date_parts_mismatch'
  | 'non_positive_amount'
  | 'amount_review_required'
  | 'missing_summary'
  | 'thin_summary'
  | 'missing_breach_context'
  | 'missing_official_source'
  | 'unverified_source'
  | 'source_check_missing'
  | 'source_check_failed'
  | 'source_domain_mismatch'
  | 'source_needs_review';

export interface FcaFineCaseQuality {
  indexable: boolean;
  reasons: FcaFineCaseIndexabilityReason[];
  warnings: FcaFineCaseIndexabilityReason[];
  summaryWordCount: number;
  evidenceStrength: 'verified' | 'official_unverified' | 'weak' | 'missing';
}

export interface FcaFineRelatedCase {
  caseId: string;
  canonicalPath: string;
  firm: string;
  firmSlug: string;
  amount: number;
  dateIssued: string;
  year: number;
  breach: string | null;
  categories: string[];
  summary: string;
  sourceUrl: string | null;
  sourceStatus: FcaFineCaseSourceStatus | null;
  sourceCheckedAt: string | null;
  indexable: boolean;
  indexabilityReasons: FcaFineCaseIndexabilityReason[];
  relationship: 'same_entity' | 'same_evidence' | 'same_entity_and_evidence';
}

/** Public, canonical FCA fine record returned by GET /api/fca-fines/:caseId. */
export interface FcaFineCaseRecord {
  caseId: string;
  canonicalPath: string;
  regulator: 'FCA';
  firm: string;
  firmSlug: string;
  amount: number;
  dateIssued: string;
  year: number;
  month: number;
  summary: string;
  breach: string | null;
  categories: string[];
  sourceUrl: string | null;
  noticeUrl: string | null;
  listingSourceUrl: string | null;
  resolvedSourceUrl: string | null;
  sourceStatus: FcaFineCaseSourceStatus | null;
  sourceCheckedAt: string | null;
  sourceHttpStatus: number | null;
  sourceOfficialDomainMatch: boolean | null;
  sourceContentHash: string | null;
  sourceLastVerifiedAt: string | null;
  sourceNextCheckAt: string | null;
  sourceConsecutiveFailures: number;
  sourceReviewStatus: string | null;
  sourceReviewReason: string | null;
  amountQuality: string | null;
  requiresAmountReview: boolean;
  amountVerificationUrl: string | null;
  amountOverrideReason: string | null;
  duplicateCount: number;
  createdAt: string | null;
  quality: FcaFineCaseQuality;
  relatedCases: FcaFineRelatedCase[];
}

export interface FcaFineCaseResponse {
  success: true;
  data: FcaFineCaseRecord;
}

export interface StatsResponse {
  success: boolean;
  data: {
    totalFines: number;
    totalAmount: number;
    avgAmount: number;
    maxFine: number;
    maxFirmName: string | null;
    dominantBreach: string | null;
  };
}

export interface TrendsResponse {
  success: boolean;
  data: Array<{
    period_type: string;
    year: number;
    period_value: number;
    fine_count: number;
    total_fines: number;
    average_fine: number;
  }>;
}

export interface ListResponse {
  success: boolean;
  data: FineRecord[];
}

export interface NotificationsResponse {
  success: boolean;
  data: Array<{
    id: string;
    title: string;
    detail: string;
    time: string;
    read?: boolean;
  }>;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  read?: boolean;
}

export interface CategorySummary {
  name: string;
  slug: string;
  fineCount: number;
  totalAmount: number;
}

export interface YearSummary {
  year: number;
  fineCount: number;
  totalAmount: number;
}

export interface SectorSummary {
  name: string;
  slug: string;
  fineCount: number;
  totalAmount: number;
}

export interface FirmSummary {
  name: string;
  slug: string;
  fineCount: number;
  totalAmount: number;
  latestDate: string | null;
}

export interface FirmDetails {
  name: string;
  slug: string;
  fineCount: number;
  totalAmount: number;
  maxFine: number;
  earliestDate: string | null;
  latestDate: string | null;
  records: FineRecord[];
}

export interface BreachDetails {
  category: CategorySummary;
  maxFine: number;
  earliestDate: string | null;
  latestDate: string | null;
  topFirms: FirmSummary[];
  topPenalties: FineRecord[];
}

export interface SectorDetails {
  sector: SectorSummary;
  maxFine: number;
  earliestDate: string | null;
  latestDate: string | null;
  topBreaches: CategorySummary[];
  topPenalties: FineRecord[];
}

export interface CategoriesResponse {
  success: boolean;
  data: CategorySummary[];
}

export interface YearsResponse {
  success: boolean;
  data: YearSummary[];
}

export interface SectorsResponse {
  success: boolean;
  data: SectorSummary[];
}

export interface FirmsResponse {
  success: boolean;
  data: FirmSummary[];
}

export interface FirmResponse {
  success: boolean;
  data: FirmDetails;
}

export interface BreachResponse {
  success: boolean;
  data: BreachDetails;
}

export interface SectorResponse {
  success: boolean;
  data: SectorDetails;
}
