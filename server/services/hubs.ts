import type { FineRecord } from '../../src/types';
import { getSqlClient } from '../db.js';
import { firmSlug, hubSlug } from '../utils/slugify.js';

export interface CategorySummary {
  name: string;
  slug: string;
  fineCount: number;
  totalAmount: number;
}

export interface YearSummary {
  year: number;
  fineCount: number;
  totalAmount: number;
}

export interface SectorSummary {
  name: string;
  slug: string;
  fineCount: number;
  totalAmount: number;
}

export interface FirmSummary {
  name: string;
  slug: string;
  fineCount: number;
  totalAmount: number;
  latestDate: string | null;
}

export interface FirmDetails {
  name: string;
  slug: string;
  fineCount: number;
  totalAmount: number;
  maxFine: number;
  earliestDate: string | null;
  latestDate: string | null;
  records: FineRecord[];
}

export async function listBreachCategories(): Promise<CategorySummary[]> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT
      cat.category AS category,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(f.amount), 0)::float8 AS total_amount
    FROM fca_fines f
    CROSS JOIN LATERAL jsonb_array_elements_text(f.breach_categories) AS cat(category)
    GROUP BY cat.category
    ORDER BY total_amount DESC, fine_count DESC, cat.category ASC
  `;

  return rows.map((row: any) => ({
    name: String(row.category),
    slug: hubSlug(String(row.category)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));
}

export async function listYears(): Promise<YearSummary[]> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT
      year_issued::int AS year,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount
    FROM fca_fines
    GROUP BY year_issued
    ORDER BY year DESC
  `;

  return rows.map((row: any) => ({
    year: Number(row.year) || 0,
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));
}

export async function listSectors(): Promise<SectorSummary[]> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT
      firm_category AS sector,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount
    FROM fca_fines
    WHERE firm_category IS NOT NULL AND firm_category <> ''
    GROUP BY firm_category
    ORDER BY total_amount DESC, fine_count DESC, firm_category ASC
  `;

  return rows.map((row: any) => ({
    name: String(row.sector),
    slug: hubSlug(String(row.sector)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));
}

export async function listTopFirms(limit = 100): Promise<FirmSummary[]> {
  const sql = getSqlClient();
  const clamped = Math.max(1, Math.min(limit, 1000));
  const rows = await sql`
    SELECT
      firm_individual,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    GROUP BY firm_individual
    ORDER BY total_amount DESC, fine_count DESC, firm_individual ASC
    LIMIT ${clamped}
  `;

  return rows.map((row: any) => ({
    name: String(row.firm_individual),
    slug: firmSlug(String(row.firm_individual)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
    latestDate: row.latest_date ? String(row.latest_date) : null,
  }));
}

export async function getFirmDetailsBySlug(slug: string, limit = 200): Promise<FirmDetails | null> {
  const sql = getSqlClient();

  // Resolve slug -> firm name (stable firmSlug() includes a short hash).
  const firms = await sql`SELECT DISTINCT firm_individual FROM fca_fines`;
  const firmName = firms
    .map((row: any) => String(row.firm_individual))
    .find((name) => firmSlug(name) === slug);

  if (!firmName) return null;

  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(MAX(amount), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    WHERE firm_individual = ${firmName}
  `;

  const clamped = Math.max(1, Math.min(limit, 5000));
  const records = await sql(
    `
      SELECT fine_reference, firm_individual, firm_category, regulator,
             final_notice_url, summary, breach_type, breach_categories,
             amount, date_issued, year_issued, month_issued
      FROM fca_fines
      WHERE firm_individual = $1
      ORDER BY date_issued DESC, amount DESC
      LIMIT $2
    `,
    [firmName, clamped],
  );

  return {
    name: firmName,
    slug,
    fineCount: Number(summary?.fine_count) || 0,
    totalAmount: Number(summary?.total_amount) || 0,
    maxFine: Number(summary?.max_fine) || 0,
    earliestDate: summary?.earliest_date ? String(summary.earliest_date) : null,
    latestDate: summary?.latest_date ? String(summary.latest_date) : null,
    records: records as FineRecord[],
  };
}

