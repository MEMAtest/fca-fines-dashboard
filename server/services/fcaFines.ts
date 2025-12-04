import type { NotificationItem } from '../../src/types';
import { getSqlClient } from '../db.js';

const sql = getSqlClient;

function buildWhereClause(year: number) {
  if (year > 0) {
    return {
      text: 'WHERE EXTRACT(YEAR FROM date_issued) = $1',
      params: [year],
    };
  }
  return { text: '', params: [] as Array<number> };
}

export async function listFines(year: number, limit: number) {
  const instance = sql();
  const { text: where, params } = buildWhereClause(year);
  const query = `
    SELECT fine_reference, firm_individual, firm_category, regulator,
           final_notice_url, summary, breach_type, breach_categories,
           amount, date_issued, year_issued, month_issued
    FROM fca_fines
    ${where}
    ORDER BY date_issued DESC
    LIMIT $${params.length + 1}
  `;
  return instance(query, [...params, limit]);
}

export async function getStats(year: number) {
  const instance = sql();
  const { text: where, params } = buildWhereClause(year);
  const breachWhere = where ? `${where} AND` : 'WHERE';

  const statsQuery = `
    SELECT
      COUNT(*)::int AS total_fines,
      COALESCE(SUM(amount), 0)::float8 AS total_amount,
      COALESCE(AVG(amount), 0)::float8 AS avg_amount,
      COALESCE(MAX(amount), 0)::float8 AS max_fine
    FROM fca_fines
    ${where}
  `;
  const stats = (await instance(statsQuery, params))[0];

  const maxQuery = `
    SELECT firm_individual
    FROM fca_fines
    ${where}
    ORDER BY amount DESC
    LIMIT 1
  `;
  const maxRow = (await instance(maxQuery, params))[0];

  const breachQuery = `
    SELECT
      jsonb_array_elements_text(breach_categories) AS category,
      COUNT(*) AS category_count
    FROM fca_fines
    ${breachWhere} breach_categories IS NOT NULL
      AND breach_categories != '[]'::jsonb
    GROUP BY category
    ORDER BY category_count DESC
    LIMIT 1
  `;
  const breachRow = (await instance(breachQuery, params))[0];

  return {
    totalFines: stats?.total_fines || 0,
    totalAmount: stats?.total_amount || 0,
    avgAmount: stats?.avg_amount || 0,
    maxFine: stats?.max_fine || 0,
    maxFirmName: maxRow?.firm_individual || null,
    dominantBreach: breachRow?.category || null,
  };
}

export async function getTrends(period: string, year: number, limit: number) {
  const instance = sql();
  const params: Array<string | number> = [period];
  let query = `
    SELECT period_type, year, period_value, fine_count, total_fines, average_fine
    FROM fca_fine_trends
    WHERE period_type = $1
  `;

  if (year > 0) {
    params.push(year);
    query += ` AND year = $${params.length} ORDER BY period_value ASC`;
  } else {
    params.push(limit);
    query += ` ORDER BY year DESC, period_value DESC LIMIT $${params.length}`;
  }

  const rows = await instance(query, params);
  return year > 0 ? rows : rows.reverse();
}

const amountFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatAmount(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  return amountFormatter.format(numeric);
}

function formatDate(value: string | Date) {
  return dateFormatter.format(new Date(value));
}

export async function getNotifications(limit = 5): Promise<NotificationItem[]> {
  const instance = sql();
  const rows = await instance(
    `
      SELECT id, firm_individual, breach_type, amount, date_issued
      FROM fca_fines
      ORDER BY date_issued DESC, amount DESC
      LIMIT $1
    `,
    [limit],
  );

  return rows.map((row) => ({
    id: row.id,
    title: `${row.firm_individual} final notice`,
    detail: `${formatAmount(row.amount)}${row.breach_type ? ` • ${row.breach_type}` : ''}`,
    time: formatDate(row.date_issued),
    read: false,
  }));
}
