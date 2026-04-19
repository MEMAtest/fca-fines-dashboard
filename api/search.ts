/**
 * Enforcement Search API
 *
 * Hybrid ranked search across all enforcement actions using:
 * - exact / near-exact firm matching
 * - PostgreSQL full-text search
 * - phrase and token fallback matching for broader enforcement themes
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';
import { PUBLIC_REGULATOR_CODES } from '../src/data/regulatorCoverage.js';
import {
  buildFallbackSnippet,
  normalizeCountryCode,
  prepareEnforcementSearch,
  resolveFuzzySearchTerms,
  stripSnippetHtml,
} from '../server/services/enforcementSearch.js';

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false,
});

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

function toFiniteNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchFuzzyCandidatePhrases({
  regulator,
  countryCode,
  year,
}: {
  regulator: string | undefined;
  countryCode: string | null;
  year: string | undefined;
}) {
  const conditions: string[] = [`firm_individual IS NOT NULL`, `firm_individual <> ''`];
  const params: Array<string | number | readonly string[]> = [];

  if (regulator) {
    params.push(regulator);
    conditions.push(`regulator = $${params.length}`);
  } else {
    params.push(PUBLIC_REGULATOR_CODES);
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

  const rows = await sql.unsafe<
    Array<{
      firm_individual: string | null;
      regulator: string | null;
      regulator_full_name: string | null;
      country_name: string | null;
      breach_type: string | null;
    }>
  >(
    `
      SELECT DISTINCT ON (firm_individual)
        firm_individual,
        regulator,
        regulator_full_name,
        country_name,
        breach_type
      FROM all_regulatory_fines
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
      row.breach_type,
    ].filter((value): value is string => Boolean(value && value.trim())),
  );
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

    if (!prepared.hasSearchIntent) {
      return res.status(200).json(
        buildEmptySearchResponse({
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
        }),
      );
    }

    const shouldAttemptFuzzyCorrection = prepared.meaningfulTerms.some(
      (term) => term.length >= 4,
    );
    const fuzzyCandidatePhrases = shouldAttemptFuzzyCorrection
      ? await fetchFuzzyCandidatePhrases({
          regulator,
          countryCode: normalizedCountryCode,
          year,
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
    const params: Array<string | number | readonly string[] | null> = [
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
    ];

    if (regulator) {
      params.push(regulator);
      conditions.push(`regulator = $${params.length}`);
    } else {
      params.push(PUBLIC_REGULATOR_CODES);
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
      WITH filtered_results AS (
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
            WHEN LOWER(COALESCE(firm_individual, '')) = LOWER($1) THEN 300
            WHEN COALESCE(firm_individual, '') ILIKE $2 THEN 200
            ELSE 0
          END AS firm_match_score,
          CASE
            WHEN $8 <> '' AND LOWER(COALESCE(firm_individual, '')) = LOWER($8) THEN 180
            WHEN $9 <> '' AND COALESCE(firm_individual, '') ILIKE $9 THEN 120
            ELSE 0
          END AS fuzzy_firm_match_score,
          CASE
            WHEN COALESCE(array_length($5::text[], 1), 0) > 0
              AND regulator = ANY($5::text[])
              THEN 35
            ELSE 0
          END AS regulator_hint_score,
          CASE
            WHEN COALESCE(array_length($6::text[], 1), 0) > 0
              AND country_code = ANY($6::text[])
              THEN 20
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
        FROM all_regulatory_fines
        ${filterWhereClause}
      ),
      ranked_results AS (
        SELECT
          *,
          CASE
            WHEN regulator_hint_score > 0
              AND (
                phrase_match_score > 0
                OR token_match_score >= GREATEST($4, 1)
                OR full_text_rank > 0
              )
              THEN 25
            ELSE 0
          END AS regulator_theme_synergy_score,
          CASE
            WHEN country_hint_score > 0
              AND (
                phrase_match_score > 0
                OR token_match_score >= GREATEST($4, 1)
                OR full_text_rank > 0
              )
              THEN 15
            ELSE 0
          END AS country_theme_synergy_score
          ,
          CASE
            WHEN category_match_score > 0
              AND (
                phrase_match_score > 0
                OR token_match_score >= GREATEST($4, 1)
                OR full_text_rank > 0
              )
              THEN 18
            ELSE 0
          END AS category_theme_synergy_score
        FROM filtered_results
        WHERE
          firm_match_score > 0
          OR fuzzy_firm_match_score > 0
          OR regulator_hint_score > 0
          OR country_hint_score > 0
          OR category_match_score > 0
          OR full_text_rank > 0
          OR fuzzy_full_text_rank > 0
          OR phrase_match_score > 0
          OR fuzzy_phrase_match_score > 0
          OR token_match_score >= $4
          OR fuzzy_token_match_score >= $11
      ),
      scored_results AS (
        SELECT
          *,
          (
            firm_match_score
            + fuzzy_firm_match_score
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
        fuzzy_firm_match_score DESC,
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

    const results = await sql.unsafe<SearchRow[]>(rankedQuery, [
      ...params,
      limitNum,
      offsetNum,
    ]);

    const countQuery = `
      WITH filtered_results AS (
        SELECT
          CASE
            WHEN LOWER(COALESCE(firm_individual, '')) = LOWER($1) THEN 300
            WHEN COALESCE(firm_individual, '') ILIKE $2 THEN 200
            ELSE 0
          END AS firm_match_score,
          CASE
            WHEN $8 <> '' AND LOWER(COALESCE(firm_individual, '')) = LOWER($8) THEN 180
            WHEN $9 <> '' AND COALESCE(firm_individual, '') ILIKE $9 THEN 120
            ELSE 0
          END AS fuzzy_firm_match_score,
          CASE
            WHEN COALESCE(array_length($5::text[], 1), 0) > 0
              AND regulator = ANY($5::text[])
              THEN 35
            ELSE 0
          END AS regulator_hint_score,
          CASE
            WHEN COALESCE(array_length($6::text[], 1), 0) > 0
              AND country_code = ANY($6::text[])
              THEN 20
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
        FROM all_regulatory_fines
        ${filterWhereClause}
      )
      SELECT COUNT(*)::int AS count
      FROM filtered_results
      WHERE
        firm_match_score > 0
        OR fuzzy_firm_match_score > 0
        OR regulator_hint_score > 0
        OR country_hint_score > 0
        OR category_match_score > 0
        OR full_text_rank > 0
        OR fuzzy_full_text_rank > 0
        OR phrase_match_score > 0
        OR fuzzy_phrase_match_score > 0
        OR token_match_score >= $4
        OR fuzzy_token_match_score >= $11
    `;

    const countResult = await sql.unsafe<{ count: number }[]>(countQuery, params);
    const totalCount = countResult[0]?.count ?? 0;

    return res.status(200).json({
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
        },
        weights: {
          firm: 'exact / phrase firm matches',
          fullText: 'search_vector full-text ranking',
          fallback: 'phrase and token fallback matching',
          fuzzy: 'typo-tolerant token correction with lower ranking weight',
        },
      },
    });
  } catch (error) {
    console.error('Enforcement search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      hint: 'Try broadening the search terms or removing filters.',
    });
  }
}
