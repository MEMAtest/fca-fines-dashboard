import crypto from 'node:crypto';
import { getSqlClient } from '../db.js';
import { PUBLIC_REGULATOR_CODES } from '../../src/data/regulatorCoverage.js';
import { UK_ENFORCEMENT_REGULATOR_CODES } from '../../src/data/ukEnforcement.js';
import {
  normalizeBreachCategories,
  type EnforcementEvidenceRow,
} from './enforcementBriefingAgent.js';
import { classifyEnforcementAction } from './enforcementTaxonomy.js';
import { FIRM_PERSONAS, getPersona, type FirmPersona } from './firmPersonas.js';

const DATA_LAYER_VERSION = '2026-05-21-agentic-data-layer-v1';
const MAX_PROFILE_TERMS = 16;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_DATE_RANGE_DAYS = 366 * 5;
const MAX_DATE_RANGE_DAYS = 366 * 5;
const MAX_QUERY_LIMIT = 1_500;

const VALID_REGULATOR_CODES = [
  ...PUBLIC_REGULATOR_CODES,
  ...UK_ENFORCEMENT_REGULATOR_CODES,
];
const VALID_REGULATORS = new Set(VALID_REGULATOR_CODES);
const VALID_REGULATOR_LOOKUP = new Map(
  VALID_REGULATOR_CODES.map((code) => [code.toUpperCase(), code]),
);

const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
];

export interface AgenticFirmProfileInput {
  profileName?: string | null;
  personaId?: string | null;
  firmType?: string | null;
  sizeBand?: string | null;
  jurisdictions?: string[];
  regulators?: string[];
  products?: string[];
  customerTypes?: string[];
  permissions?: string[];
  riskFlags?: string[];
  recentIncidents?: string[];
  keywords?: string[];
}

export interface AgenticFirmProfile {
  profileName: string;
  personaId: string | null;
  firmType: string | null;
  sizeBand: string | null;
  jurisdictions: string[];
  regulators: string[];
  products: string[];
  customerTypes: string[];
  permissions: string[];
  riskFlags: string[];
  recentIncidents: string[];
  keywords: string[];
}

export interface ScoredPrecedent {
  citationId: string;
  action: EnforcementEvidenceRow;
  score: number;
  matchedSignals: string[];
  explanation: string;
}

export interface AgenticRiskTheme {
  label: string;
  domain: string;
  count: number;
  averageScore: number;
  totalAmountGbp: number;
  evidenceIds: string[];
  watchPoint: string;
}

export interface AgenticCitation {
  id: string;
  actionId: string;
  firm: string;
  regulator: string;
  dateIssued: string;
  category: string;
  summary: string;
  url: string | null;
}

export interface ComparatorAnalysis {
  capability: 'Comparator agent';
  profile: AgenticFirmProfile;
  summary: string;
  riskThemes: AgenticRiskTheme[];
  closestPrecedents: ScoredPrecedent[];
  citations: AgenticCitation[];
  methodology: string[];
}

export interface HorizonScanAnalysis {
  capability: 'Horizon scanning agent';
  lookbackDays: number;
  summary: string;
  newRelevantActions: ScoredPrecedent[];
  trendDeltas: Array<{
    label: string;
    recentCount: number;
    previousCount: number;
    change: number;
  }>;
  watchlistMatches: string[];
  citations: AgenticCitation[];
}

export interface ControlGapAnalysis {
  capability: 'Control gap analyser';
  summary: string;
  assessedControls: Array<{
    theme: string;
    status: 'covered' | 'partial' | 'not evidenced';
    matchedTerms: string[];
    expectedEvidence: string[];
    precedentEvidenceIds: string[];
  }>;
  priorityGaps: Array<{
    theme: string;
    severity: 'high' | 'medium' | 'low';
    reason: string;
    suggestedEvidence: string[];
  }>;
}

export interface ResearchAnalysis {
  capability: 'Multi-step research agent';
  question: string;
  answer: string;
  plan: Array<{ step: string; status: 'completed' }>;
  parsedFilters: {
    dateFrom: string;
    dateTo: string;
    regulators: string[];
    countries: string[];
    categories: string[];
    keywords: string[];
  };
  topFindings: AgenticRiskTheme[];
  citations: AgenticCitation[];
}

export interface ImpactAnalysis {
  capability: 'Regulatory change impact agent';
  sourceAction: EnforcementEvidenceRow | null;
  summary: string;
  impactFlags: Array<{
    label: string;
    severity: 'high' | 'medium' | 'low';
    reason: string;
  }>;
  affectedProfiles: Array<{ personaId: string; name: string; score: number; matchedSignals: string[] }>;
  draftMemo: {
    subject: string;
    audience: string;
    body: string[];
  };
  citations: AgenticCitation[];
}

export interface AgenticWorkbenchInput {
  profile?: AgenticFirmProfileInput;
  controlFramework?: string;
  controls?: string[];
  researchQuestion?: string;
  lookbackDays?: number;
  dateFrom?: string;
  dateTo?: string;
  regulator?: string;
  country?: string;
  actionId?: string;
}

export interface AgenticWorkbenchResult {
  success: true;
  generatedAt: string;
  version: string;
  profile: AgenticFirmProfile;
  comparator: ComparatorAnalysis;
  horizonScan: HorizonScanAnalysis;
  controlGapAnalysis: ControlGapAnalysis;
  research: ResearchAnalysis;
  impact: ImpactAnalysis;
}

interface FetchActionOptions {
  dateFrom?: string;
  dateTo?: string;
  regulators?: string[];
  countries?: string[];
  query?: string;
  categoryLabels?: string[];
  actionId?: string;
  limit?: number;
}

const CONTROL_LIBRARY: Record<string, { terms: string[]; expectedEvidence: string[] }> = {
  'AML and financial crime': {
    terms: [
      'aml',
      'anti money laundering',
      'customer due diligence',
      'cdd',
      'kyc',
      'transaction monitoring',
      'financial crime',
      'suspicious activity',
    ],
    expectedEvidence: [
      'CDD and enhanced due diligence standards',
      'Transaction monitoring scenario governance',
      'Financial crime MI and escalation records',
    ],
  },
  'Sanctions screening': {
    terms: ['sanctions', 'ofsi', 'ofac', 'screening', 'designated person', 'asset freeze'],
    expectedEvidence: [
      'Sanctions screening configuration and tuning evidence',
      'Alert investigation quality checks',
      'List update and payment-screening controls',
    ],
  },
  'Market abuse and disclosure': {
    terms: ['market abuse', 'inside information', 'insider', 'surveillance', 'mar', 'trading'],
    expectedEvidence: [
      'Market abuse surveillance coverage map',
      'Inside information escalation process',
      'Trade surveillance alert testing',
    ],
  },
  'Suitability and advice': {
    terms: ['suitability', 'advice', 'pension', 'retirement', 'client best interest', 'risk profile'],
    expectedEvidence: [
      'Suitability file-review outcomes',
      'Advice QA and vulnerable customer checks',
      'Product replacement and transfer rationale evidence',
    ],
  },
  'Client assets and safeguarding': {
    terms: ['client money', 'client assets', 'custody', 'safeguarding', 'reconciliation'],
    expectedEvidence: [
      'Client asset reconciliation records',
      'Safeguarding account attestations',
      'CASS breach log and remediation tracking',
    ],
  },
  'Consumer protection': {
    terms: ['consumer duty', 'tcf', 'complaints', 'redress', 'vulnerable', 'affordability'],
    expectedEvidence: [
      'Consumer outcomes MI',
      'Complaints root-cause analysis',
      'Vulnerability and affordability testing',
    ],
  },
  'Financial promotions and communications': {
    terms: ['financial promotion', 'advertising', 'marketing', 'risk warning', 'approval'],
    expectedEvidence: [
      'Financial promotion approval logs',
      'Risk-warning and balance checks',
      'Ongoing monitoring of live promotions',
    ],
  },
  'Governance, systems and controls': {
    terms: ['governance', 'systems and controls', 'oversight', 'risk management', 'policies', 'board'],
    expectedEvidence: [
      'Board and committee MI',
      'Control testing schedule',
      'Policy ownership and exceptions tracking',
    ],
  },
  'Authorisation and threshold conditions': {
    terms: ['authorisation', 'permission', 'registration', 'threshold condition', 'vreq'],
    expectedEvidence: [
      'Permissions and regulatory perimeter register',
      'Threshold-condition attestation evidence',
      'Change-in-control and appointed-representative checks',
    ],
  },
  'Regulatory reporting and prudential': {
    terms: ['regulatory reporting', 'transaction reporting', 'capital', 'liquidity', 'prudential'],
    expectedEvidence: [
      'Regulatory returns controls',
      'Transaction reporting reconciliations',
      'Capital and liquidity monitoring evidence',
    ],
  },
  'Operational resilience and cyber': {
    terms: ['operational resilience', 'cyber', 'incident', 'outsourcing', 'business continuity'],
    expectedEvidence: [
      'Important business service mapping',
      'Incident response and cyber testing evidence',
      'Outsourcing and third-party oversight records',
    ],
  },
  'Fraud, scams and dishonest conduct': {
    terms: ['fraud', 'scam', 'misappropriation', 'forgery', 'dishonest'],
    expectedEvidence: [
      'Fraud monitoring typology coverage',
      'Escalation and investigation records',
      'Staff conduct and conflicts controls',
    ],
  },
};

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultDateFrom() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - DEFAULT_DATE_RANGE_DAYS);
  return toIsoDate(date);
}

function todayIso() {
  return toIsoDate(new Date());
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9£€$.\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedContains(haystack: string, needle: string) {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return false;
  return haystack.includes(normalizedNeedle);
}

function escapeLikeTerm(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function searchTermGroups(value: string) {
  return value
    .split(',')
    .map((group) =>
      normalizeText(group)
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

function uniqueStrings(values: unknown, maxItems = MAX_PROFILE_TERMS) {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text.slice(0, 120));
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeRegulators(
  values: string[] | undefined,
  options: { strict?: boolean; field?: string } = {},
) {
  const unique = uniqueStrings(values);
  const invalid: string[] = [];
  const normalized = unique
    .map((value) => {
      const regulator = VALID_REGULATOR_LOOKUP.get(value.toUpperCase());
      if (!regulator) invalid.push(value);
      return regulator;
    })
    .filter((value): value is string => Boolean(value));

  if (options.strict && invalid.length) {
    throw new Error(`${options.field || 'regulators'} contains unsupported regulator code: ${invalid[0]}`);
  }

  return normalized;
}

function canonicalCountryCode(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (normalized === 'UK' || normalized === 'UNITED KINGDOM') return 'GB';
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return null;
}

function normalizeCountries(
  values: string[] | undefined,
  options: { strict?: boolean; field?: string } = {},
) {
  const unique = uniqueStrings(values);
  const invalid: string[] = [];
  const seen = new Set<string>();
  const normalized = unique
    .map((value) => {
      const country = canonicalCountryCode(value);
      if (!country) invalid.push(value);
      return country;
    })
    .filter((value): value is string => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });

  if (options.strict && invalid.length) {
    throw new Error(`${options.field || 'countries'} contains unsupported country code: ${invalid[0]}`);
  }

  return normalized;
}

function parseIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toIsoDate(parsed) !== value) {
    throw new Error(`${field} is not a valid date`);
  }
  return parsed;
}

function daysBetween(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function normalizeDateRange(options: Pick<FetchActionOptions, 'dateFrom' | 'dateTo'> = {}) {
  const dateFrom = options.dateFrom || defaultDateFrom();
  const dateTo = options.dateTo || todayIso();
  const start = parseIsoDate(dateFrom, 'dateFrom');
  const end = parseIsoDate(dateTo, 'dateTo');

  if (start.getTime() > end.getTime()) {
    throw new Error('dateFrom must be before dateTo');
  }
  if (daysBetween(start, end) > MAX_DATE_RANGE_DAYS) {
    throw new Error('Agentic workbench date range cannot exceed five years');
  }

  return { dateFrom, dateTo, start, end };
}

function dateText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toIsoDate(value);
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);
  return '';
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeAgenticFirmProfile(input: AgenticFirmProfileInput = {}): AgenticFirmProfile {
  const persona = input.personaId ? getPersona(input.personaId) : null;
  const inferredProfileName = input.profileName || persona?.name || input.firmType || 'Example regulated firm';
  const personaRegulators = persona?.regulators.filter((regulator) => VALID_REGULATORS.has(regulator)) || [];
  const personaKeywords = persona ? [...persona.keywords, ...persona.sectors] : [];
  const explicitRegulators = input.regulators?.length ? input.regulators : personaRegulators;

  return {
    profileName: String(inferredProfileName).trim().slice(0, 120) || 'Example regulated firm',
    personaId: persona?.id || null,
    firmType: String(input.firmType || persona?.name || '').trim().slice(0, 120) || null,
    sizeBand: String(input.sizeBand || '').trim().slice(0, 80) || null,
    jurisdictions: normalizeCountries(input.jurisdictions, {
      strict: Boolean(input.jurisdictions?.length),
      field: 'profile.jurisdictions',
    }),
    regulators: normalizeRegulators(explicitRegulators, {
      strict: Boolean(input.regulators?.length),
      field: 'profile.regulators',
    }),
    products: uniqueStrings(input.products),
    customerTypes: uniqueStrings(input.customerTypes),
    permissions: uniqueStrings(input.permissions),
    riskFlags: uniqueStrings(input.riskFlags),
    recentIncidents: uniqueStrings(input.recentIncidents),
    keywords: uniqueStrings([...(input.keywords || []), ...personaKeywords], 28),
  };
}

function mapActionRow(row: Record<string, unknown>): EnforcementEvidenceRow {
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
    dateIssued: dateText(row.date_issued),
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

function rowSearchText(row: EnforcementEvidenceRow) {
  return normalizeText([
    row.firm,
    row.firmCategory,
    row.regulator,
    row.countryName,
    row.breachType,
    row.breachCategories.join(' '),
    row.regActionsCategory.label,
    row.summary,
  ].filter(Boolean).join(' '));
}

function actionFingerprint(row: EnforcementEvidenceRow) {
  return crypto
    .createHash('sha256')
    .update([
      row.id,
      row.firm,
      row.regulator,
      row.dateIssued,
      row.breachType || '',
      row.summary || '',
      row.regActionsCategory.id,
    ].join('|'))
    .digest('hex');
}

async function persistTaxonomyAssignments(rows: EnforcementEvidenceRow[]) {
  if (!rows.length) return;
  const sql = getSqlClient();
  try {
    const selected = rows.slice(0, 300);
    const params: unknown[] = [];
    const tuples = selected.map((row, index) => {
      const base = index * 8;
      params.push(
        row.id,
        row.regActionsCategory.id,
        row.regActionsCategory.label,
        row.regActionsCategory.domain,
        row.regActionsCategory.confidence,
        JSON.stringify(row.regActionsCategory.matchedSignals),
        DATA_LAYER_VERSION,
        actionFingerprint(row),
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb, $${base + 7}, $${base + 8}, NOW())`;
    });
    await sql(
      `
      INSERT INTO agentic_taxonomy_assignments (
        action_id,
        category_id,
        category_label,
        category_domain,
        confidence,
        matched_signals,
        classifier_version,
        action_fingerprint,
        updated_at
      )
      VALUES ${tuples.join(', ')}
      ON CONFLICT (action_id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        category_label = EXCLUDED.category_label,
        category_domain = EXCLUDED.category_domain,
        confidence = EXCLUDED.confidence,
        matched_signals = EXCLUDED.matched_signals,
        classifier_version = EXCLUDED.classifier_version,
        action_fingerprint = EXCLUDED.action_fingerprint,
        updated_at = NOW()
      WHERE agentic_taxonomy_assignments.action_fingerprint IS DISTINCT FROM EXCLUDED.action_fingerprint
         OR agentic_taxonomy_assignments.classifier_version IS DISTINCT FROM EXCLUDED.classifier_version
      `,
      params,
    );
  } catch {
    // The analysis path must still work before migrations are applied.
  }
}

function buildCategorySearchCondition(categoryLabels: string[] | undefined, params: unknown[]) {
  if (!categoryLabels?.length) return null;

  const terms = categoryLabels
    .flatMap((label) => [
      label,
      ...(CONTROL_LIBRARY[label]?.terms || []),
    ])
    .map((term) => escapeLikeTerm(normalizeText(term)))
    .filter(Boolean)
    .filter((term, index, all) => all.indexOf(term) === index)
    .slice(0, 48);

  if (!terms.length) return null;

  const fields = [
    `COALESCE(firm_category, '')`,
    `COALESCE(breach_type, '')`,
    `COALESCE(summary, '')`,
    `COALESCE(breach_categories::text, '')`,
  ];

  return `(${terms.map((term) => {
    params.push(`%${term}%`);
    const index = params.length;
    return `(${fields.map((field) => `${field} ILIKE $${index} ESCAPE '\\'`).join(' OR ')})`;
  }).join(' OR ')})`;
}

async function fetchActionRows(options: FetchActionOptions = {}) {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (options.actionId) {
    params.push(options.actionId);
    conditions.push(`id = $${params.length}`);
  } else {
    const range = normalizeDateRange(options);
    params.push(range.dateFrom);
    conditions.push(`date_issued >= $${params.length}::date`);
    params.push(range.dateTo);
    conditions.push(`date_issued <= $${params.length}::date`);
  }

  const regulators = normalizeRegulators(options.regulators, {
    strict: Boolean(options.regulators?.length),
    field: 'regulators',
  });
  if (regulators.length) {
    params.push(regulators);
    conditions.push(`regulator = ANY($${params.length}::text[])`);
  } else {
    params.push(VALID_REGULATOR_CODES);
    conditions.push(`regulator = ANY($${params.length}::text[])`);
  }

  const countries = normalizeCountries(options.countries, {
    strict: Boolean(options.countries?.length),
    field: 'countries',
  });
  if (countries.length) {
    params.push(countries);
    conditions.push(`country_code = ANY($${params.length}::text[])`);
  }

  if (options.query) {
    const searchCondition = buildTextSearchCondition(
      [
        `COALESCE(firm_individual, '')`,
        `COALESCE(firm_category, '')`,
        `COALESCE(breach_type, '')`,
        `COALESCE(summary, '')`,
        `COALESCE(breach_categories::text, '')`,
      ],
      options.query,
      params,
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const categoryCondition = buildCategorySearchCondition(options.categoryLabels, params);
  if (categoryCondition) conditions.push(categoryCondition);

  params.push(Math.min(Math.max(Math.trunc(options.limit || 800), 1), MAX_QUERY_LIMIT));
  const rows = await getSqlClient()(
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
    WHERE ${conditions.join(' AND ')}
    ORDER BY date_issued DESC, amount_gbp DESC NULLS LAST
    LIMIT $${params.length}
    `,
    params,
  );
  const actions = rows.map(mapActionRow);
  await persistTaxonomyAssignments(actions);

  if (!options.categoryLabels?.length) return actions;
  const categorySet = new Set(options.categoryLabels.map((label) => label.toLowerCase()));
  return actions.filter((row) => categorySet.has(row.regActionsCategory.label.toLowerCase()));
}

function profileTerms(profile: AgenticFirmProfile) {
  return [
    profile.firmType,
    profile.sizeBand,
    ...profile.products,
    ...profile.customerTypes,
    ...profile.permissions,
    ...profile.riskFlags,
    ...profile.recentIncidents,
    ...profile.keywords,
  ].filter(Boolean) as string[];
}

function rowMatchesProfileRegulator(row: EnforcementEvidenceRow, profile: AgenticFirmProfile) {
  return profile.regulators.length > 0
    && profile.regulators.some((regulator) => regulator.toUpperCase() === row.regulator.toUpperCase());
}

export function scoreActionForProfile(row: EnforcementEvidenceRow, profile: AgenticFirmProfile) {
  const text = rowSearchText(row);
  const matchedSignals = new Set<string>();
  let score = 0;

  if (rowMatchesProfileRegulator(row, profile)) {
    score += 14;
    matchedSignals.add(`regulator:${row.regulator}`);
  }

  if (profile.jurisdictions.includes(row.countryCode)) {
    score += 8;
    matchedSignals.add(`jurisdiction:${row.countryCode}`);
  }

  for (const term of profileTerms(profile)) {
    if (!normalizedContains(text, term)) continue;
    score += profile.riskFlags.includes(term) || profile.recentIncidents.includes(term) ? 14 : 7;
    matchedSignals.add(term);
  }

  const library = CONTROL_LIBRARY[row.regActionsCategory.label];
  if (library) {
    const controlTermMatches = library.terms.filter((term) =>
      profile.riskFlags.some((risk) => normalizeText(risk).includes(normalizeText(term)))
      || profile.recentIncidents.some((incident) => normalizeText(incident).includes(normalizeText(term)))
      || profile.keywords.some((keyword) => normalizeText(keyword).includes(normalizeText(term))),
    );
    if (controlTermMatches.length) {
      score += Math.min(24, controlTermMatches.length * 8);
      controlTermMatches.forEach((term) => matchedSignals.add(term));
    }
  }

  if (row.amountGbp && row.amountGbp >= 1_000_000) score += 6;
  if (row.regActionsCategory.label === 'Process-only enforcement records') score -= 18;
  if (row.regActionsCategory.label === 'Other regulatory issues') score -= 8;

  const cappedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: cappedScore,
    matchedSignals: [...matchedSignals].slice(0, 8),
  };
}

function precedentExplanation(row: EnforcementEvidenceRow, matchedSignals: string[]) {
  const parts = [
    `${row.regActionsCategory.label} precedent`,
    row.regulator ? `from ${row.regulator}` : '',
    matchedSignals.length ? `matched on ${matchedSignals.slice(0, 3).join(', ')}` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

function buildCitations(precedents: ScoredPrecedent[], max = 12): AgenticCitation[] {
  return precedents.slice(0, max).map((precedent, index) => ({
    id: precedent.citationId || `C${index + 1}`,
    actionId: precedent.action.id,
    firm: precedent.action.firm,
    regulator: precedent.action.regulator,
    dateIssued: precedent.action.dateIssued,
    category: precedent.action.regActionsCategory.label,
    summary: precedent.action.summary || precedent.action.breachType || '',
    url: precedent.action.noticeUrl || precedent.action.sourceUrl,
  }));
}

function toScoredPrecedents(rows: EnforcementEvidenceRow[], profile: AgenticFirmProfile, minScore = 18) {
  return rows
    .map((action) => {
      const score = scoreActionForProfile(action, profile);
      return {
        citationId: '',
        action,
        score: score.score,
        matchedSignals: score.matchedSignals,
        explanation: precedentExplanation(action, score.matchedSignals),
      };
    })
    .filter((item) => item.score >= minScore)
    .sort((left, right) => right.score - left.score || (right.action.amountGbp || 0) - (left.action.amountGbp || 0))
    .slice(0, 30)
    .map((item, index) => ({
      ...item,
      citationId: `C${index + 1}`,
    }));
}

function buildRiskThemes(precedents: ScoredPrecedent[], maxThemes = 6): AgenticRiskTheme[] {
  const grouped = new Map<string, {
    label: string;
    domain: string;
    scores: number[];
    totalAmountGbp: number;
    evidenceIds: string[];
  }>();

  for (const precedent of precedents) {
    const label = precedent.action.regActionsCategory.label;
    if (label === 'Process-only enforcement records' || label === 'Other regulatory issues') continue;
    const existing = grouped.get(label) || {
      label,
      domain: precedent.action.regActionsCategory.domain,
      scores: [],
      totalAmountGbp: 0,
      evidenceIds: [],
    };
    existing.scores.push(precedent.score);
    existing.totalAmountGbp += precedent.action.amountGbp || 0;
    existing.evidenceIds.push(precedent.citationId);
    grouped.set(label, existing);
  }

  return [...grouped.values()]
    .sort((left, right) => right.scores.length - left.scores.length || average(right.scores) - average(left.scores))
    .slice(0, maxThemes)
    .map((item) => ({
      label: item.label,
      domain: item.domain,
      count: item.scores.length,
      averageScore: Math.round(average(item.scores)),
      totalAmountGbp: Math.round(item.totalAmountGbp),
      evidenceIds: item.evidenceIds.slice(0, 5),
      watchPoint: buildWatchPoint(item.label),
    }));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildWatchPoint(label: string) {
  const expected = CONTROL_LIBRARY[label]?.expectedEvidence?.[0];
  return expected
    ? `Check whether current evidence covers ${expected.toLowerCase()}.`
    : `Check whether this theme is represented in current risk and controls MI.`;
}

export async function runComparatorAnalysis(input: AgenticWorkbenchInput): Promise<ComparatorAnalysis> {
  const profile = normalizeAgenticFirmProfile(input.profile);
  const rows = await fetchActionRows({
    dateFrom: input.dateFrom || defaultDateFrom(),
    dateTo: input.dateTo || todayIso(),
    regulators: input.regulator ? [input.regulator] : profile.regulators,
    countries: input.country ? [input.country] : profile.jurisdictions,
    limit: 1_200,
  });
  const closestPrecedents = toScoredPrecedents(rows, profile).slice(0, 12);
  const riskThemes = buildRiskThemes(closestPrecedents);
  const leadingTheme = riskThemes[0]?.label || 'no strong precedent theme';

  return {
    capability: 'Comparator agent',
    profile,
    summary: `${profile.profileName} was compared with ${rows.length.toLocaleString('en-GB')} qualified enforcement records. The strongest local precedent theme is ${leadingTheme}.`,
    riskThemes,
    closestPrecedents,
    citations: buildCitations(closestPrecedents),
    methodology: [
      'Normalised the firm profile into sector, regulator, product, permission, customer, and risk terms.',
      'Retrieved qualified enforcement records from the RegActions database.',
      'Applied the RegActions enforcement taxonomy before scoring.',
      'Ranked precedents by profile similarity, regulator/jurisdiction match, risk-theme overlap, and fine significance.',
    ],
  };
}

function subtractDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
}

function countByTheme(rows: EnforcementEvidenceRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = row.regActionsCategory.label;
    if (label === 'Process-only enforcement records') continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return counts;
}

export async function runHorizonScan(input: AgenticWorkbenchInput): Promise<HorizonScanAnalysis> {
  const profile = normalizeAgenticFirmProfile(input.profile);
  const lookbackDays = Math.min(Math.max(Math.trunc(input.lookbackDays || DEFAULT_LOOKBACK_DAYS), 7), 120);
  const range = normalizeDateRange({ dateFrom: input.dateFrom, dateTo: input.dateTo });
  const end = range.end;
  const recentFrom = subtractDays(end, lookbackDays);
  const previousFrom = subtractDays(recentFrom, lookbackDays);

  const recentRows = await fetchActionRows({
    dateFrom: toIsoDate(recentFrom),
    dateTo: toIsoDate(end),
    regulators: input.regulator ? [input.regulator] : profile.regulators,
    countries: input.country ? [input.country] : profile.jurisdictions,
    limit: 700,
  });
  const previousRows = await fetchActionRows({
    dateFrom: toIsoDate(previousFrom),
    dateTo: toIsoDate(recentFrom),
    regulators: input.regulator ? [input.regulator] : profile.regulators,
    countries: input.country ? [input.country] : profile.jurisdictions,
    limit: 700,
  });

  const newRelevantActions = toScoredPrecedents(recentRows, profile, 18).slice(0, 10);
  const recentCounts = countByTheme(recentRows);
  const previousCounts = countByTheme(previousRows);
  const trendLabels = new Set([...recentCounts.keys(), ...previousCounts.keys()]);
  const trendDeltas = [...trendLabels]
    .map((label) => {
      const recentCount = recentCounts.get(label) || 0;
      const previousCount = previousCounts.get(label) || 0;
      return { label, recentCount, previousCount, change: recentCount - previousCount };
    })
    .filter((item) => item.recentCount || item.previousCount)
    .sort((left, right) => right.change - left.change || right.recentCount - left.recentCount)
    .slice(0, 6);

  const watchlistMatches = newRelevantActions
    .flatMap((precedent) => precedent.matchedSignals)
    .filter((signal, index, all) => all.indexOf(signal) === index)
    .slice(0, 8);

  return {
    capability: 'Horizon scanning agent',
    lookbackDays,
    summary: `${newRelevantActions.length} relevant action${newRelevantActions.length === 1 ? '' : 's'} matched the profile in the last ${lookbackDays} days.`,
    newRelevantActions,
    trendDeltas,
    watchlistMatches,
    citations: buildCitations(newRelevantActions),
  };
}

export function detectControlCoverage(controlText: string, theme: string) {
  const library = CONTROL_LIBRARY[theme];
  if (!library) {
    return {
      status: 'not evidenced' as const,
      matchedTerms: [],
      expectedEvidence: [],
    };
  }
  const text = normalizeText(controlText);
  const matchedTerms = library.terms.filter((term) => normalizedContains(text, term));
  const coverageRatio = matchedTerms.length / Math.max(library.terms.length, 1);
  const status: 'covered' | 'partial' | 'not evidenced' = coverageRatio >= 0.34
    ? 'covered'
    : matchedTerms.length
      ? 'partial'
      : 'not evidenced';
  return {
    status,
    matchedTerms,
    expectedEvidence: library.expectedEvidence,
  };
}

export async function runControlGapAnalysis(input: AgenticWorkbenchInput): Promise<ControlGapAnalysis> {
  const comparator = await runComparatorAnalysis(input);
  const controlText = [input.controlFramework, ...(input.controls || [])].filter(Boolean).join(' ');
  const assessedControls = comparator.riskThemes.map((theme) => {
    const coverage = detectControlCoverage(controlText, theme.label);
    return {
      theme: theme.label,
      status: coverage.status,
      matchedTerms: coverage.matchedTerms,
      expectedEvidence: coverage.expectedEvidence,
      precedentEvidenceIds: theme.evidenceIds,
    };
  });

  const priorityGaps = assessedControls
    .filter((control) => control.status !== 'covered')
    .map((control) => ({
      theme: control.theme,
      severity: control.status === 'not evidenced' ? 'high' as const : 'medium' as const,
      reason: `${control.theme} appears in similar enforcement precedents but is ${control.status} in the supplied control description.`,
      suggestedEvidence: control.expectedEvidence,
    }))
    .slice(0, 6);

  return {
    capability: 'Control gap analyser',
    summary: priorityGaps.length
      ? `${priorityGaps.length} priority control gap${priorityGaps.length === 1 ? '' : 's'} were found against comparable enforcement themes.`
      : 'The supplied control description covers the main comparable enforcement themes at a high level.',
    assessedControls,
    priorityGaps,
  };
}

function parseYearQuestion(question: string) {
  const match = question.match(/\b(?:since|from)\s+(20\d{2}|19\d{2})\b/i);
  return match?.[1] ? `${match[1]}-01-01` : null;
}

export function planResearchQuery(question: string) {
  const normalizedQuestion = normalizeText(question);
  const regulators = [...VALID_REGULATORS].filter((regulator) =>
    new RegExp(`\\b${regulator.toLowerCase()}\\b`, 'i').test(normalizedQuestion),
  );
  const countries = normalizedQuestion.includes(' eu ') || normalizedQuestion.includes('european union')
    ? EU_COUNTRIES
    : normalizedQuestion.includes(' uk ') || normalizedQuestion.includes('united kingdom')
      ? ['GB']
      : [];

  const categories = Object.entries(CONTROL_LIBRARY)
    .filter(([label, library]) =>
      normalizedContains(normalizedQuestion, label)
      || library.terms.some((term) => normalizedContains(normalizedQuestion, term)),
    )
    .map(([label]) => label);

  const keywords = [
    'bank',
    'banks',
    'investment',
    'payments',
    'fintech',
    'insurance',
    'crypto',
    'consumer',
    'aml',
    'sanctions',
    'market abuse',
    'suitability',
    'client money',
  ].filter((term) => normalizedContains(normalizedQuestion, term));

  return {
    dateFrom: parseYearQuestion(question) || defaultDateFrom(),
    dateTo: todayIso(),
    regulators,
    countries,
    categories,
    keywords,
  };
}

export async function runResearchAnalysis(input: AgenticWorkbenchInput): Promise<ResearchAnalysis> {
  const question = String(
    input.researchQuestion
    || 'What are the most relevant enforcement themes for this firm profile?',
  ).trim().slice(0, 500);
  const parsedFilters = planResearchQuery(question);
  const explicitQuestionDateFrom = parseYearQuestion(question);
  const effectiveFilters = {
    ...parsedFilters,
    dateFrom: explicitQuestionDateFrom || input.dateFrom || parsedFilters.dateFrom,
    dateTo: input.dateTo || parsedFilters.dateTo,
  };
  const query = parsedFilters.categories.length
    ? undefined
    : parsedFilters.keywords.slice(0, 4).join(' ') || undefined;
  const rows = await fetchActionRows({
    dateFrom: effectiveFilters.dateFrom,
    dateTo: effectiveFilters.dateTo,
    regulators: input.regulator ? [input.regulator] : parsedFilters.regulators,
    countries: input.country ? [input.country] : parsedFilters.countries,
    query,
    categoryLabels: parsedFilters.categories,
    limit: 1_200,
  });

  const profile = normalizeAgenticFirmProfile({
    ...input.profile,
    keywords: [...(input.profile?.keywords || []), ...parsedFilters.keywords],
  });
  const precedents = toScoredPrecedents(rows, profile, 0).slice(0, 18);
  const topFindings = buildRiskThemes(precedents, 8);
  const leading = topFindings[0];
  const answer = leading
    ? `${leading.label} is the strongest observed pattern in the retrieved set, with ${leading.count} cited precedent${leading.count === 1 ? '' : 's'} in the evidence sample.`
    : `No strong recurring pattern was found in ${rows.length.toLocaleString('en-GB')} retrieved records for this question.`;

  return {
    capability: 'Multi-step research agent',
    question,
    answer,
    plan: [
      { step: 'Parsed the user question into date, regulator, geography, theme, and keyword filters.', status: 'completed' },
      { step: 'Retrieved matching qualified enforcement records from RegActions.', status: 'completed' },
      { step: 'Applied the RegActions taxonomy before aggregation.', status: 'completed' },
      { step: 'Ranked themes and retained citations for the answer.', status: 'completed' },
    ],
    parsedFilters: effectiveFilters,
    topFindings,
    citations: buildCitations(precedents),
  };
}

function scorePersonaAgainstAction(persona: FirmPersona, action: EnforcementEvidenceRow) {
  const profile = normalizeAgenticFirmProfile({ personaId: persona.id });
  const score = scoreActionForProfile(action, profile);
  return {
    personaId: persona.id,
    name: persona.name,
    score: score.score,
    matchedSignals: score.matchedSignals,
  };
}

export async function runImpactAnalysis(input: AgenticWorkbenchInput): Promise<ImpactAnalysis> {
  const profile = normalizeAgenticFirmProfile(input.profile);
  const rows = input.actionId
    ? await fetchActionRows({ actionId: input.actionId, limit: 1 })
    : await fetchActionRows({
      dateFrom: input.dateFrom || defaultDateFrom(),
      dateTo: input.dateTo || todayIso(),
      regulators: input.regulator ? [input.regulator] : profile.regulators,
      countries: input.country ? [input.country] : profile.jurisdictions,
      limit: 1,
    });
  const sourceAction = rows[0] || null;

  if (!sourceAction) {
    return {
      capability: 'Regulatory change impact agent',
      sourceAction: null,
      summary: 'No source enforcement action was available for impact analysis.',
      impactFlags: [],
      affectedProfiles: [],
      draftMemo: {
        subject: 'No new enforcement action selected',
        audience: 'Head of Compliance',
        body: ['No source action was available to analyse.'],
      },
      citations: [],
    };
  }

  const affectedProfiles = Object.values(FIRM_PERSONAS)
    .map((persona) => scorePersonaAgainstAction(persona, sourceAction))
    .filter((item) => item.score >= 12)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const category = sourceAction.regActionsCategory.label;
  const expectedEvidence = CONTROL_LIBRARY[category]?.expectedEvidence || [
    'Evidence that this theme is considered in the current compliance monitoring plan',
  ];
  const impactFlags = [
    {
      label: category,
      severity: sourceAction.amountGbp && sourceAction.amountGbp >= 10_000_000 ? 'high' as const : 'medium' as const,
      reason: `${sourceAction.regulator} action against ${sourceAction.firm} creates a fresh precedent for ${category.toLowerCase()}.`,
    },
    {
      label: 'Evidence refresh',
      severity: 'medium' as const,
      reason: `Refresh ${expectedEvidence[0].toLowerCase()} against the new enforcement facts.`,
    },
  ];

  const sourceCitation: ScoredPrecedent = {
    citationId: 'C1',
    action: sourceAction,
    score: 100,
    matchedSignals: [category],
    explanation: 'Source enforcement action selected for impact analysis',
  };

  return {
    capability: 'Regulatory change impact agent',
    sourceAction,
    summary: `${sourceAction.regulator} action against ${sourceAction.firm} was mapped to ${category} and scored against regulated-firm personas.`,
    impactFlags,
    affectedProfiles,
    draftMemo: {
      subject: `Impact note: ${sourceAction.regulator} ${category} action`,
      audience: 'Head of Compliance',
      body: [
        `A new ${sourceAction.regulator} enforcement action against ${sourceAction.firm} has been classified as ${category}.`,
        `The immediate compliance question is whether current controls can evidence: ${expectedEvidence.join('; ')}.`,
        affectedProfiles.length
          ? `Most exposed internal profile: ${affectedProfiles[0].name}.`
          : 'No high-similarity internal profile was identified from default personas.',
      ],
    },
    citations: buildCitations([sourceCitation], 1),
  };
}

export async function runAgenticWorkbench(input: AgenticWorkbenchInput): Promise<AgenticWorkbenchResult> {
  const profile = normalizeAgenticFirmProfile(input.profile);
  const profileInput = { ...input, profile };
  const comparator = await runComparatorAnalysis(profileInput);
  const horizonScan = await runHorizonScan(profileInput);
  const controlGapAnalysis = await runControlGapAnalysis(profileInput);
  const research = await runResearchAnalysis(profileInput);
  const impact = await runImpactAnalysis(profileInput);

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    version: DATA_LAYER_VERSION,
    profile,
    comparator,
    horizonScan,
    controlGapAnalysis,
    research,
    impact,
  };
}
