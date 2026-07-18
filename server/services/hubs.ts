import type { FineRecord } from "../../src/types.js";
import { getSqlClient } from "../db.js";
import { firmSlug, hubSlug } from "../utils/slugify.js";

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
let cachedFirmSlugMap: { builtAt: number; map: Map<string, string> } | null =
  null;
let cachedCategorySlugMap: {
  builtAt: number;
  map: Map<string, string>;
} | null = null;
let cachedSectorSlugMap: { builtAt: number; map: Map<string, string> } | null =
  null;

async function getFirmSlugMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedFirmSlugMap && now - cachedFirmSlugMap.builtAt < HUB_INDEX_TTL_MS) {
    return cachedFirmSlugMap.map;
  }

  const sql = getSqlClient();
  const rows =
    (await sql`SELECT DISTINCT firm_individual FROM fca_fines`) as any[];
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
  const rows = (await sql`
    SELECT
      cat.category AS category,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(f.amount), 0)::float8 AS total_amount
    FROM fca_fines f
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(f.breach_categories) = 'string'
           THEN (f.breach_categories #>> '{}')::jsonb
           ELSE f.breach_categories END
    ) AS cat(category)
    GROUP BY cat.category
    ORDER BY total_amount DESC, fine_count DESC, cat.category ASC
  `) as any[];

  return rows.map((row: any) => ({
    name: String(row.category),
    slug: hubSlug(String(row.category)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));
}

export async function listYears(): Promise<YearSummary[]> {
  const sql = getSqlClient();
  const rows = (await sql`
    SELECT
      year_issued::int AS year,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount
    FROM fca_fines
    GROUP BY year_issued
    ORDER BY year DESC
  `) as any[];

  return rows.map((row: any) => ({
    year: Number(row.year) || 0,
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
  }));
}

export async function listSectors(): Promise<SectorSummary[]> {
  const sql = getSqlClient();
  const rows = (await sql`
    SELECT
      firm_category AS sector,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount
    FROM fca_fines
    WHERE firm_category IS NOT NULL AND firm_category <> ''
    GROUP BY firm_category
    ORDER BY total_amount DESC, fine_count DESC, firm_category ASC
  `) as any[];

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
  const rows = (await sql`
    SELECT
      firm_individual,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    GROUP BY firm_individual
    ORDER BY total_amount DESC, fine_count DESC, firm_individual ASC
    LIMIT ${clamped}
  `) as any[];

  return rows.map((row: any) => ({
    name: String(row.firm_individual),
    slug: firmSlug(String(row.firm_individual)),
    fineCount: Number(row.fine_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
    latestDate: row.latest_date ? String(row.latest_date) : null,
  }));
}

export interface RegulatorTopFine {
  firm: string;
  dateIssued: string | null;
  amount: number;
  currency: string;
  breach: string | null;
  sourceUrl: string | null;
}

/**
 * Display-sanity heuristics for the "Largest enforcement actions" table.
 *
 * These filters apply ONLY to the top-N showcase table baked into regulator
 * hub pages. Rows excluded here remain in the database, the full fines list,
 * and search — only the static highlight table is affected.
 *
 * Rules (conservative — when in doubt, keep the row):
 *   1. Name is too short (<= 2 chars, e.g. "J.P" truncated to "J.P" is 3 chars
 *      but that trailing dot makes it truncated; we catch it separately).
 *   2. Name contains obvious verb-phrase tokens that indicate a headline sentence
 *      rather than a party name: "to Pay", " fines ", " fined ", " charged ",
 *      "overcharged", "finds ", "ruled", "to Return", "to Appeal", "Paying",
 *      "Agrees to", "Sanctions on", "Fines Against", "Fine Imposition on",
 *      "Imposed on", "Received a Warning", "admits to illegal/cartel",
 *      "increases fine", "commence prosecution", "Misconduct Tribunal", and
 *      document-title colon forms (": an open letter", ": guidance", etc.).
 *   3. Name is a well-known placeholder: "Unknown", "Undisclosed", "N/A", "N/a",
 *      and exact-match DNB/CMVM anonymisation tokens ("Onderneming",
 *      "Bank N.V.", "Netherlands B.V.", "dois arguidos").
 *      Deliberate keeps (conservative): "Personen" (Danish anonymisation),
 *      named companies whose legal form ends in "N.V." or "B.V." (e.g.
 *      "Volksbank N.V.", "Aegon Bank N.V.") are NOT excluded because they
 *      are real firm names, not bare generic tokens.
 *      Note: "dois arguidos" (Portuguese "two defendants") was previously listed
 *      as a deliberate keep, but the reviewer overturned that: it is a generic
 *      legal term, not a firm name. Excluding it means CMVM renders no fines
 *      table, which is the correct graceful empty state.
 *   4. Name matches a date-shaped action title like "Enforcement Action YYYY-MM-DD".
 *   5. Name starts with a regulator's own name (e.g. "CMA finds …", "CMVM divulgou …",
 *      "The FSC Imposed …") — these are press-release titles, not party names.
 *   6. Name is a press-release boilerplate snippet (e.g. starts with "interviews are").
 *   7. Name is an HTTP error code string (e.g. "403 ERROR").
 *   8. Name appears to be a truncated navigation menu fragment (starts with
 *      lowercase and contains multiple unrelated Dutch/administrative terms joined
 *      by spaces without logical connectives, caught by the >80-char heuristic
 *      combined with verb-phrase absence — but we surface it via the "starts
 *      with lowercase" check for the specific AFM truncation pattern).
 *   9. Name ends with a bare hanging connective word (e.g. "water tank firms over"),
 *      indicating a truncated sentence fragment.
 *  10. Name is paragraph-scale (>= 180 chars) — a scraped press-release
 *      paragraph, never a party name (observed from FMA-AT).
 *
 * False-exclusion risk: legitimate firm names that are long phrases (e.g.
 * "Citigroup Global Markets Limited, Citibank N.A. London Branch and Citibank
 * Europe Plc") are intentionally NOT excluded because they contain no verb
 * phrases and have no placeholder tokens. The heuristics are applied as an
 * OR of specific patterns, not a name-scale length cut-off (rule 10 only
 * fires at paragraph scale, roughly double the longest known real name).
 */
export function isGarbageFirmName(name: string): boolean {
  if (!name || name.trim().length === 0) return true;

  const n = name.trim();

  // Rule 7: HTTP error strings
  if (/^\d{3}\s+ERROR$/i.test(n)) return true;

  // Rule 3: known placeholder values — exact matches only to avoid killing real
  // firm names like "Volksbank N.V." or "Jmond Corporate Solutions B.V.".
  // "dois arguidos" (Portuguese "two defendants") is a CMVM generic legal term,
  // not a firm name; excluding it yields a graceful empty table for CMVM.
  if (/^(Unknown|Undisclosed|N\/A|N\/a|Onderneming|Bank N\.V\.|Netherlands B\.V\.|dois arguidos)$/i.test(n)) return true;

  // Rule 4: date-shaped enforcement action titles ("Enforcement Action YYYY-MM-DD")
  if (/^Enforcement Action \d{4}-\d{2}-\d{2}$/i.test(n)) return true;

  // Rule 6: press-release boilerplate snippets
  if (/^interviews are coordinated by/i.test(n)) return true;

  // Rule 2: headline verb phrases that indicate a sentence, not a party name.
  // These appear inside the string (not anchored) because headlines embed the
  // verb mid-sentence. We check for word-boundary variants to avoid false
  // positives on firm names like "Payday Lender Penalised".
  const verbPhrases = [
    /\bto Pay\b/i,
    /\bto Return\b/i,
    /\bto Appeal\b/i,
    / fines /i,
    / fined /i,
    / charged /i,
    /overcharged/i,
    /\bfinds \b/i,
    /\bruled\b/i,
    /\bOrders?\b.*\bJudgment\b/i, // "Court Orders $1 Billion Judgment …"
    /\bReaches? Settlement\b/i, // "Petrobras Reaches Settlement With SEC …"
    /\bSettles\b.{0,40}\b(FCPA|Charges?|Violations?)\b/i, // "X Settles FCPA Violations"
    /\bdivulgou\b/i, // Portuguese CMVM press-release titles ("divulgou hoje")
    /\bproferiu\b/i, // Portuguese CMVM decision titles ("proferiu decisão")
    /^Contraorden/i, // Portuguese quarter-report section titles (CMVM)
    /^Decisão do Conselho\b/i, // Portuguese formal decision titles
    /\bSanctions? on\b/i, // TWFSC action-phrase titles (singular + plural: "Sanction on", "Sanctions on")
    /\bDisposition Imposed on\b/i,
    /\bDisciplinary [Aa]ction\b/i, // TWFSC action-phrase titles
    /\bDisciplinary [Cc]ase\b/i,
    /\brevokes the licen/i, // SFC "revokes the licence of …"
    /\bdealings in the shares/i, // SFC sentence-as-name
    /\bImposed\b.*\bSanctions\b/i, // TWFSC bulk-action titles
    /\blessons learnt\b/i, // CMA case-study title
    // --- patterns added to close 16 filter escapes found in prod review ---
    /\bPaying\b/i, // SEC: "Teva Pharmaceutical Paying $519M …", "Oil Services Company Paying $140M …"
    /\bAgrees? to\b/i, // SEC: "Barclays Agrees to a $361M Settlement …" (missed by Reaches Settlement)
    /\bFines? Against\b/i, // TWFSC: "Fines Against the Person Responsible …"
    /\bFine Imposition on\b/i, // TWFSC: "Fine Imposition on Person Responsible …"
    /\bImposed on\b/i, // TWFSC: "NT$1,200,000 Fine and Warning Imposed on …"
    /\bReceived a Warning\b/i, // TWFSC: "Capital Investment Trust Corp. Received a Warning …"
    /\badmit(s|ted)?\s+(to\s+)?(an?\s+)?(illegal|cartel)/i, // CMA: "Two UK roofing lead firms admit to illegal cartel"
    /\bincreases fine\b/i, // CMA: "CAT increases fine after musical instrument firm …"
    /:\s*(an?\s+)?(open letter|guidance|consultation|case study)\b/i, // CMA: "Restricting resale prices: an open letter …"
    /^commence prosecution\b/i, // SFC: "commence prosecution in securities fraud case …" (starts lowercase)
    /\bMisconduct Tribunal\b/i, // SFC: "Market Misconduct Tribunal sanctions Magic Holdings …"
    // --- residue found by post-fix dist sweep of all baked hub tables ---
    /\bSanctioned\b/i, // TWFSC: "Concord Futures Corp. Sanctioned", "Masterlink Futures Corp.,Ltd and Its Associated Person Sanctioned"
    /\bDisciplinary Procedures?\b/i, // TWFSC: "Disciplinary Procedures Against Asia Pacific International Securities …"
    /\bto Settle\b/i, // SEC: "Bank of America Admits Disclosure Failures to Settle SEC Charges"
    /\bhereby announces\b/i, // FMA-AT: press-release paragraph scraped as the party name
    /\bdue to (a )?breach of\b/i, // FMA-AT: "Lang & Schwarz AG due to breach of the ban on market manipulation …"
  ];
  for (const re of verbPhrases) {
    if (re.test(n)) return true;
  }

  // Rule 5: name starts with a known regulator acronym followed by a verb
  // (catches "CMA finds …", "CMA decision …", "CMA to appeal …",
  //  "The FSC Imposed …", "CMVM divulgou …").
  if (/^(?:CMA|CMVM|FSC|FCA|SEC|DNB|AFM)\b[^A-Z]/i.test(n)) return true;
  // Note: no /i flag here — [A-Z]{2,4} must be uppercase-only to catch "The FSC",
  // "The FCA", "The SEC" etc., while keeping "The Bank of Nova Scotia" (mixed case).
  if (/^The [A-Z]{2,4} /.test(n)) return true;

  // Rule 1 + truncation: very short names that look like truncated strings.
  // "J.P" (3 chars, ends with dot) is a BaFin scraper truncation artifact.
  // We match the specific pattern: 1-4 chars total, ends with "." and no
  // space — distinguishes it from legitimate abbreviations that end mid-word.
  if (/^[A-Z]\.[A-Z]\.?$/.test(n) && !n.includes(" ")) return true;

  // Rule 9: truncated sentence fragments ending in a bare hanging connective
  // word — indicates the scraper caught a partial sentence, not a party name.
  //
  // Design notes:
  //   • Space lookbehind ((?<= )) ensures we only match full standalone words,
  //     not abbreviation suffixes like "N.A" or "S.A" (the 'A' is preceded by '.').
  //   • Negative comma+space lookbehind ((?<!, )) preserves the OCC/FDIC naming
  //     convention "BANK NAME, THE" where the article is appended with a comma —
  //     those are legitimate legal entity names, not sentence fragments.
  //   • "a" and "an" are intentionally omitted: a single capital "A" at end of
  //     string is indistinguishable from an initial (e.g. "Air France-KLM and Mr A",
  //     "Saxo Bank A"). Those names must be kept.
  //   • "Pfizer and Flynn" (ends "Flynn") and "The Bank of Nova Scotia" (ends
  //     "Scotia") are safely kept — neither ends with a listed connective word.
  if (/(?<!, )(?<= )(over|and|the|of|to|for|with)$/i.test(n)) return true;

  // Rule 10: paragraph-scale blobs. Long legitimate multi-entity names exist
  // (e.g. the ~93-char "The Bank of New York Mellon London Branch & The Bank of
  // New York Mellon International Limited"), so this is NOT a name-scale
  // cut-off — but nothing at >= 180 chars is a party name; that is a scraped
  // press-release paragraph (observed from FMA-AT).
  if (n.length >= 180) return true;

  return false;
}

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
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(MAX(amount), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    WHERE firm_individual = ${firmName}
  `) as any[];
  const summary = summaryRows[0];

  const clamped = Math.max(1, Math.min(limit, 5000));
  const records = (await sql(
    `
      SELECT fine_reference, firm_individual, firm_category, regulator,
             final_notice_url, summary, breach_type, breach_categories,
             amount, date_issued::text AS date_issued, year_issued, month_issued
      FROM fca_fines
      WHERE firm_individual = $1
      ORDER BY date_issued DESC, amount DESC
      LIMIT $2
    `,
    [firmName, clamped],
  )) as unknown as FineRecord[];

  return {
    name: firmName,
    slug,
    fineCount: Number(summary?.fine_count) || 0,
    totalAmount: Number(summary?.total_amount) || 0,
    maxFine: Number(summary?.max_fine) || 0,
    earliestDate: summary?.earliest_date ? String(summary.earliest_date) : null,
    latestDate: summary?.latest_date ? String(summary.latest_date) : null,
    records,
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
  const catFilter = `(CASE WHEN jsonb_typeof(breach_categories) = 'string'
    THEN (breach_categories #>> '{}')::jsonb ELSE breach_categories END)`;

  const summaryRows = (await sql(
    `SELECT
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(MAX(amount), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    WHERE breach_categories IS NOT NULL AND ${catFilter} ? $1`,
    [categoryName],
  )) as any[];
  const summary = summaryRows[0];

  const firmsLimit = Math.max(1, Math.min(limitFirms, 50));
  const topFirmRows = (await sql(
    `SELECT
      firm_individual,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    WHERE breach_categories IS NOT NULL AND ${catFilter} ? $1
    GROUP BY firm_individual
    ORDER BY total_amount DESC, fine_count DESC, firm_individual ASC
    LIMIT $2`,
    [categoryName, firmsLimit],
  )) as any[];

  const penaltiesLimit = Math.max(1, Math.min(limitPenalties, 50));
  const penalties = (await sql(
    `SELECT fine_reference, firm_individual, firm_category, regulator,
             final_notice_url, summary, breach_type, breach_categories,
             amount, date_issued::text AS date_issued, year_issued, month_issued
      FROM fca_fines
      WHERE breach_categories IS NOT NULL AND ${catFilter} ? $1
      ORDER BY amount DESC, date_issued DESC
      LIMIT $2`,
    [categoryName, penaltiesLimit],
  )) as unknown as FineRecord[];

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
    topPenalties: penalties,
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
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(MAX(amount), 0)::float8 AS max_fine,
      MIN(date_issued)::text AS earliest_date,
      MAX(date_issued)::text AS latest_date
    FROM fca_fines
    WHERE firm_category = ${sectorName}
  `) as any[];
  const summary = summaryRows[0];

  const clampedBreaches = Math.max(1, Math.min(limitBreaches, 50));
  const breachRows = (await sql`
    SELECT
      COALESCE(cat.category, 'Unclassified') AS category,
      COUNT(*)::int AS fine_count,
      COALESCE(SUM(f.amount), 0)::float8 AS total_amount
    FROM fca_fines f
    LEFT JOIN LATERAL (
      SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(f.breach_categories) = 'string'
             THEN (f.breach_categories #>> '{}')::jsonb
             ELSE f.breach_categories END
      ) AS category
    ) AS cat ON TRUE
    WHERE f.firm_category = ${sectorName}
    GROUP BY category
    ORDER BY total_amount DESC, fine_count DESC, category ASC
    LIMIT ${clampedBreaches}
  `) as any[];

  const penaltiesLimit = Math.max(1, Math.min(limitPenalties, 50));
  const penalties = (await sql(
    `
      SELECT fine_reference, firm_individual, firm_category, regulator,
             final_notice_url, summary, breach_type, breach_categories,
             amount, date_issued::text AS date_issued, year_issued, month_issued
      FROM fca_fines
      WHERE firm_category = $1
      ORDER BY amount DESC, date_issued DESC
      LIMIT $2
    `,
    [sectorName, penaltiesLimit],
  )) as unknown as FineRecord[];

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
    topPenalties: penalties,
  };
}
