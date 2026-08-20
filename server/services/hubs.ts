import type { FineRecord } from "../../src/types.js";
import { getSqlClient } from "../db.js";
import { normaliseFcaFineEntityName } from "./fcaFineCases.js";
import { firmSlug, hubSlug } from "../utils/slugify.js";
import { isGarbageFirmName } from "../../src/utils/firmName.js";

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
const FCA_TRUSTED_FINE_FILTER =
  "upper(regulator) = 'FCA' AND trusted_amount_gbp > 0";
const FCA_CATEGORY_EXPRESSION = `COALESCE(
  CASE WHEN jsonb_typeof(breach_categories) = 'string'
    THEN (breach_categories #>> '{}')::jsonb
    ELSE breach_categories
  END,
  jsonb_build_array(COALESCE(breach_type, 'Other / not classified'))
)`;
let cachedFirmSlugMap: { builtAt: number; map: Map<string, string> } | null =
  null;
let cachedCategorySlugMap: {
  builtAt: number;
  map: Map<string, string>;
} | null = null;
let cachedSectorSlugMap: { builtAt: number; map: Map<string, string> } | null =
  null;

function mapTrustedFineRecord(row: Record<string, unknown>): FineRecord {
  const caseSourceUrl = row.case_source_url
    ? String(row.case_source_url)
    : null;
  return {
    ...(row as unknown as FineRecord),
    firm_individual: normaliseFcaFineEntityName(
      row.firm_individual,
      caseSourceUrl,
    ),
    breach_categories: Array.isArray(row.breach_categories)
      ? row.breach_categories.map(String)
      : (() => {
          try {
            const parsed =
              typeof row.breach_categories === "string"
                ? JSON.parse(row.breach_categories)
                : [];
            return Array.isArray(parsed) ? parsed.map(String) : [];
          } catch {
            return [];
          }
        })(),
    amount: Number(row.amount) || 0,
    year_issued: Number(row.year_issued) || 0,
    month_issued: Number(row.month_issued) || 0,
  };
}

async function getFirmSlugMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedFirmSlugMap && now - cachedFirmSlugMap.builtAt < HUB_INDEX_TTL_MS) {
    return cachedFirmSlugMap.map;
  }

  const sql = getSqlClient();
  const rows = (await sql(`
    SELECT DISTINCT ON (firm_individual)
      firm_individual,
      COALESCE(NULLIF(notice_url, ''), NULLIF(source_resolved_url, '')) AS case_source_url
    FROM public.all_regulatory_fines_trusted
    WHERE ${FCA_TRUSTED_FINE_FILTER}
    ORDER BY firm_individual, date_issued DESC
  `)) as any[];
  const map = new Map<string, string>();
  rows.forEach((row: any) => {
    const rawName = String(row.firm_individual);
    const displayName = normaliseFcaFineEntityName(
      rawName,
      row.case_source_url ? String(row.case_source_url) : null,
    );
    map.set(firmSlug(displayName), rawName);
    map.set(hubSlug(displayName), rawName);
    map.set(firmSlug(rawName), rawName);
    map.set(hubSlug(rawName), rawName);
  });

  cachedFirmSlugMap = { builtAt: now, map };
  return map;
}

async function getCategorySlugMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (
    cachedCategorySlugMap &&
    now - cachedCategorySlugMap.builtAt < HUB_INDEX_TTL_MS
  ) {
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
  if (
    cachedSectorSlugMap &&
    now - cachedSectorSlugMap.builtAt < HUB_INDEX_TTL_MS
  ) {
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
  const rows = (await sql(`
    SELECT
      cat.category AS category,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(f.trusted_amount_gbp), 0)::float8 AS total_amount
    FROM public.all_regulatory_fines_trusted f
    CROSS JOIN LATERAL (
      SELECT DISTINCT labels.category
      FROM (
        SELECT jsonb_array_elements_text(${FCA_CATEGORY_EXPRESSION
          .replaceAll("breach_categories", "f.breach_categories")
          .replaceAll("breach_type", "f.breach_type")}) AS category
        UNION ALL
        SELECT NULLIF(trim(f.breach_type), '')
      ) labels
      WHERE labels.category IS NOT NULL
    ) AS cat
    WHERE upper(f.regulator) = 'FCA' AND f.trusted_amount_gbp > 0
    GROUP BY cat.category
    ORDER BY total_amount DESC, fine_count DESC, cat.category ASC
  `)) as any[];

  return rows.map((row: any) => ({
    name: String(row.category),
    slug: hubSlug(String(row.category)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));
}

export async function listYears(): Promise<YearSummary[]> {
  const sql = getSqlClient();
  const rows = (await sql(`
    SELECT
      year_issued::int AS year,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount
    FROM public.all_regulatory_fines_trusted
    WHERE ${FCA_TRUSTED_FINE_FILTER}
    GROUP BY year_issued
    ORDER BY year DESC
  `)) as any[];

  return rows.map((row: any) => ({
    year: Number(row.year) || 0,
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));
}

export async function listSectors(): Promise<SectorSummary[]> {
  const sql = getSqlClient();
  const rows = (await sql(`
    SELECT
      firm_category AS sector,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount
    FROM public.all_regulatory_fines_trusted
    WHERE firm_category IS NOT NULL AND firm_category <> ''
      AND ${FCA_TRUSTED_FINE_FILTER}
    GROUP BY firm_category
    ORDER BY total_amount DESC, fine_count DESC, firm_category ASC
  `)) as any[];

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
  const rows = (await sql(`
    SELECT
      firm_individual,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount,
      MAX(date_issued)::text AS latest_date,
      (ARRAY_AGG(
        COALESCE(NULLIF(notice_url, ''), NULLIF(source_resolved_url, ''))
        ORDER BY date_issued DESC
      ))[1] AS case_source_url
    FROM public.all_regulatory_fines_trusted
    WHERE ${FCA_TRUSTED_FINE_FILTER}
    GROUP BY firm_individual
    ORDER BY total_amount DESC, fine_count DESC, firm_individual ASC
    LIMIT $1
  `, [clamped])) as any[];

  return rows.map((row: any) => {
    const name = normaliseFcaFineEntityName(
      row.firm_individual,
      row.case_source_url ? String(row.case_source_url) : null,
    );
    return {
      name,
      slug: firmSlug(name),
      fineCount: Number(row.fine_count) || 0,
      totalAmount: Number(row.total_amount) || 0,
      latestDate: row.latest_date ? String(row.latest_date) : null,
    };
  });
}

export interface RegulatorTopFine {
  firm: string;
  dateIssued: string | null;
  amount: number;
  currency: string;
  breach: string | null;
  sourceUrl: string | null;
}

export interface RegulatorFreshness {
  /** Enforcement actions currently held for this regulator. */
  actionCount: number;
  /** ISO date of the most recent tracked action, or null if none. */
  latestActionDate: string | null;
}

/**
 * Live action count and latest action date for every regulator, in one grouped
 * query.
 *
 * Exists because `regulatorCoverage.ts` carries a HAND-MAINTAINED `count`
 * which no script updates. Anything derived from it — hub copy, meta
 * descriptions, freshness signals — silently goes stale as the scrapers
 * ingest. Read counts from here instead whenever the number is shown to a
 * user or a crawler.
 *
 * Unfiltered by `isGarbageFirmName`: that filter is a display concern for the
 * top-N table, whereas this is "how many actions do we hold", which should
 * match the searchable dataset.
 */
export async function getRegulatorFreshness(): Promise<
  Map<string, RegulatorFreshness>
> {
  const sql = getSqlClient();
  const rows = (await sql(`
    SELECT regulator,
           COUNT(*)::int AS action_count,
           MAX(date_issued)::text AS latest_action_date
    FROM all_regulatory_fines_canonical
    WHERE regulator IS NOT NULL
    GROUP BY regulator
  `)) as any[];

  const map = new Map<string, RegulatorFreshness>();
  for (const row of rows) {
    map.set(String(row.regulator).toUpperCase(), {
      actionCount: Number(row.action_count) || 0,
      latestActionDate: row.latest_action_date
        ? String(row.latest_action_date)
        : null,
    });
  }
  return map;
}

export interface RegulatorYearMonth {
  month: number;
  fineCount: number;
  totalAmount: number;
}

export interface RegulatorYearReport {
  regulator: string;
  year: number;
  fineCount: number;
  totalAmount: number;
  previousYearFineCount: number;
  previousYearTotalAmount: number;
  latestDate: string | null;
  largestFine: RegulatorTopFine | null;
  monthly: RegulatorYearMonth[];
  fines: RegulatorTopFine[];
}

// isGarbageFirmName now lives in src/utils/firmName.ts so the client can
// apply the same rules (the homepage ticker was showing names this rejects).
export { isGarbageFirmName };


/**
 * Top enforcement actions for a single regulator, largest-first. Used by the
 * pre-render step to bake a static, crawlable fines table into each regulator
 * hub page (the live fines list is otherwise client-only). Reads the canonical
 * evidence view (`all_regulatory_fines_canonical`), which spans every live
 * regulator — FCA, the EU/global scrapers, and the pipeline regulators once
 * promoted — filtering on the `regulator` column whose stored value is the
 * canonical regulator code (e.g. "FCA", "BaFin", "SPK"). `amount_gbp` is the
 * house-normalised GBP amount, matching the hub table's "normalised to GBP"
 * label. Returns [] on any error so callers can fall back to the DB-less hub
 * body.
 *
 * Applies display-sanity filtering via {@link isGarbageFirmName} to exclude
 * rows whose party-name field contains a headline sentence, placeholder, or
 * scraping artefact. The DB rows are never mutated — only the showcase table
 * is affected. The query over-fetches (limit × 3, capped at 100) to ensure
 * enough clean rows remain after filtering.
 */
export async function getRegulatorTopFines(
  regulatorCode: string,
  limit = 20,
): Promise<RegulatorTopFine[]> {
  const sql = getSqlClient();
  const clamped = Math.max(1, Math.min(limit, 100));
  // Over-fetch so filtering doesn't leave us with fewer rows than requested.
  const fetchLimit = Math.min(clamped * 3, 100);
  const rows = (await sql(
    `
      SELECT firm_individual, regulator,
             COALESCE(NULLIF(notice_url, ''), NULLIF(source_url, '')) AS notice_url,
             breach_type,
             amount_gbp AS amount, date_issued::text AS date_issued
      FROM all_regulatory_fines_canonical
      WHERE regulator = $1 AND amount_gbp IS NOT NULL AND requires_amount_review IS NOT TRUE
      ORDER BY amount_gbp DESC, date_issued DESC
      LIMIT $2
    `,
    [regulatorCode, fetchLimit],
  )) as any[];

  const clean = rows
    .filter((row: any) => !isGarbageFirmName(String(row.firm_individual ?? "")))
    .slice(0, clamped);

  // Zero-out diagnostic: distinguish "no data" from "all data structurally garbage".
  if (rows.length > 0 && clean.length === 0) {
    console.warn(
      `[hubs] getRegulatorTopFines(${regulatorCode}): ${rows.length} row(s) fetched but ALL removed by isGarbageFirmName — every party-name field appears structurally garbage. Investigate scraper output.`,
    );
  }

  return clean.map((row: any) => ({
    firm: String(row.firm_individual ?? ""),
    dateIssued: row.date_issued ? String(row.date_issued) : null,
    amount: Number(row.amount) || 0,
    currency: "",
    breach: row.breach_type ? String(row.breach_type) : null,
    sourceUrl: row.notice_url ? String(row.notice_url) : null,
  }));
}

/**
 * Exact monetary-fine report for a regulator and calendar year. This powers
 * the crawlable FCA answer pages, so it deliberately excludes non-monetary
 * actions, undisclosed values and amounts still awaiting review. The canonical
 * view prevents duplicate source records from inflating the published totals.
 */
export async function getRegulatorYearReport(
  regulatorCode: string,
  year: number,
): Promise<RegulatorYearReport> {
  const sql = getSqlClient();
  const rows = (await sql(
    `
      SELECT firm_individual,
             date_issued::text AS date_issued,
             month_issued,
             amount_gbp AS amount,
             breach_type,
             COALESCE(
               NULLIF(notice_url, ''),
               NULLIF(source_url, '')
             ) AS source_url
      FROM all_regulatory_fines_canonical
      WHERE regulator = $1
        AND year_issued = $2
        AND amount_gbp > 0
        AND requires_amount_review IS NOT TRUE
      ORDER BY date_issued DESC, amount_gbp DESC
      LIMIT 500
    `,
    [regulatorCode, year],
  )) as any[];
  const previousRows = (await sql(
    `
      SELECT COUNT(*)::int AS fine_count,
             COALESCE(SUM(amount_gbp), 0)::float8 AS total_amount
      FROM all_regulatory_fines_canonical
      WHERE regulator = $1
        AND year_issued = $2
        AND amount_gbp > 0
        AND requires_amount_review IS NOT TRUE
    `,
    [regulatorCode, year - 1],
  )) as any[];

  const fines = rows
    .filter((row: any) => !isGarbageFirmName(String(row.firm_individual ?? "")))
    .map((row: any): RegulatorTopFine => ({
      firm: String(row.firm_individual ?? ""),
      dateIssued: row.date_issued ? String(row.date_issued) : null,
      amount: Number(row.amount) || 0,
      currency: "GBP",
      breach: row.breach_type ? String(row.breach_type) : null,
      sourceUrl: row.source_url ? String(row.source_url) : null,
    }));
  const monthlyMap = new Map<number, { fineCount: number; totalAmount: number }>();
  rows.forEach((row: any) => {
    const month = Math.min(12, Math.max(1, Number(row.month_issued) || 1));
    const current = monthlyMap.get(month) ?? { fineCount: 0, totalAmount: 0 };
    current.fineCount += 1;
    current.totalAmount += Number(row.amount) || 0;
    monthlyMap.set(month, current);
  });
  const totalAmount = rows.reduce((sum: number, row: any) => sum + (Number(row.amount) || 0), 0);
  const largestFine = fines.slice().sort((left, right) => right.amount - left.amount)[0] ?? null;
  const previous = previousRows[0];

  return {
    regulator: regulatorCode,
    year,
    fineCount: rows.length,
    totalAmount,
    previousYearFineCount: Number(previous?.fine_count) || 0,
    previousYearTotalAmount: Number(previous?.total_amount) || 0,
    latestDate: rows[0]?.date_issued ? String(rows[0].date_issued) : null,
    largestFine,
    monthly: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      fineCount: monthlyMap.get(index + 1)?.fineCount ?? 0,
      totalAmount: monthlyMap.get(index + 1)?.totalAmount ?? 0,
    })),
    fines,
  };
}

export async function getFirmDetailsBySlug(
  slug: string,
  limit = 200,
): Promise<FirmDetails | null> {
  const sql = getSqlClient();

  // Resolve slug -> firm name (stable firmSlug() includes a short hash).
  const firmSlugMap = await getFirmSlugMap();
  const firmName = firmSlugMap.get(slug) ?? null;

  if (!firmName) return null;

  const summaryRows = (await sql`
    SELECT
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount,
      COALESCE(MAX(trusted_amount_gbp), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date,
      (ARRAY_AGG(
        COALESCE(NULLIF(notice_url, ''), NULLIF(source_resolved_url, ''))
        ORDER BY date_issued DESC
      ))[1] AS case_source_url
    FROM public.all_regulatory_fines_trusted
    WHERE upper(regulator) = 'FCA'
      AND trusted_amount_gbp > 0
      AND firm_individual = ${firmName}
  `) as any[];
  const summary = summaryRows[0];
  const displayName = normaliseFcaFineEntityName(
    firmName,
    summary?.case_source_url ? String(summary.case_source_url) : null,
  );

  const clamped = Math.max(1, Math.min(limit, 5000));
  const records = (await sql(
    `
      SELECT public_case_id AS canonical_case_id,
             public_case_id AS fine_reference,
             firm_individual, firm_category, regulator,
             notice_url AS final_notice_url,
             source_url, summary, breach_type, breach_categories,
             trusted_amount_gbp AS amount,
             date_issued::text AS date_issued, year_issued, month_issued,
             amount_quality, requires_amount_review,
             amount_verification_url, amount_override_reason,
             source_link_status, source_checked_at, source_http_status,
             source_official_domain_match, source_content_hash,
             duplicate_count, created_at,
             COALESCE(NULLIF(notice_url, ''), NULLIF(source_resolved_url, '')) AS case_source_url
      FROM public.all_regulatory_fines_trusted
      WHERE upper(regulator) = 'FCA'
        AND trusted_amount_gbp > 0
        AND firm_individual = $1
      ORDER BY date_issued DESC, trusted_amount_gbp DESC
      LIMIT $2
    `,
    [firmName, clamped],
  )) as unknown as Array<Record<string, unknown>>;

  return {
    name: displayName,
    slug: firmSlug(displayName),
    fineCount: Number(summary?.fine_count) || 0,
    totalAmount: Number(summary?.total_amount) || 0,
    maxFine: Number(summary?.max_fine) || 0,
    earliestDate: summary?.earliest_date ? String(summary.earliest_date) : null,
    latestDate: summary?.latest_date ? String(summary.latest_date) : null,
    records: records.map(mapTrustedFineRecord),
  };
}

export async function getBreachDetailsBySlug(
  slug: string,
  limitPenalties = 10,
  limitFirms = 10,
): Promise<BreachDetails | null> {
  const sql = getSqlClient();
  const categorySlugMap = await getCategorySlugMap();
  const categoryName = categorySlugMap.get(slug) ?? null;
  if (!categoryName) return null;

  // Handle double-encoded breach_categories: 312/316 rows store a JSON string
  // instead of a native array, so the ? operator won't match them directly.
  const catFilter = FCA_CATEGORY_EXPRESSION;

  const summaryRows = (await sql(
    `SELECT
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount,
      COALESCE(MAX(trusted_amount_gbp), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM public.all_regulatory_fines_trusted
    WHERE upper(regulator) = 'FCA'
      AND trusted_amount_gbp > 0
      AND (
        ${catFilter} @> jsonb_build_array($1::text)
        OR lower(trim(breach_type)) = lower(trim($1))
      )`,
    [categoryName],
  )) as any[];
  const summary = summaryRows[0];

  const firmsLimit = Math.max(1, Math.min(limitFirms, 50));
  const topFirmRows = (await sql(
    `SELECT
      firm_individual,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount,
      MAX(date_issued)::text AS latest_date,
      (ARRAY_AGG(
        COALESCE(NULLIF(notice_url, ''), NULLIF(source_resolved_url, ''))
        ORDER BY date_issued DESC
      ))[1] AS case_source_url
    FROM public.all_regulatory_fines_trusted
    WHERE upper(regulator) = 'FCA'
      AND trusted_amount_gbp > 0
      AND (
        ${catFilter} @> jsonb_build_array($1::text)
        OR lower(trim(breach_type)) = lower(trim($1))
      )
    GROUP BY firm_individual
    ORDER BY total_amount DESC, fine_count DESC, firm_individual ASC
    LIMIT $2`,
    [categoryName, firmsLimit],
  )) as any[];

  const penaltiesLimit = Math.max(1, Math.min(limitPenalties, 50));
  const penalties = (await sql(
    `SELECT public_case_id AS canonical_case_id,
            public_case_id AS fine_reference,
            firm_individual, firm_category, regulator,
            notice_url AS final_notice_url,
            source_url, summary, breach_type, breach_categories,
            trusted_amount_gbp AS amount,
            date_issued::text AS date_issued, year_issued, month_issued,
            amount_quality, requires_amount_review,
            amount_verification_url, amount_override_reason,
            source_link_status, source_checked_at, source_http_status,
            source_official_domain_match, source_content_hash,
            duplicate_count, created_at,
            COALESCE(NULLIF(notice_url, ''), NULLIF(source_resolved_url, '')) AS case_source_url
      FROM public.all_regulatory_fines_trusted
      WHERE upper(regulator) = 'FCA'
        AND trusted_amount_gbp > 0
        AND (
          ${catFilter} @> jsonb_build_array($1::text)
          OR lower(trim(breach_type)) = lower(trim($1))
        )
      ORDER BY trusted_amount_gbp DESC, date_issued DESC
      LIMIT $2`,
    [categoryName, penaltiesLimit],
  )) as unknown as Array<Record<string, unknown>>;

  const category: CategorySummary = {
    name: categoryName,
    slug,
    fineCount: Number(summary?.fine_count) || 0,
    totalAmount: Number(summary?.total_amount) || 0,
  };

  const topFirms: FirmSummary[] = topFirmRows.map((row: any) => ({
    name: normaliseFcaFineEntityName(
      row.firm_individual,
      row.case_source_url ? String(row.case_source_url) : null,
    ),
    slug: firmSlug(normaliseFcaFineEntityName(
      row.firm_individual,
      row.case_source_url ? String(row.case_source_url) : null,
    )),
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
    topPenalties: penalties.map(mapTrustedFineRecord),
  };
}

export async function getSectorDetailsBySlug(
  slug: string,
  limitPenalties = 10,
  limitBreaches = 10,
): Promise<SectorDetails | null> {
  const sql = getSqlClient();
  const sectorSlugMap = await getSectorSlugMap();
  const sectorName = sectorSlugMap.get(slug) ?? null;
  if (!sectorName) return null;

  const summaryRows = (await sql`
    SELECT
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount,
      COALESCE(MAX(trusted_amount_gbp), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM public.all_regulatory_fines_trusted
    WHERE upper(regulator) = 'FCA'
      AND trusted_amount_gbp > 0
      AND firm_category = ${sectorName}
  `) as any[];
  const summary = summaryRows[0];

  const clampedBreaches = Math.max(1, Math.min(limitBreaches, 50));
  const breachRows = (await sql`
    SELECT
      COALESCE(cat.category, 'Unclassified') AS category,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(f.trusted_amount_gbp), 0)::float8 AS total_amount
    FROM public.all_regulatory_fines_trusted f
    LEFT JOIN LATERAL (
      SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(f.breach_categories) = 'string'
             THEN (f.breach_categories #>> '{}')::jsonb
             ELSE f.breach_categories END
      ) AS category
    ) AS cat ON TRUE
    WHERE upper(f.regulator) = 'FCA'
      AND f.trusted_amount_gbp > 0
      AND f.firm_category = ${sectorName}
    GROUP BY category
    ORDER BY total_amount DESC, fine_count DESC, category ASC
    LIMIT ${clampedBreaches}
  `) as any[];

  const penaltiesLimit = Math.max(1, Math.min(limitPenalties, 50));
  const penalties = (await sql(
    `
      SELECT public_case_id AS canonical_case_id,
             public_case_id AS fine_reference,
             firm_individual, firm_category, regulator,
             notice_url AS final_notice_url,
             source_url, summary, breach_type, breach_categories,
             trusted_amount_gbp AS amount,
             date_issued::text AS date_issued, year_issued, month_issued,
             amount_quality, requires_amount_review,
             amount_verification_url, amount_override_reason,
             source_link_status, source_checked_at, source_http_status,
             source_official_domain_match, source_content_hash,
             duplicate_count, created_at,
             COALESCE(NULLIF(notice_url, ''), NULLIF(source_resolved_url, '')) AS case_source_url
      FROM public.all_regulatory_fines_trusted
      WHERE upper(regulator) = 'FCA'
        AND trusted_amount_gbp > 0
        AND firm_category = $1
      ORDER BY trusted_amount_gbp DESC, date_issued DESC
      LIMIT $2
    `,
    [sectorName, penaltiesLimit],
  )) as unknown as Array<Record<string, unknown>>;

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
    topPenalties: penalties.map(mapTrustedFineRecord),
  };
}
