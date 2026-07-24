import type { NotificationItem } from '../../src/types.js';
import { getSqlClient } from '../db.js';
import {
  assessFcaFineCaseIndexability,
  mapFcaFineCaseRow,
  normaliseFcaFineEntityName,
  parseFcaFineCategories,
} from './fcaFineCases.js';

const sql = getSqlClient();

function buildWhereClause(year: number) {
  const base =
    "WHERE upper(regulator) = 'FCA' AND trusted_amount_gbp > 0";
  if (year > 0) {
    return {
      text: `${base} AND year_issued = $1`,
      params: [year],
    };
  }
  return { text: base, params: [] as Array<number> };
}

export async function listFines(year: number, limit: number) {
  const instance = sql;
  const { text: where, params } = buildWhereClause(year);
  const query = `
    SELECT public_case_id AS canonical_case_id,
           public_case_id AS fine_reference,
           firm_individual, firm_category, regulator,
           notice_url AS final_notice_url,
           source_url,
           summary, breach_type, breach_categories,
           trusted_amount_gbp AS amount,
           date_issued, year_issued, month_issued,
           amount_quality, requires_amount_review,
           amount_verification_url, amount_override_reason,
           source_link_status, source_checked_at, source_http_status,
           source_official_domain_match, source_content_hash,
           duplicate_count, created_at,
           source_resolved_url, source_review_status
           ,COALESCE(NULLIF(notice_url, ''), NULLIF(source_resolved_url, '')) AS case_source_url
    FROM public.all_regulatory_fines_trusted
    ${where}
    ORDER BY date_issued DESC
    LIMIT $${params.length + 1}
  `;
  const rows = await instance(query, [...params, limit]);
  return rows.map((row: any) => {
    const mapped = mapFcaFineCaseRow({
      ...row,
      public_case_id: row.canonical_case_id,
      trusted_amount_gbp: row.amount,
      notice_url: row.final_notice_url,
    });
    const quality = assessFcaFineCaseIndexability(mapped);
    return {
      ...row,
      firm_individual: normaliseFcaFineEntityName(
      row.firm_individual,
      row.case_source_url ? String(row.case_source_url) : null,
      ),
      breach_categories: parseFcaFineCategories(row.breach_categories),
      amount: Number(row.amount) || 0,
      year_issued: Number(row.year_issued) || 0,
      month_issued: Number(row.month_issued) || 0,
      indexable: quality.indexable,
      indexability_reasons: quality.reasons,
    };
  });
}

export async function getStats(year: number) {
  const instance = sql;
  const { text: where, params } = buildWhereClause(year);

  const statsQuery = `
    SELECT
      COUNT(*)::int AS total_fines,
      COALESCE(SUM(trusted_amount_gbp), 0)::float8 AS total_amount,
      COALESCE(AVG(trusted_amount_gbp), 0)::float8 AS avg_amount,
      COALESCE(MAX(trusted_amount_gbp), 0)::float8 AS max_fine
    FROM public.all_regulatory_fines_trusted
    ${where}
  `;
  const statsRows = (await instance(statsQuery, params)) as any[];
  const stats = statsRows[0];

  const maxQuery = `
    SELECT firm_individual
    FROM public.all_regulatory_fines_trusted
    ${where}
    ORDER BY trusted_amount_gbp DESC
    LIMIT 1
  `;
  const maxRows = (await instance(maxQuery, params)) as any[];
  const maxRow = maxRows[0];

  const breachWhere = where
    .replaceAll('regulator', 'f.regulator')
    .replaceAll('trusted_amount_gbp', 'f.trusted_amount_gbp')
    .replaceAll('year_issued', 'f.year_issued') + ' AND';

  const breachQuery = `
    SELECT
      cat.category,
      COUNT(*) AS category_count
    FROM public.all_regulatory_fines_trusted f
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(f.breach_categories) = 'string'
           THEN (f.breach_categories #>> '{}')::jsonb
           ELSE f.breach_categories END
    ) AS cat(category)
    ${breachWhere} f.breach_categories IS NOT NULL
    GROUP BY cat.category
    ORDER BY category_count DESC
    LIMIT 1
  `;
  const breachRows = (await instance(breachQuery, params)) as any[];
  const breachRow = breachRows[0];

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
  const instance = sql;
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

  const rows = (await instance(query, params)) as any[];
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
  const instance = sql;
  const rows = (await instance(
    `
      SELECT id, firm_individual, breach_type, amount, date_issued
      FROM (
        SELECT public_case_id AS id, firm_individual, breach_type,
               trusted_amount_gbp AS amount, date_issued
        FROM public.all_regulatory_fines_trusted
        WHERE upper(regulator) = 'FCA' AND trusted_amount_gbp > 0
      ) fines
      ORDER BY date_issued DESC, amount DESC
      LIMIT $1
    `,
    [limit],
  )) as any[];

  return rows.map((row: any) => ({
    id: `notice-${row.id}`,
    title: `${row.firm_individual} final notice`,
    detail: `${formatAmount(row.amount)}${row.breach_type ? ` • ${row.breach_type}` : ''}`,
    time: formatDate(row.date_issued),
    read: false,
  }));
}
