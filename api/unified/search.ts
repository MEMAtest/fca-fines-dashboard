/**
 * Unified Search API - Search across ALL regulators (FCA + EU)
 *
 * Queries the canonical enforcement evidence materialized view
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
      month,              // 1-12, used by monthly chart drill-downs
      minAmount,          // Minimum fine amount
      maxAmount,          // Maximum fine amount
      breachCategory,     // 'AML', 'MARKET_ABUSE', etc.
      sector,             // Normalized firm category
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
    const limitNum = Math.min(parseInt(limit) || 100, 5000); // Command Centre can request the public working set
    const offsetNum = parseInt(offset) || 0;

    // Choose amount column based on currency preference
    const amountColumn = currency === 'EUR' ? 'amount_eur' : 'amount_gbp';

    // Treat the normalised category array and the legacy breach type as one
    // public theme field. The overview endpoint uses the same expression, so a
    // theme tile always opens the records that produced its aggregate.
    const categoryExpression = `COALESCE(
      CASE WHEN jsonb_typeof(breach_categories) = 'string'
        THEN (breach_categories #>> '{}')::jsonb
        ELSE breach_categories
      END,
      jsonb_build_array(COALESCE(breach_type, 'Other / not classified'))
    )`;

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

    if (month && Number(month) >= 1 && Number(month) <= 12) {
      conditions.push(`month_issued = $${paramIndex++}`);
      params.push(parseInt(month));
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
      // Handle double-encoded JSONB and records that only carry breach_type.
      conditions.push(`${categoryExpression} @> $${paramIndex++}::jsonb`);
      params.push([breachCategory]);
    }

    if (sector) {
      conditions.push(`COALESCE(firm_category, 'Sector not recorded') = $${paramIndex++}`);
      params.push(sector);
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
        created_at,
        canonical_case_id,
        duplicate_count,
        amount_quality,
        requires_amount_review,
        amount_verification_url,
        amount_override_reason
      FROM public.all_regulatory_fines_canonical
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}, canonical_case_id ASC, id ASC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}
    `;

    params.push(limitNum, offsetNum);

    const results = await sql.unsafe(query, params);

    // Query for total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM public.all_regulatory_fines_canonical
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
        month: month ? parseInt(month) : null,
        minAmount: minAmount ? parseFloat(minAmount) : null,
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        breachCategory: breachCategory || null,
        sector: sector || null,
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
