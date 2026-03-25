/**
 * Natural Language Search API - Phase 6A
 *
 * Enables semantic search across all enforcement actions using PostgreSQL full-text search.
 * Uses weighted tsvector indexes with GIN for fast queries.
 *
 * Example queries:
 * - "AML transaction monitoring failures"
 * - "market manipulation insider trading"
 * - "Goldman Sachs enforcement actions"
 * - "German banks fined for compliance"
 *
 * Weighting:
 * - A (highest): firm_individual
 * - B: breach_type
 * - C: summary
 * - D: firm_category, regulator_full_name
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';
import { PUBLIC_REGULATOR_CODES } from '../src/data/regulatorCoverage.js';

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
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
      q,                    // Natural language search query (REQUIRED)
      regulator,           // Filter by specific regulator code
      country,             // Filter by country code
      year,                // Filter by year
      minAmount,           // Minimum fine amount
      maxAmount,           // Maximum fine amount
      currency = 'GBP',    // Display currency
      limit = '20',        // Results per page
      offset = '0',        // Pagination offset
      minRelevance = '0.01' // Minimum relevance score (0-1)
    } = req.query as Record<string, string>;

    // Validate required query parameter
    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Query parameter "q" is required for natural language search',
        example: '/api/search?q=AML+transaction+monitoring+failures'
      });
    }

    // Validate inputs
    const limitNum = Math.min(parseInt(limit) || 20, 100); // Max 100 results
    const offsetNum = parseInt(offset) || 0;
    const minRelevanceNum = parseFloat(minRelevance) || 0.01;
    const amountColumn = currency === 'EUR' ? 'amount_eur' : 'amount_gbp';

    // Build WHERE conditions (using sql.unsafe for simpler query building)
    const conditions = [`search_vector @@ plainto_tsquery('english', '${q.trim().replace(/'/g, "''")}')`];

    // Filter by public regulators only (unless specific regulator requested)
    if (regulator) {
      conditions.push(`regulator = '${regulator.replace(/'/g, "''")}'`);
    } else {
      const regulatorList = PUBLIC_REGULATOR_CODES.map(r => `'${r}'`).join(', ');
      conditions.push(`regulator IN (${regulatorList})`);
    }

    if (country) {
      conditions.push(`country_code = '${country.replace(/'/g, "''")}'`);
    }

    if (year) {
      const yearNum = parseInt(year);
      if (!isNaN(yearNum)) {
        conditions.push(`year_issued = ${yearNum}`);
      }
    }

    if (minAmount) {
      const minAmountNum = parseFloat(minAmount);
      if (!isNaN(minAmountNum)) {
        conditions.push(`${amountColumn} >= ${minAmountNum}`);
      }
    }

    if (maxAmount) {
      const maxAmountNum = parseFloat(maxAmount);
      if (!isNaN(maxAmountNum)) {
        conditions.push(`${amountColumn} <= ${maxAmountNum}`);
      }
    }

    // Add minimum relevance filter
    conditions.push(`ts_rank_cd(search_vector, plainto_tsquery('english', '${q.trim().replace(/'/g, "''")}')) > ${minRelevanceNum}`);

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Query with relevance ranking
    // ts_rank_cd gives us a relevance score based on how well the document matches
    const query = `
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
        ts_rank_cd(search_vector, plainto_tsquery('english', '${q.trim().replace(/'/g, "''")}')) AS relevance,
        ts_headline('english', COALESCE(summary, ''), plainto_tsquery('english', '${q.trim().replace(/'/g, "''")}'),
                   'MaxWords=50, MinWords=30, MaxFragments=1') AS snippet
      FROM all_regulatory_fines
      ${whereClause}
      ORDER BY relevance DESC, date_issued DESC
      LIMIT ${limitNum}
      OFFSET ${offsetNum}
    `;

    const results = await sql.unsafe(query);

    // Query for total count (without limit/offset)
    const countQuery = `
      SELECT COUNT(*) as count
      FROM all_regulatory_fines
      ${whereClause}
    `;

    const countResult = await sql.unsafe(countQuery);
    const totalCount = parseInt(countResult[0]?.count || 0);

    // Extract search terms for highlighting
    const searchTerms = q.trim().toLowerCase().split(/\s+/).filter(term => term.length > 2);

    // Return response with relevance scores
    return res.status(200).json({
      query: q,
      results: results.map(r => ({
        id: r.id,
        regulator: r.regulator,
        regulatorFullName: r.regulator_full_name,
        countryCode: r.country_code,
        countryName: r.country_name,
        firm: r.firm_individual,
        firmCategory: r.firm_category,
        amountOriginal: parseFloat(r.amount_original || 0),
        currency: r.currency,
        amountGbp: parseFloat(r.amount_gbp || 0),
        amountEur: parseFloat(r.amount_eur || 0),
        dateIssued: r.date_issued,
        year: r.year_issued,
        month: r.month_issued,
        breachType: r.breach_type,
        breachCategories: r.breach_categories,
        summary: r.summary,
        snippet: r.snippet, // Highlighted excerpt
        noticeUrl: r.notice_url,
        sourceUrl: r.source_url,
        relevance: parseFloat(r.relevance).toFixed(4), // 0-1 score
        createdAt: r.created_at
      })),
      pagination: {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (offsetNum + limitNum) < totalCount,
        pages: Math.ceil(totalCount / limitNum),
        currentPage: Math.floor(offsetNum / limitNum) + 1
      },
      filters: {
        query: q,
        regulator: regulator || null,
        country: country || null,
        year: year ? parseInt(year) : null,
        minAmount: minAmount ? parseFloat(minAmount) : null,
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        currency,
        minRelevance: minRelevanceNum
      },
      searchTerms,
      metadata: {
        searchMethod: 'full-text',
        indexType: 'GIN tsvector',
        language: 'english',
        weights: {
          A: 'firm_individual (highest)',
          B: 'breach_type',
          C: 'summary',
          D: 'firm_category, regulator_full_name'
        }
      }
    });

  } catch (error) {
    console.error('Natural language search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      hint: 'Try simplifying your search query or check the database connection'
    });
  }
}
