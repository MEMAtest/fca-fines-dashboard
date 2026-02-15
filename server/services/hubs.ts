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

export interface BreachDetails {
  category: CategorySummary;
  maxFine: number;
  earliestDate: string | null;
  latestDate: string | null;
  topFirms: FirmSummary[];
  topPenalties: FineRecord[];
}

export interface SectorDetails {
  sector: SectorSummary;
  maxFine: number;
  earliestDate: string | null;
  latestDate: string | null;
  topBreaches: CategorySummary[];
  topPenalties: FineRecord[];
}

const HUB_INDEX_TTL_MS = 15 * 60_000;
let cachedFirmSlugMap: { builtAt: number; map: Map<string, string> } | null = null;
let cachedCategorySlugMap: { builtAt: number; map: Map<string, string> } | null = null;
let cachedSectorSlugMap: { builtAt: number; map: Map<string, string> } | null = null;

async function getFirmSlugMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedFirmSlugMap && now - cachedFirmSlugMap.builtAt < HUB_INDEX_TTL_MS) {
    return cachedFirmSlugMap.map;
  }

  const sql = getSqlClient();
  const rows = await sql`SELECT DISTINCT firm_individual FROM fca_fines`;
  const map = new Map<string, string>();
  rows.forEach((row: any) => {
    const name = String(row.firm_individual);
    map.set(firmSlug(name), name);
  });

  cachedFirmSlugMap = { builtAt: now, map };
  return map;
}

async function getCategorySlugMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedCategorySlugMap && now - cachedCategorySlugMap.builtAt < HUB_INDEX_TTL_MS) {
    return cachedCategorySlugMap.map;
  }

  const categories = await listBreachCategories();
  const map = new Map<string, string>();
  categories.forEach((cat) => map.set(cat.slug, cat.name));

  cachedCategorySlugMap = { builtAt: now, map };
  return map;
}

async function getSectorSlugMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedSectorSlugMap && now - cachedSectorSlugMap.builtAt < HUB_INDEX_TTL_MS) {
    return cachedSectorSlugMap.map;
  }

  const sectors = await listSectors();
  const map = new Map<string, string>();
  sectors.forEach((sector) => map.set(sector.slug, sector.name));

  cachedSectorSlugMap = { builtAt: now, map };
  return map;
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
  const firmSlugMap = await getFirmSlugMap();
  const firmName = firmSlugMap.get(slug) ?? null;

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

export async function getBreachDetailsBySlug(slug: string, limitPenalties = 10, limitFirms = 10): Promise<BreachDetails | null> {
  const sql = getSqlClient();
  const categorySlugMap = await getCategorySlugMap();
  const categoryName = categorySlugMap.get(slug) ?? null;
  if (!categoryName) return null;

  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(MAX(amount), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    WHERE breach_categories IS NOT NULL AND breach_categories ? ${categoryName}
  `;

  const firmsLimit = Math.max(1, Math.min(limitFirms, 50));
  const topFirmRows = await sql`
    SELECT
      firm_individual,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    WHERE breach_categories IS NOT NULL AND breach_categories ? ${categoryName}
    GROUP BY firm_individual
    ORDER BY total_amount DESC, fine_count DESC, firm_individual ASC
    LIMIT ${firmsLimit}
  `;

  const penaltiesLimit = Math.max(1, Math.min(limitPenalties, 50));
  const penalties = await sql(
    `
      SELECT fine_reference, firm_individual, firm_category, regulator,
             final_notice_url, summary, breach_type, breach_categories,
             amount, date_issued, year_issued, month_issued
      FROM fca_fines
      WHERE breach_categories IS NOT NULL AND breach_categories ? $1
      ORDER BY amount DESC, date_issued DESC
      LIMIT $2
    `,
    [categoryName, penaltiesLimit],
  );

  const category: CategorySummary = {
    name: categoryName,
    slug,
    fineCount: Number(summary?.fine_count) || 0,
    totalAmount: Number(summary?.total_amount) || 0,
  };

  const topFirms: FirmSummary[] = topFirmRows.map((row: any) => ({
    name: String(row.firm_individual),
    slug: firmSlug(String(row.firm_individual)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
    latestDate: row.latest_date ? String(row.latest_date) : null,
  }));

  return {
    category,
    maxFine: Number(summary?.max_fine) || 0,
    earliestDate: summary?.earliest_date ? String(summary.earliest_date) : null,
    latestDate: summary?.latest_date ? String(summary.latest_date) : null,
    topFirms,
    topPenalties: penalties as FineRecord[],
  };
}

export async function getSectorDetailsBySlug(slug: string, limitPenalties = 10, limitBreaches = 10): Promise<SectorDetails | null> {
  const sql = getSqlClient();
  const sectorSlugMap = await getSectorSlugMap();
  const sectorName = sectorSlugMap.get(slug) ?? null;
  if (!sectorName) return null;

  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(MAX(amount), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    WHERE firm_category = ${sectorName}
  `;

  const clampedBreaches = Math.max(1, Math.min(limitBreaches, 50));
  const breachRows = await sql`
    SELECT
      COALESCE(cat.category, 'Unclassified') AS category,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(f.amount), 0)::float8 AS total_amount
    FROM fca_fines f
    LEFT JOIN LATERAL (
      SELECT jsonb_array_elements_text(f.breach_categories) AS category
    ) AS cat ON TRUE
    WHERE f.firm_category = ${sectorName}
    GROUP BY category
    ORDER BY total_amount DESC, fine_count DESC, category ASC
    LIMIT ${clampedBreaches}
  `;

  const penaltiesLimit = Math.max(1, Math.min(limitPenalties, 50));
  const penalties = await sql(
    `
      SELECT fine_reference, firm_individual, firm_category, regulator,
             final_notice_url, summary, breach_type, breach_categories,
             amount, date_issued, year_issued, month_issued
      FROM fca_fines
      WHERE firm_category = $1
      ORDER BY amount DESC, date_issued DESC
      LIMIT $2
    `,
    [sectorName, penaltiesLimit],
  );

  const sector: SectorSummary = {
    name: sectorName,
    slug,
    fineCount: Number(summary?.fine_count) || 0,
    totalAmount: Number(summary?.total_amount) || 0,
  };

  const topBreaches: CategorySummary[] = breachRows.map((row: any) => ({
    name: String(row.category),
    slug: hubSlug(String(row.category)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));

  return {
    sector,
    maxFine: Number(summary?.max_fine) || 0,
    earliestDate: summary?.earliest_date ? String(summary.earliest_date) : null,
    latestDate: summary?.latest_date ? String(summary.latest_date) : null,
    topBreaches,
    topPenalties: penalties as FineRecord[],
  };
}
