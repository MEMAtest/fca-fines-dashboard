/**
 * Enforcement Search API
 *
 * Hybrid ranked search across all enforcement actions using:
 * - exact / near-exact firm matching
 * - PostgreSQL full-text search
 * - phrase and token fallback matching for broader enforcement themes
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PUBLIC_REGULATOR_CODES } from '../src/data/regulatorCoverage.js';
import { UK_ENFORCEMENT_REGULATOR_CODES } from '../src/data/ukEnforcement.js';
import { getSqlClient } from '../server/db.js';
import {
  buildFallbackSnippet,
  normalizeCountryCode,
  prepareEnforcementSearch,
  type PreparedEnforcementSearch,
  resolveFuzzySearchTerms,
  stripSnippetHtml,
} from '../server/services/enforcementSearch.js';
import {
  buildSearchAnalyticsRecord,
  type SearchAnalyticsRecord,
} from '../server/services/searchAnalytics.js';

const SEARCHABLE_REGULATOR_CODES = [
  ...new Set([...PUBLIC_REGULATOR_CODES, ...UK_ENFORCEMENT_REGULATOR_CODES]),
];

interface SearchRow {
  id: string;
  regulator: string;
  regulator_full_name: string;
  country_code: string;
  country_name: string;
  firm_individual: string;
  firm_category: string;
  amount_original: string | number | null;
  currency: string;
  amount_gbp: string | number | null;
  amount_eur: string | number | null;
  date_issued: string;
  year_issued: number;
  month_issued: number;
  breach_type: string | null;
  breach_categories: string[];
  summary: string | null;
  notice_url: string | null;
  source_url: string | null;
  created_at: string;
  relevance_score: string | number;
  snippet: string | null;
}

type SearchQueryMode = 'firm_lookup' | 'mixed' | 'theme';

interface FirmCandidateSignal {
  strong: boolean;
  candidateCount: number;
  bestTier: number;
}

const FIRM_NORMALIZATION_JOIN = `
  CROSS JOIN LATERAL (
    SELECT TRIM(
      REGEXP_REPLACE(
        LOWER(COALESCE(firm_individual, '')),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ) AS normalized_name
  ) AS firm_norm
  CROSS JOIN LATERAL (
    SELECT TRIM(
      REGEXP_REPLACE(
        firm_norm.normalized_name,
        '([[:space:]]+(limited|ltd|plc|llc|llp|inc|incorporated|corp|corporation|company|co|ag|sa|se|nv|bv|gmbh|pte|pty|dac|uab|sicav|sarl|spa|sro))+$',
        '',
        'i'
      )
    ) AS legal_stripped_name
  ) AS firm_legal
`;

const SEARCHABLE_ENFORCEMENT_CTE = `
  searchable_enforcement AS (
    SELECT
      id,
      regulator,
      regulator_full_name,
      country_code,
      country_name,
      firm_individual,
      firm_category,
      amount_original,
      currency,
      amount_gbp,
      amount_eur,
      date_issued,
      year_issued,
      month_issued,
      breach_type,
      breach_categories,
      summary,
      notice_url,
      source_url,
      created_at,
      search_vector
    FROM all_regulatory_fines

    UNION ALL

    SELECT
      id,
      regulator,
      regulator_full_name,
      country_code,
      country_name,
      firm_individual,
      firm_category,
      amount_original,
      currency,
      amount_gbp,
      amount_eur,
      date_issued,
      year_issued,
      month_issued,
      breach_type,
      breach_categories,
      summary,
      notice_url,
      source_url,
      created_at,
      to_tsvector(
        'english',
        concat_ws(
          ' ',
          firm_individual,
          regulator,
          regulator_full_name,
          country_name,
          breach_type,
          breach_categories::text,
          summary,
          aliases::text
        )
      ) AS search_vector
    FROM uk_enforcement_actions
  )
`;

function toFiniteNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function queryRows<T>(
  query: string,
  params: unknown[] = [],
) {
  return getSqlClient()(query, params) as Promise<T[]>;
}

function firmBoundaryCondition(expression: string, placeholder: string) {
  return `(
    ${placeholder} <> ''
    AND (
      ${expression} = ${placeholder}
      OR ${expression} LIKE ${placeholder} || ' %'
      OR ${expression} LIKE '% ' || ${placeholder} || ' %'
      OR ${expression} LIKE '% ' || ${placeholder}
    )
  )`;
}

function firmTokenBoundaryCondition(expression: string, placeholder: string) {
  return `(
    SELECT COUNT(*)::int
    FROM unnest(${placeholder}::text[]) AS token
    WHERE token <> ''
      AND (
        ${expression} = token
        OR ${expression} LIKE token || ' %'
        OR ${expression} LIKE '% ' || token || ' %'
        OR ${expression} LIKE '% ' || token
      )
  )`;
}

function determineSearchQueryMode(
  prepared: PreparedEnforcementSearch,
  firmCandidateSignal: FirmCandidateSignal,
): SearchQueryMode {
  if (prepared.isShortFirmLikeQuery && firmCandidateSignal.strong) {
    return 'firm_lookup';
  }

  if (
    prepared.firmIntentTerms.length > 0 &&
    (
      prepared.regulatorHints.length > 0 ||
      prepared.countryHints.length > 0 ||
      prepared.categoryHints.length > 0 ||
      prepared.meaningfulTerms.length !== prepared.firmIntentTerms.length
    )
  ) {
    return 'mixed';
  }

  return 'theme';
}

async function recordSearchAnalytics(record: SearchAnalyticsRecord) {
  try {
    await queryRows(
      `
      INSERT INTO search_query_analytics (
        query_hash,
        query_text,
        query_normalized,
        query_mode,
        query_length,
        meaningful_term_count,
        firm_intent_term_count,
        short_query,
        strong_firm_candidate,
        regulator_hint_count,
        country_hint_count,
        category_hint_count,
        filters_applied,
        result_count,
        zero_result,
        low_signal,
        correction_count,
        corrected_query,
        correction_pairs,
        fuzzy_suppressed_by_firm_candidate,
        top_firms,
        top_regulators,
        latency_ms
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13::jsonb,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19::jsonb,
        $20,
        $21::jsonb,
        $22::jsonb,
        $23
      )
      `,
      [
        record.queryHash,
        record.queryText,
        record.queryNormalized,
        record.queryMode,
        record.queryLength,
        record.meaningfulTermCount,
        record.firmIntentTermCount,
        record.shortQuery,
        record.strongFirmCandidate,
        record.regulatorHintCount,
        record.countryHintCount,
        record.categoryHintCount,
        JSON.stringify(record.filtersApplied),
        record.resultCount,
        record.zeroResult,
        record.lowSignal,
        record.correctionCount,
        record.correctedQuery,
        JSON.stringify(record.correctionPairs),
        record.fuzzySuppressedByFirmCandidate,
        JSON.stringify(record.topFirms),
        JSON.stringify(record.topRegulators),
        record.latencyMs,
      ],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('search_query_analytics')) {
      console.warn('⚠️ search_query_analytics table not available yet');
      return;
    }
    console.warn('⚠️ Failed to record search analytics', error);
  }
}

async function fetchFuzzyCandidatePhrases({
  regulator,
  countryCode,
  year,
  meaningfulTerms,
}: {
  regulator: string | undefined;
  countryCode: string | null;
  year: string | undefined;
  meaningfulTerms: string[];
}) {
  const conditions: string[] = [`firm_individual IS NOT NULL`, `firm_individual <> ''`];
  const params: Array<string | number | readonly string[]> = [];
  const candidatePrefixes = Array.from(
    new Set(
      meaningfulTerms
        .filter((term) => term.length >= 4)
        .map((term) => term.slice(0, Math.min(2, term.length)).toLowerCase()),
    ),
  );

  if (regulator) {
    params.push(regulator);
    conditions.push(`regulator = $${params.length}`);
  } else {
    params.push(SEARCHABLE_REGULATOR_CODES);
    conditions.push(`regulator = ANY($${params.length})`);
  }

  if (countryCode) {
    params.push(countryCode);
    conditions.push(`country_code = $${params.length}`);
  }

  if (year) {
    const yearNum = Number.parseInt(year, 10);
    if (!Number.isNaN(yearNum)) {
      params.push(yearNum);
      conditions.push(`year_issued = $${params.length}`);
    }
  }

  if (candidatePrefixes.length > 0) {
    params.push(candidatePrefixes);
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM unnest($${params.length}::text[]) AS prefix
        WHERE LOWER(COALESCE(firm_individual, '')) LIKE prefix || '%'
          OR LOWER(COALESCE(regulator_full_name, '')) LIKE prefix || '%'
          OR LOWER(COALESCE(country_name, '')) LIKE prefix || '%'
      )
    `);
  }

  const rows = await queryRows<{
      firm_individual: string | null;
      regulator: string | null;
      regulator_full_name: string | null;
      country_name: string | null;
    }>(
    `
      WITH ${SEARCHABLE_ENFORCEMENT_CTE}
      SELECT DISTINCT ON (firm_individual)
        firm_individual,
        regulator,
        regulator_full_name,
        country_name
      FROM searchable_enforcement
      WHERE ${conditions.join(' AND ')}
      ORDER BY firm_individual, date_issued DESC
      LIMIT 1200
    `,
    params,
  );

  return rows.flatMap((row) =>
    [
      row.firm_individual,
      row.regulator,
      row.regulator_full_name,
      row.country_name,
    ].filter((value): value is string => Boolean(value && value.trim())),
  );
}

async function fetchStrongFirmCandidateSignal({
  regulator,
  countryCode,
  year,
  prepared,
}: {
  regulator: string | undefined;
  countryCode: string | null;
  year: string | undefined;
  prepared: PreparedEnforcementSearch;
}): Promise<FirmCandidateSignal> {
  if (!prepared.isShortFirmLikeQuery) {
    return { strong: false, candidateCount: 0, bestTier: 0 };
  }

  const firmQuery = prepared.firmIntentQuery;
  const firmQueryWithoutLegalSuffix = prepared.firmIntentQueryWithoutLegalSuffix;
  if (!firmQueryWithoutLegalSuffix) {
    return { strong: false, candidateCount: 0, bestTier: 0 };
  }

  const params: Array<string | number | readonly string[]> = [
    firmQuery,
    firmQueryWithoutLegalSuffix,
    prepared.firmIntentTerms,
  ];
  const conditions: string[] = [];

  if (regulator) {
    params.push(regulator);
    conditions.push(`regulator = $${params.length}`);
  } else {
    params.push(SEARCHABLE_REGULATOR_CODES);
    conditions.push(`regulator = ANY($${params.length})`);
  }

  if (countryCode) {
    params.push(countryCode);
    conditions.push(`country_code = $${params.length}`);
  }

  if (year) {
    const yearNum = Number.parseInt(year, 10);
    if (!Number.isNaN(yearNum)) {
      params.push(yearNum);
      conditions.push(`year_issued = $${params.length}`);
    }
  }

  const filterWhereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const wholeFirmQueryCondition = firmBoundaryCondition(
    'firm_norm.normalized_name',
    '$2',
  );
  const tokenBoundaryMatchCount = firmTokenBoundaryCondition(
    'firm_norm.normalized_name',
    '$3',
  );

  const rows = await queryRows<{
      firm_individual: string | null;
      candidate_tier: number;
    }>(
    `
      WITH ${SEARCHABLE_ENFORCEMENT_CTE},
      candidates AS (
        SELECT
          firm_individual,
          CASE
            WHEN $1 <> '' AND firm_norm.normalized_name = $1 THEN 5
            WHEN $2 <> '' AND firm_legal.legal_stripped_name = $2 THEN 5
            WHEN $2 <> '' AND firm_norm.normalized_name = $2 THEN 4
            WHEN $2 <> '' AND firm_norm.normalized_name LIKE $2 || ' %' THEN 3
            WHEN ${wholeFirmQueryCondition} THEN 2
            WHEN ${tokenBoundaryMatchCount} > 0 THEN 1
            ELSE 0
          END AS candidate_tier
        FROM searchable_enforcement
        ${FIRM_NORMALIZATION_JOIN}
        ${filterWhereClause}
      )
      SELECT DISTINCT ON (firm_individual)
        firm_individual,
        candidate_tier
      FROM candidates
      WHERE candidate_tier > 0
      ORDER BY firm_individual, candidate_tier DESC
      LIMIT 30
    `,
    params,
  );

  const candidateCount = rows.length;
  const bestTier = rows.reduce(
    (highest, row) => Math.max(highest, Number(row.candidate_tier ?? 0)),
    0,
  );
  const strong =
    bestTier >= 3 ||
    (bestTier >= 2 && candidateCount <= 20) ||
    (bestTier === 1 && candidateCount <= 10);

  return { strong, candidateCount, bestTier };
}

function buildEmptySearchResponse({
  query,
  regulator,
  country,
  year,
  minAmount,
  maxAmount,
  currency,
  limit,
  offset,
  searchTerms,
  reason,
}: {
  query: string;
  regulator: string | null;
  country: string | null;
  year: string | undefined;
  minAmount: string | undefined;
  maxAmount: string | undefined;
  currency: string;
  limit: number;
  offset: number;
  searchTerms: string[];
  reason: string;
}) {
  return {
    query,
    results: [],
    pagination: {
      total: 0,
      limit,
      offset,
      hasMore: false,
      pages: 0,
      currentPage: 1,
    },
    filters: {
      query,
      regulator,
      country,
      year: year ? Number.parseInt(year, 10) : null,
      minAmount: minAmount ? Number.parseFloat(minAmount) : null,
      maxAmount: maxAmount ? Number.parseFloat(maxAmount) : null,
      currency,
      minRelevance: 0,
    },
    searchTerms,
    metadata: {
      searchMethod: 'hybrid',
      indexType: 'full-text + ilike fallback',
      language: 'english',
      reason,
      indexSignals: {
        conceptEnrichment: true,
        breachCategoryFallback: true,
        categoryHints: true,
        lowSignalGuard: true,
      },
      weights: {
        firm: 'exact / phrase firm matches',
        fullText: 'search_vector full-text ranking',
        fallback: 'phrase and token fallback matching',
      },
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      q,
      regulator,
      country,
      year,
      minAmount,
      maxAmount,
      currency = 'GBP',
      limit = '20',
      offset = '0',
    } = req.query as Record<string, string>;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Query parameter "q" is required for enforcement search',
        example: '/api/search?q=AML+transaction+monitoring+failures',
      });
    }

    const limitNum = Math.min(Number.parseInt(limit, 10) || 20, 100);
    const offsetNum = Math.max(Number.parseInt(offset, 10) || 0, 0);
    const amountColumn = currency === 'EUR' ? 'amount_eur' : 'amount_gbp';
    const normalizedCountryCode = normalizeCountryCode(country);
    const prepared = prepareEnforcementSearch(q);
    const searchQuery = prepared.searchQuery;
    const analyticsFilters = {
      regulator: regulator || null,
      country: normalizedCountryCode || null,
      year: year ? Number.parseInt(year, 10) : null,
      minAmount: minAmount ? Number.parseFloat(minAmount) : null,
      maxAmount: maxAmount ? Number.parseFloat(maxAmount) : null,
      currency,
    };

    if (!prepared.hasSearchIntent) {
      const payload = buildEmptySearchResponse({
        query: q,
        regulator: regulator || null,
        country: normalizedCountryCode || null,
        year,
        minAmount,
        maxAmount,
        currency,
        limit: limitNum,
        offset: offsetNum,
        searchTerms: prepared.searchTerms,
        reason: 'Query contained only low-signal terms',
      });
      await recordSearchAnalytics(
        buildSearchAnalyticsRecord({
          query: q,
          prepared,
          fuzzyResolution: null,
          filters: analyticsFilters,
          results: [],
          totalCount: 0,
          latencyMs: Date.now() - startedAt,
          lowSignal: true,
          queryMode: 'theme',
          strongFirmCandidate: false,
          fuzzySuppressedByFirmCandidate: false,
        }),
      );
      return res.status(200).json(payload);
    }

    const firmCandidateSignal = await fetchStrongFirmCandidateSignal({
      regulator,
      countryCode: normalizedCountryCode,
      year,
      prepared,
    });
    const queryMode = determineSearchQueryMode(prepared, firmCandidateSignal);
    const fuzzySuppressedByFirmCandidate =
      prepared.isShortFirmLikeQuery &&
      firmCandidateSignal.strong &&
      prepared.meaningfulTerms.some((term) => term.length >= 4);
    const shouldAttemptFuzzyCorrection =
      !fuzzySuppressedByFirmCandidate &&
      prepared.meaningfulTerms.some((term) => term.length >= 4);
    const fuzzyCandidatePhrases = shouldAttemptFuzzyCorrection
      ? await fetchFuzzyCandidatePhrases({
          regulator,
          countryCode: normalizedCountryCode,
          year,
          meaningfulTerms: prepared.meaningfulTerms,
        })
      : [];
    const fuzzyResolution = shouldAttemptFuzzyCorrection
      ? resolveFuzzySearchTerms(prepared.meaningfulTerms, fuzzyCandidatePhrases)
      : {
          correctedTerms: prepared.meaningfulTerms,
          correctedQuery: prepared.meaningfulTerms.join(' '),
          corrections: [],
          changed: false,
        };
    const fuzzyPrepared = fuzzyResolution.changed
      ? prepareEnforcementSearch(fuzzyResolution.correctedQuery)
      : null;

    const conditions: string[] = [];
    const params: Array<string | number | boolean | readonly string[] | null> = [
      searchQuery,
      prepared.phrasePattern,
      prepared.searchPatterns,
      prepared.minimumTokenMatches,
      prepared.regulatorHints,
      prepared.countryHints,
      prepared.categoryHints,
      fuzzyPrepared?.searchQuery ?? '',
      fuzzyPrepared?.phrasePattern ?? '',
      fuzzyPrepared?.searchPatterns ?? [],
      fuzzyPrepared?.minimumTokenMatches ?? 0,
      prepared.firmIntentTerms,
      fuzzyPrepared?.firmIntentTerms ?? [],
      prepared.meaningfulTerms,
      fuzzyPrepared?.meaningfulTerms ?? [],
      prepared.firmIntentQuery,
      prepared.firmIntentQueryWithoutLegalSuffix,
      prepared.isShortFirmLikeQuery,
    ];

    if (regulator) {
      params.push(regulator);
      conditions.push(`regulator = $${params.length}`);
    } else {
      params.push(SEARCHABLE_REGULATOR_CODES);
      conditions.push(`regulator = ANY($${params.length})`);
    }

    if (country) {
      params.push(normalizedCountryCode);
      conditions.push(`country_code = $${params.length}`);
    }

    if (year) {
      const yearNum = Number.parseInt(year, 10);
      if (!Number.isNaN(yearNum)) {
        params.push(yearNum);
        conditions.push(`year_issued = $${params.length}`);
      }
    }

    if (minAmount) {
      const minAmountNum = Number.parseFloat(minAmount);
      if (!Number.isNaN(minAmountNum)) {
        params.push(minAmountNum);
        conditions.push(`${amountColumn} >= $${params.length}`);
      }
    }

    if (maxAmount) {
      const maxAmountNum = Number.parseFloat(maxAmount);
      if (!Number.isNaN(maxAmountNum)) {
        params.push(maxAmountNum);
        conditions.push(`${amountColumn} <= $${params.length}`);
      }
    }

    const filterWhereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rankedQuery = `
      WITH ${SEARCHABLE_ENFORCEMENT_CTE},
      filtered_results AS (
        SELECT
          id,
          regulator,
          regulator_full_name,
          country_code,
          country_name,
          firm_individual,
          firm_category,
          amount_original,
          currency,
          amount_gbp,
          amount_eur,
          date_issued,
          year_issued,
          month_issued,
          breach_type,
          breach_categories,
          summary,
          notice_url,
          source_url,
          created_at,
          CASE
            WHEN $16 <> '' AND firm_norm.normalized_name = $16 THEN 430
            WHEN $17 <> '' AND firm_legal.legal_stripped_name = $17 THEN 410
            WHEN $17 <> '' AND firm_norm.normalized_name = $17 THEN 390
            WHEN $17 <> '' AND firm_norm.normalized_name LIKE $17 || ' %' THEN 300
            WHEN ${firmBoundaryCondition('firm_norm.normalized_name', '$17')} THEN 250
            WHEN LOWER(COALESCE(firm_individual, '')) = LOWER($1) THEN 230
            WHEN ($18 = FALSE) AND COALESCE(firm_individual, '') ILIKE $2 THEN 180
            ELSE 0
          END AS firm_match_score,
          ${firmTokenBoundaryCondition('firm_norm.normalized_name', '$12')} AS firm_token_match_score,
          CASE
            WHEN $8 <> '' AND firm_norm.normalized_name = $8 THEN 180
            WHEN $8 <> '' AND firm_legal.legal_stripped_name = $8 THEN 170
            WHEN $9 <> '' AND ($18 = FALSE) AND COALESCE(firm_individual, '') ILIKE $9 THEN 120
            ELSE 0
          END AS fuzzy_firm_match_score,
          ${firmTokenBoundaryCondition('firm_norm.normalized_name', '$13')} AS fuzzy_firm_token_match_score,
          CASE
            WHEN COALESCE(array_length($5::text[], 1), 0) > 0
              AND regulator = ANY($5::text[])
              THEN 35
            ELSE 0
          END AS regulator_hint_score,
          CASE
            WHEN COALESCE(array_length($6::text[], 1), 0) > 0
              AND country_code = ANY($6::text[])
              THEN 55
            ELSE 0
          END AS country_hint_score,
          CASE
            WHEN COALESCE(array_length($7::text[], 1), 0) > 0
              AND EXISTS (
                SELECT 1
                FROM unnest($7::text[]) AS category
                WHERE COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE '%' || category || '%'
              )
              THEN 30
            ELSE 0
          END AS category_match_score,
          CASE
            WHEN $1 <> ''
              AND search_vector @@ websearch_to_tsquery('english', $1)
              THEN ts_rank_cd(search_vector, websearch_to_tsquery('english', $1))
            ELSE 0
          END AS full_text_rank,
          CASE
            WHEN $8 <> ''
              AND search_vector @@ websearch_to_tsquery('english', $8)
              THEN ts_rank_cd(search_vector, websearch_to_tsquery('english', $8))
            ELSE 0
          END AS fuzzy_full_text_rank,
          CASE
            WHEN $2 <> ''
              AND (
                COALESCE(summary, '') ILIKE $2
                OR COALESCE(breach_type, '') ILIKE $2
                OR COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE $2
                OR COALESCE(firm_individual, '') ILIKE $2
                OR COALESCE(country_name, '') ILIKE $2
                OR COALESCE(regulator, '') ILIKE $2
                OR COALESCE(regulator_full_name, '') ILIKE $2
              )
              THEN 50
            ELSE 0
          END AS phrase_match_score,
          CASE
            WHEN $9 <> ''
              AND (
                COALESCE(summary, '') ILIKE $9
                OR COALESCE(breach_type, '') ILIKE $9
                OR COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE $9
                OR COALESCE(firm_individual, '') ILIKE $9
                OR COALESCE(country_name, '') ILIKE $9
                OR COALESCE(regulator, '') ILIKE $9
                OR COALESCE(regulator_full_name, '') ILIKE $9
              )
              THEN 25
            ELSE 0
          END AS fuzzy_phrase_match_score,
          (
            SELECT COUNT(*)::int
            FROM unnest($14::text[]) AS token
            WHERE token <> ''
              AND (
                COALESCE(firm_individual, '') ILIKE '%' || token || '%'
                OR COALESCE(breach_type, '') ILIKE '%' || token || '%'
                OR COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE '%' || token || '%'
                OR COALESCE(summary, '') ILIKE '%' || token || '%'
                OR COALESCE(country_name, '') ILIKE '%' || token || '%'
                OR COALESCE(regulator, '') ILIKE '%' || token || '%'
                OR COALESCE(regulator_full_name, '') ILIKE '%' || token || '%'
              )
          ) AS raw_token_match_score,
          (
            SELECT COUNT(*)::int
            FROM unnest($3::text[]) AS pattern
            WHERE COALESCE(firm_individual, '') ILIKE pattern
              OR COALESCE(breach_type, '') ILIKE pattern
              OR COALESCE(
                CASE WHEN jsonb_typeof(breach_categories) = 'string'
                  THEN (breach_categories #>> '{}')
                  ELSE breach_categories::text
                END,
                ''
              ) ILIKE pattern
              OR COALESCE(summary, '') ILIKE pattern
              OR COALESCE(country_name, '') ILIKE pattern
              OR COALESCE(regulator, '') ILIKE pattern
              OR COALESCE(regulator_full_name, '') ILIKE pattern
          ) AS token_match_score,
          (
            SELECT COUNT(*)::int
            FROM unnest($15::text[]) AS token
            WHERE token <> ''
              AND (
                COALESCE(firm_individual, '') ILIKE '%' || token || '%'
                OR COALESCE(breach_type, '') ILIKE '%' || token || '%'
                OR COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE '%' || token || '%'
                OR COALESCE(summary, '') ILIKE '%' || token || '%'
                OR COALESCE(country_name, '') ILIKE '%' || token || '%'
                OR COALESCE(regulator, '') ILIKE '%' || token || '%'
                OR COALESCE(regulator_full_name, '') ILIKE '%' || token || '%'
              )
          ) AS fuzzy_raw_token_match_score,
          (
            SELECT COUNT(*)::int
            FROM unnest($10::text[]) AS pattern
            WHERE COALESCE(firm_individual, '') ILIKE pattern
              OR COALESCE(breach_type, '') ILIKE pattern
              OR COALESCE(
                CASE WHEN jsonb_typeof(breach_categories) = 'string'
                  THEN (breach_categories #>> '{}')
                  ELSE breach_categories::text
                END,
                ''
              ) ILIKE pattern
              OR COALESCE(summary, '') ILIKE pattern
              OR COALESCE(country_name, '') ILIKE pattern
              OR COALESCE(regulator, '') ILIKE pattern
              OR COALESCE(regulator_full_name, '') ILIKE pattern
          ) AS fuzzy_token_match_score,
          CASE
            WHEN $1 <> ''
              AND search_vector @@ websearch_to_tsquery('english', $1)
              THEN ts_headline(
                'english',
                COALESCE(summary, breach_type, firm_individual, ''),
                websearch_to_tsquery('english', $1),
                'MaxWords=45, MinWords=20, MaxFragments=1'
              )
            WHEN $8 <> ''
              AND search_vector @@ websearch_to_tsquery('english', $8)
              THEN ts_headline(
                'english',
                COALESCE(summary, breach_type, firm_individual, ''),
                websearch_to_tsquery('english', $8),
                'MaxWords=45, MinWords=20, MaxFragments=1'
              )
            ELSE NULL
          END AS highlighted_snippet
        FROM searchable_enforcement
        ${FIRM_NORMALIZATION_JOIN}
        ${filterWhereClause}
      ),
      ranked_results AS (
        SELECT
          *,
          CASE
            WHEN regulator_hint_score > 0
              AND (
                raw_token_match_score >= GREATEST($4, 1)
                OR phrase_match_score > 0
                OR token_match_score >= GREATEST($4, 1)
                OR full_text_rank > 0
              )
              THEN 25
            ELSE 0
          END AS regulator_theme_synergy_score,
          CASE
            WHEN country_hint_score > 0
              AND (
                raw_token_match_score >= GREATEST($4 - 1, 1)
                OR phrase_match_score > 0
                OR token_match_score >= GREATEST($4, 1)
                OR full_text_rank > 0
              )
              THEN 45
            ELSE 0
          END AS country_theme_synergy_score
          ,
          CASE
            WHEN category_match_score > 0
              AND (
                raw_token_match_score >= GREATEST($4, 1)
                OR phrase_match_score > 0
                OR token_match_score >= GREATEST($4, 1)
                OR full_text_rank > 0
              )
              THEN 18
            ELSE 0
          END AS category_theme_synergy_score
        FROM filtered_results
        WHERE
          firm_match_score > 0
          OR firm_token_match_score > 0
          OR fuzzy_firm_match_score > 0
          OR fuzzy_firm_token_match_score > 0
          OR raw_token_match_score >= GREATEST($4, 1)
          OR ($8 <> '' AND fuzzy_raw_token_match_score >= GREATEST($11, 1))
          OR (
            regulator_hint_score > 0
            AND (
              raw_token_match_score >= GREATEST($4 - 1, 1)
              OR token_match_score >= GREATEST($4, 1)
              OR category_match_score > 0
              OR full_text_rank > 0
              OR ($8 <> '' AND fuzzy_raw_token_match_score >= GREATEST($11 - 1, 1))
              OR ($8 <> '' AND fuzzy_token_match_score >= GREATEST($11, 1))
              OR fuzzy_full_text_rank > 0
            )
          )
          OR (
            country_hint_score > 0
            AND (
              raw_token_match_score >= GREATEST($4 - 1, 1)
              OR token_match_score >= GREATEST($4, 1)
              OR category_match_score > 0
              OR full_text_rank > 0
              OR ($8 <> '' AND fuzzy_raw_token_match_score >= GREATEST($11 - 1, 1))
              OR ($8 <> '' AND fuzzy_token_match_score >= GREATEST($11, 1))
              OR fuzzy_full_text_rank > 0
            )
          )
          OR (
            category_match_score > 0
            AND (
              raw_token_match_score >= GREATEST($4, 1)
              OR token_match_score >= GREATEST($4, 1)
              OR full_text_rank > 0
              OR ($8 <> '' AND fuzzy_raw_token_match_score >= GREATEST($11 - 1, 1))
              OR ($8 <> '' AND fuzzy_token_match_score >= GREATEST($11, 1))
              OR fuzzy_full_text_rank > 0
            )
          )
      ),
      scored_results AS (
        SELECT
          *,
          (
            firm_match_score
            + (firm_token_match_score * 45)
            + fuzzy_firm_match_score
            + (fuzzy_firm_token_match_score * 30)
            + (raw_token_match_score * 20)
            + (fuzzy_raw_token_match_score * 12)
            + regulator_hint_score
            + country_hint_score
            + category_match_score
            + regulator_theme_synergy_score
            + country_theme_synergy_score
            + category_theme_synergy_score
            + phrase_match_score
            + fuzzy_phrase_match_score
            + token_match_score
            + fuzzy_token_match_score
            + (full_text_rank * 100)
            + (fuzzy_full_text_rank * 60)
          ) AS combined_score
        FROM ranked_results
      )
      SELECT
        id,
        regulator,
        regulator_full_name,
        country_code,
        country_name,
        firm_individual,
        firm_category,
        amount_original,
        currency,
        amount_gbp,
        amount_eur,
        date_issued,
        year_issued,
        month_issued,
        breach_type,
        breach_categories,
        summary,
        notice_url,
        source_url,
        created_at,
        combined_score AS relevance_score,
        highlighted_snippet AS snippet
      FROM scored_results
      ORDER BY
        firm_match_score DESC,
        firm_token_match_score DESC,
        fuzzy_firm_match_score DESC,
        fuzzy_firm_token_match_score DESC,
        combined_score DESC,
        regulator_theme_synergy_score DESC,
        country_theme_synergy_score DESC,
        category_theme_synergy_score DESC,
        regulator_hint_score DESC,
        country_hint_score DESC,
        category_match_score DESC,
        full_text_rank DESC,
        fuzzy_full_text_rank DESC,
        phrase_match_score DESC,
        fuzzy_phrase_match_score DESC,
        token_match_score DESC,
        fuzzy_token_match_score DESC,
        date_issued DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    const results = await queryRows<SearchRow>(rankedQuery, [
      ...params,
      limitNum,
      offsetNum,
    ]);

    const countQuery = `
      WITH ${SEARCHABLE_ENFORCEMENT_CTE},
      filtered_results AS (
        SELECT
          CASE
            WHEN $16 <> '' AND firm_norm.normalized_name = $16 THEN 430
            WHEN $17 <> '' AND firm_legal.legal_stripped_name = $17 THEN 410
            WHEN $17 <> '' AND firm_norm.normalized_name = $17 THEN 390
            WHEN $17 <> '' AND firm_norm.normalized_name LIKE $17 || ' %' THEN 300
            WHEN ${firmBoundaryCondition('firm_norm.normalized_name', '$17')} THEN 250
            WHEN LOWER(COALESCE(firm_individual, '')) = LOWER($1) THEN 230
            WHEN ($18 = FALSE) AND COALESCE(firm_individual, '') ILIKE $2 THEN 180
            ELSE 0
          END AS firm_match_score,
          ${firmTokenBoundaryCondition('firm_norm.normalized_name', '$12')} AS firm_token_match_score,
          CASE
            WHEN $8 <> '' AND firm_norm.normalized_name = $8 THEN 180
            WHEN $8 <> '' AND firm_legal.legal_stripped_name = $8 THEN 170
            WHEN $9 <> '' AND ($18 = FALSE) AND COALESCE(firm_individual, '') ILIKE $9 THEN 120
            ELSE 0
          END AS fuzzy_firm_match_score,
          ${firmTokenBoundaryCondition('firm_norm.normalized_name', '$13')} AS fuzzy_firm_token_match_score,
          CASE
            WHEN COALESCE(array_length($5::text[], 1), 0) > 0
              AND regulator = ANY($5::text[])
              THEN 35
            ELSE 0
          END AS regulator_hint_score,
          CASE
            WHEN COALESCE(array_length($6::text[], 1), 0) > 0
              AND country_code = ANY($6::text[])
              THEN 55
            ELSE 0
          END AS country_hint_score,
          CASE
            WHEN COALESCE(array_length($7::text[], 1), 0) > 0
              AND EXISTS (
                SELECT 1
                FROM unnest($7::text[]) AS category
                WHERE COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE '%' || category || '%'
              )
              THEN 30
            ELSE 0
          END AS category_match_score,
          CASE
            WHEN $1 <> ''
              AND search_vector @@ websearch_to_tsquery('english', $1)
              THEN ts_rank_cd(search_vector, websearch_to_tsquery('english', $1))
            ELSE 0
          END AS full_text_rank,
          CASE
            WHEN $8 <> ''
              AND search_vector @@ websearch_to_tsquery('english', $8)
              THEN ts_rank_cd(search_vector, websearch_to_tsquery('english', $8))
            ELSE 0
          END AS fuzzy_full_text_rank,
          CASE
            WHEN $2 <> ''
              AND (
                COALESCE(summary, '') ILIKE $2
                OR COALESCE(breach_type, '') ILIKE $2
                OR COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE $2
                OR COALESCE(firm_individual, '') ILIKE $2
                OR COALESCE(country_name, '') ILIKE $2
                OR COALESCE(regulator, '') ILIKE $2
                OR COALESCE(regulator_full_name, '') ILIKE $2
              )
              THEN 50
            ELSE 0
          END AS phrase_match_score,
          CASE
            WHEN $9 <> ''
              AND (
                COALESCE(summary, '') ILIKE $9
                OR COALESCE(breach_type, '') ILIKE $9
                OR COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE $9
                OR COALESCE(firm_individual, '') ILIKE $9
                OR COALESCE(country_name, '') ILIKE $9
                OR COALESCE(regulator, '') ILIKE $9
                OR COALESCE(regulator_full_name, '') ILIKE $9
              )
              THEN 25
            ELSE 0
          END AS fuzzy_phrase_match_score,
          (
            SELECT COUNT(*)::int
            FROM unnest($14::text[]) AS token
            WHERE token <> ''
              AND (
                COALESCE(firm_individual, '') ILIKE '%' || token || '%'
                OR COALESCE(breach_type, '') ILIKE '%' || token || '%'
                OR COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE '%' || token || '%'
                OR COALESCE(summary, '') ILIKE '%' || token || '%'
                OR COALESCE(country_name, '') ILIKE '%' || token || '%'
                OR COALESCE(regulator, '') ILIKE '%' || token || '%'
                OR COALESCE(regulator_full_name, '') ILIKE '%' || token || '%'
              )
          ) AS raw_token_match_score,
          (
            SELECT COUNT(*)::int
            FROM unnest($3::text[]) AS pattern
            WHERE COALESCE(firm_individual, '') ILIKE pattern
              OR COALESCE(breach_type, '') ILIKE pattern
              OR COALESCE(
                CASE WHEN jsonb_typeof(breach_categories) = 'string'
                  THEN (breach_categories #>> '{}')
                  ELSE breach_categories::text
                END,
                ''
              ) ILIKE pattern
              OR COALESCE(summary, '') ILIKE pattern
              OR COALESCE(country_name, '') ILIKE pattern
              OR COALESCE(regulator, '') ILIKE pattern
              OR COALESCE(regulator_full_name, '') ILIKE pattern
          ) AS token_match_score,
          (
            SELECT COUNT(*)::int
            FROM unnest($15::text[]) AS token
            WHERE token <> ''
              AND (
                COALESCE(firm_individual, '') ILIKE '%' || token || '%'
                OR COALESCE(breach_type, '') ILIKE '%' || token || '%'
                OR COALESCE(
                  CASE WHEN jsonb_typeof(breach_categories) = 'string'
                    THEN (breach_categories #>> '{}')
                    ELSE breach_categories::text
                  END,
                  ''
                ) ILIKE '%' || token || '%'
                OR COALESCE(summary, '') ILIKE '%' || token || '%'
                OR COALESCE(country_name, '') ILIKE '%' || token || '%'
                OR COALESCE(regulator, '') ILIKE '%' || token || '%'
                OR COALESCE(regulator_full_name, '') ILIKE '%' || token || '%'
              )
          ) AS fuzzy_raw_token_match_score,
          (
            SELECT COUNT(*)::int
            FROM unnest($10::text[]) AS pattern
            WHERE COALESCE(firm_individual, '') ILIKE pattern
              OR COALESCE(breach_type, '') ILIKE pattern
              OR COALESCE(
                CASE WHEN jsonb_typeof(breach_categories) = 'string'
                  THEN (breach_categories #>> '{}')
                  ELSE breach_categories::text
                END,
                ''
              ) ILIKE pattern
              OR COALESCE(summary, '') ILIKE pattern
              OR COALESCE(country_name, '') ILIKE pattern
              OR COALESCE(regulator, '') ILIKE pattern
              OR COALESCE(regulator_full_name, '') ILIKE pattern
          ) AS fuzzy_token_match_score
        FROM searchable_enforcement
        ${FIRM_NORMALIZATION_JOIN}
        ${filterWhereClause}
      )
      SELECT COUNT(*)::int AS count
      FROM filtered_results
      WHERE
        firm_match_score > 0
        OR firm_token_match_score > 0
        OR fuzzy_firm_match_score > 0
        OR fuzzy_firm_token_match_score > 0
        OR raw_token_match_score >= GREATEST($4, 1)
        OR ($8 <> '' AND fuzzy_raw_token_match_score >= GREATEST($11, 1))
        OR (
          regulator_hint_score > 0
          AND (
            raw_token_match_score >= GREATEST($4 - 1, 1)
            OR token_match_score >= GREATEST($4, 1)
            OR category_match_score > 0
            OR full_text_rank > 0
            OR ($8 <> '' AND fuzzy_raw_token_match_score >= GREATEST($11 - 1, 1))
            OR ($8 <> '' AND fuzzy_token_match_score >= GREATEST($11, 1))
            OR fuzzy_full_text_rank > 0
          )
        )
        OR (
          country_hint_score > 0
          AND (
            raw_token_match_score >= GREATEST($4 - 1, 1)
            OR token_match_score >= GREATEST($4, 1)
            OR category_match_score > 0
            OR full_text_rank > 0
            OR ($8 <> '' AND fuzzy_raw_token_match_score >= GREATEST($11 - 1, 1))
            OR ($8 <> '' AND fuzzy_token_match_score >= GREATEST($11, 1))
            OR fuzzy_full_text_rank > 0
          )
        )
        OR (
          category_match_score > 0
          AND (
            raw_token_match_score >= GREATEST($4, 1)
            OR token_match_score >= GREATEST($4, 1)
            OR full_text_rank > 0
            OR ($8 <> '' AND fuzzy_raw_token_match_score >= GREATEST($11 - 1, 1))
            OR ($8 <> '' AND fuzzy_token_match_score >= GREATEST($11, 1))
            OR fuzzy_full_text_rank > 0
          )
        )
    `;

    const countResult = await queryRows<{ count: number }>(countQuery, params);
    const totalCount = countResult[0]?.count ?? 0;

    const payload = {
      query: q,
      results: results.map((row) => ({
        id: row.id,
        regulator: row.regulator,
        regulatorFullName: row.regulator_full_name,
        countryCode: row.country_code,
        countryName: row.country_name,
        firm: row.firm_individual,
        firmCategory: row.firm_category,
        amountOriginal: toFiniteNumber(row.amount_original),
        currency: row.currency,
        amountGbp: toFiniteNumber(row.amount_gbp),
        amountEur: toFiniteNumber(row.amount_eur),
        dateIssued: row.date_issued,
        year: row.year_issued,
        month: row.month_issued,
        breachType: row.breach_type,
        breachCategories: row.breach_categories,
        summary: row.summary,
        snippet:
          stripSnippetHtml(row.snippet) ||
          buildFallbackSnippet(row.summary, row.breach_type),
        noticeUrl: row.notice_url,
        sourceUrl: row.source_url,
        relevance: Math.min(
          1,
          toFiniteNumber(row.relevance_score) / 300,
        ).toFixed(4),
        createdAt: row.created_at,
      })),
      pagination: {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < totalCount,
        pages: Math.ceil(totalCount / limitNum),
        currentPage: Math.floor(offsetNum / limitNum) + 1,
      },
      filters: {
        query: q,
        regulator: regulator || null,
        country: normalizedCountryCode || null,
        year: year ? Number.parseInt(year, 10) : null,
        minAmount: minAmount ? Number.parseFloat(minAmount) : null,
        maxAmount: maxAmount ? Number.parseFloat(maxAmount) : null,
        currency,
        minRelevance: 0,
      },
      searchTerms: prepared.searchTerms,
      metadata: {
        searchMethod: 'hybrid',
        indexType: 'full-text + ilike fallback',
        language: 'english',
        queryMode,
        firmCandidate: {
          strong: firmCandidateSignal.strong,
          candidateCount: firmCandidateSignal.candidateCount,
          bestTier: firmCandidateSignal.bestTier,
        },
        correction: fuzzyResolution.changed
          ? {
              correctedQuery: fuzzyResolution.correctedQuery,
              corrections: fuzzyResolution.corrections,
            }
          : null,
        indexSignals: {
          conceptEnrichment: true,
          breachCategoryFallback: true,
          lowSignalGuard: true,
          fuzzyTermCorrection: fuzzyResolution.changed,
          fuzzySuppressedByFirmCandidate,
        },
        weights: {
          firm: 'exact / normalized / whole-word firm matches',
          fullText: 'search_vector full-text ranking',
          fallback: 'phrase and token fallback matching',
          fuzzy: 'typo-tolerant token correction with lower ranking weight',
        },
      },
    };

    await recordSearchAnalytics(
      buildSearchAnalyticsRecord({
        query: q,
        prepared,
        fuzzyResolution,
        filters: analyticsFilters,
        results: payload.results.map((result) => ({
          firm: result.firm,
          regulator: result.regulator,
        })),
        totalCount,
        latencyMs: Date.now() - startedAt,
        lowSignal: false,
        queryMode,
        strongFirmCandidate: firmCandidateSignal.strong,
        fuzzySuppressedByFirmCandidate,
      }),
    );

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Enforcement search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      hint: 'Try broadening the search terms or removing filters.',
    });
  }
}
