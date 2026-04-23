import { getSqlClient } from "../db.js";
import {
  UK_ENFORCEMENT_DOMAIN_LABELS,
  UK_ENFORCEMENT_REGULATOR_CODES,
  getUKEnforcementRegulator,
  type UKEnforcementDomain,
} from "../../src/data/ukEnforcement.js";
import { expandFirmAliasTerms } from "./firmAliases.js";

export interface UKEnforcementSearchParams {
  q?: string;
  firmName?: string;
  regulator?: string;
  domain?: string;
  year?: string | number;
  minAmount?: string | number;
  maxAmount?: string | number;
  currency?: string;
  sortBy?: string;
  order?: string;
  limit?: string | number;
  offset?: string | number;
}

export interface UKEnforcementStatsParams {
  year?: string | number;
  domain?: string;
  currency?: string;
}

function parseInteger(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRegulator(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return UK_ENFORCEMENT_REGULATOR_CODES.includes(normalized)
    ? normalized
    : null;
}

function normalizeDomain(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim() as UKEnforcementDomain;
  return UK_ENFORCEMENT_DOMAIN_LABELS[normalized] ? normalized : null;
}

function getAmountColumn(currency: string | undefined) {
  return currency?.toUpperCase() === "EUR" ? "amount_eur" : "amount_gbp";
}

function buildSearchPatterns(input: string) {
  return Array.from(
    new Set(
      expandFirmAliasTerms(input)
        .map((term) => term.trim())
        .filter(Boolean)
        .map((term) => `%${term}%`),
    ),
  );
}

const UK_ACTIONS_CTE = `
  WITH uk_actions AS (
    SELECT
      id,
      regulator,
      regulator_full_name,
      'financial_conduct'::text AS source_domain,
      country_code,
      country_name,
      firm_individual,
      firm_category,
      amount_original,
      currency,
      amount_gbp,
      amount_eur,
      date_issued,
      year_issued,
      month_issued,
      breach_type,
      breach_categories,
      summary,
      notice_url,
      source_url,
      NULL::text AS source_window_note,
      ARRAY[]::text[] AS aliases,
      created_at,
      updated_at,
      'fca_unified'::text AS source_layer
    FROM all_regulatory_fines
    WHERE regulator = 'FCA'

    UNION ALL

    SELECT
      id,
      regulator,
      regulator_full_name,
      source_domain,
      country_code,
      country_name,
      firm_individual,
      firm_category,
      amount_original,
      currency,
      amount_gbp,
      amount_eur,
      date_issued,
      year_issued,
      month_issued,
      breach_type,
      breach_categories,
      summary,
      notice_url,
      source_url,
      source_window_note,
      aliases,
      created_at,
      updated_at,
      'uk_enforcement_actions'::text AS source_layer
    FROM uk_enforcement_actions
  )
`;

function addCommonConditions(
  params: Array<string | number | string[]>,
  conditions: string[],
  {
    regulator,
    domain,
    year,
    minAmount,
    maxAmount,
    amountColumn,
  }: {
    regulator: string | null;
    domain: UKEnforcementDomain | null;
    year: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    amountColumn: string;
  },
) {
  if (regulator) {
    params.push(regulator);
    conditions.push(`regulator = $${params.length}`);
  }

  if (domain) {
    params.push(domain);
    conditions.push(`source_domain = $${params.length}`);
  }

  if (year) {
    params.push(year);
    conditions.push(`year_issued = $${params.length}`);
  }

  if (minAmount !== null) {
    params.push(minAmount);
    conditions.push(`${amountColumn} >= $${params.length}`);
  }

  if (maxAmount !== null) {
    params.push(maxAmount);
    conditions.push(`${amountColumn} <= $${params.length}`);
  }
}

export async function listUKEnforcementActions({
  q,
  firmName,
  regulator: rawRegulator,
  domain: rawDomain,
  year: rawYear,
  minAmount: rawMinAmount,
  maxAmount: rawMaxAmount,
  currency = "GBP",
  sortBy = "date_issued",
  order = "desc",
  limit = 50,
  offset = 0,
}: UKEnforcementSearchParams = {}) {
  const sql = getSqlClient();
  const amountColumn = getAmountColumn(currency);
  const regulator = normalizeRegulator(rawRegulator);
  const domain = normalizeDomain(rawDomain);
  const year = rawYear ? parseInteger(rawYear, 0) || null : null;
  const minAmount = parseNumber(rawMinAmount);
  const maxAmount = parseNumber(rawMaxAmount);
  const limitNum = Math.min(Math.max(parseInteger(limit, 50), 1), 250);
  const offsetNum = Math.max(parseInteger(offset, 0), 0);
  const sortColumn = [
    "date_issued",
    "amount_gbp",
    "amount_eur",
    "firm_individual",
    "regulator",
    "source_domain",
  ].includes(sortBy)
    ? sortBy
    : "date_issued";
  const sortOrder = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";
  const searchText = (firmName || q || "").trim();
  const conditions: string[] = [];
  const params: Array<string | number | string[]> = [];

  addCommonConditions(params, conditions, {
    regulator,
    domain,
    year,
    minAmount,
    maxAmount,
    amountColumn,
  });

  if (searchText) {
    const patterns = buildSearchPatterns(searchText);
    params.push(patterns);
    conditions.push(`(
      firm_individual ILIKE ANY($${params.length}::text[])
      OR COALESCE(summary, '') ILIKE ANY($${params.length}::text[])
      OR COALESCE(breach_type, '') ILIKE ANY($${params.length}::text[])
      OR regulator ILIKE ANY($${params.length}::text[])
      OR EXISTS (
        SELECT 1
        FROM unnest(aliases) AS alias
        WHERE alias ILIKE ANY($${params.length}::text[])
      )
    )`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const queryParams = [...params, limitNum, offsetNum];
  const rows = await sql(
    `
      ${UK_ACTIONS_CTE}
      SELECT
        *,
        ${amountColumn} AS display_amount
      FROM uk_actions
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    queryParams,
  );

  const countRows = await sql(
    `
      ${UK_ACTIONS_CTE}
      SELECT COUNT(*)::int AS count
      FROM uk_actions
      ${whereClause}
    `,
    params,
  );
  const total = Number(countRows[0]?.count ?? 0);

  return {
    success: true,
    results: rows,
    pagination: {
      total,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + limitNum < total,
      pages: Math.ceil(total / limitNum),
      currentPage: Math.floor(offsetNum / limitNum) + 1,
    },
    filters: {
      q: searchText || null,
      regulator,
      domain,
      year,
      minAmount,
      maxAmount,
      currency: amountColumn === "amount_eur" ? "EUR" : "GBP",
    },
    metadata: {
      aliasExpanded: searchText
        ? expandFirmAliasTerms(searchText).length > 1
        : false,
    },
  };
}

export async function getUKEnforcementStats({
  year: rawYear,
  domain: rawDomain,
  currency = "GBP",
}: UKEnforcementStatsParams = {}) {
  const sql = getSqlClient();
  const amountColumn = getAmountColumn(currency);
  const domain = normalizeDomain(rawDomain);
  const year = rawYear ? parseInteger(rawYear, 0) || null : null;
  const conditions: string[] = [];
  const params: Array<string | number | string[]> = [];

  addCommonConditions(params, conditions, {
    regulator: null,
    domain,
    year,
    minAmount: null,
    maxAmount: null,
    amountColumn,
  });

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [summaryRows, byRegulator, byDomain, topActions] = await Promise.all([
    sql(
      `
        ${UK_ACTIONS_CTE}
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) AS total,
          COALESCE(MAX(${amountColumn}), 0)::numeric(18,2) AS max_fine,
          MIN(date_issued) AS earliest_date,
          MAX(date_issued) AS latest_date
        FROM uk_actions
        ${whereClause}
      `,
      params,
    ),
    sql(
      `
        ${UK_ACTIONS_CTE}
        SELECT
          regulator,
          regulator_full_name,
          source_domain,
          COUNT(*)::int AS count,
          COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) AS total,
          COALESCE(MAX(${amountColumn}), 0)::numeric(18,2) AS max_fine
        FROM uk_actions
        ${whereClause}
        GROUP BY regulator, regulator_full_name, source_domain
        ORDER BY total DESC NULLS LAST, count DESC
      `,
      params,
    ),
    sql(
      `
        ${UK_ACTIONS_CTE}
        SELECT
          source_domain,
          COUNT(*)::int AS count,
          COALESCE(SUM(${amountColumn}), 0)::numeric(18,2) AS total
        FROM uk_actions
        ${whereClause}
        GROUP BY source_domain
        ORDER BY total DESC NULLS LAST, count DESC
      `,
      params,
    ),
    sql(
      `
        ${UK_ACTIONS_CTE}
        SELECT
          id,
          regulator,
          source_domain,
          firm_individual,
          ${amountColumn} AS display_amount,
          currency,
          date_issued,
          breach_type,
          summary,
          notice_url
        FROM uk_actions
        ${whereClause}
        ORDER BY ${amountColumn} DESC NULLS LAST, date_issued DESC
        LIMIT 10
      `,
      params,
    ),
  ]);

  const summary = summaryRows[0] ?? {};

  return {
    success: true,
    summary: {
      count: Number(summary.count ?? 0),
      total: Number(summary.total ?? 0),
      maxFine: Number(summary.max_fine ?? 0),
      earliestDate: summary.earliest_date ?? null,
      latestDate: summary.latest_date ?? null,
      currency: amountColumn === "amount_eur" ? "EUR" : "GBP",
    },
    byRegulator: byRegulator.map((row) => ({
      regulator: row.regulator,
      regulatorFullName: row.regulator_full_name,
      domain: row.source_domain,
      domainLabel:
        UK_ENFORCEMENT_DOMAIN_LABELS[row.source_domain as UKEnforcementDomain] ??
        row.source_domain,
      sourceWindowNote:
        getUKEnforcementRegulator(String(row.regulator))?.sourceWindowNote ??
        null,
      count: Number(row.count ?? 0),
      total: Number(row.total ?? 0),
      maxFine: Number(row.max_fine ?? 0),
    })),
    byDomain: byDomain.map((row) => ({
      domain: row.source_domain,
      label:
        UK_ENFORCEMENT_DOMAIN_LABELS[row.source_domain as UKEnforcementDomain] ??
        row.source_domain,
      count: Number(row.count ?? 0),
      total: Number(row.total ?? 0),
    })),
    topActions: topActions.map((row) => ({
      id: row.id,
      regulator: row.regulator,
      domain: row.source_domain,
      firm: row.firm_individual,
      amount: Number(row.display_amount ?? 0),
      currency: amountColumn === "amount_eur" ? "EUR" : "GBP",
      date: row.date_issued,
      breachType: row.breach_type,
      summary: row.summary,
      url: row.notice_url,
    })),
    filters: {
      year,
      domain,
      currency: amountColumn === "amount_eur" ? "EUR" : "GBP",
    },
  };
}
