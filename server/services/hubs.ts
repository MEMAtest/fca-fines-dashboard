import type { FineRecord } from "../../src/types.js";
import { getSqlClient } from "../db.js";
import {
  normaliseFcaFineEntityName,
  listFcaMonetaryCasesForSeo,
  buildFcaFineCasePath,
  type FcaFineCaseSeoRow,
} from "./fcaFineCases.js";
import { firmSlug, hubSlug } from "../utils/slugify.js";
import { isGarbageFirmName } from "../../src/utils/firmName.js";
import { formatBreachCategory } from "../../src/utils/labelConversion.js";
import {
  CYBER_OPERATIONAL_RESILIENCE,
  CYBER_OPERATIONAL_RESILIENCE_ALIASES,
} from "../../src/data/enforcementConcepts.js";

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

/**
 * Breach categories reach us in two spellings.
 *
 * `breach_categories` holds enum-shaped values ("MARKET_ABUSE") while
 * `breach_type` holds free text from the notice ("Market Abuse"), and the
 * category list unions both. Grouping on the raw string therefore produced two
 * rows for the same category on /breaches -- "Market Abuse 63 actions" and
 * "Market Abuse 5 actions" -- which both linked to /breaches/market-abuse,
 * because hubSlug() strips underscores and already collapsed them.
 *
 * Worse, the hub page behind that one URL filtered on a single raw spelling,
 * so it silently under-reported: whichever variant the slug map happened to
 * hold won, and the other variant's actions were unreachable.
 *
 * Canonicalise instead: lowercase, underscores to spaces, collapsed
 * whitespace. Applied identically when grouping the list and when filtering a
 * hub, so the two agree by construction.
 */
const CANONICAL_CATEGORY_SQL = (expr: string) =>
  `regexp_replace(lower(trim(replace(${expr}, '_', ' '))), '\\s+', ' ', 'g')`;

export async function listBreachCategories(): Promise<CategorySummary[]> {
  const sql = getSqlClient();
  const rows = (await sql(`
    SELECT
      -- Prefer the enum spelling: formatBreachCategory() has an explicit
      -- label for "MARKET_ABUSE" but has to guess at "Market Abuse".
      (ARRAY_AGG(cat.category ORDER BY (position('_' in cat.category) > 0) DESC, cat.category))[1] AS category,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(f.trusted_amount_gbp), 0)::float8 AS total_amount
    FROM public.all_regulatory_fines_trusted f
    CROSS JOIN LATERAL (
      -- DISTINCT ON the canonical form, not the raw string. A fine whose
      -- breach_categories says "MARKET_ABUSE" and whose breach_type says
      -- "Market Abuse" must contribute ONE row, or it is counted twice in the
      -- group those two now share. Ties resolve to the enum spelling, which
      -- becomes the group's representative label.
      SELECT DISTINCT ON (${CANONICAL_CATEGORY_SQL("labels.category")}) labels.category
      FROM (
        SELECT jsonb_array_elements_text(${FCA_CATEGORY_EXPRESSION
          .replaceAll("breach_categories", "f.breach_categories")
          .replaceAll("breach_type", "f.breach_type")}) AS category
        UNION ALL
        SELECT NULLIF(trim(f.breach_type), '')
      ) labels
      WHERE labels.category IS NOT NULL
      ORDER BY
        ${CANONICAL_CATEGORY_SQL("labels.category")},
        (position('_' in labels.category) > 0) DESC,
        labels.category
    ) AS cat
    WHERE upper(f.regulator) = 'FCA' AND f.trusted_amount_gbp > 0
    GROUP BY ${CANONICAL_CATEGORY_SQL("cat.category")}
    ORDER BY total_amount DESC, fine_count DESC, category ASC
  `)) as any[];

  const cyberPatterns = CYBER_OPERATIONAL_RESILIENCE_ALIASES.map((alias) => `%${alias}%`);
  const cyberRows = (await sql(`
    SELECT COUNT(*)::int AS fine_count,
           COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount
    FROM public.all_regulatory_fines_trusted
    WHERE (
        COALESCE(summary, '') ILIKE ANY($1::text[])
        OR COALESCE(breach_type, '') ILIKE ANY($1::text[])
        OR COALESCE(breach_categories::text, '') ILIKE ANY($1::text[])
      )
  `, [cyberPatterns])) as any[];
  const cyber = cyberRows[0];
  const mapped = rows.map((row: any) => ({
    name: String(row.category),
    slug: hubSlug(String(row.category)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));
  if (Number(cyber?.fine_count) > 0 && !mapped.some((item) => item.slug === "cyber-operational-resilience")) {
    mapped.push({
      name: CYBER_OPERATIONAL_RESILIENCE,
      slug: "cyber-operational-resilience",
      fineCount: Number(cyber.fine_count) || 0,
      totalAmount: Number(cyber.total_amount) || 0,
    });
  }
  return mapped;
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

export interface RegulatorFirmTotal {
  firm: string;
  totalAmount: number;
  fineCount: number;
}

/**
 * Firms/individuals ranked by total disclosed penalty amount for one
 * regulator, largest total first — powers "which firm has been fined most"
 * FAQ/leaderboard copy. Same garbage-name filtering and
 * `requires_amount_review` exclusion as {@link getRegulatorTopFines}, but
 * grouped by firm rather than by individual fine. Returns [] on any error so
 * callers omit the derived copy rather than fabricate it.
 */
export async function getRegulatorFirmTotals(
  regulatorCode: string,
  limit = 1,
): Promise<RegulatorFirmTotal[]> {
  const sql = getSqlClient();
  const clamped = Math.max(1, Math.min(limit, 50));
  const fetchLimit = Math.min(clamped * 3, 100);
  const rows = (await sql(
    `
      SELECT firm_individual,
             SUM(amount_gbp)::float8 AS total_amount,
             COUNT(*)::int AS fine_count
      FROM all_regulatory_fines_canonical
      WHERE regulator = $1 AND amount_gbp IS NOT NULL AND requires_amount_review IS NOT TRUE
      GROUP BY firm_individual
      ORDER BY total_amount DESC
      LIMIT $2
    `,
    [regulatorCode, fetchLimit],
  )) as any[];

  return rows
    .filter((row: any) => !isGarbageFirmName(String(row.firm_individual ?? "")))
    .slice(0, clamped)
    .map((row: any) => ({
      firm: String(row.firm_individual ?? ""),
      totalAmount: Number(row.total_amount) || 0,
      fineCount: Number(row.fine_count) || 0,
    }));
}

export interface GlobalTopFine extends RegulatorTopFine {
  regulator: string;
}

export interface GlobalFinesSummary {
  actionCount: number;
  regulatorCount: number;
  totalAmount: number;
  latestDate: string | null;
}

/**
 * Site-wide totals across every live regulator, for the /fines database page
 * running-totals line. `totalAmount` only sums rows with a reviewed GBP
 * amount (mirrors the "normalised to GBP" convention used elsewhere), so it
 * is directly comparable to the regulator hub totals. Returns null fields
 * are never fabricated — callers must degrade gracefully if this throws.
 */
export async function getGlobalFinesSummary(): Promise<GlobalFinesSummary> {
  const sql = getSqlClient();
  const rows = (await sql(`
    SELECT
      COUNT(*)::int AS action_count,
      COUNT(DISTINCT regulator)::int AS regulator_count,
      COALESCE(SUM(amount_gbp) FILTER (
        WHERE amount_gbp IS NOT NULL AND requires_amount_review IS NOT TRUE
      ), 0)::float8 AS total_amount,
      MAX(date_issued)::text AS latest_date
    FROM all_regulatory_fines_canonical
    WHERE regulator IS NOT NULL
  `)) as any[];
  const row = rows[0] ?? {};
  return {
    actionCount: Number(row.action_count) || 0,
    regulatorCount: Number(row.regulator_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
    latestDate: row.latest_date ? String(row.latest_date) : null,
  };
}

/**
 * Top enforcement actions across every regulator, largest-first. Same
 * filtering rules as {@link getRegulatorTopFines} but not scoped to a single
 * regulator — powers the baked top-fines table on the /fines database page.
 */
export async function getGlobalTopFines(limit = 50): Promise<GlobalTopFine[]> {
  const sql = getSqlClient();
  const clamped = Math.max(1, Math.min(limit, 100));
  const fetchLimit = Math.min(clamped * 3, 200);
  const rows = (await sql(
    `
      SELECT firm_individual, regulator,
             COALESCE(NULLIF(notice_url, ''), NULLIF(source_url, '')) AS notice_url,
             breach_type,
             amount_gbp AS amount, date_issued::text AS date_issued
      FROM all_regulatory_fines_canonical
      WHERE regulator IS NOT NULL AND amount_gbp IS NOT NULL AND requires_amount_review IS NOT TRUE
      ORDER BY amount_gbp DESC, date_issued DESC
      LIMIT $1
    `,
    [fetchLimit],
  )) as any[];

  const clean = rows
    .filter((row: any) => !isGarbageFirmName(String(row.firm_individual ?? "")))
    .slice(0, clamped);

  return clean.map((row: any) => ({
    firm: String(row.firm_individual ?? ""),
    regulator: String(row.regulator ?? ""),
    dateIssued: row.date_issued ? String(row.date_issued) : null,
    amount: Number(row.amount) || 0,
    currency: "",
    breach: row.breach_type ? String(row.breach_type) : null,
    sourceUrl: row.notice_url ? String(row.notice_url) : null,
  }));
}

export interface CountryFinesLargest {
  firm: string;
  regulator: string;
  amount: number;
  dateIssued: string | null;
}

export interface CountryFinesSummary {
  actionCount: number;
  totalAmount: number;
  latestDate: string | null;
  largestFine: CountryFinesLargest | null;
}

/**
 * Per-country enforcement-fines totals + largest fine, for the country-page
 * fines FAQ. Grouped by `country_code` (ISO2, matches `Country.iso2`) on the
 * same canonical evidence view used everywhere else in this file. Countries
 * with zero rows are simply absent from the returned map — callers MUST treat
 * a missing entry as "no fines FAQ", never as a zero to display.
 */
export async function getCountryFinesSummaries(): Promise<
  Map<string, CountryFinesSummary>
> {
  const sql = getSqlClient();
  const totals = (await sql(`
    SELECT country_code,
           COUNT(*)::int AS action_count,
           COALESCE(SUM(amount_gbp) FILTER (
             WHERE amount_gbp IS NOT NULL AND requires_amount_review IS NOT TRUE
           ), 0)::float8 AS total_amount,
           MAX(date_issued)::text AS latest_date
    FROM all_regulatory_fines_canonical
    WHERE country_code IS NOT NULL
    GROUP BY country_code
  `)) as any[];

  // Largest CLEAN (non-garbage-name) fine per country. Over-fetch rn<=10 per
  // country so a garbage top row doesn't blank out the whole country.
  const largestRows = (await sql(`
    SELECT country_code, firm_individual, regulator, amount_gbp AS amount, date_issued::text AS date_issued
    FROM (
      SELECT country_code, firm_individual, regulator, amount_gbp, date_issued,
             ROW_NUMBER() OVER (
               PARTITION BY country_code
               ORDER BY amount_gbp DESC, date_issued DESC
             ) AS rn
      FROM all_regulatory_fines_canonical
      WHERE country_code IS NOT NULL
        AND amount_gbp IS NOT NULL
        AND requires_amount_review IS NOT TRUE
    ) ranked
    WHERE rn <= 10
    ORDER BY country_code, rn
  `)) as any[];

  const largestByCountry = new Map<string, CountryFinesLargest>();
  for (const row of largestRows) {
    const cc = String(row.country_code ?? "").toUpperCase();
    if (!cc || largestByCountry.has(cc)) continue;
    const firmName = String(row.firm_individual ?? "");
    if (isGarbageFirmName(firmName)) continue; // keep scanning this country's rn 2..10
    largestByCountry.set(cc, {
      firm: firmName,
      regulator: String(row.regulator ?? ""),
      amount: Number(row.amount) || 0,
      dateIssued: row.date_issued ? String(row.date_issued) : null,
    });
  }

  const map = new Map<string, CountryFinesSummary>();
  for (const row of totals) {
    const cc = String(row.country_code ?? "").toUpperCase();
    if (!cc) continue;
    map.set(cc, {
      actionCount: Number(row.action_count) || 0,
      totalAmount: Number(row.total_amount) || 0,
      latestDate: row.latest_date ? String(row.latest_date) : null,
      largestFine: largestByCountry.get(cc) ?? null,
    });
  }
  return map;
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

// ---------------------------------------------------------------------------
// "State of FCA Enforcement" report (/topics/state-of-fca-enforcement)
// ---------------------------------------------------------------------------

export interface FcaEnforcementYearRow {
  year: number;
  fineCount: number;
  totalAmount: number;
  averageAmount: number;
}

export interface FcaEnforcementBreachRow {
  name: string;
  slug: string;
  count: number;
  totalAmount: number;
  averageAmount: number;
  /** Share of the all-time qualifying total. Fines may carry more than one
   * breach category, so these shares do not sum to 100%. */
  shareOfTotal: number;
}

export interface FcaEnforcementReport {
  firstYear: number;
  currentYear: number;
  yearsCovered: number;
  allTimeTotal: number;
  allTimeCount: number;
  averageFine: number;
  largestFine: RegulatorTopFine | null;
  mostFinedFirm: RegulatorFirmTotal | null;
  currentYearTotal: number;
  currentYearCount: number;
  lastUpdatedDate: string | null;
  yearly: FcaEnforcementYearRow[];
  breachBreakdown: FcaEnforcementBreachRow[];
  topFirms: RegulatorFirmTotal[];
}

/**
 * Build-time data source for the "State of FCA Enforcement" data-journalism
 * report. Every figure here is derived from the live evidence set — nothing
 * hardcoded. Yearly totals use the same canonical-view / `requires_amount_review`
 * exclusion convention as {@link getRegulatorYearReport} (one grouped query
 * instead of one call per year). Breach totals reuse {@link listBreachCategories},
 * which already unwraps the double-encoded `breach_categories` JSONB and
 * canonicalises enum vs free-text spellings — so this function does not
 * duplicate that logic. The synthetic "Cyber and Operational Resilience"
 * concept row (a keyword-matched overlay, not a real breach category) is
 * excluded here to keep the breakdown to genuine, non-overlapping-by-construction
 * categories as far as the source data allows.
 */
export async function getFcaEnforcementReport(
  firstYear = 2013,
): Promise<FcaEnforcementReport> {
  const sql = getSqlClient();
  const currentYear = new Date().getUTCFullYear();

  const yearRows = (await sql(
    `
      SELECT year_issued::int AS year,
             COUNT(*)::int AS fine_count,
             COALESCE(SUM(amount_gbp), 0)::float8 AS total_amount,
             MAX(date_issued)::text AS latest_date
      FROM all_regulatory_fines_canonical
      WHERE regulator = 'FCA'
        AND year_issued BETWEEN $1 AND $2
        AND amount_gbp > 0
        AND requires_amount_review IS NOT TRUE
      GROUP BY year_issued
      ORDER BY year_issued ASC
    `,
    [firstYear, currentYear],
  )) as any[];

  const yearly: FcaEnforcementYearRow[] = yearRows.map((row: any) => {
    const fineCount = Number(row.fine_count) || 0;
    const totalAmount = Number(row.total_amount) || 0;
    return {
      year: Number(row.year) || 0,
      fineCount,
      totalAmount,
      averageAmount: fineCount > 0 ? totalAmount / fineCount : 0,
    };
  });

  const allTimeCount = yearly.reduce((sum, row) => sum + row.fineCount, 0);
  const allTimeTotal = yearly.reduce((sum, row) => sum + row.totalAmount, 0);
  const lastUpdatedDate = yearRows.reduce<string | null>((latest, row: any) => {
    const value = row.latest_date ? String(row.latest_date) : null;
    if (!value) return latest;
    return !latest || value > latest ? value : latest;
  }, null);

  const currentYearRow = yearly.find((row) => row.year === currentYear) ?? null;

  const [largestFineRows, topFirms, breachCategories] = await Promise.all([
    getRegulatorTopFines("FCA", 1),
    getRegulatorFirmTotals("FCA", 10),
    listBreachCategories(),
  ]);

  const breachBreakdown: FcaEnforcementBreachRow[] = breachCategories
    .filter((category) => category.slug !== "cyber-operational-resilience")
    .map((category) => ({
      name: formatBreachCategory(category.name),
      slug: category.slug,
      count: category.fineCount,
      totalAmount: category.totalAmount,
      averageAmount: category.fineCount > 0 ? category.totalAmount / category.fineCount : 0,
      shareOfTotal: allTimeTotal > 0 ? category.totalAmount / allTimeTotal : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    firstYear,
    currentYear,
    yearsCovered: yearly.filter((row) => row.fineCount > 0).length,
    allTimeTotal,
    allTimeCount,
    averageFine: allTimeCount > 0 ? allTimeTotal / allTimeCount : 0,
    largestFine: largestFineRows[0] ?? null,
    mostFinedFirm: topFirms[0] ?? null,
    currentYearTotal: currentYearRow?.totalAmount ?? 0,
    currentYearCount: currentYearRow?.fineCount ?? 0,
    lastUpdatedDate,
    yearly,
    breachBreakdown,
    topFirms,
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
  const isCyberConcept = slug === "cyber-operational-resilience";
  const categoryName = isCyberConcept
    ? CYBER_OPERATIONAL_RESILIENCE
    : categorySlugMap.get(slug) ?? null;
  if (!categoryName) return null;

  // Handle double-encoded breach_categories: 312/316 rows store a JSON string
  // instead of a native array, so the ? operator won't match them directly.
  const catFilter = FCA_CATEGORY_EXPRESSION;
  const cyberPatterns = CYBER_OPERATIONAL_RESILIENCE_ALIASES.map((alias) => `%${alias}%`);
  const categoryWhere = isCyberConcept
    ? `(
        COALESCE(summary, '') ILIKE ANY($1::text[])
        OR COALESCE(breach_type, '') ILIKE ANY($1::text[])
        OR COALESCE(${catFilter}, '[]'::jsonb)::text ILIKE ANY($1::text[])
      )`
    : `(
        EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${catFilter}) AS label
          WHERE ${CANONICAL_CATEGORY_SQL("label")} = ${CANONICAL_CATEGORY_SQL("$1::text")}
        )
        OR ${CANONICAL_CATEGORY_SQL("breach_type")} = ${CANONICAL_CATEGORY_SQL("$1::text")}
      )`;
  const categoryParams = [isCyberConcept ? cyberPatterns : categoryName];
  const amountWhere = isCyberConcept ? "" : "AND trusted_amount_gbp > 0";
  const regulatorWhere = isCyberConcept ? "" : "upper(regulator) = 'FCA' AND";

  const summaryRows = (await sql(
    `SELECT
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount,
      COALESCE(MAX(trusted_amount_gbp), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM public.all_regulatory_fines_trusted
    WHERE ${regulatorWhere}
      1 = 1 ${amountWhere}
      AND ${categoryWhere}`,
    categoryParams,
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
    WHERE ${regulatorWhere}
      1 = 1 ${amountWhere}
      AND ${categoryWhere}
    GROUP BY firm_individual
    ORDER BY total_amount DESC, fine_count DESC, firm_individual ASC
    LIMIT $2`,
    [...categoryParams, firmsLimit],
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
      WHERE ${regulatorWhere}
        1 = 1 ${amountWhere}
        AND ${categoryWhere}
      ORDER BY trusted_amount_gbp DESC, date_issued DESC
      LIMIT $2`,
    [...categoryParams, penaltiesLimit],
  )) as unknown as Array<Record<string, unknown>>;

  const category: CategorySummary = {
    name: categoryName,
    slug,
    fineCount: Number(summary?.fine_count) || 0,
    totalAmount: Number(summary?.total_amount) || 0,
  };

  const topFirms: FirmSummary[] = topFirmRows.map((row: any) => ({
    name: isCyberConcept
      ? String(row.firm_individual)
      : normaliseFcaFineEntityName(
          row.firm_individual,
          row.case_source_url ? String(row.case_source_url) : null,
        ),
    slug: firmSlug(isCyberConcept
      ? String(row.firm_individual)
      : normaliseFcaFineEntityName(
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

// ---------------------------------------------------------------------------
// FCA-scoped firm hubs (`/fca-fines/firms/:slug`)
// ---------------------------------------------------------------------------

/**
 * Same indexability gate used for the cross-regulator `/firms/:slug` hub
 * (`MIN_FIRM_ACTIONS_FOR_INDEX` / `MIN_FIRM_TOTAL_FOR_INDEX_GBP` in
 * `scripts/prerender-seo.ts`). Kept here too so the FCA-scoped hub's gate
 * lives next to the data it gates, rather than only in the SSG script.
 */
export const FCA_FIRM_HUB_MIN_ACTIONS_FOR_INDEX = 2;
export const FCA_FIRM_HUB_MIN_TOTAL_FOR_INDEX_GBP = 10_000_000;

export interface FcaFirmHubFine {
  caseId: string;
  dateIssued: string | null;
  year: number;
  amount: number;
  breach: string | null;
  sourceUrl: string | null;
  casePath: string;
  /** false for amounts still awaiting RegActions' amount-review gate. */
  qualifiesForTotal: boolean;
}

export interface FcaFirmHubBreachBreakdown {
  name: string;
  count: number;
  totalAmount: number;
}

export interface FcaFirmHubDetails {
  slug: string;
  firm: string;
  /** Count of QUALIFYING fines only (excludes amount-review-pending rows). */
  fineCount: number;
  /** Sum of QUALIFYING fines only. */
  totalAmount: number;
  maxFine: number;
  earliestDate: string | null;
  latestDate: string | null;
  /** Every fine for this firm, newest first, including non-qualifying rows. */
  fines: FcaFirmHubFine[];
  breachBreakdown: FcaFirmHubBreachBreakdown[];
  indexable: boolean;
}

/**
 * Group already-fetched FCA monetary-case SEO rows into one hub per firm,
 * keyed by the SAME slug function the FCA case pages use
 * (`normaliseFcaFineFirmSlug`, applied upstream by
 * `mapFcaFineCaseRow`/`listFcaMonetaryCasesForSeo`) so `/fca-fines/firms/{slug}`
 * always matches the `{firmSlug}` segment in `/fca-fines/:year/:firmSlug/:caseId`.
 *
 * Pure and synchronous so both the API route (single slug) and the SSG script
 * (every firm, once) can share one grouping pass over one DB fetch.
 *
 * A firm with zero QUALIFYING fines (all rows pending amount review, or all
 * rows filtered out as a garbage/placeholder name) is omitted entirely — no
 * hub is emitted for it.
 */
export function groupFcaFirmHubs(
  cases: FcaFineCaseSeoRow[],
): Map<string, FcaFirmHubDetails> {
  const byFirm = new Map<string, { firm: string; fines: FcaFirmHubFine[] }>();

  for (const row of cases) {
    if (!row.firm || isGarbageFirmName(row.firm)) continue;
    const slug = row.firmSlug;
    if (!slug) continue;
    const qualifiesForTotal =
      row.amount > 0 && !row.indexabilityReasons.includes("amount_review_required");
    let casePath: string;
    try {
      casePath = buildFcaFineCasePath(row);
    } catch {
      continue; // Case ID/year did not pass the shared route contract; skip.
    }
    const entry = byFirm.get(slug) ?? { firm: row.firm, fines: [] };
    entry.fines.push({
      caseId: row.caseId,
      dateIssued: row.dateIssued || null,
      year: row.year,
      amount: row.amount,
      breach: row.breach,
      sourceUrl: row.sourceUrl,
      casePath,
      qualifiesForTotal,
    });
    byFirm.set(slug, entry);
  }

  const result = new Map<string, FcaFirmHubDetails>();
  for (const [slug, entry] of byFirm) {
    const qualifying = entry.fines.filter((f) => f.qualifiesForTotal);
    if (qualifying.length === 0) continue;

    const fines = [...entry.fines].sort((a, b) =>
      (b.dateIssued || "").localeCompare(a.dateIssued || ""),
    );
    const totalAmount = qualifying.reduce((sum, f) => sum + f.amount, 0);
    const maxFine = qualifying.reduce((max, f) => Math.max(max, f.amount), 0);
    const dates = qualifying
      .map((f) => f.dateIssued)
      .filter((d): d is string => Boolean(d))
      .sort();
    const earliestDate = dates[0] ?? null;
    const latestDate = dates[dates.length - 1] ?? null;

    const breachMap = new Map<string, { count: number; totalAmount: number }>();
    for (const f of qualifying) {
      const key = f.breach?.trim() || "Not classified";
      const current = breachMap.get(key) ?? { count: 0, totalAmount: 0 };
      current.count += 1;
      current.totalAmount += f.amount;
      breachMap.set(key, current);
    }
    const breachBreakdown = Array.from(breachMap.entries())
      .map(([name, v]) => ({ name, count: v.count, totalAmount: v.totalAmount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const indexable =
      qualifying.length >= FCA_FIRM_HUB_MIN_ACTIONS_FOR_INDEX ||
      totalAmount >= FCA_FIRM_HUB_MIN_TOTAL_FOR_INDEX_GBP;

    result.set(slug, {
      slug,
      firm: entry.firm,
      fineCount: qualifying.length,
      totalAmount,
      maxFine,
      earliestDate,
      latestDate,
      fines,
      breachBreakdown,
      indexable,
    });
  }
  return result;
}

let cachedFcaFirmHubs: { builtAt: number; map: Map<string, FcaFirmHubDetails> } | null = null;

/**
 * Every FCA firm hub, largest total first. Cached for `HUB_INDEX_TTL_MS` so a
 * single build (or a burst of API requests) doesn't refetch the whole FCA
 * monetary-case inventory per firm.
 */
export async function listFcaFirmHubs(): Promise<FcaFirmHubDetails[]> {
  const now = Date.now();
  if (cachedFcaFirmHubs && now - cachedFcaFirmHubs.builtAt < HUB_INDEX_TTL_MS) {
    return Array.from(cachedFcaFirmHubs.map.values()).sort(
      (a, b) => b.totalAmount - a.totalAmount,
    );
  }
  const cases = await listFcaMonetaryCasesForSeo();
  const map = groupFcaFirmHubs(cases);
  cachedFcaFirmHubs = { builtAt: now, map };
  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

/** Single FCA firm hub by its `/fca-fines/firms/:slug` slug, or null if unknown. */
export async function getFcaFirmFines(slug: string): Promise<FcaFirmHubDetails | null> {
  const trimmed = String(slug ?? "").trim();
  if (!trimmed) return null;
  const now = Date.now();
  if (cachedFcaFirmHubs && now - cachedFcaFirmHubs.builtAt < HUB_INDEX_TTL_MS) {
    return cachedFcaFirmHubs.map.get(trimmed) ?? null;
  }
  const all = await listFcaFirmHubs();
  return all.find((firm) => firm.slug === trimmed) ?? null;
}
