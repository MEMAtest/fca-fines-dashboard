import { getSqlClient } from '../db.ts';

const sql = getSqlClient;

export interface HomepageStats {
  totalFines: number;
  totalAmount: number;
  yearsCovered: number;
  latestFines: Array<{
    firm_individual: string;
    amount: number;
    date_issued: string;
    breach_type: string;
  }>;
}

/**
 * Get aggregate statistics and latest fines for homepage display
 */
export async function getHomepageStats(): Promise<HomepageStats> {
  const instance = sql();

  // Get aggregate statistics
  const stats = await instance(`
    SELECT
      COUNT(*)::int AS total_fines,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      MIN(year_issued)::int AS earliest_year,
      MAX(year_issued)::int AS latest_year
    FROM fca_fines
  `);

  // Get latest 3 enforcement notices
  const latestFines = await instance(`
    SELECT
      firm_individual,
      amount,
      date_issued,
      breach_type
    FROM fca_fines
    ORDER BY date_issued DESC
    LIMIT 3
  `);

  const { total_fines, total_amount, earliest_year, latest_year } = stats[0];

  return {
    totalFines: total_fines,
    totalAmount: total_amount,
    yearsCovered: latest_year - earliest_year + 1,
    latestFines: latestFines.map(fine => ({
      firm_individual: fine.firm_individual,
      amount: Number(fine.amount),
      date_issued: fine.date_issued,
      breach_type: fine.breach_type,
    })),
  };
}
