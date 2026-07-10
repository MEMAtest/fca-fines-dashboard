/**
 * Article Data Query Layer
 *
 * Queries enforcement data from PostgreSQL for AI article generation.
 * Uses the same DB patterns as server/db.ts (pg pool, tagged templates).
 */

import pg from 'pg';
import { resolveConnectionString, buildPgPoolConfig } from '../../server/db.js';
import { isVerifiedPenaltyAmount } from './editorialWorkflow.js';

const VERIFIED_PENALTY_SQL = `
  COALESCE(amount_gbp, amount_original, 0) > 0
  AND (COALESCE(breach_type, '') || ' ' || COALESCE(summary, ''))
      ~* '(fine|financial penalty|monetary penalty|civil penalty|penalised|penalized|geldbuße|geldbusse|bußgeld|bussgeld|ordnungsgeld)'
  AND (COALESCE(breach_type, '') || ' ' || COALESCE(summary, ''))
      !~* '(review|examination|investigation opened|consultation|tax receivable|assets under management|turnover|redress estimate)'
`;

export interface EnforcementRecord {
  id: string;
  regulator: string;
  firm_individual: string;
  amount: number;
  currency: string;
  date_issued: string;
  breach_type: string;
  summary: string;
  notice_url: string;
  source_url: string;
  amount_verified: boolean;
}

export interface RegulatorStats {
  regulator: string;
  action_count: number;
  total_fines: number;
  latest_action: string;
}

export interface DataContext {
  records: EnforcementRecord[];
  stats: RegulatorStats[];
  totalActions: number;
  totalFines: number;
  dateRange: { start: string; end: string };
  topRegulators: string[];
}

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = resolveConnectionString();
    if (!connectionString) {
      throw new Error('No DATABASE_URL found for article data queries');
    }
    pool = new pg.Pool(buildPgPoolConfig(connectionString));
  }
  return pool;
}

async function query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const client = await getPool().connect();
  try {
    await client.query('SET search_path TO public');
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Fetch recent enforcement actions (last N days) for timely roundup articles.
 */
export async function getTimelyData(days: number = 14): Promise<EnforcementRecord[]> {
  const rows = await query(`
    SELECT id::text, regulator, firm_individual,
           COALESCE(amount_gbp, amount_original, 0)::float as amount,
           'GBP'::text as currency, date_issued::text, breach_type,
           COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
           COALESCE(source_url, '') as source_url
    FROM all_regulatory_fines
    WHERE date_issued >= CURRENT_DATE - $1 * INTERVAL '1 day'
    ORDER BY date_issued DESC, amount_gbp DESC NULLS LAST
    LIMIT 25
  `, [days]);

  return rows.map(normalizeRecord);
}

/**
 * Fetch enforcement actions filtered by theme (breach type keywords).
 */
export async function getThematicData(keywords: string[]): Promise<EnforcementRecord[]> {
  const conditions = keywords
    .map((_, i) => `(breach_type ILIKE $${i + 1} OR summary ILIKE $${i + 1})`)
    .join(' OR ');

  const params = keywords.map(k => `%${k}%`);

  const rows = await query(`
    SELECT id::text, regulator, firm_individual,
           COALESCE(amount_gbp, amount_original, 0)::float as amount,
           'GBP'::text as currency, date_issued::text, breach_type,
           COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
           COALESCE(source_url, '') as source_url
    FROM all_regulatory_fines
    WHERE ${conditions}
    ORDER BY amount_gbp DESC NULLS LAST
    LIMIT 30
  `, params);

  return rows.map(normalizeRecord);
}

/**
 * Fetch aggregate stats per regulator.
 */
export async function getRegulatorStats(): Promise<RegulatorStats[]> {
  const rows = await query(`
    SELECT regulator, COUNT(*)::int as action_count,
           COALESCE(SUM(CASE WHEN ${VERIFIED_PENALTY_SQL} THEN COALESCE(amount_gbp, amount_original) ELSE 0 END), 0)::numeric as total_fines,
           MAX(date_issued)::text as latest_action
    FROM all_regulatory_fines
    GROUP BY regulator
    ORDER BY total_fines DESC
  `);

  return rows.map(r => ({
    regulator: String(r.regulator || ''),
    action_count: Number(r.action_count) || 0,
    total_fines: Number(r.total_fines) || 0,
    latest_action: String(r.latest_action || ''),
  }));
}

/**
 * Build full data context for article generation (timely or thematic).
 */
export async function buildDataContext(
  type: 'timely' | 'thematic',
  keywords?: string[]
): Promise<DataContext> {
  const records = type === 'timely' ? await getTimelyData(14) : await getThematicData(keywords || []);
  const regulatorStats = new Map<string, RegulatorStats>();
  for (const record of records) {
    const current = regulatorStats.get(record.regulator) || {
      regulator: record.regulator,
      action_count: 0,
      total_fines: 0,
      latest_action: record.date_issued,
    };
    current.action_count += 1;
    if (record.amount_verified) current.total_fines += record.amount;
    if (record.date_issued > current.latest_action) current.latest_action = record.date_issued;
    regulatorStats.set(record.regulator, current);
  }
  const stats = [...regulatorStats.values()].sort((a, b) => b.action_count - a.action_count);
  const totalActions = records.length;
  const totalFines = records.filter((record) => record.amount_verified).reduce((sum, record) => sum + record.amount, 0);

  const dates = records
    .map(r => r.date_issued)
    .filter(Boolean)
    .sort();

  return {
    records,
    stats,
    totalActions,
    totalFines,
    dateRange: {
      start: dates[0] || 'unknown',
      end: dates[dates.length - 1] || 'unknown',
    },
    topRegulators: stats.slice(0, 10).map(s => s.regulator),
  };
}

/**
 * Format records as a text table for the AI prompt.
 */
export function formatDataTable(records: EnforcementRecord[]): string {
  if (records.length === 0) return '(No enforcement records in this period)';

  const header = 'Regulator | Firm/Individual | Amount | Date | Breach Type | Summary';
  const separator = '---|---|---|---|---|---';
  const rows = records.map(r =>
    `${r.regulator} | ${r.firm_individual} | ${r.amount_verified ? formatAmount(r.amount) : 'Non-monetary or amount unverified'} | ${r.date_issued} | ${r.breach_type} | ${truncate(r.summary, 400)}`
  );

  return [header, separator, ...rows].join('\n');
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── Type-specific query interfaces ───────────────────────────────────────────

export interface MonthlyData {
  currentMonth: EnforcementRecord[];
  priorYearMonth: EnforcementRecord[];
  sectorBreakdown: Array<{ sector: string; count: number; totalAmount: number }>;
  monthName: string;
  year: number;
  month: number;
}

export interface ThematicData {
  records: EnforcementRecord[];
  regulatorAggregates: Array<{ regulator: string; count: number; total: number }>;
  yearAggregates: Array<{ year: number; count: number; total: number }>;
}

export interface PersonaData {
  records: EnforcementRecord[];
  regulatorBreakdown: Array<{ regulator: string; count: number; total: number }>;
  firmCategory: string;
}

export interface ComparisonData {
  regulatorA: { name: string; count: number; total: number; avgFine: number; topBreachType: string; topCases: EnforcementRecord[] };
  regulatorB: { name: string; count: number; total: number; avgFine: number; topBreachType: string; topCases: EnforcementRecord[] };
}

export interface ForensicData {
  topCase: EnforcementRecord | null;
  allCasesInRange: EnforcementRecord[];
  scope: string;
}

// ─── Monthly query ─────────────────────────────────────────────────────────────

export async function queryMonthlyData(year: number, month: number): Promise<MonthlyData> {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthName = monthNames[month - 1] ?? `Month ${month}`;

  const [current, prior, sectors] = await Promise.all([
    query(`
      SELECT id::text, firm_individual, COALESCE(amount, 0)::float as amount,
             'GBP'::text as currency,
             date_issued::text, breach_type, COALESCE(summary, '') as summary,
             'FCA' as regulator, COALESCE(final_notice_url, '') as notice_url,
             COALESCE(final_notice_url, '') as source_url
      FROM fca_fines
      WHERE year_issued = $1 AND month_issued = $2
      ORDER BY amount DESC NULLS LAST
    `, [year, month]),
    query(`
      SELECT id::text, firm_individual, COALESCE(amount, 0)::float as amount,
             'GBP'::text as currency,
             date_issued::text, breach_type, COALESCE(summary, '') as summary,
             'FCA' as regulator, COALESCE(final_notice_url, '') as notice_url,
             COALESCE(final_notice_url, '') as source_url
      FROM fca_fines
      WHERE year_issued = $1 AND month_issued = $2
      ORDER BY amount DESC NULLS LAST
    `, [year - 1, month]),
    query(`
      SELECT COALESCE(firm_category, 'Unknown') as sector,
             COUNT(*)::int as count,
             COALESCE(SUM(amount), 0)::float as total_amount
      FROM fca_fines
      WHERE year_issued = $1 AND month_issued = $2
      GROUP BY firm_category
      ORDER BY count DESC
    `, [year, month]),
  ]);

  return {
    currentMonth: current.map(normalizeRecord),
    priorYearMonth: prior.map(normalizeRecord),
    sectorBreakdown: sectors.map(r => ({
      sector: String(r.sector),
      count: Number(r.count),
      totalAmount: Number(r.total_amount),
    })),
    monthName,
    year,
    month,
  };
}

/** Check if enough FCA data exists for a given month (prerequisite gate). */
export async function checkMonthlyPrerequisite(year: number, month: number): Promise<{ met: boolean; count: number }> {
  const rows = await query(
    `SELECT COUNT(*)::int as n FROM fca_fines WHERE year_issued = $1 AND month_issued = $2`,
    [year, month],
  );
  const count = Number(rows[0]?.n ?? 0);
  return { met: count >= 3, count };
}

// ─── Thematic query ────────────────────────────────────────────────────────────

export async function queryThematicData(
  keywords: string[],
  regulators?: string[],
  yearsSince = 3,
): Promise<ThematicData> {
  const sinceYear = new Date().getFullYear() - yearsSince;
  const keywordConditions = keywords
    .map((_, i) => `(breach_type ILIKE $${i + 1} OR summary ILIKE $${i + 1})`)
    .join(' OR ');
  const keywordParams = keywords.map(k => `%${k}%`);

  let baseQuery = `
    SELECT id::text, regulator, firm_individual, COALESCE(amount_gbp, amount_original, 0)::float as amount,
           'GBP'::text as currency, date_issued::text, breach_type,
           COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
           COALESCE(source_url, '') as source_url
    FROM all_regulatory_fines
    WHERE (${keywordConditions}) AND year_issued >= $${keywords.length + 1}
  `;
  const baseParams: unknown[] = [...keywordParams, sinceYear];
  let regulatorFilterSql = '';

  if (regulators && regulators.length > 0) {
    regulatorFilterSql = ` AND regulator = ANY($${baseParams.length + 1}::text[])`;
    baseQuery += regulatorFilterSql;
    baseParams.push(regulators);
  }
  baseQuery += ' ORDER BY amount DESC NULLS LAST LIMIT 50';

  const [records, regAggs, yearAggs] = await Promise.all([
    query(baseQuery, baseParams),
    query(`
      SELECT regulator, COUNT(*)::int as count,
             COALESCE(SUM(CASE WHEN ${VERIFIED_PENALTY_SQL} THEN COALESCE(amount_gbp, amount_original) ELSE 0 END), 0)::float as total
      FROM all_regulatory_fines
      WHERE (${keywordConditions}) AND year_issued >= $${keywords.length + 1}${regulatorFilterSql}
      GROUP BY regulator ORDER BY total DESC LIMIT 15
    `, baseParams),
    query(`
      SELECT year_issued as year, COUNT(*)::int as count,
             COALESCE(SUM(CASE WHEN ${VERIFIED_PENALTY_SQL} THEN COALESCE(amount_gbp, amount_original) ELSE 0 END), 0)::float as total
      FROM all_regulatory_fines
      WHERE (${keywordConditions}) AND year_issued >= $${keywords.length + 1}${regulatorFilterSql}
      GROUP BY year_issued ORDER BY year_issued ASC
    `, baseParams),
  ]);

  return {
    records: records.map(normalizeRecord),
    regulatorAggregates: regAggs.map(r => ({
      regulator: String(r.regulator),
      count: Number(r.count),
      total: Number(r.total),
    })),
    yearAggregates: yearAggs.map(r => ({
      year: Number(r.year),
      count: Number(r.count),
      total: Number(r.total),
    })),
  };
}

// ─── Persona / sector query ────────────────────────────────────────────────────

export async function queryPersonaData(
  firmCategory: string,
  sectorKeywords: string[],
): Promise<PersonaData> {
  const kwConditions = sectorKeywords
    .map((_, i) => `(breach_type ILIKE $${i + 2} OR summary ILIKE $${i + 2} OR firm_individual ILIKE $${i + 2})`)
    .join(' OR ');
  const kwParams = sectorKeywords.map(k => `%${k}%`);

  const [records, breakdown] = await Promise.all([
    query(`
      SELECT id::text, regulator, firm_individual, COALESCE(amount_gbp, amount_original, 0)::float as amount,
             'GBP'::text as currency, date_issued::text, breach_type,
             COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
             COALESCE(source_url, '') as source_url
      FROM all_regulatory_fines
      WHERE (firm_category ILIKE $1 OR ${kwConditions})
      ORDER BY amount DESC NULLS LAST LIMIT 40
    `, [firmCategory, ...kwParams]),
    query(`
      SELECT regulator, COUNT(*)::int as count,
             COALESCE(SUM(CASE WHEN ${VERIFIED_PENALTY_SQL} THEN COALESCE(amount_gbp, amount_original) ELSE 0 END), 0)::float as total
      FROM all_regulatory_fines
      WHERE (firm_category ILIKE $1 OR ${kwConditions})
      GROUP BY regulator ORDER BY total DESC LIMIT 12
    `, [firmCategory, ...kwParams]),
  ]);

  return {
    records: records.map(normalizeRecord),
    regulatorBreakdown: breakdown.map(r => ({
      regulator: String(r.regulator),
      count: Number(r.count),
      total: Number(r.total),
    })),
    firmCategory,
  };
}

// ─── Comparison query ──────────────────────────────────────────────────────────

export async function queryComparisonData(
  [regA, regB]: [string, string],
  since = 2022,
): Promise<ComparisonData> {
  async function fetchRegStats(reg: string) {
    const [stats, topCases, topBreach] = await Promise.all([
      query(`
        SELECT COUNT(*)::int as count,
               COALESCE(SUM(CASE WHEN ${VERIFIED_PENALTY_SQL} THEN COALESCE(amount_gbp, amount_original) ELSE 0 END), 0)::float as total,
               COALESCE(AVG(CASE WHEN ${VERIFIED_PENALTY_SQL} THEN COALESCE(amount_gbp, amount_original) END), 0)::float as avg_fine
        FROM all_regulatory_fines
        WHERE regulator = $1 AND year_issued >= $2
      `, [reg, since]),
      query(`
        SELECT id::text, regulator, firm_individual, COALESCE(amount_gbp, amount_original, 0)::float as amount,
               'GBP'::text as currency, date_issued::text, breach_type,
               COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
               COALESCE(source_url, '') as source_url
        FROM all_regulatory_fines
        WHERE regulator = $1 AND year_issued >= $2
        ORDER BY amount DESC NULLS LAST LIMIT 5
      `, [reg, since]),
      query(`
        SELECT breach_type, COUNT(*)::int as n
        FROM all_regulatory_fines
        WHERE regulator = $1 AND year_issued >= $2 AND breach_type IS NOT NULL
        GROUP BY breach_type ORDER BY n DESC LIMIT 1
      `, [reg, since]),
    ]);
    return {
      name: reg,
      count: Number(stats[0]?.count ?? 0),
      total: Number(stats[0]?.total ?? 0),
      avgFine: Number(stats[0]?.avg_fine ?? 0),
      topBreachType: String(topBreach[0]?.breach_type ?? 'Unknown'),
      topCases: topCases.map(normalizeRecord),
    };
  }

  const [rA, rB] = await Promise.all([fetchRegStats(regA), fetchRegStats(regB)]);
  return { regulatorA: rA, regulatorB: rB };
}

// ─── Forensic query ────────────────────────────────────────────────────────────

export async function queryForensicData(
  scope: "biggest-fine" | "biggest-aml" | "biggest-greenwashing",
  dateRange: [string, string],
  breachKeywords?: string[],
): Promise<ForensicData> {
  const [from, to] = dateRange;
  let whereClause = `date_issued BETWEEN $1 AND $2`;
  const params: unknown[] = [from, to];

  if (scope === "biggest-aml") {
    whereClause += ` AND (breach_type ILIKE '%AML%' OR breach_type ILIKE '%money laundering%' OR summary ILIKE '%AML%' OR summary ILIKE '%money laundering%')`;
  } else if (scope === "biggest-greenwashing" && breachKeywords && breachKeywords.length > 0) {
    const kwConditions = breachKeywords
      .map((_, i) => `(breach_type ILIKE $${i + 3} OR summary ILIKE $${i + 3})`)
      .join(' OR ');
    whereClause += ` AND (${kwConditions})`;
    params.push(...breachKeywords.map(k => `%${k}%`));
  }

  const namedFirmClause = `AND firm_individual NOT IN ('Mr', 'Unknown', '', 'N/A') AND firm_individual IS NOT NULL AND length(trim(firm_individual)) > 3`;
  const validAmountClause = `AND amount_gbp IS NOT NULL AND amount_gbp > 0 AND amount_gbp != 'NaN'::float`;
  const verifiedPenaltyClause = `AND (
    breach_type ~* '(fine|financial penalty|monetary penalty|geldbuße|geldbusse|bußgeld|bussgeld|ordnungsgeld)'
    OR summary ~* '(fined|financial penalty|monetary penalty|geldbuße|geldbusse|bußgeld|bussgeld|ordnungsgeld)'
  ) AND summary !~* '(review|examination|investigation opened|tax receivable|assets under management|turnover|prüfung eingeleitet|leitet eine prüfung)'`;
  const [topRows, allRows] = await Promise.all([
    query(`
      SELECT id::text, regulator, firm_individual, amount_gbp::float as amount,
             'GBP'::text as currency, date_issued::text, breach_type,
             COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
             COALESCE(source_url, '') as source_url
      FROM all_regulatory_fines
      WHERE ${whereClause} ${namedFirmClause} ${validAmountClause} ${verifiedPenaltyClause}
      ORDER BY amount_gbp DESC NULLS LAST LIMIT 1
    `, params),
    query(`
      SELECT id::text, regulator, firm_individual, COALESCE(amount_gbp, amount_original, 0)::float as amount,
             'GBP'::text as currency, date_issued::text, breach_type,
             COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
             COALESCE(source_url, '') as source_url
      FROM all_regulatory_fines
      WHERE ${whereClause} ${verifiedPenaltyClause}
      ORDER BY amount DESC NULLS LAST LIMIT 20
    `, params),
  ]);

  return {
    topCase: topRows[0] ? normalizeRecord(topRows[0]) : null,
    allCasesInRange: allRows.map(normalizeRecord),
    scope,
  };
}

/** Check if forensic prerequisites are met (≥10 qualifying rows in date range). */
export async function checkForensicPrerequisite(
  dateRange: [string, string],
  breachKeywords?: string[],
): Promise<{ met: boolean; count: number }> {
  const [from, to] = dateRange;
  let whereClause = `date_issued BETWEEN $1 AND $2`;
  const params: unknown[] = [from, to];

  if (breachKeywords && breachKeywords.length > 0) {
    const kwConditions = breachKeywords
      .map((_, i) => `(breach_type ILIKE $${i + 3} OR summary ILIKE $${i + 3})`)
      .join(' OR ');
    whereClause += ` AND (${kwConditions})`;
    params.push(...breachKeywords.map(k => `%${k}%`));
  }

  const rows = await query(
    `SELECT COUNT(*)::int as n FROM all_regulatory_fines WHERE ${whereClause}`,
    params,
  );
  const count = Number(rows[0]?.n ?? 0);
  return { met: count >= 3, count };
}

// ─── Format helpers for generator prompt tables ────────────────────────────────

export function formatMonthlyTable(data: MonthlyData): string {
  if (data.currentMonth.length === 0) {
    return `No enforcement actions recorded for ${data.monthName} ${data.year}.`;
  }
  const header = '| Firm/Individual | Amount | Date | Breach Type |';
  const sep    = '|---|---|---|---|';
  const rows = data.currentMonth.map(r =>
    `| ${r.firm_individual} | ${r.amount_verified ? formatAmount(r.amount) : 'Non-monetary'} | ${r.date_issued} | ${r.breach_type || '-'} |`,
  );
  return [header, sep, ...rows].join('\n');
}

export function formatComparisonTable(data: ComparisonData): string {
  const { regulatorA: a, regulatorB: b } = data;
  return [
    `| Metric | ${a.name} | ${b.name} |`,
    `|--------|${'-'.repeat(a.name.length + 2)}|${'-'.repeat(b.name.length + 2)}|`,
    `| Total actions (since ${new Date().getFullYear() - 3}) | ${a.count} | ${b.count} |`,
    `| Total fines | ${formatAmount(a.total)} | ${formatAmount(b.total)} |`,
    `| Average fine | ${formatAmount(a.avgFine)} | ${formatAmount(b.avgFine)} |`,
    `| Top breach type | ${a.topBreachType} | ${b.topBreachType} |`,
  ].join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeRecord(r: Record<string, unknown>): EnforcementRecord {
  const base = {
    id: String(r.id || `${r.regulator || 'unknown'}:${r.firm_individual || 'unknown'}:${r.date_issued || 'unknown'}`),
    regulator: String(r.regulator || ''),
    firm_individual: String(r.firm_individual || ''),
    amount: Number(r.amount) || 0,
    currency: String(r.currency || 'GBP'),
    date_issued: String(r.date_issued || ''),
    breach_type: String(r.breach_type || ''),
    summary: String(r.summary || ''),
    notice_url: String(r.notice_url || ''),
    source_url: String(r.source_url || ''),
  };
  return { ...base, amount_verified: isVerifiedPenaltyAmount(base) };
}

function formatAmount(amount: number): string {
  if (!amount) return 'N/A';
  if (amount >= 1_000_000_000) return `£${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `£${(amount / 1_000).toFixed(0)}K`;
  return `£${amount.toLocaleString()}`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ─── Statistical summary ───────────────────────────────────────────────────────

export interface StatisticalSummary {
  totalRecords: number;
  totalFines: string;
  mean: string;
  median: string;
  p75: string;
  outliers: EnforcementRecord[];
  yoyDelta: string | null;
  topFirms: string;
  yearBreakdown: string;
}

/**
 * Compute statistical summary for a set of enforcement records.
 * Injected into generator prompts as structured context for the AI.
 */
export function buildStatisticalSummary(
  records: EnforcementRecord[],
  yearAggs?: Array<{ year: number; count: number; total: number }>,
): string {
  if (records.length === 0) return '(No statistical summary available — no records)';

  const amounts = records
    .filter(r => r.amount_verified)
    .map(r => r.amount)
    .filter(a => a > 0 && !isNaN(a))
    .sort((a, b) => a - b);

  if (amounts.length === 0) return `(${records.length} records — no monetary amounts)`;

  const total = amounts.reduce((s, a) => s + a, 0);
  const mean = total / amounts.length;
  const median = amounts.length % 2 === 0
    ? (amounts[amounts.length / 2 - 1]! + amounts[amounts.length / 2]!) / 2
    : amounts[Math.floor(amounts.length / 2)]!;
  const p75idx = Math.floor(amounts.length * 0.75);
  const p75 = amounts[p75idx] ?? amounts[amounts.length - 1]!;

  const outliers = records.filter(r => r.amount_verified && r.amount > p75 * 3);

  const topFirms = records
    .filter(r => r.firm_individual && r.firm_individual.length > 3 && !['Mr', 'Unknown', 'N/A'].includes(r.firm_individual))
    .slice(0, 10)
    .map(r => `${r.firm_individual} (${r.regulator}, ${r.amount_verified ? formatAmount(r.amount) : 'non-monetary'}, ${r.date_issued.slice(0, 7)})`)
    .join('\n  ');

  let yoyDelta: string | null = null;
  if (yearAggs && yearAggs.length >= 2) {
    const sorted = [...yearAggs].sort((a, b) => a.year - b.year);
    const last = sorted[sorted.length - 1]!;
    const prev = sorted[sorted.length - 2]!;
    if (prev.total > 0) {
      const pct = ((last.total - prev.total) / prev.total * 100).toFixed(0);
      yoyDelta = `${last.year} vs ${prev.year}: ${last.total > prev.total ? '+' : ''}${pct}% (${formatAmount(prev.total)} → ${formatAmount(last.total)})`;
    }
  }

  const lines = [
    `STATISTICAL SUMMARY (${records.length} enforcement records):`,
    `  Total fines: ${formatAmount(total)}`,
    `  Mean fine: ${formatAmount(mean)} | Median: ${formatAmount(median)} | 75th percentile: ${formatAmount(p75)}`,
    outliers.length > 0 ? `  Outlier cases (>3× p75, ${formatAmount(p75 * 3)}+): ${outliers.map(r => `${r.firm_individual} ${formatAmount(r.amount)}`).join(', ')}` : '',
    yoyDelta ? `  Year-on-year: ${yoyDelta}` : '',
    topFirms ? `\nKEY SOURCE CASES (${Math.min(10, records.length)} shown, monetary values only where verified):\n  ${topFirms}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Format records as full-text "Key Case Summaries" for injection into generator prompts.
 * Unlike formatDataTable (which truncates summaries to 100 chars), this provides full context.
 */
export function buildKeyCaseSummaries(records: EnforcementRecord[], limit = 10): string {
  const top = records
    .filter(r => r.firm_individual && r.firm_individual.length > 3 && !['Mr', 'Unknown', 'N/A'].includes(r.firm_individual))
    .slice(0, limit);

  if (top.length === 0) return '(No named cases available)';

  return top.map((r, i) => [
    `Case ${i + 1}: ${r.firm_individual}`,
    `  Regulator: ${r.regulator}`,
    `  Amount: ${r.amount_verified ? formatAmount(r.amount) : 'Non-monetary or not verified as a penalty'}`,
    `  Date: ${r.date_issued}`,
    `  Breach: ${r.breach_type || 'Not specified'}`,
    `  Detail: ${r.summary || 'No summary available'}`,
  ].join('\n')).join('\n\n');
}
