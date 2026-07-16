import type { SourceLinkRecord, SourceLinkStatus } from "./sourceLinks.js";
import type { FineRecord } from "../types.js";
import {
  getBestRecordSourceUrl,
  getRecordListingUrl,
  getRecordSourceLabel,
  getRecordSourceStatus,
} from "./sourceLinks.js";

export type EvidenceSurface =
  | "workspace_drawer"
  | "fines_drilldown"
  | "enforcement_search"
  | "uk_enforcement"
  | "year_hub"
  | "breach_hub"
  | "sector_hub"
  | "firm_hub"
  | "latest_notices"
  | "lessons_analysis"
  | "dashboard_hero";

export interface EvidenceCase {
  id: string;
  entity: string;
  regulator: string;
  regulatorFullName?: string | null;
  country?: string | null;
  dateIssued: string;
  amount?: number | null;
  currency: string;
  breachType?: string | null;
  categories: string[];
  summary?: string | null;
  sourceStatus: SourceLinkStatus;
  sourceLabel: string;
  directSourceUrl: string | null;
  listingSourceUrl: string | null;
  sourceWindowNote?: string | null;
  surface: EvidenceSurface;
}

export interface EvidenceCaseInput extends SourceLinkRecord {
  id?: string | null;
  entity: string;
  regulatorFullName?: string | null;
  country?: string | null;
  dateIssued: string;
  amount?: number | null;
  currency?: string | null;
  breachType?: string | null;
  categories?: string[] | null;
  summary?: string | null;
  sourceWindowNote?: string | null;
}

export function buildEvidenceCase(
  input: EvidenceCaseInput,
  surface: EvidenceSurface,
): EvidenceCase {
  const sourceRecord: SourceLinkRecord = {
    regulator: input.regulator,
    final_notice_url: input.final_notice_url,
    source_url: input.source_url,
    listing_url: input.listing_url,
    detail_url: input.detail_url,
    official_publication_url: input.official_publication_url,
    source_link_status: input.source_link_status,
    source_link_label: input.source_link_label,
  };
  const sourceStatus = getRecordSourceStatus(sourceRecord);
  const directSourceUrl = getBestRecordSourceUrl(sourceRecord);
  const listingSourceUrl = sourceStatus === "listing_only"
    ? getRecordListingUrl(sourceRecord)
    : null;

  return {
    id: input.id || `${input.regulator}-${input.entity}-${input.dateIssued}`,
    entity: input.entity,
    regulator: input.regulator,
    regulatorFullName: input.regulatorFullName,
    country: input.country,
    dateIssued: input.dateIssued,
    amount: input.amount,
    currency: input.currency || "GBP",
    breachType: input.breachType,
    categories: input.categories?.filter(Boolean) ?? [],
    summary: input.summary,
    sourceStatus,
    sourceLabel: getRecordSourceLabel(sourceRecord),
    directSourceUrl,
    listingSourceUrl,
    sourceWindowNote: input.sourceWindowNote,
    surface,
  };
}

export function buildFineRecordEvidence(
  record: FineRecord,
  surface: EvidenceSurface,
  currency = "GBP",
) {
  return buildEvidenceCase({
    id: record.id ?? record.fine_reference,
    entity: record.firm_individual,
    regulator: record.regulator,
    regulatorFullName: record.regulator_full_name,
    country: record.country_name,
    dateIssued: record.date_issued,
    amount: record.amount,
    currency,
    breachType: record.breach_type,
    categories: record.breach_categories,
    summary: record.summary,
    final_notice_url: record.final_notice_url,
    source_url: record.source_url,
    listing_url: record.listing_url,
    detail_url: record.detail_url,
    official_publication_url: record.official_publication_url,
    source_link_status: record.source_link_status,
    source_link_label: record.source_link_label,
  }, surface);
}
