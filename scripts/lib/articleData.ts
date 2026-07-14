/**
 * Article Data Query Layer
 *
 * Queries enforcement data from PostgreSQL for AI article generation.
 * Uses the same DB patterns as server/db.ts (pg pool, tagged templates).
 */

import pg from 'pg';
import { resolveConnectionString, buildPgPoolConfig } from '../../server/db.js';
import { isOfficialRegulatorySource, isVerifiedPenaltyAmount } from './editorialWorkflow.js';

const GBP_AMOUNT_SQL = `CASE
  WHEN NULLIF(amount_gbp, 'NaN'::numeric) IS NOT NULL AND NULLIF(amount_gbp, 'NaN'::numeric) > 0 THEN NULLIF(amount_gbp, 'NaN'::numeric)
  WHEN UPPER(COALESCE(currency, '')) = 'GBP' THEN NULLIF(amount_original, 'NaN'::numeric)
  ELSE NULL
END`;

const EVIDENCE_AMOUNT_COLUMNS = `
  COALESCE(NULLIF(amount_original, 'NaN'::numeric), NULLIF(amount_gbp, 'NaN'::numeric), 0)::float as amount,
  CASE
    WHEN NULLIF(amount_original, 'NaN'::numeric) IS NOT NULL THEN COALESCE(NULLIF(UPPER(currency), ''), 'UNKNOWN')
    WHEN NULLIF(amount_gbp, 'NaN'::numeric) IS NOT NULL THEN 'GBP'
    ELSE COALESCE(NULLIF(UPPER(currency), ''), 'UNKNOWN')
  END::text as currency,
  COALESCE(${GBP_AMOUNT_SQL}, 0)::float as amount_gbp,
`;

const VERIFIED_PENALTY_SQL = `
  COALESCE(NULLIF(amount_original, 'NaN'::numeric), NULLIF(amount_gbp, 'NaN'::numeric), 0) > 0
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
  amount_gbp: number;
  date_issued: string;
  breach_type: string;
  summary: string;
  notice_url: string;
  source_url: string;
  amount_verified: boolean;
  raw_firm_individual?: string;
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
           ${EVIDENCE_AMOUNT_COLUMNS}
           date_issued::text, breach_type,
           COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
           COALESCE(source_url, '') as source_url
    FROM all_regulatory_fines
    WHERE date_issued >= CURRENT_DATE - $1 * INTERVAL '1 day'
    ORDER BY date_issued DESC, amount_gbp DESC NULLS LAST
    LIMIT 25
  `, [days]);

  return prepareEvidenceRecords(rows.map(normalizeRecord));
}

/**
 * Fetch enforcement actions filtered by theme (breach type keywords).
 */
export async function getThematicData(keywords: string[]): Promise<EnforcementRecord[]> {
  if (keywords.length === 0) return [];
  const conditions = keywords
    .map((_, i) => `(breach_type ILIKE $${i + 1} OR summary ILIKE $${i + 1})`)
    .join(' OR ');

  const params = keywords.map(k => `%${k}%`);

  const rows = await query(`
    SELECT id::text, regulator, firm_individual,
           ${EVIDENCE_AMOUNT_COLUMNS}
           date_issued::text, breach_type,
           COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
           COALESCE(source_url, '') as source_url
    FROM all_regulatory_fines
    WHERE ${conditions}
    ORDER BY date_issued DESC
    LIMIT 120
  `, params);

  return selectEvidenceSample(prepareEvidenceRecords(rows.map(normalizeRecord), keywords), 30);
}

/**
 * Fetch aggregate stats per regulator.
 */
export async function getRegulatorStats(): Promise<RegulatorStats[]> {
  const rows = await query(`
    SELECT regulator, COUNT(*)::int as action_count,
           COALESCE(SUM(CASE WHEN ${VERIFIED_PENALTY_SQL} THEN ${GBP_AMOUNT_SQL} ELSE 0 END), 0)::numeric as total_fines,
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
    if (record.amount_verified) current.total_fines += record.amount_gbp;
    if (record.date_issued > current.latest_action) current.latest_action = record.date_issued;
    regulatorStats.set(record.regulator, current);
  }
  const stats = [...regulatorStats.values()].sort((a, b) => b.action_count - a.action_count);
  const totalActions = records.length;
  const totalFines = records.filter((record) => record.amount_verified).reduce((sum, record) => sum + record.amount_gbp, 0);

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

  const header = 'Record ID | Regulator | Firm/Individual | Amount | Date | Breach Type | Summary | Official Source';
  const separator = '---|---|---|---|---|---|---|---';
  const rows = records.map((r) => {
    const breach = redactUnverifiedMonetaryFigures(r.breach_type);
    const summary = redactUnverifiedMonetaryFigures(r.summary);
    const amount = r.amount_verified
      ? `${formatEvidenceAmount(r.amount, r.currency)} (exact source amount: ${r.currency} ${r.amount.toLocaleString('en-GB')})`
      : 'NOT VERIFIED — do not state a monetary figure for this record';
    return [
      r.id,
      r.regulator,
      redactUnverifiedMonetaryFigures(r.firm_individual),
      amount,
      r.date_issued,
      breach,
      truncate(summary, 400),
      evidenceSourceUrl(r),
    ].map(sanitiseTableCell).join(' | ');
  });

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
             'GBP'::text as currency, COALESCE(amount, 0)::float as amount_gbp,
             date_issued::text, breach_type, COALESCE(summary, '') as summary,
             'FCA' as regulator, COALESCE(final_notice_url, '') as notice_url,
             COALESCE(final_notice_url, '') as source_url
      FROM fca_fines
      WHERE year_issued = $1 AND month_issued = $2
      ORDER BY amount DESC NULLS LAST
    `, [year, month]),
    query(`
      SELECT id::text, firm_individual, COALESCE(amount, 0)::float as amount,
             'GBP'::text as currency, COALESCE(amount, 0)::float as amount_gbp,
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
    currentMonth: prepareEvidenceRecords(current.map(normalizeRecord)),
    priorYearMonth: prepareEvidenceRecords(prior.map(normalizeRecord)),
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
  if (keywords.length === 0) {
    return { records: [], regulatorAggregates: [], yearAggregates: [] };
  }
  const sinceYear = new Date().getFullYear() - yearsSince;
  const keywordConditions = keywords
    .map((_, i) => `(breach_type ILIKE $${i + 1} OR summary ILIKE $${i + 1})`)
    .join(' OR ');
  const keywordParams = keywords.map(k => `%${k}%`);

  let baseQuery = `
    SELECT id::text, regulator, firm_individual, ${EVIDENCE_AMOUNT_COLUMNS}
           date_issued::text, breach_type,
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
  baseQuery += ' ORDER BY date_issued DESC LIMIT 120';

  const rows = await query(baseQuery, baseParams);
  const records = selectEvidenceSample(prepareEvidenceRecords(rows.map(normalizeRecord), keywords), 50);

  return {
    records,
    regulatorAggregates: aggregateEvidenceByRegulator(records),
    yearAggregates: aggregateEvidenceByYear(records),
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

  const rows = await query(`
      SELECT id::text, regulator, firm_individual, ${EVIDENCE_AMOUNT_COLUMNS}
             date_issued::text, breach_type,
             COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
             COALESCE(source_url, '') as source_url
      FROM all_regulatory_fines
      WHERE (firm_category ILIKE $1 OR ${kwConditions})
      ORDER BY date_issued DESC LIMIT 120
    `, [firmCategory, ...kwParams]);
  const records = selectEvidenceSample(prepareEvidenceRecords(rows.map(normalizeRecord), sectorKeywords), 40);

  return {
    records,
    regulatorBreakdown: aggregateEvidenceByRegulator(records),
    firmCategory,
  };
}

// ─── Comparison query ──────────────────────────────────────────────────────────

export async function queryComparisonData(
  [regA, regB]: [string, string],
  since = 2022,
): Promise<ComparisonData> {
  async function fetchRegStats(reg: string) {
    const rows = await query(`
        SELECT id::text, regulator, firm_individual, ${EVIDENCE_AMOUNT_COLUMNS}
               date_issued::text, breach_type,
               COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
               COALESCE(source_url, '') as source_url
        FROM all_regulatory_fines
        WHERE regulator = $1 AND year_issued >= $2
        ORDER BY date_issued DESC LIMIT 200
      `, [reg, since]);
    const records = prepareEvidenceRecords(rows.map(normalizeRecord));
    const verifiedAmounts = records
      .filter((record) => record.amount_verified && record.amount_gbp > 0)
      .map((record) => record.amount_gbp);
    const total = verifiedAmounts.reduce((sum, amount) => sum + amount, 0);
    return {
      name: reg,
      count: records.length,
      total,
      avgFine: verifiedAmounts.length > 0 ? total / verifiedAmounts.length : 0,
      topBreachType: mostCommonBreachType(records),
      topCases: [...records]
        .sort((a, b) => b.amount_gbp - a.amount_gbp || b.date_issued.localeCompare(a.date_issued))
        .slice(0, 5),
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
             'GBP'::text as currency, amount_gbp::float as amount_gbp, date_issued::text, breach_type,
             COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
             COALESCE(source_url, '') as source_url
      FROM all_regulatory_fines
      WHERE ${whereClause} ${namedFirmClause} ${validAmountClause} ${verifiedPenaltyClause}
      ORDER BY amount_gbp DESC NULLS LAST LIMIT 1
    `, params),
    query(`
      SELECT id::text, regulator, firm_individual, ${EVIDENCE_AMOUNT_COLUMNS}
             date_issued::text, breach_type,
             COALESCE(summary, '') as summary, COALESCE(notice_url, '') as notice_url,
             COALESCE(source_url, '') as source_url
      FROM all_regulatory_fines
      WHERE ${whereClause} ${verifiedPenaltyClause}
      ORDER BY amount DESC NULLS LAST LIMIT 20
    `, params),
  ]);

  return {
    topCase: topRows[0] ? prepareEvidenceRecords([normalizeRecord(topRows[0])])[0] ?? null : null,
    allCasesInRange: prepareEvidenceRecords(allRows.map(normalizeRecord)),
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
    `| ${r.firm_individual} | ${r.amount_verified ? formatEvidenceAmount(r.amount, r.currency) : 'Non-monetary or amount unverified'} | ${r.date_issued} | ${redactUnverifiedMonetaryFigures(r.breach_type || '-')} |`,
  );
  return [header, sep, ...rows].join('\n');
}

export function formatComparisonTable(data: ComparisonData): string {
  const { regulatorA: a, regulatorB: b } = data;
  return [
    `| Metric | ${a.name} | ${b.name} |`,
    `|--------|${'-'.repeat(a.name.length + 2)}|${'-'.repeat(b.name.length + 2)}|`,
    `| Total actions (since ${new Date().getFullYear() - 3}) | ${a.count} | ${b.count} |`,
    `| Total verified penalties (GBP-normalised) | ${formatEvidenceAmount(a.total)} | ${formatEvidenceAmount(b.total)} |`,
    `| Average verified penalty (GBP-normalised) | ${formatEvidenceAmount(a.avgFine)} | ${formatEvidenceAmount(b.avgFine)} |`,
    `| Top breach type | ${a.topBreachType} | ${b.topBreachType} |`,
  ].join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const TOPIC_STOP_WORDS = new Set([
  'action', 'actions', 'across', 'analysis', 'and', 'anti', 'board', 'building',
  'compliance', 'conduct', 'control', 'controls', 'effective', 'enforcement',
  'failure', 'focus', 'global', 'guide', 'into', 'market', 'money', 'operational',
  'risk', 'rising', 'the', 'trends', 'with',
]);

const INVALID_ENTITY_PATTERNS = [
  /^(?:in particular|mr|unknown|n\/?a|not specified|unnamed subject)$/i,
  /^(?:firm|issuer|investment adviser|company|bank|broker-dealer)$/i,
  /^(?:a|an|the)\s+(?:branch|foreign bank|retail investor|public company officer)\b/i,
  /^(?:former public company officer|redress system reforms|insider trading(?: case)?|market manipulation case|pushpay shares)\b/i,
  /^\d+\s+(?:individuals?|firms?|companies|employees)\b/i,
  /^(?:fca|sec|finra|regulator)\s+(?:appoints|announces|publishes|proposes|seeks|launches|updates)\b/i,
  /^(?:alleged|investigation|enforcement|case involving)\b/i,
  /^(?:imposes sanctions|charges|orders)\b/i,
  /^(?:mmt)\s+sanctions\b/i,
  /^(?:cma|regulator)\s+(?:finds|charges|fines|orders)\b/i,
  /^(?:drug companies|medical device company|brazilian meat producers|financial institution|investment firm|asset management company)(?:…|\.\.\.)?$/i,
  /^(?:[a-z-]+)\s+(?:firms?|companies|media companies)$/i,
  /^(?:two|three|four|five|six|seven|eight|nine|ten|twenty-six)\b.*\b(?:firms?|companies|employees)\b/i,
  /^(?:£|\$|€|GBP|USD|EUR)\s*\d/i,
];

const HEADLINE_ACTION = /(?:,\s*|\s+)(?:and\s+)?(?:admits? to|agrees? to (?:pay|a )|paying|to pay|charged with|faces? charges|fines?\s+of(?:euros?)?|fined|ordered to pay|sentenced|settles?|sanctioned)\b/i;
const LEADING_ENTITY_DESCRIPTOR = /^(?:petrochemical manufacturer|global software company|movie producer|transfer agent)\s+/i;
const MONETARY_FIGURE_PATTERNS = [
  /(?:£|\$|€)\s*\d[\d,.]*(?:\s*(?:billion|million|thousand|bn|mn|m|k))?/gi,
  /\b(?:AED|AUD|BRL|CAD|CHF|CLP|CNY|DKK|EUR|GBP|HKD|INR|JPY|KRW|MXN|NOK|NZD|SAR|SEK|SGD|TWD|USD|ZAR)\s*\d[\d,.]*(?:\s*(?:billion|million|thousand|bn|mn|m|k))?/gi,
  /\b\d[\d,.]*\s*(?:billion|million|thousand|bn|mn)\s*(?:pounds?|dollars?|euros?)\b/gi,
];

export function canonicaliseEntityName(value: string, summary = ''): string | null {
  let entity = value.replace(/\s+/g, ' ').replace(/\s*\(PDF\)\.?$/i, '').trim();
  if (!entity || INVALID_ENTITY_PATTERNS.some((pattern) => pattern.test(entity))) return null;

  const actionIndex = entity.search(HEADLINE_ACTION);
  if (actionIndex > 0) entity = entity.slice(0, actionIndex).trim();
  if (/\s+fest$/i.test(entity) && /bu(?:ß|ss)geld/i.test(summary)) {
    entity = entity.replace(/\s+fest$/i, '').trim();
  }
  if (entity.length <= 8 && entity.includes('.') && summary) {
    const escapedEntity = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\.$/, '\\.?');
    const completion = summary.match(new RegExp(`\\b${escapedEntity}\\.?\\s+([A-Z][\\p{L}.-]+(?:\\s+(?:SE|AG|GmbH|plc|Ltd\\.?|Inc\\.?|Bank))?)`, 'u'));
    if (completion?.[0]) entity = completion[0].trim();
  }
  entity = entity.replace(LEADING_ENTITY_DESCRIPTOR, '').replace(/[,:;\-\s]+$/, '').trim();

  const jointRespondents = summary.match(
    /\bfined\s+(?:Mr|Ms|Mrs|Dr)\.?\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)+)\s+and\s+(?:(?:his|her|their)\s+[^,]+,\s*)?(?:Mr|Ms|Mrs|Dr)\.?\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)+),?\s+(?:a\s+)?(?:combined\s+)?total\s+of\b/iu,
  );
  if (jointRespondents?.[1] && jointRespondents[2]
    && entity.toLowerCase().includes(jointRespondents[1].toLowerCase())) {
    entity = `${jointRespondents[1]} and ${jointRespondents[2]}`;
  }

  if (!entity || entity.length < 2 || entity.length > 120) return null;
  if (INVALID_ENTITY_PATTERNS.some((pattern) => pattern.test(entity))) return null;
  return entity;
}

export function redactUnverifiedMonetaryFigures(value: string): string {
  let redacted = value;
  for (const pattern of MONETARY_FIGURE_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, '[unverified monetary figure removed]');
  }
  return redacted;
}

function normaliseUrlForEvidence(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return '';
  }
}

function evidenceSourceUrl(record: EnforcementRecord) {
  const candidates = [record.notice_url, record.source_url];
  return candidates.find((url) => isOfficialRegulatorySource(url)) || '';
}

function evidenceRecordKey(record: EnforcementRecord) {
  const url = normaliseUrlForEvidence(evidenceSourceUrl(record));
  if (url) return `url:${url}`;
  const breach = record.breach_type.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return [record.regulator, record.firm_individual, record.date_issued, breach]
    .map((value) => value.toLowerCase().trim())
    .join('|');
}

function evidenceRichness(record: EnforcementRecord) {
  return (record.amount_verified ? 1_000 : 0)
    + (evidenceSourceUrl(record) ? 500 : 0)
    + Math.min(record.summary.length, 400)
    + Math.min(record.breach_type.length, 120);
}

export function dedupeEvidenceRecords(records: EnforcementRecord[]) {
  const deduped = new Map<string, EnforcementRecord>();
  for (const record of records) {
    const key = evidenceRecordKey(record);
    const existing = deduped.get(key);
    if (!existing || evidenceRichness(record) > evidenceRichness(existing)) {
      deduped.set(key, record);
    }
  }
  return [...deduped.values()];
}

function meaningfulTopicTerms(keywords: string[]) {
  const terms = new Set<string>();
  for (const keyword of keywords) {
    const phrase = keyword.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (phrase && !TOPIC_STOP_WORDS.has(phrase)) terms.add(phrase);
    for (const token of phrase.split(/\s+/)) {
      if (token.length >= 3 && !TOPIC_STOP_WORDS.has(token)) terms.add(token);
    }
  }
  return [...terms];
}

function evidenceRelevance(record: EnforcementRecord, terms: string[]) {
  if (terms.length === 0) return 1;
  const breach = record.breach_type.toLowerCase();
  const summary = record.summary.toLowerCase();
  const entity = record.firm_individual.toLowerCase();
  const containsTerm = (value: string, term: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(value);
  };
  let corroboratedOutsideClassification = false;
  const score = terms.reduce((total, term) => {
    const summaryMatch = containsTerm(summary, term);
    const entityMatch = containsTerm(entity, term);
    if (summaryMatch || entityMatch) corroboratedOutsideClassification = true;
    return total
      + (containsTerm(breach, term) ? 3 : 0)
      + (summaryMatch ? 4 : 0)
      + (entityMatch ? 1 : 0);
  }, 0);
  return corroboratedOutsideClassification ? score : 0;
}

function parseSourceAmount(raw: string, magnitude?: string) {
  const trimmed = raw.trim();
  const europeanThousands = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(trimmed);
  const normalised = europeanThousands
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(/,/g, '');
  let value = Number(normalised);
  if (!Number.isFinite(value)) return 0;
  const scale = (magnitude || '').toLowerCase();
  if (['billion', 'bn', 'b'].includes(scale)) value *= 1_000_000_000;
  else if (['million', 'mn', 'm'].includes(scale)) value *= 1_000_000;
  else if (['thousand', 'k'].includes(scale)) value *= 1_000;
  return value;
}

export function hasMaterialSourceAmountConflict(record: Pick<EnforcementRecord, 'amount' | 'currency' | 'summary' | 'breach_type'>) {
  if (!(record.amount > 0)) return false;
  const aliases: Record<string, string> = {
    GBP: '(?:£|GBP)',
    USD: '(?:\\$|USD)',
    EUR: '(?:€|EUR|&#x20AC;|&euro;)',
    AUD: '(?:A\\$|AUD)',
    CAD: '(?:C\\$|CAD)',
    SGD: '(?:S\\$|SGD)',
    NZD: '(?:NZ\\$|NZD|\\$)',
    HKD: '(?:HK\\$|HKD)',
  };
  const alias = aliases[record.currency.toUpperCase()];
  if (!alias) return false;
  const suffixAliases: Record<string, string> = {
    GBP: '(?:GBP|pounds?)',
    USD: '(?:USD|US dollars?|dollars?)',
    EUR: '(?:EUR|euros?)',
    AUD: '(?:AUD|Australian dollars?)',
    CAD: '(?:CAD|Canadian dollars?)',
    SGD: '(?:SGD|Singapore dollars?)',
    NZD: '(?:NZD|New Zealand dollars?)',
    HKD: '(?:HKD|Hong Kong dollars?)',
  };
  const corpus = `${record.breach_type} ${record.summary}`;
  const pattern = new RegExp(`${alias}\\s*([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)(?:\\s*(billion|million|thousand|bn|mn|m|k|b))?`, 'gi');
  const suffixPattern = new RegExp(`([0-9][0-9.,]*)(?:\\s*(billion|million|thousand|bn|mn|m|k|b))?\\s*${suffixAliases[record.currency.toUpperCase()]}`, 'gi');
  const matches = [...corpus.matchAll(pattern), ...corpus.matchAll(suffixPattern)]
    .map((match) => ({
      amount: parseSourceAmount(match[1] || '', match[2]),
      index: match.index || 0,
      text: match[0],
    }))
    .filter((match) => match.amount > 0);
  const figures = matches.map((match) => match.amount);
  if (figures.length === 0) return true;
  const penaltyFigures = matches
    .filter((match) => {
      const priorFullStop = corpus.lastIndexOf('.', match.index - 1);
      const priorNewline = corpus.lastIndexOf('\n', match.index - 1);
      const start = Math.max(priorFullStop, priorNewline) + 1;
      const nextFullStop = corpus.indexOf('.', match.index + match.text.length);
      const nextNewline = corpus.indexOf('\n', match.index + match.text.length);
      const endings = [nextFullStop, nextNewline].filter((position) => position >= 0);
      const end = endings.length > 0 ? Math.min(...endings) : corpus.length;
      const context = corpus.slice(start, end);
      return /\b(fine[ds]?|penalt(?:y|ies)|penalised|penalized)\b/i.test(context);
    })
    .map((match) => match.amount);
  const uniquePenaltyFigures = [...new Set(penaltyFigures)];
  if (uniquePenaltyFigures.length > 0) {
    const matchesStored = uniquePenaltyFigures.some((amount) =>
      Math.max(amount, record.amount) / Math.min(amount, record.amount) <= 1.02
    );
    const penaltyTotal = uniquePenaltyFigures.reduce((sum, amount) => sum + amount, 0);
    const matchesPenaltyTotal = penaltyTotal > 0
      && Math.max(penaltyTotal, record.amount) / Math.min(penaltyTotal, record.amount) <= 1.02;
    if (!matchesStored && !matchesPenaltyTotal) return true;
  }
  const uniqueFigures = [...new Set(figures)];
  if (uniqueFigures.length === 1) {
    const onlyFigure = uniqueFigures[0]!;
    if (Math.max(onlyFigure, record.amount) / Math.min(onlyFigure, record.amount) > 1.02) return true;
  }
  return figures.some((amount) => {
    const ratio = Math.max(amount, record.amount) / Math.min(amount, record.amount);
    return ratio >= 100;
  });
}

export function hasUnresolvedJointPenaltyAttribution(
  record: Pick<EnforcementRecord, 'firm_individual' | 'summary' | 'breach_type'>,
) {
  const corpus = `${record.breach_type} ${record.summary}`;
  const jointTotal = /\b(?:fined|penalised|penalized)\b[^.]{0,240}\b(?:and|alongside|together with)\b[^.]{0,180}\b(?:a\s+)?(?:combined\s+)?total\s+of\b/i.test(corpus);
  if (!jointTotal) return false;

  const namedParties = [...corpus.matchAll(/\b(?:Mr|Ms|Mrs|Dr)\.?\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)+)/gu)]
    .map((match) => match[1]!.toLowerCase());
  const uniqueParties = [...new Set(namedParties)];
  if (uniqueParties.length < 2) return true;
  const entity = record.firm_individual.toLowerCase();
  return !uniqueParties.slice(0, 2).every((name) => entity.includes(name));
}

export function prepareEvidenceRecords(records: EnforcementRecord[], keywords: string[] = []) {
  const terms = meaningfulTopicTerms(keywords);
  const canonical = records.map((record) => ({
    ...record,
    raw_firm_individual: record.raw_firm_individual || record.firm_individual,
    firm_individual: canonicaliseEntityName(record.raw_firm_individual || record.firm_individual, record.summary) || '',
  }));
  return dedupeEvidenceRecords(canonical)
    .map((record) => ({ record, relevance: evidenceRelevance(record, terms) }))
    .filter(({ record, relevance }) =>
      Boolean(record.firm_individual)
      && Boolean(record.regulator)
      && Boolean(record.date_issued)
      && Boolean(evidenceSourceUrl(record))
      && (terms.length === 0 || relevance >= 4))
    .sort((a, b) =>
      Number(b.record.amount_verified) - Number(a.record.amount_verified)
      || b.relevance - a.relevance
      || b.record.date_issued.localeCompare(a.record.date_issued))
    .map(({ record }) => record);
}

export function selectEvidenceSample(records: EnforcementRecord[], limit: number) {
  if (records.length <= limit) return records;
  const selected: EnforcementRecord[] = [];
  const selectedIds = new Set<string>();
  const regulators = new Set<string>();
  for (const record of records) {
    if (regulators.has(record.regulator)) continue;
    selected.push(record);
    selectedIds.add(record.id);
    regulators.add(record.regulator);
    if (selected.length >= limit) return selected;
  }
  for (const record of records) {
    if (selectedIds.has(record.id)) continue;
    selected.push(record);
    if (selected.length >= limit) break;
  }
  return selected;
}

function aggregateEvidenceByRegulator(records: EnforcementRecord[]) {
  const aggregates = new Map<string, { regulator: string; count: number; total: number }>();
  for (const record of records) {
    const current = aggregates.get(record.regulator) || { regulator: record.regulator, count: 0, total: 0 };
    current.count += 1;
    if (record.amount_verified) current.total += record.amount_gbp;
    aggregates.set(record.regulator, current);
  }
  return [...aggregates.values()].sort((a, b) => b.count - a.count || b.total - a.total);
}

function aggregateEvidenceByYear(records: EnforcementRecord[]) {
  const aggregates = new Map<number, { year: number; count: number; total: number }>();
  for (const record of records) {
    const year = Number(record.date_issued.slice(0, 4));
    if (!Number.isInteger(year)) continue;
    const current = aggregates.get(year) || { year, count: 0, total: 0 };
    current.count += 1;
    if (record.amount_verified) current.total += record.amount_gbp;
    aggregates.set(year, current);
  }
  return [...aggregates.values()].sort((a, b) => a.year - b.year);
}

function mostCommonBreachType(records: EnforcementRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const breach = record.breach_type.trim();
    if (!breach) continue;
    counts.set(breach, (counts.get(breach) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
}

export function getCitationEligibleEntities(records: EnforcementRecord[]) {
  return [...new Set(records.map((record) => record.firm_individual).filter(Boolean))];
}

export function getRequiredCaseCitationCount(records: EnforcementRecord[]) {
  return Math.min(5, getCitationEligibleEntities(records).length);
}

export function getRequiredVerifiedAmountCount(records: EnforcementRecord[]) {
  const amounts = new Set(
    records
      .filter((record) => record.amount_verified && record.amount > 0)
      .map((record) => `${record.currency}:${record.amount}`),
  );
  return Math.min(3, amounts.size);
}

function normalizeRecord(r: Record<string, unknown>): EnforcementRecord {
  const rawFirm = String(r.firm_individual || '');
  const summary = String(r.summary || '');
  const entity = canonicaliseEntityName(rawFirm, summary) || '';
  const currency = String(r.currency || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
  const amount = Number(r.amount) || 0;
  const base = {
    id: String(r.id || `${r.regulator || 'unknown'}:${r.firm_individual || 'unknown'}:${r.date_issued || 'unknown'}`),
    regulator: String(r.regulator || ''),
    firm_individual: entity,
    amount,
    currency,
    amount_gbp: Number(r.amount_gbp) || (currency === 'GBP' ? amount : 0),
    date_issued: String(r.date_issued || ''),
    breach_type: String(r.breach_type || ''),
    summary,
    notice_url: String(r.notice_url || ''),
    source_url: String(r.source_url || ''),
    raw_firm_individual: rawFirm,
  };
  return {
    ...base,
    amount_verified: currency !== 'UNKNOWN'
      && isVerifiedPenaltyAmount(base)
      && !hasMaterialSourceAmountConflict(base)
      && !hasUnresolvedJointPenaltyAttribution(base),
  };
}

function currencyPrefix(currency: string) {
  const normalised = currency.toUpperCase();
  if (normalised === 'GBP') return '£';
  if (normalised === 'USD') return '$';
  if (normalised === 'EUR') return '€';
  return `${normalised} `;
}

export function formatEvidenceAmount(amount: number, currency = 'GBP'): string {
  if (!amount) return 'N/A';
  const prefix = currencyPrefix(currency);
  if (amount >= 1_000_000_000) return `${prefix}${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${prefix}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${prefix}${(amount / 1_000).toFixed(0)}K`;
  return `${prefix}${amount.toLocaleString('en-GB')}`;
}

function sanitiseTableCell(value: unknown) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
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
    .map(r => r.amount_gbp)
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

  const outliers = records.filter(r => r.amount_verified && r.amount_gbp > p75 * 3);

  const topFirms = records
    .filter(r => r.firm_individual && r.firm_individual.length > 3 && !['Mr', 'Unknown', 'N/A'].includes(r.firm_individual))
    .slice(0, 10)
    .map(r => `${r.firm_individual} (${r.regulator}, ${r.amount_verified ? formatEvidenceAmount(r.amount, r.currency) : 'non-monetary or amount unverified'}, ${r.date_issued.slice(0, 7)})`)
    .join('\n  ');

  let yoyDelta: string | null = null;
  if (yearAggs && yearAggs.length >= 2) {
    const sorted = [...yearAggs].sort((a, b) => a.year - b.year);
    const last = sorted[sorted.length - 1]!;
    const prev = sorted[sorted.length - 2]!;
    if (prev.total > 0) {
      const pct = ((last.total - prev.total) / prev.total * 100).toFixed(0);
      yoyDelta = `${last.year} vs ${prev.year}: ${last.total > prev.total ? '+' : ''}${pct}% (${formatEvidenceAmount(prev.total)} → ${formatEvidenceAmount(last.total)})`;
    }
  }

  const lines = [
    `STATISTICAL SUMMARY (${records.length} enforcement records):`,
    `  Total verified penalties (GBP-normalised): ${formatEvidenceAmount(total)}`,
    `  Mean verified penalty (GBP-normalised): ${formatEvidenceAmount(mean)} | Median: ${formatEvidenceAmount(median)} | 75th percentile: ${formatEvidenceAmount(p75)}`,
    outliers.length > 0 ? `  Outlier cases (>3× p75, ${formatEvidenceAmount(p75 * 3)}+): ${outliers.map(r => `${r.firm_individual} ${formatEvidenceAmount(r.amount, r.currency)} (${formatEvidenceAmount(r.amount_gbp)} GBP-normalised)`).join(', ')}` : '',
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
    `  Amount: ${r.amount_verified ? formatEvidenceAmount(r.amount, r.currency) : 'NOT VERIFIED — do not state a monetary figure for this record'}`,
    `  Date: ${r.date_issued}`,
    `  Breach: ${redactUnverifiedMonetaryFigures(r.breach_type || 'Not specified')}`,
    `  Detail: ${redactUnverifiedMonetaryFigures(r.summary || 'No summary available')}`,
    `  Official source: ${evidenceSourceUrl(r)}`,
  ].join('\n')).join('\n\n');
}
