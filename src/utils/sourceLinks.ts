import { getRegulatorCoverage } from '../data/regulatorCoverage';
import type { FineRecord } from '../types';

export type SourceLinkStatus = 'verified_detail' | 'verified_publication' | 'listing_only' | 'missing';

type SourceLinkRecord = Pick<
  FineRecord,
  | 'regulator'
  | 'final_notice_url'
  | 'source_url'
  | 'listing_url'
  | 'detail_url'
  | 'official_publication_url'
  | 'source_link_status'
  | 'source_link_label'
>;

const DIRECT_LINK_DISABLED_REGULATORS = new Set(['AFM', 'DNB', 'ESMA']);

function normalizeUrl(url: string | null | undefined) {
  const trimmed = url?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function isPdfUrl(url: string) {
  return /\.pdf(?:$|[?#])/i.test(url);
}

function isLikelyListingPage(url: string) {
  return [
    '/register',
    '/registers/',
    '/registrosanciones/',
    '/sanctions-and-enforcement',
    '/enforcement-actions',
    '/enforcementdecisions',
    '/enforcement-committee-news-releases',
    '/sector-information/enforcement/',
    '/massnahmen_sanktionen_node',
  ].some((segment) => url.toLowerCase().includes(segment));
}

function isSyntheticCnmvDetail(url: string) {
  return /cnmv\.es\/portal\/consultas\/registrosanciones\/s\/\d{4}\//i.test(url);
}

function normalizeRegulator(regulator: string | null | undefined) {
  return regulator?.toUpperCase().trim() || '';
}

function getPreferredOfficialLink(record: Pick<FineRecord, 'detail_url' | 'official_publication_url' | 'final_notice_url'>) {
  return normalizeUrl(record.detail_url) || normalizeUrl(record.official_publication_url) || normalizeUrl(record.final_notice_url);
}

export function deriveSourceLinkStatus(
  regulator: string,
  noticeUrl: string | null | undefined,
  sourceUrl: string | null | undefined
): SourceLinkStatus {
  const normalizedRegulator = normalizeRegulator(regulator);
  const detail = normalizeUrl(noticeUrl);
  const listing = normalizeUrl(sourceUrl);

  if (DIRECT_LINK_DISABLED_REGULATORS.has(normalizedRegulator)) {
    return listing ? 'listing_only' : 'missing';
  }

  if (!detail && !listing) {
    return 'missing';
  }

  if (normalizedRegulator === 'FCA' && detail) {
    return isPdfUrl(detail) ? 'verified_publication' : 'verified_detail';
  }

  if (!detail) {
    return listing ? 'listing_only' : 'missing';
  }

  if (listing && detail === listing) {
    return 'listing_only';
  }

  if (normalizedRegulator === 'CNMV' && isSyntheticCnmvDetail(detail)) {
    return listing ? 'listing_only' : 'missing';
  }

  if (isLikelyListingPage(detail)) {
    return listing ? 'listing_only' : 'missing';
  }

  return isPdfUrl(detail) ? 'verified_publication' : 'verified_detail';
}

export function getRecordSourceStatus(record: SourceLinkRecord): SourceLinkStatus {
  return (
    record.source_link_status ||
    deriveSourceLinkStatus(record.regulator, getPreferredOfficialLink(record), record.listing_url || record.source_url)
  );
}

export function getBestRecordSourceUrl(record: SourceLinkRecord) {
  const status = getRecordSourceStatus(record);
  if (status === 'listing_only' || status === 'missing') {
    return null;
  }

  if (status === 'verified_publication') {
    return normalizeUrl(record.official_publication_url) || normalizeUrl(record.detail_url) || normalizeUrl(record.final_notice_url);
  }

  return getPreferredOfficialLink(record);
}

export function hasVerifiedRecordSource(record: SourceLinkRecord) {
  return Boolean(getBestRecordSourceUrl(record));
}

export function getRecordListingUrl(record: Pick<FineRecord, 'regulator' | 'source_url' | 'listing_url'>) {
  const directListing = normalizeUrl(record.listing_url) || normalizeUrl(record.source_url);
  if (directListing) {
    return directListing;
  }
  return getRegulatorCoverage(record.regulator)?.officialSources[0]?.url ?? null;
}

export function getRecordSourceLabel(record: SourceLinkRecord) {
  if (record.source_link_label) {
    return record.source_link_label;
  }

  return getRecordSourceStatus(record) === 'verified_publication' ? 'View publication' : 'View notice';
}
