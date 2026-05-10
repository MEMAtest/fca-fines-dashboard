/**
 * Article Data Query Layer
 *
 * Queries enforcement data from PostgreSQL for AI article generation.
 * Uses the same DB patterns as server/db.ts (pg pool, tagged templates).
 */

import pg from 'pg';
import { resolveConnectionString, buildPgPoolConfig } from '../../server/db.js';

export interface EnforcementRecord {
  regulator: string;
  firm_individual: string;
  amount: number;
  date_issued: string;
  breach_type: string;
  summary: string;
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
    SELECT regulator, firm_individual, amount, date_issued::text, breach_type,
           COALESCE(summary, '') as summary
    FROM all_regulatory_fines
    WHERE date_issued >= CURRENT_DATE - $1 * INTERVAL '1 day'
    ORDER BY date_issued DESC, amount DESC
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
    SELECT regulator, firm_individual, amount, date_issued::text, breach_type,
           COALESCE(summary, '') as summary
    FROM all_regulatory_fines
    WHERE ${conditions}
    ORDER BY amount DESC
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
           COALESCE(SUM(amount), 0)::numeric as total_fines,
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
  const [records, stats] = await Promise.all([
    type === 'timely' ? getTimelyData(14) : getThematicData(keywords || []),
    getRegulatorStats(),
  ]);

  const totalActions = stats.reduce((sum, s) => sum + s.action_count, 0);
  const totalFines = stats.reduce((sum, s) => sum + s.total_fines, 0);

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
    `${r.regulator} | ${r.firm_individual} | ${formatAmount(r.amount)} | ${r.date_issued} | ${r.breach_type} | ${truncate(r.summary, 100)}`
  );

  return [header, separator, ...rows].join('\n');
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeRecord(r: Record<string, unknown>): EnforcementRecord {
  return {
    regulator: String(r.regulator || ''),
    firm_individual: String(r.firm_individual || ''),
    amount: Number(r.amount) || 0,
    date_issued: String(r.date_issued || ''),
    breach_type: String(r.breach_type || ''),
    summary: String(r.summary || ''),
  };
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
