/**
 * Unified Statistics API - Aggregate stats across ALL regulators
 *
 * Returns:
 * - UK (FCA) totals
 * - EU totals (all EU regulators combined)
 * - Per-regulator breakdown
 * - Top fines
 * - Breach category distribution
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

// Public regulators only (ESMA excluded until real parsers exist)
// AFM and DNB added in Phase 5 with test data
const PUBLIC_REGULATORS = ['FCA', 'BaFin', 'AMF', 'CNMV', 'CBI', 'SFC', 'AFM', 'DNB'];
const PUBLIC_EU_REGULATORS = ['BaFin', 'AMF', 'CNMV', 'CBI', 'SFC', 'AFM', 'DNB'];

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
    const { year, currency = 'GBP' } = req.query as Record<string, string>;
    const amountColumn = currency === 'EUR' ? 'amount_eur' : 'amount_gbp';
    const yearFilter = year ? `WHERE year_issued = ${parseInt(year)}` : '';

    // UK (FCA) stats
    const ukStats = await sql.unsafe(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total,
        COALESCE(AVG(${amountColumn}), 0)::numeric(18,2) as average,
        COALESCE(MAX(${amountColumn}), 0)::numeric(18,2) as max_fine,
        MIN(date_issued) as earliest_date,
        MAX(date_issued) as latest_date
      FROM all_regulatory_fines
      WHERE regulator = 'FCA' ${year ? `AND year_issued = ${parseInt(year)}` : ''}
    `);

    // EU stats (public EU regulators only - excludes AFM, DNB, ESMA)
    const euStats = await sql.unsafe(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total,
        COALESCE(AVG(${amountColumn}), 0)::numeric(18,2) as average,
        COALESCE(MAX(${amountColumn}), 0)::numeric(18,2) as max_fine,
        MIN(date_issued) as earliest_date,
        MAX(date_issued) as latest_date
      FROM all_regulatory_fines
      WHERE regulator IN (${PUBLIC_EU_REGULATORS.map(r => `'${r}'`).join(', ')}) ${year ? `AND year_issued = ${parseInt(year)}` : ''}
    `);

    // Per-regulator breakdown (public regulators only)
    const byRegulator = await sql.unsafe(`
      SELECT
        regulator,
        regulator_full_name,
        country_code,
        country_name,
        COUNT(*) as count,
        COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total,
        COALESCE(AVG(${amountColumn}), 0)::numeric(18,2) as average,
        COALESCE(MAX(${amountColumn}), 0)::numeric(18,2) as max_fine
      FROM all_regulatory_fines
      WHERE regulator IN (${PUBLIC_REGULATORS.map(r => `'${r}'`).join(', ')})
      ${year ? `AND year_issued = ${parseInt(year)}` : ''}
      GROUP BY regulator, regulator_full_name, country_code, country_name
      ORDER BY total DESC
    `);

    // Top 10 fines (public regulators only)
    const topFines = await sql.unsafe(`
      SELECT
        id,
        regulator,
        country_code,
        firm_individual,
        ${amountColumn} as amount,
        date_issued,
        breach_type,
        summary,
        notice_url
      FROM all_regulatory_fines
      WHERE regulator IN (${PUBLIC_REGULATORS.map(r => `'${r}'`).join(', ')})
      ${year ? `AND year_issued = ${parseInt(year)}` : ''}
      ORDER BY ${amountColumn} DESC NULLS LAST
      LIMIT 10
    `);

    // Breach category distribution (public regulators only)
    const breachDistribution = await sql.unsafe(`
      SELECT
        breach_type,
        COUNT(*) as count,
        COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total
      FROM all_regulatory_fines
      WHERE regulator IN (${PUBLIC_REGULATORS.map(r => `'${r}'`).join(', ')})
      ${year ? `AND year_issued = ${parseInt(year)}` : ''}
      GROUP BY breach_type
      ORDER BY count DESC
      LIMIT 20
    `);

    // Cross-border analysis (firms fined by multiple public regulators)
    const crossBorderFirms = await sql.unsafe(`
      SELECT
        firm_individual,
        ARRAY_AGG(DISTINCT regulator) as regulators,
        COUNT(DISTINCT regulator) as regulator_count,
        COUNT(*) as total_fines,
        COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total_amount
      FROM all_regulatory_fines
      WHERE regulator IN (${PUBLIC_REGULATORS.map(r => `'${r}'`).join(', ')})
      ${year ? `AND year_issued = ${parseInt(year)}` : ''}
      GROUP BY firm_individual
      HAVING COUNT(DISTINCT regulator) > 1
      ORDER BY total_amount DESC
      LIMIT 10
    `);

    // Time series (monthly trends - public regulators only)
    const monthlyTrends = await sql.unsafe(`
      SELECT
        year_issued,
        month_issued,
        regulator,
        COUNT(*) as count,
        COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total
      FROM all_regulatory_fines
      WHERE regulator IN (${PUBLIC_REGULATORS.map(r => `'${r}'`).join(', ')})
      ${year ? `AND year_issued = ${parseInt(year)}` : ''}
      GROUP BY year_issued, month_issued, regulator
      ORDER BY year_issued DESC, month_issued DESC, regulator
      LIMIT 100
    `);

    // Calculate EU/UK ratio
    const ukTotal = parseFloat(ukStats[0]?.total || 0);
    const euTotal = parseFloat(euStats[0]?.total || 0);
    const strictnessRatio = euTotal > 0 ? (ukTotal / euTotal) : 0;

    return res.status(200).json({
      summary: {
        uk: {
          count: parseInt(ukStats[0]?.count || 0),
          total: parseFloat(ukStats[0]?.total || 0),
          average: parseFloat(ukStats[0]?.average || 0),
          maxFine: parseFloat(ukStats[0]?.max_fine || 0),
          earliestDate: ukStats[0]?.earliest_date,
          latestDate: ukStats[0]?.latest_date
        },
        eu: {
          count: parseInt(euStats[0]?.count || 0),
          total: parseFloat(euStats[0]?.total || 0),
          average: parseFloat(euStats[0]?.average || 0),
          maxFine: parseFloat(euStats[0]?.max_fine || 0),
          earliestDate: euStats[0]?.earliest_date,
          latestDate: euStats[0]?.latest_date
        },
        strictnessRatio: strictnessRatio.toFixed(2),
        currency
      },
      byRegulator: byRegulator.map(r => ({
        regulator: r.regulator,
        regulatorFullName: r.regulator_full_name,
        countryCode: r.country_code,
        countryName: r.country_name,
        count: parseInt(r.count),
        total: parseFloat(r.total),
        average: parseFloat(r.average),
        maxFine: parseFloat(r.max_fine)
      })),
      topFines: topFines.map(f => ({
        id: f.id,
        regulator: f.regulator,
        countryCode: f.country_code,
        firm: f.firm_individual,
        amount: parseFloat(f.amount || 0),
        date: f.date_issued,
        breachType: f.breach_type,
        summary: f.summary,
        url: f.notice_url
      })),
      breachDistribution: breachDistribution.map(b => ({
        breachType: b.breach_type,
        count: parseInt(b.count),
        total: parseFloat(b.total)
      })),
      crossBorderFirms: crossBorderFirms.map(f => ({
        firm: f.firm_individual,
        regulators: f.regulators,
        regulatorCount: parseInt(f.regulator_count),
        totalFines: parseInt(f.total_fines),
        totalAmount: parseFloat(f.total_amount)
      })),
      monthlyTrends: monthlyTrends.map(t => ({
        year: parseInt(t.year_issued),
        month: parseInt(t.month_issued),
        regulator: t.regulator,
        count: parseInt(t.count),
        total: parseFloat(t.total)
      })),
      filters: {
        year: year ? parseInt(year) : null,
        currency
      }
    });

  } catch (error) {
    console.error('Unified stats error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
