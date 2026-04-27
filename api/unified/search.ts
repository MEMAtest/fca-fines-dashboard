/**
 * Unified Search API - Search across ALL regulators (FCA + EU)
 *
 * Queries the all_regulatory_fines materialized view
 * Supports filtering by regulator, country, year, amount, breach, firm name
 * Returns normalized data with both EUR and GBP amounts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';
import { resolveConnectionString } from '../../server/db.js';
import { PUBLIC_REGULATOR_CODES } from '../../src/data/regulatorCoverage.js';

const databaseUrl = resolveConnectionString() || '';
const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes('sslmode=')
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
    // Parse query parameters
    const {
      regulator,          // 'FCA', 'BaFin', 'AMF', etc.
      country,            // 'UK', 'DE', 'FR', etc.
      year,               // 2024, 2025, etc.
      minAmount,          // Minimum fine amount
      maxAmount,          // Maximum fine amount
      breachCategory,     // 'AML', 'MARKET_ABUSE', etc.
      currency = 'GBP',   // 'GBP' or 'EUR' for display
      firmName,           // Fuzzy search on firm name
      sortBy = 'date_issued', // Sort column
      order = 'desc',     // 'asc' or 'desc'
      limit = '100',      // Results per page
      offset = '0'        // Pagination offset
    } = req.query as Record<string, string>;

    // Validate inputs
    const validSortColumns = ['date_issued', 'amount_gbp', 'amount_eur', 'firm_individual', 'regulator', 'country_code'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'date_issued';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const limitNum = Math.min(parseInt(limit) || 100, 500); // Max 500 results
    const offsetNum = parseInt(offset) || 0;

    // Choose amount column based on currency preference
    const amountColumn = currency === 'EUR' ? 'amount_eur' : 'amount_gbp';

    // Build WHERE conditions
    const conditions = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (regulator) {
      conditions.push(`regulator = $${paramIndex++}`);
      params.push(regulator);
    } else {
      // Default: only show live/public regulators from the shared registry
      conditions.push(`regulator = ANY($${paramIndex++})`);
      params.push(PUBLIC_REGULATOR_CODES);
    }

    if (country) {
      conditions.push(`country_code = $${paramIndex++}`);
      params.push(country);
    }

    if (year) {
      conditions.push(`year_issued = $${paramIndex++}`);
      params.push(parseInt(year));
    }

    if (minAmount) {
      conditions.push(`${amountColumn} >= $${paramIndex++}`);
      params.push(parseFloat(minAmount));
    }

    if (maxAmount) {
      conditions.push(`${amountColumn} <= $${paramIndex++}`);
      params.push(parseFloat(maxAmount));
    }

    if (breachCategory) {
      // Handle double-encoded JSONB (312/316 rows store JSON string instead of array)
      conditions.push(`
        COALESCE(
          CASE WHEN jsonb_typeof(breach_categories) = 'string'
            THEN (breach_categories #>> '{}')::jsonb
            ELSE breach_categories
          END,
          '[]'::jsonb
        ) @> $${paramIndex++}::jsonb
      `);
      params.push(JSON.stringify([breachCategory]));
    }

    if (firmName) {
      conditions.push(`firm_individual ILIKE $${paramIndex++}`);
      params.push(`%${firmName}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query for results
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
        created_at
      FROM public.all_regulatory_fines
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `;

    params.push(limitNum, offsetNum);

    const results = await sql.unsafe(query, params);

    // Query for total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM public.all_regulatory_fines
      ${whereClause}
    `;

    const countResult = await sql.unsafe(countQuery, params.slice(0, -2)); // Remove limit/offset
    const totalCount = parseInt(countResult[0]?.count || 0);

    // Return response
    return res.status(200).json({
      results,
      pagination: {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (offsetNum + limitNum) < totalCount,
        pages: Math.ceil(totalCount / limitNum),
        currentPage: Math.floor(offsetNum / limitNum) + 1
      },
      filters: {
        regulator: regulator || null,
        country: country || null,
        year: year ? parseInt(year) : null,
        minAmount: minAmount ? parseFloat(minAmount) : null,
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        breachCategory: breachCategory || null,
        currency,
        firmName: firmName || null
      }
    });

  } catch (error) {
    console.error('Unified search error:', {
      error: error instanceof Error ? error.message : error
    });
    return res.status(500).json({
      error: 'Search failed'
      // Schema details removed for security
    });
  }
}
