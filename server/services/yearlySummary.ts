import { getSqlClient } from '../db.ts';

const sql = getSqlClient;

export interface YearlySummary {
  year: number;
  narrative: string;
  regulatory_focus: string[];
  top_cases: Array<{
    firm: string;
    amount: number;
    date: string;
    breach_type: string;
    summary: string;
  }>;
  generated_by: 'manual' | 'auto' | 'ai';
  metadata?: any;
}

/**
 * Get yearly summary for a specific year
 * Falls back to auto-generated summary if manual one doesn't exist
 */
export async function getYearlySummary(year: number): Promise<YearlySummary> {
  const instance = sql();

  // Try to get manually created summary first
  const summary = await instance(
    'SELECT * FROM yearly_summaries WHERE year = $1',
    [year]
  );

  if (summary.length > 0) {
    return {
      year: summary[0].year,
      narrative: summary[0].narrative,
      regulatory_focus: summary[0].regulatory_focus || [],
      top_cases: summary[0].top_cases || [],
      generated_by: summary[0].generated_by,
      metadata: summary[0].metadata,
    };
  }

  // If no manual summary exists, generate one automatically
  return generateAutoSummary(year);
}

/**
 * Auto-generate a basic summary from the data for a given year
 */
async function generateAutoSummary(year: number): Promise<YearlySummary> {
  const instance = sql();

  // Get top 5 cases by amount
  const topCases = await instance(`
    SELECT
      firm_individual,
      amount,
      date_issued,
      breach_type,
      summary
    FROM fca_fines
    WHERE year_issued = $1
    ORDER BY amount DESC
    LIMIT 5
  `, [year]);

  // Get aggregate statistics for the year
  const stats = await instance(`
    SELECT
      COUNT(*)::int AS total_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(AVG(amount), 0)::float8 AS avg_amount
    FROM fca_fines
    WHERE year_issued = $1
  `, [year]);

  // Get breach type distribution
  const breachTypes = await instance(`
    SELECT
      breach_type,
      COUNT(*)::int AS count
    FROM fca_fines
    WHERE year_issued = $1 AND breach_type IS NOT NULL
    GROUP BY breach_type
    ORDER BY count DESC
    LIMIT 3
  `, [year]);

  const topBreaches = breachTypes.map(b => b.breach_type).join(', ');
  const { total_count, total_amount, avg_amount } = stats[0];

  // Generate narrative
  const narrative = topCases.length > 0
    ? `Auto-generated summary for ${year}: The FCA issued ${total_count} enforcement actions totaling £${(total_amount / 1000000).toFixed(1)}m, with an average fine of £${(avg_amount / 1000000).toFixed(2)}m. Key enforcement areas included ${topBreaches}. The largest penalty was £${(topCases[0].amount / 1000000).toFixed(1)}m issued to ${topCases[0].firm_individual} for ${topCases[0].breach_type}.`
    : `No enforcement data available for ${year}.`;

  return {
    year,
    narrative,
    regulatory_focus: breachTypes.slice(0, 5).map(b => b.breach_type),
    top_cases: topCases.map(c => ({
      firm: c.firm_individual,
      amount: Number(c.amount),
      date: c.date_issued,
      breach_type: c.breach_type,
      summary: c.summary || 'No summary available',
    })),
    generated_by: 'auto',
  };
}
