import crypto from 'node:crypto';
import { getSqlClient } from '../db.js';
import { PUBLIC_REGULATOR_CODES } from '../../src/data/regulatorCoverage.js';
import { UK_ENFORCEMENT_REGULATOR_CODES } from '../../src/data/ukEnforcement.js';
import { getPersona, type FirmPersona } from './firmPersonas.js';
import {
  classifyEnforcementAction,
  type RegActionsEnforcementCategory,
} from './enforcementTaxonomy.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
const MAX_RANGE_DAYS = 366 * 5;
const DEFAULT_RANGE_DAYS = 365;
const MAX_EVIDENCE_ROWS = 60;
const STATS_SAMPLE_ROWS = 250;
const CACHE_TTL_HOURS = 6;
const RATE_LIMIT_PER_HOUR = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const IN_MEMORY_RATE_LIMIT_MAX_BUCKETS = 5_000;
const CACHE_SCHEMA_VERSION = '2026-05-21-regactions-taxonomy-v6';

const VALID_REGULATORS = new Set([
  ...PUBLIC_REGULATOR_CODES,
  ...UK_ENFORCEMENT_REGULATOR_CODES,
]);

export interface EnforcementBriefingFilters {
  dateFrom?: string;
  dateTo?: string;
  regulator?: string;
  country?: string;
  breachCategory?: string;
  firmCategory?: string;
  personaId?: string;
  query?: string;
  currency?: 'GBP' | 'EUR';
  limit?: number;
}

export interface NormalizedBriefingFilters {
  dateFrom: string;
  dateTo: string;
  regulator: string | null;
  country: string | null;
  breachCategory: string | null;
  firmCategory: string | null;
  personaId: string | null;
  query: string | null;
  currency: 'GBP' | 'EUR';
  limit: number;
}

export interface EnforcementEvidenceRow {
  id: string;
  regulator: string;
  regulatorFullName: string;
  countryCode: string;
  countryName: string;
  firm: string;
  firmCategory: string | null;
  amountOriginal: number | null;
  currency: string;
  amountGbp: number | null;
  amountEur: number | null;
  dateIssued: string;
  year: number;
  breachType: string | null;
  breachCategories: string[];
  regActionsCategory: RegActionsEnforcementCategory;
  summary: string | null;
  noticeUrl: string | null;
  sourceUrl: string | null;
}

export interface EnforcementBriefingCitation {
  id: string;
  actionId: string;
  firm: string;
  regulator: string;
  dateIssued: string;
  title: string;
  url: string | null;
}

export interface EnforcementBriefingTheme {
  title: string;
  narrative: string;
  evidenceIds: string[];
  implication: string;
  count?: number;
}

export interface EnforcementBriefingPayload {
  executiveSummary: string;
  keyThemes: EnforcementBriefingTheme[];
  notablePrecedents: Array<{
    firm: string;
    regulator: string;
    dateIssued: string;
    reason: string;
    citationId: string | null;
  }>;
  mlroWatchPoints: string[];
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  disclaimer: string;
}

export interface EnforcementBriefingStats {
  totalActions: number;
  sampledActions: number;
  monetaryActions: number;
  sampledTotalAmount: number;
  sampledAverageAmount: number;
  sampledMaxAmount: number;
  totalAmount: number;
  averageAmount: number;
  maxAmount: number;
  earliestDate: string | null;
  latestDate: string | null;
  topRegulators: Array<{ regulator: string; name: string; count: number; totalAmount: number }>;
  topFirms: Array<{ firm: string; count: number; totalAmount: number }>;
  topCategories: Array<{ category: string; count: number; totalAmount: number }>;
}

export interface QualifiedDatasetSummary {
  source: 'RegActions qualified enforcement dataset';
  taxonomy: {
    name: 'RegActions enforcement taxonomy';
    version: string;
    basis: string;
  };
  scopeLabel: string;
  filtersApplied: string[];
  matchedActions: number;
  sampledActions: number;
  evidenceActions: number;
  evidenceLimit: number;
  requestedDateRange: {
    from: string;
    to: string;
  };
  evidenceDateRange: {
    from: string;
    to: string;
  } | null;
  sampledMonetaryValue: number;
  topRegulators: Array<{ label: string; count: number }>;
  topThemes: Array<{ label: string; count: number; sampledAmount: number }>;
  topFirms: Array<{ label: string; count: number; sampledAmount: number }>;
  modelInput: {
    sentToModel: boolean;
    evidenceRowsSent: number;
    note: string;
  };
}

export interface EnforcementBriefingResult {
  briefing: EnforcementBriefingPayload;
  stats: EnforcementBriefingStats;
  datasetSummary: QualifiedDatasetSummary;
  themes: EnforcementBriefingTheme[];
  citations: EnforcementBriefingCitation[];
  filters: NormalizedBriefingFilters;
  generatedAt: string;
  model: string;
  fallbackUsed: boolean;
  cached: boolean;
  evidenceHash: string;
}

interface WhereClause {
  clause: string;
  params: unknown[];
}

interface CacheRow {
  response_payload: EnforcementBriefingResult;
  fallback_used: boolean;
  model: string | null;
}

let tableEnsureAttempted = false;
let tablePersistenceAvailable = true;
const inMemoryRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} is not a valid date`);
  }
  return parsed;
}

function daysBetween(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function normalizeRegulator(value: unknown) {
  const input = asTrimmedString(value);
  if (!input || input.toLowerCase() === 'all') return null;
  const normalized = input.toUpperCase();
  if (!VALID_REGULATORS.has(normalized)) {
    throw new Error(`Unsupported regulator: ${input}`);
  }
  return normalized;
}

function normalizeCountry(value: unknown) {
  const input = asTrimmedString(value);
  if (!input || input.toLowerCase() === 'all') return null;
  const normalized = input.toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error('country must be a two-letter country code');
  }
  return normalized;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const input = asTrimmedString(value);
  if (!input) return null;
  return input.slice(0, maxLength);
}

function escapeLikeTerm(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function searchTermGroups(value: string) {
  return value
    .split(',')
    .map((group) =>
      group
        .trim()
        .split(/\s+/)
        .map((term) => escapeLikeTerm(term.trim()))
        .filter(Boolean)
        .slice(0, 8),
    )
    .filter((group) => group.length > 0)
    .slice(0, 6);
}

function buildTextSearchCondition(fields: string[], query: string, params: unknown[]) {
  const groups = searchTermGroups(query);
  if (!groups.length) return null;

  const groupConditions = groups.map((terms) => {
    const termConditions = terms.map((term) => {
      params.push(`%${term}%`);
      const index = params.length;
      return `(${fields.map((field) => `${field} ILIKE $${index} ESCAPE '\\'`).join(' OR ')})`;
    });
    return `(${termConditions.join(' AND ')})`;
  });

  return `(${groupConditions.join(' OR ')})`;
}

export function normalizeBriefingFilters(input: EnforcementBriefingFilters = {}): NormalizedBriefingFilters {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - DEFAULT_RANGE_DAYS);

  const dateFrom = asTrimmedString(input.dateFrom) || toIsoDate(defaultFrom);
  const dateTo = asTrimmedString(input.dateTo) || toIsoDate(now);
  const start = parseIsoDate(dateFrom, 'dateFrom');
  const end = parseIsoDate(dateTo, 'dateTo');

  if (start.getTime() > end.getTime()) {
    throw new Error('dateFrom must be before dateTo');
  }
  if (daysBetween(start, end) > MAX_RANGE_DAYS) {
    throw new Error('Briefing date range cannot exceed five years');
  }

  const currency = input.currency === 'EUR' ? 'EUR' : 'GBP';
  const requestedLimit = Number(input.limit ?? MAX_EVIDENCE_ROWS);
  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : MAX_EVIDENCE_ROWS, 1),
    MAX_EVIDENCE_ROWS,
  );

  const personaId = normalizeOptionalText(input.personaId, 80);
  if (personaId && !getPersona(personaId)) {
    throw new Error(`Unknown personaId: ${personaId}`);
  }

  return {
    dateFrom,
    dateTo,
    regulator: normalizeRegulator(input.regulator),
    country: normalizeCountry(input.country),
    breachCategory: normalizeOptionalText(input.breachCategory, 80),
    firmCategory: normalizeOptionalText(input.firmCategory, 120),
    personaId,
    query: normalizeOptionalText(input.query, 240),
    currency,
    limit,
  };
}

function buildPersonaConditions(persona: FirmPersona, params: unknown[], conditions: string[]) {
  const regulatorMatches = persona.regulators
    .map((regulator) => regulator.toUpperCase())
    .filter((regulator) => VALID_REGULATORS.has(regulator));
  const keywordPatterns = [...persona.keywords, ...persona.sectors]
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((term) => `%${escapeLikeTerm(term)}%`);

  const personaParts: string[] = [];
  if (regulatorMatches.length) {
    params.push(regulatorMatches);
    personaParts.push(`regulator = ANY($${params.length}::text[])`);
  }
  if (keywordPatterns.length) {
    params.push(keywordPatterns);
    personaParts.push(`(
      COALESCE(firm_category, '') ILIKE ANY($${params.length}::text[])
      OR COALESCE(breach_type, '') ILIKE ANY($${params.length}::text[])
      OR COALESCE(summary, '') ILIKE ANY($${params.length}::text[])
      OR COALESCE(breach_categories::text, '') ILIKE ANY($${params.length}::text[])
    )`);
  }
  if (personaParts.length) {
    conditions.push(`(${personaParts.join(' OR ')})`);
  }
}

function buildWhereClause(filters: NormalizedBriefingFilters): WhereClause {
  const conditions = ['date_issued >= $1::date', 'date_issued <= $2::date'];
  const params: unknown[] = [filters.dateFrom, filters.dateTo];

  if (filters.regulator) {
    params.push(filters.regulator);
    conditions.push(`regulator = $${params.length}`);
  } else {
    params.push([...VALID_REGULATORS]);
    conditions.push(`regulator = ANY($${params.length}::text[])`);
  }

  if (filters.country) {
    params.push(filters.country);
    conditions.push(`country_code = $${params.length}`);
  }

  if (filters.breachCategory) {
    params.push(`%${escapeLikeTerm(filters.breachCategory)}%`);
    conditions.push(`(
      COALESCE(breach_type, '') ILIKE $${params.length} ESCAPE '\\'
      OR COALESCE(breach_categories::text, '') ILIKE $${params.length} ESCAPE '\\'
    )`);
  }

  if (filters.firmCategory) {
    params.push(`%${escapeLikeTerm(filters.firmCategory)}%`);
    conditions.push(`(
      COALESCE(firm_category, '') ILIKE $${params.length} ESCAPE '\\'
      OR COALESCE(summary, '') ILIKE $${params.length} ESCAPE '\\'
    )`);
  }

  if (filters.query) {
    const searchCondition = buildTextSearchCondition(
      [
        `COALESCE(firm_individual, '')`,
        `COALESCE(regulator, '')`,
        `COALESCE(regulator_full_name, '')`,
        `COALESCE(country_name, '')`,
        `COALESCE(breach_type, '')`,
        `COALESCE(summary, '')`,
        `COALESCE(breach_categories::text, '')`,
      ],
      filters.query,
      params,
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  if (filters.personaId) {
    const persona = getPersona(filters.personaId);
    if (persona) buildPersonaConditions(persona, params, conditions);
  }

  return {
    clause: `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalIsoDate(value);
  }
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);
  return text.slice(0, 10);
}

export function normalizeBreachCategories(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    if (typeof parsed === 'string') return normalizeBreachCategories(parsed);
  } catch {
    // Fall through to delimiter split.
  }
  return trimmed
    .replace(/[{}[\]"]/g, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapEvidenceRow(row: Record<string, unknown>): EnforcementEvidenceRow {
  const firm = String(row.firm_individual ?? 'Unknown firm');
  const firmCategory = row.firm_category ? String(row.firm_category) : null;
  const regulator = String(row.regulator ?? '');
  const breachType = row.breach_type ? String(row.breach_type) : null;
  const breachCategories = normalizeBreachCategories(row.breach_categories);
  const summary = row.summary ? String(row.summary) : null;

  return {
    id: String(row.id ?? ''),
    regulator,
    regulatorFullName: String(row.regulator_full_name ?? row.regulator ?? ''),
    countryCode: String(row.country_code ?? ''),
    countryName: String(row.country_name ?? ''),
    firm,
    firmCategory,
    amountOriginal: toNullableNumber(row.amount_original),
    currency: String(row.currency ?? 'GBP'),
    amountGbp: toNullableNumber(row.amount_gbp),
    amountEur: toNullableNumber(row.amount_eur),
    dateIssued: normalizeDateText(row.date_issued),
    year: Math.trunc(toNumber(row.year_issued)),
    breachType,
    breachCategories,
    regActionsCategory: classifyEnforcementAction({
      firm,
      firmCategory,
      regulator,
      breachType,
      breachCategories,
      summary,
    }),
    summary,
    noticeUrl: row.notice_url ? String(row.notice_url) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
  };
}

async function fetchEvidenceRows(filters: NormalizedBriefingFilters, limit: number) {
  const sql = getSqlClient();
  const where = buildWhereClause(filters);
  const rows = await sql(
    `
    SELECT
      id,
      regulator,
      regulator_full_name,
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
      breach_type,
      breach_categories,
      summary,
      notice_url,
      source_url
    FROM public.all_regulatory_fines
    ${where.clause}
    ORDER BY date_issued DESC, amount_gbp DESC NULLS LAST
    LIMIT $${where.params.length + 1}
    `,
    [...where.params, limit],
  );
  return rows.map(mapEvidenceRow);
}

async function fetchTotalCount(filters: NormalizedBriefingFilters) {
  const sql = getSqlClient();
  const where = buildWhereClause(filters);
  const rows = await sql(
    `SELECT COUNT(*)::int AS total FROM public.all_regulatory_fines ${where.clause}`,
    where.params,
  );
  return Math.trunc(toNumber(rows[0]?.total));
}

function selectedAmount(row: EnforcementEvidenceRow, currency: 'GBP' | 'EUR') {
  return currency === 'EUR' ? row.amountEur : row.amountGbp;
}

function formatAmount(value: number, currency: 'GBP' | 'EUR') {
  if (!Number.isFinite(value) || value <= 0) return 'non-monetary';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function humanizeCategory(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function topEntries<T>(
  map: Map<string, T & { count: number; totalAmount: number }>,
  count = 5,
) {
  return [...map.values()]
    .sort((left, right) => right.count - left.count || right.totalAmount - left.totalAmount)
    .slice(0, count);
}

export function buildDeterministicStats(
  rows: EnforcementEvidenceRow[],
  totalActions: number,
  currency: 'GBP' | 'EUR',
): EnforcementBriefingStats {
  const regulatorMap = new Map<string, { regulator: string; name: string; count: number; totalAmount: number }>();
  const firmMap = new Map<string, { firm: string; count: number; totalAmount: number }>();
  const categoryMap = new Map<string, { category: string; count: number; totalAmount: number }>();

  let totalAmount = 0;
  let maxAmount = 0;
  let monetaryActions = 0;
  let earliestDate: string | null = null;
  let latestDate: string | null = null;

  for (const row of rows) {
    const amount = selectedAmount(row, currency) ?? 0;
    if (amount > 0) {
      totalAmount += amount;
      monetaryActions += 1;
      maxAmount = Math.max(maxAmount, amount);
    }
    if (!earliestDate || row.dateIssued < earliestDate) earliestDate = row.dateIssued;
    if (!latestDate || row.dateIssued > latestDate) latestDate = row.dateIssued;

    const regulator = regulatorMap.get(row.regulator) ?? {
      regulator: row.regulator,
      name: row.regulatorFullName,
      count: 0,
      totalAmount: 0,
    };
    regulator.count += 1;
    regulator.totalAmount += amount;
    regulatorMap.set(row.regulator, regulator);

    const firm = firmMap.get(row.firm) ?? { firm: row.firm, count: 0, totalAmount: 0 };
    firm.count += 1;
    firm.totalAmount += amount;
    firmMap.set(row.firm, firm);

    const categoryName = row.regActionsCategory.label;
    const category = categoryMap.get(categoryName) ?? { category: categoryName, count: 0, totalAmount: 0 };
    category.count += 1;
    category.totalAmount += amount;
    categoryMap.set(categoryName, category);
  }

  return {
    totalActions,
    sampledActions: rows.length,
    monetaryActions,
    sampledTotalAmount: totalAmount,
    sampledAverageAmount: monetaryActions ? totalAmount / monetaryActions : 0,
    sampledMaxAmount: maxAmount,
    totalAmount,
    averageAmount: monetaryActions ? totalAmount / monetaryActions : 0,
    maxAmount,
    earliestDate,
    latestDate,
    topRegulators: topEntries(regulatorMap),
    topFirms: topEntries(firmMap),
    topCategories: topEntries(categoryMap),
  };
}

export function buildDeterministicBriefing(
  rows: EnforcementEvidenceRow[],
  stats: EnforcementBriefingStats,
  filters: NormalizedBriefingFilters,
): EnforcementBriefingPayload {
  const topRegulators = stats.topRegulators.map((item) => item.regulator).join(', ') || 'tracked regulators';
  const topCategories = stats.topCategories.map((item) => item.category).join(', ') || 'mixed enforcement themes';
  const period = `${filters.dateFrom} to ${filters.dateTo}`;
  const monetaryLine = stats.sampledTotalAmount > 0
    ? `${formatAmount(stats.sampledTotalAmount, filters.currency)} in sampled monetary penalties`
    : 'mostly non-monetary or unquantified actions in the sampled set';

  const keyThemes = stats.topCategories.slice(0, 4).map((category) => {
    const evidenceIds = rows
      .map((row, rowIndex) => {
        return row.regActionsCategory.label === category.category ? `C${rowIndex + 1}` : null;
      })
      .filter((id): id is string => Boolean(id))
      .slice(0, 3)
      .map((id) => id);

    return {
      title: category.category,
      narrative: `${category.count} sampled action${category.count !== 1 ? 's' : ''} involved ${category.category.toLowerCase()}, with ${formatAmount(category.totalAmount, filters.currency)} in sampled monetary value.`,
      evidenceIds,
      implication: 'Review whether current MI, control testing, escalation, and remediation evidence would stand up against the issues visible in these notices.',
      count: category.count,
    };
  });

  const notablePrecedents = rows.slice(0, 5).map((row, index) => ({
    firm: row.firm,
    regulator: row.regulator,
    dateIssued: row.dateIssued,
    reason: row.breachType || row.summary?.slice(0, 140) || 'Regulatory enforcement action',
    citationId: `C${index + 1}`,
  }));

  return {
    executiveSummary: `Between ${period}, RegActions found ${stats.totalActions} matching enforcement action${stats.totalActions !== 1 ? 's' : ''}. The sampled evidence is led by ${topRegulators}, with recurring themes around ${topCategories}. The sample includes ${monetaryLine}.`,
    keyThemes,
    notablePrecedents,
    mlroWatchPoints: [
      'Compare the recurring breach themes against the latest board MI and compliance monitoring plan.',
      'Check whether remediation evidence is current, dated, owned, and mapped to each relevant control.',
      'Prioritise areas where similar firms show repeated failures or large penalties.',
    ],
    confidence: rows.length >= 15 ? 'medium' : 'low',
    limitations: [
      'Generated from the matched RegActions records and available notice summaries only.',
      'Use the official notices for legal interpretation and final compliance decisions.',
    ],
    disclaimer: 'This is enforcement pattern analysis for compliance monitoring. It is not legal, regulatory, or compliance advice.',
  };
}

function buildFiltersApplied(filters: NormalizedBriefingFilters) {
  const filtersApplied: string[] = [`${filters.dateFrom} to ${filters.dateTo}`];
  if (filters.regulator) filtersApplied.push(`Regulator: ${filters.regulator}`);
  if (filters.country) filtersApplied.push(`Country: ${filters.country}`);
  if (filters.personaId) {
    const persona = getPersona(filters.personaId);
    filtersApplied.push(`Firm type: ${persona?.name || filters.personaId}`);
  }
  if (filters.breachCategory) filtersApplied.push(`Theme: ${filters.breachCategory}`);
  if (filters.firmCategory) filtersApplied.push(`Firm category: ${filters.firmCategory}`);
  if (filters.query) filtersApplied.push(`Keyword: ${filters.query}`);
  return filtersApplied;
}

export function buildQualifiedDatasetSummary(params: {
  filters: NormalizedBriefingFilters;
  stats: EnforcementBriefingStats;
  evidenceRows: EnforcementEvidenceRow[];
}): QualifiedDatasetSummary {
  const { filters, stats, evidenceRows } = params;
  const regulatorLabel = filters.regulator || 'selected regulators';
  const themeLabel = stats.topCategories[0]?.category || 'mixed enforcement themes';

  return {
    source: 'RegActions qualified enforcement dataset',
    taxonomy: {
      name: 'RegActions enforcement taxonomy',
      version: '2026-05-20',
      basis: 'Deterministic classification from breach type, source categories, firm category, and notice summary before model use.',
    },
    scopeLabel: `${stats.totalActions.toLocaleString('en-GB')} qualified actions for ${regulatorLabel}, led by ${themeLabel}`,
    filtersApplied: buildFiltersApplied(filters),
    matchedActions: stats.totalActions,
    sampledActions: stats.sampledActions,
    evidenceActions: evidenceRows.length,
    evidenceLimit: filters.limit,
    requestedDateRange: {
      from: filters.dateFrom,
      to: filters.dateTo,
    },
    evidenceDateRange: stats.earliestDate && stats.latestDate
      ? { from: stats.earliestDate, to: stats.latestDate }
      : null,
    sampledMonetaryValue: stats.sampledTotalAmount,
    topRegulators: stats.topRegulators.slice(0, 5).map((item) => ({
      label: item.regulator,
      count: item.count,
    })),
    topThemes: stats.topCategories.slice(0, 6).map((item) => ({
      label: item.category,
      count: item.count,
      sampledAmount: item.totalAmount,
    })),
    topFirms: stats.topFirms.slice(0, 5).map((item) => ({
      label: item.firm,
      count: item.count,
      sampledAmount: item.totalAmount,
    })),
    modelInput: {
      sentToModel: evidenceRows.length > 0,
      evidenceRowsSent: evidenceRows.length,
      note: evidenceRows.length > 0
        ? `DeepSeek receives this summary plus ${evidenceRows.length} selected evidence records, each with a citation ID. It does not browse the web or receive unqualified records.`
        : 'DeepSeek is skipped because no qualified enforcement actions matched the filters.',
    },
  };
}

function makeCitations(rows: EnforcementEvidenceRow[]): EnforcementBriefingCitation[] {
  return rows.slice(0, MAX_EVIDENCE_ROWS).map((row, index) => ({
    id: `C${index + 1}`,
    actionId: row.id,
    firm: row.firm,
    regulator: row.regulator,
    dateIssued: row.dateIssued,
    title: `${row.firm} - ${row.breachType || row.regulatorFullName}`,
    url: row.noticeUrl || row.sourceUrl,
  }));
}

function compactEvidence(rows: EnforcementEvidenceRow[], filters: NormalizedBriefingFilters) {
  return rows.slice(0, filters.limit).map((row, index) => ({
    citationId: `C${index + 1}`,
    firm: row.firm,
    regulator: row.regulator,
    country: row.countryName,
    date: row.dateIssued,
    amount: selectedAmount(row, filters.currency),
    breachType: row.breachType,
    regActionsCategory: {
      label: row.regActionsCategory.label,
      domain: row.regActionsCategory.domain,
      confidence: row.regActionsCategory.confidence,
      matchedSignals: row.regActionsCategory.matchedSignals,
    },
    categories: row.breachCategories.slice(0, 6),
    summary: (row.summary || '').slice(0, 700),
    sourceUrl: row.noticeUrl || row.sourceUrl,
  }));
}

function buildAiPrompt(params: {
  filters: NormalizedBriefingFilters;
  stats: EnforcementBriefingStats;
  datasetSummary: QualifiedDatasetSummary;
  rows: EnforcementEvidenceRow[];
}) {
  const { filters, stats, datasetSummary, rows } = params;
  return [
    {
      role: 'system',
      content: [
        'You are RegActions, an enforcement intelligence analyst for UK/EU/global financial services compliance leaders.',
        'Write concise, evidence-grounded analysis for an MLRO or Head of Compliance.',
        'Use the supplied regActionsCategory as the primary taxonomy for themes; raw source categories are secondary context only.',
        'Do not give legal or compliance advice. Do not invent facts outside the supplied evidence.',
        'Return valid JSON only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Summarise enforcement patterns and themes from the supplied RegActions evidence.',
        requiredJsonShape: {
          executiveSummary: 'string, 120-180 words',
          keyThemes: [
            {
              title: 'string',
              narrative: 'string, 1-2 sentences',
              evidenceIds: ['C1'],
              implication: 'string, practical monitoring implication',
            },
          ],
          notablePrecedents: [
            {
              firm: 'string',
              regulator: 'string',
              dateIssued: 'YYYY-MM-DD',
              reason: 'string',
              citationId: 'C1',
            },
          ],
          mlroWatchPoints: ['string'],
          confidence: 'high|medium|low',
          limitations: ['string'],
        },
        filters,
        qualifiedDataset: datasetSummary,
        aggregateStats: stats,
        evidence: compactEvidence(rows, filters),
      }),
    },
  ];
}

function parseJsonObject(content: string) {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>;
    }
    throw new Error('DeepSeek response was not valid JSON');
  }
}

function stringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'medium';
}

export function parseDeepSeekBriefingJson(content: string, fallback: EnforcementBriefingPayload): EnforcementBriefingPayload {
  const parsed = parseJsonObject(content);
  const keyThemes = Array.isArray(parsed.keyThemes)
    ? parsed.keyThemes.slice(0, 6).map((item) => {
      const theme = item as Record<string, unknown>;
      return {
        title: String(theme.title || 'Enforcement theme').slice(0, 120),
        narrative: String(theme.narrative || '').slice(0, 900),
        evidenceIds: stringArray(theme.evidenceIds).filter((id) => /^C\d+$/.test(id)),
        implication: String(theme.implication || '').slice(0, 600),
      };
    }).filter((item) => item.narrative || item.implication)
    : fallback.keyThemes;

  const notablePrecedents = Array.isArray(parsed.notablePrecedents)
    ? parsed.notablePrecedents.slice(0, 6).map((item) => {
      const precedent = item as Record<string, unknown>;
      const citationId = String(precedent.citationId || '');
      return {
        firm: String(precedent.firm || 'Unknown firm').slice(0, 160),
        regulator: String(precedent.regulator || '').slice(0, 40),
        dateIssued: String(precedent.dateIssued || '').slice(0, 10),
        reason: String(precedent.reason || '').slice(0, 500),
        citationId: /^C\d+$/.test(citationId) ? citationId : null,
      };
    })
    : fallback.notablePrecedents;

  return {
    executiveSummary: String(parsed.executiveSummary || fallback.executiveSummary).slice(0, 2000),
    keyThemes,
    notablePrecedents,
    mlroWatchPoints: stringArray(parsed.mlroWatchPoints, fallback.mlroWatchPoints),
    confidence: normalizeConfidence(parsed.confidence ?? fallback.confidence),
    limitations: stringArray(parsed.limitations, fallback.limitations),
    disclaimer: fallback.disclaimer,
  };
}

async function callDeepSeekBriefing(params: {
  filters: NormalizedBriefingFilters;
  stats: EnforcementBriefingStats;
  datasetSummary: QualifiedDatasetSummary;
  rows: EnforcementEvidenceRow[];
  fallback: EnforcementBriefingPayload;
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const model = process.env.AGENTIC_BRIEFING_MODEL?.trim()
    || process.env.AI_TRIAGE_MODEL?.trim()
    || DEFAULT_DEEPSEEK_MODEL;

  if (!apiKey) {
    return { briefing: params.fallback, model, fallbackUsed: true };
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: buildAiPrompt(params),
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      temperature: 0.2,
      max_tokens: Number(process.env.AGENTIC_BRIEFING_MAX_OUTPUT_TOKENS || 1800),
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek request failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content || '{}';
  return {
    briefing: parseDeepSeekBriefingJson(content, params.fallback),
    model,
    fallbackUsed: false,
  };
}

function stableJson(value: unknown) {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

export function buildEvidenceHash(rows: Array<Pick<EnforcementEvidenceRow, 'id' | 'dateIssued' | 'summary'>>) {
  const payload = rows.map((row) => ({
    id: row.id,
    dateIssued: row.dateIssued,
    summaryHash: crypto.createHash('sha256').update(row.summary || '').digest('hex').slice(0, 16),
  }));
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildCacheKey(filters: NormalizedBriefingFilters, evidenceHash: string) {
  return crypto
    .createHash('sha256')
    .update(`${CACHE_SCHEMA_VERSION}:${stableJson(filters)}:${evidenceHash}`)
    .digest('hex');
}

async function ensureAgenticTables() {
  if (tableEnsureAttempted) return tablePersistenceAvailable;
  tableEnsureAttempted = true;
  try {
    const sql = getSqlClient();
    await sql(`
      CREATE TABLE IF NOT EXISTS agentic_briefing_cache (
        cache_key TEXT PRIMARY KEY,
        evidence_hash TEXT NOT NULL,
        normalized_filters JSONB NOT NULL,
        response_payload JSONB NOT NULL,
        model TEXT,
        fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agentic_request_log (
        id BIGSERIAL PRIMARY KEY,
        client_key TEXT NOT NULL,
        route TEXT NOT NULL,
        status TEXT NOT NULL,
        filter_hash TEXT,
        latency_ms INTEGER,
        fallback_used BOOLEAN,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_agentic_request_log_client_created
        ON agentic_request_log(client_key, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agentic_briefing_cache_expires
        ON agentic_briefing_cache(expires_at);
    `, []);
    tablePersistenceAvailable = true;
  } catch (error) {
    tablePersistenceAvailable = false;
    console.warn('Agentic briefing persistence unavailable:', error instanceof Error ? error.message : String(error));
  }
  return tablePersistenceAvailable;
}

async function readCache(cacheKey: string): Promise<EnforcementBriefingResult | null> {
  if (!await ensureAgenticTables()) return null;
  try {
    const sql = getSqlClient();
    const rows = await sql(
      `SELECT response_payload
       FROM agentic_briefing_cache
       WHERE cache_key = $1 AND expires_at > NOW()
       LIMIT 1`,
      [cacheKey],
    ) as unknown as CacheRow[];
    return rows[0]?.response_payload ? { ...rows[0].response_payload, cached: true } : null;
  } catch {
    return null;
  }
}

async function writeCache(cacheKey: string, result: EnforcementBriefingResult) {
  if (!await ensureAgenticTables()) return;
  try {
    const sql = getSqlClient();
    await sql(
      `INSERT INTO agentic_briefing_cache (
        cache_key,
        evidence_hash,
        normalized_filters,
        response_payload,
        model,
        fallback_used,
        expires_at
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, NOW() + INTERVAL '1 hour' * $7::int)
      ON CONFLICT (cache_key)
      DO UPDATE SET
        response_payload = EXCLUDED.response_payload,
        model = EXCLUDED.model,
        fallback_used = EXCLUDED.fallback_used,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()`,
      [
        cacheKey,
        result.evidenceHash,
        JSON.stringify(result.filters),
        JSON.stringify(result),
        result.model,
        result.fallbackUsed,
        CACHE_TTL_HOURS,
      ],
    );
  } catch (error) {
    console.warn('Failed to write agentic briefing cache:', error instanceof Error ? error.message : String(error));
  }
}

export function hashClientKey(value: string | undefined | null) {
  return crypto.createHash('sha256').update(value || 'anonymous').digest('hex');
}

function enforceInMemoryAgenticRateLimit(clientKey: string, route: string) {
  const now = Date.now();
  const bucketKey = `${route}:${clientKey}`;
  const current = inMemoryRateLimitBuckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    inMemoryRateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    current.count += 1;
    if (current.count > RATE_LIMIT_PER_HOUR) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
  }

  if (inMemoryRateLimitBuckets.size > IN_MEMORY_RATE_LIMIT_MAX_BUCKETS) {
    for (const [key, bucket] of inMemoryRateLimitBuckets) {
      if (bucket.resetAt <= now) inMemoryRateLimitBuckets.delete(key);
      if (inMemoryRateLimitBuckets.size <= IN_MEMORY_RATE_LIMIT_MAX_BUCKETS) break;
    }
  }
}

export async function enforceAgenticRateLimit(clientKey: string, route = 'enforcement-briefing') {
  if (!await ensureAgenticTables()) {
    enforceInMemoryAgenticRateLimit(clientKey, route);
    return;
  }
  const sql = getSqlClient();
  const rows = await sql(
    `SELECT COUNT(*)::int AS count
     FROM agentic_request_log
     WHERE client_key = $1
       AND route = $2
       AND created_at > NOW() - INTERVAL '1 hour'`,
    [clientKey, route],
  );
  const count = Math.trunc(toNumber(rows[0]?.count));
  if (count >= RATE_LIMIT_PER_HOUR) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }
}

export async function recordAgenticRequest(params: {
  clientKey: string;
  route?: string;
  status: 'success' | 'error';
  filterHash?: string;
  latencyMs?: number;
  fallbackUsed?: boolean;
  errorMessage?: string;
}) {
  if (!await ensureAgenticTables()) return;
  try {
    const sql = getSqlClient();
    await sql(
      `INSERT INTO agentic_request_log (
        client_key,
        route,
        status,
        filter_hash,
        latency_ms,
        fallback_used,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.clientKey,
        params.route || 'enforcement-briefing',
        params.status,
        params.filterHash || null,
        params.latencyMs ?? null,
        params.fallbackUsed ?? null,
        params.errorMessage?.slice(0, 500) || null,
      ],
    );
  } catch {
    // Non-fatal analytics path.
  }
}

export async function generateEnforcementBriefing(
  rawFilters: EnforcementBriefingFilters = {},
): Promise<EnforcementBriefingResult> {
  const filters = normalizeBriefingFilters(rawFilters);
  const sampleRows = await fetchEvidenceRows(filters, STATS_SAMPLE_ROWS);
  const evidenceRows = sampleRows.slice(0, filters.limit);
  const totalActions = await fetchTotalCount(filters);
  const stats = buildDeterministicStats(sampleRows, totalActions, filters.currency);
  const fallback = buildDeterministicBriefing(evidenceRows, stats, filters);
  const citations = makeCitations(evidenceRows);
  const datasetSummary = buildQualifiedDatasetSummary({ filters, stats, evidenceRows });
  const evidenceHash = buildEvidenceHash(evidenceRows);
  const cacheKey = buildCacheKey(filters, evidenceHash);
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  let briefing = fallback;
  let model = process.env.AGENTIC_BRIEFING_MODEL?.trim()
    || process.env.AI_TRIAGE_MODEL?.trim()
    || DEFAULT_DEEPSEEK_MODEL;
  let fallbackUsed = true;

  if (evidenceRows.length > 0) {
    try {
      const ai = await callDeepSeekBriefing({ filters, stats, datasetSummary, rows: evidenceRows, fallback });
      briefing = ai.briefing;
      model = ai.model;
      fallbackUsed = ai.fallbackUsed;
    } catch (error) {
      console.warn('DeepSeek briefing generation failed:', error instanceof Error ? error.message : String(error));
    }
  }

  datasetSummary.modelInput = fallbackUsed || evidenceRows.length === 0
    ? {
      sentToModel: false,
      evidenceRowsSent: 0,
      note: evidenceRows.length > 0
        ? `DeepSeek was not used for this response. RegActions selected ${evidenceRows.length} cited evidence records and generated a deterministic briefing from the qualified dataset.`
        : 'DeepSeek is skipped because no qualified enforcement actions matched the filters.',
    }
    : {
      sentToModel: true,
      evidenceRowsSent: evidenceRows.length,
      note: `DeepSeek received this summary plus ${evidenceRows.length} selected evidence records, each with a citation ID. It did not browse the web or receive unqualified records.`,
    };

  const result: EnforcementBriefingResult = {
    briefing,
    stats,
    datasetSummary,
    themes: briefing.keyThemes,
    citations,
    filters,
    generatedAt: new Date().toISOString(),
    model,
    fallbackUsed,
    cached: false,
    evidenceHash,
  };

  await writeCache(cacheKey, result);
  return result;
}
