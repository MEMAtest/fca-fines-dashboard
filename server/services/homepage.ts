import { getSqlClient } from "../db.js";

const sql = getSqlClient();

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

interface HomepageStatsRow {
  total_fines: unknown;
  total_amount: unknown;
  earliest_year: unknown;
  latest_year: unknown;
}

interface HomepageFineRow {
  firm_individual: unknown;
  amount: unknown;
  date_issued: unknown;
  breach_type: unknown;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Get aggregate statistics and latest fines for homepage display
 */
export async function getHomepageStats(): Promise<HomepageStats> {
  const instance = sql;

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

  const statsRow = (stats[0] ?? {
    total_fines: 0,
    total_amount: 0,
    earliest_year: 0,
    latest_year: 0,
  }) as unknown as HomepageStatsRow;
  const totalFines = toNumber(statsRow.total_fines);
  const totalAmount = toNumber(statsRow.total_amount);
  const earliestYear = toNumber(statsRow.earliest_year);
  const latestYear = toNumber(statsRow.latest_year);

  return {
    totalFines,
    totalAmount,
    yearsCovered:
      latestYear && earliestYear ? latestYear - earliestYear + 1 : 0,
    latestFines: (latestFines as unknown as HomepageFineRow[]).map((fine) => ({
      firm_individual: toString(fine.firm_individual),
      amount: toNumber(fine.amount),
      date_issued: toString(fine.date_issued),
      breach_type: toString(fine.breach_type),
    })),
  };
}
