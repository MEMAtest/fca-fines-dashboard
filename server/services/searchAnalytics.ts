import crypto from 'node:crypto';
import type { PreparedEnforcementSearch, FuzzySearchResolution } from './enforcementSearch.js';

interface AnalyticsSearchResult {
  firm?: string;
  regulator?: string;
}

interface SearchAnalyticsFilters {
  [key: string]: string | number | null;
  regulator: string | null;
  country: string | null;
  year: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string;
}

export interface SearchAnalyticsRecord {
  queryHash: string;
  queryText: string;
  queryNormalized: string;
  queryMode: 'firm_lookup' | 'mixed' | 'theme';
  queryLength: number;
  meaningfulTermCount: number;
  firmIntentTermCount: number;
  shortQuery: boolean;
  strongFirmCandidate: boolean;
  regulatorHintCount: number;
  countryHintCount: number;
  categoryHintCount: number;
  filtersApplied: SearchAnalyticsFilters;
  resultCount: number;
  zeroResult: boolean;
  lowSignal: boolean;
  correctionCount: number;
  correctedQuery: string | null;
  correctionPairs: Array<{ from: string; to: string }>;
  fuzzySuppressedByFirmCandidate: boolean;
  topFirms: string[];
  topRegulators: string[];
  latencyMs: number;
}

function clampText(value: string, maxLength: number) {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeQueryForHash(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildSearchAnalyticsRecord({
  query,
  prepared,
  fuzzyResolution,
  filters,
  results,
  totalCount,
  latencyMs,
  lowSignal,
  queryMode,
  strongFirmCandidate,
  fuzzySuppressedByFirmCandidate,
}: {
  query: string;
  prepared: PreparedEnforcementSearch;
  fuzzyResolution: FuzzySearchResolution | null;
  filters: SearchAnalyticsFilters;
  results: AnalyticsSearchResult[];
  totalCount: number;
  latencyMs: number;
  lowSignal: boolean;
  queryMode: 'firm_lookup' | 'mixed' | 'theme';
  strongFirmCandidate: boolean;
  fuzzySuppressedByFirmCandidate: boolean;
}): SearchAnalyticsRecord {
  const normalizedQuery = clampText(normalizeQueryForHash(query), 280);
  const topFirms = unique(
    results
      .map((result) => result.firm?.trim() ?? '')
      .filter((value) => value.length > 0)
      .slice(0, 5),
  ).slice(0, 5);
  const topRegulators = unique(
    results
      .map((result) => result.regulator?.trim() ?? '')
      .filter((value) => value.length > 0)
      .slice(0, 5),
  ).slice(0, 5);
  const correctionPairs = fuzzyResolution?.changed
    ? fuzzyResolution.corrections.slice(0, 6)
    : [];
  const correctedQuery = fuzzyResolution?.changed
    ? clampText(fuzzyResolution.correctedQuery, 280)
    : null;

  return {
    queryHash: crypto.createHash('sha256').update(normalizedQuery).digest('hex'),
    queryText: clampText(query, 280),
    queryNormalized: normalizedQuery,
    queryMode,
    queryLength: query.trim().length,
    meaningfulTermCount: prepared.meaningfulTerms.length,
    firmIntentTermCount: prepared.firmIntentTerms.length,
    shortQuery: prepared.isShortFirmLikeQuery,
    strongFirmCandidate,
    regulatorHintCount: prepared.regulatorHints.length,
    countryHintCount: prepared.countryHints.length,
    categoryHintCount: prepared.categoryHints.length,
    filtersApplied: filters,
    resultCount: totalCount,
    zeroResult: totalCount === 0,
    lowSignal,
    correctionCount: correctionPairs.length,
    correctedQuery,
    correctionPairs,
    fuzzySuppressedByFirmCandidate,
    topFirms,
    topRegulators,
    latencyMs: Math.max(0, Math.round(latencyMs)),
  };
}
