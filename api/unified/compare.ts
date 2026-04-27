/**
 * Regulator Comparison API - Side-by-side comparison of 2+ regulators
 *
 * Compares enforcement approaches, fine volumes, breach types, shared firms
 * Example: /api/unified/compare?regulators=FCA,BaFin&year=2024
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';
import { resolveConnectionString } from '../../server/db.js';

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
    const { regulators, year, currency = 'GBP' } = req.query as Record<string, string>;

    if (!regulators) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Please provide regulators parameter (e.g., regulators=FCA,BaFin)'
      });
    }

    // Parse regulators (comma-separated)
    const regulatorList = regulators.split(',').map(r => r.trim()).filter(r => r);

    if (regulatorList.length < 2) {
      return res.status(400).json({
        error: 'Invalid regulators parameter',
        message: 'Please provide at least 2 regulators to compare'
      });
    }

    if (regulatorList.length > 5) {
      return res.status(400).json({
        error: 'Too many regulators',
        message: 'Maximum 5 regulators allowed for comparison'
      });
    }

    const amountColumn = currency === 'EUR' ? 'amount_eur' : 'amount_gbp';
    const yearFilter = year ? `AND year_issued = ${parseInt(year)}` : '';

    // Get stats for each regulator
    const comparison: Record<string, any> = {};

    for (const regulator of regulatorList) {
      const stats = await sql.unsafe(`
        SELECT
          regulator,
          regulator_full_name,
          country_code,
          country_name,
          COUNT(*) as count,
          COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total,
          COALESCE(AVG(${amountColumn}), 0)::numeric(18,2) as average,
          COALESCE(MAX(${amountColumn}), 0)::numeric(18,2) as max_fine,
          COALESCE(MIN(${amountColumn}), 0)::numeric(18,2) as min_fine,
          MIN(date_issued) as earliest,
          MAX(date_issued) as latest
        FROM public.all_regulatory_fines
        WHERE regulator = $1 ${yearFilter}
        GROUP BY regulator, regulator_full_name, country_code, country_name
      `, [regulator]);

      if (stats.length === 0) {
        comparison[regulator] = {
          regulator,
          error: 'No data found for this regulator',
          count: 0,
          total: 0
        };
        continue;
      }

      // Top breach categories for this regulator
      const topBreaches = await sql.unsafe(`
        SELECT
          breach_type,
          COUNT(*) as count,
          COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total
        FROM public.all_regulatory_fines
        WHERE regulator = $1 ${yearFilter}
        GROUP BY breach_type
        ORDER BY count DESC
        LIMIT 5
      `, [regulator]);

      // Top 3 fines for this regulator
      const topFines = await sql.unsafe(`
        SELECT
          firm_individual,
          ${amountColumn} as amount,
          date_issued,
          breach_type,
          summary
        FROM public.all_regulatory_fines
        WHERE regulator = $1 ${yearFilter}
        ORDER BY ${amountColumn} DESC NULLS LAST
        LIMIT 3
      `, [regulator]);

      const s = stats[0];
      comparison[regulator] = {
        regulator: s.regulator,
        regulatorFullName: s.regulator_full_name,
        countryCode: s.country_code,
        countryName: s.country_name,
        count: parseInt(s.count),
        total: parseFloat(s.total),
        average: parseFloat(s.average),
        maxFine: parseFloat(s.max_fine),
        minFine: parseFloat(s.min_fine),
        earliestDate: s.earliest,
        latestDate: s.latest,
        topBreaches: topBreaches.map(b => ({
          breachType: b.breach_type,
          count: parseInt(b.count),
          total: parseFloat(b.total)
        })),
        topFines: topFines.map(f => ({
          firm: f.firm_individual,
          amount: parseFloat(f.amount || 0),
          date: f.date_issued,
          breachType: f.breach_type,
          summary: f.summary
        }))
      };
    }

    // Cross-regulator insights
    const insights: any = {
      regulators: regulatorList,
      period: year ? { year: parseInt(year) } : { allTime: true },
      currency
    };

    // Find shared firms (firms fined by multiple selected regulators)
    const sharedFirmsQuery = await sql.unsafe(`
      SELECT
        firm_individual,
        ARRAY_AGG(DISTINCT regulator ORDER BY regulator) as regulators,
        COUNT(DISTINCT regulator) as regulator_count,
        COUNT(*) as total_fines,
        COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total_amount
      FROM public.all_regulatory_fines
      WHERE regulator = ANY($1) ${yearFilter}
      GROUP BY firm_individual
      HAVING COUNT(DISTINCT regulator) > 1
      ORDER BY total_amount DESC
      LIMIT 10
    `, [regulatorList]);

    insights.sharedFirms = sharedFirmsQuery.map(f => ({
      firm: f.firm_individual,
      regulators: f.regulators,
      regulatorCount: parseInt(f.regulator_count),
      totalFines: parseInt(f.total_fines),
      totalAmount: parseFloat(f.total_amount)
    }));

    // Find shared breach types
    const sharedBreachesQuery = await sql.unsafe(`
      SELECT
        breach_type,
        COUNT(DISTINCT regulator) as regulator_count,
        COUNT(*) as total_cases,
        COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) as total_amount
      FROM public.all_regulatory_fines
      WHERE regulator = ANY($1) ${yearFilter}
      GROUP BY breach_type
      HAVING COUNT(DISTINCT regulator) > 1
      ORDER BY total_amount DESC
      LIMIT 10
    `, [regulatorList]);

    insights.sharedBreachTypes = sharedBreachesQuery.map(b => ({
      breachType: b.breach_type,
      regulatorCount: parseInt(b.regulator_count),
      totalCases: parseInt(b.total_cases),
      totalAmount: parseFloat(b.total_amount)
    }));

    // Calculate strictness ratios
    const totals = Object.values(comparison).map((c: any) => c.total || 0);
    const maxTotal = Math.max(...totals);
    const strictnessRatios: Record<string, number> = {};

    for (const regulator of regulatorList) {
      const total = comparison[regulator]?.total || 0;
      strictnessRatios[regulator] = maxTotal > 0 ? parseFloat((total / maxTotal).toFixed(2)) : 0;
    }

    insights.strictnessRatios = strictnessRatios;

    // Most strict regulator
    const mostStrictRegulator = Object.entries(comparison)
      .reduce((max: any, [key, value]: any) =>
        (value.total > (max.value?.total || 0)) ? { key, value } : max,
        { key: null, value: null }
      );

    insights.mostStrict = mostStrictRegulator.key;

    return res.status(200).json({
      comparison,
      insights
    });

  } catch (error) {
    console.error('Regulator comparison error:', error);
    return res.status(500).json({
      error: 'Comparison failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
