import axios, { type AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import postgres, { type Sql } from 'postgres';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as dotenv from 'dotenv';

dotenv.config();

const execFileAsync = promisify(execFile);

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://fcafines.memaconsultants.com)',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const EUR_RATES: Record<string, number> = {
  EUR: 1,
  GBP: 1.18,
  USD: 0.92,
  CHF: 1.09,
  AED: 0.25,
  CAD: 0.64,
  CZK: 0.041,
  DKK: 0.134,
  INR: 0.011,
  HKD: 0.12,
  NOK: 0.089,
  SEK: 0.092,
  TWD: 0.029,
  BRL: 0.17,
  MXN: 0.046,
  CLP: 0.00096,
};

const GBP_RATES: Record<string, number> = {
  GBP: 1,
  EUR: 0.85,
  USD: 0.78,
  CHF: 0.95,
  AED: 0.21,
  CAD: 0.54,
  CZK: 0.035,
  DKK: 0.114,
  INR: 0.0094,
  HKD: 0.10,
  NOK: 0.078,
  SEK: 0.08,
  TWD: 0.025,
  BRL: 0.14,
  MXN: 0.039,
  CLP: 0.00081,
};

export interface CliFlags {
  dryRun: boolean;
  useTestData: boolean;
  strictLive: boolean;
  limit: number | null;
}

export interface ParsedEnforcementRecord {
  regulator: string;
  regulatorFullName: string;
  countryCode: string;
  countryName: string;
  firmIndividual: string;
  firmCategory: string | null;
  amount: number | null;
  currency: string;
  dateIssued: string;
  breachType: string;
  breachCategories: string[];
  summary: string;
  finalNoticeUrl: string | null;
  sourceUrl: string;
  rawPayload: unknown;
}

export interface DbReadyRecord {
  contentHash: string;
  regulator: string;
  regulatorFullName: string;
  countryCode: string;
  countryName: string;
  firmIndividual: string;
  firmCategory: string | null;
  amount: number | null;
  currency: string;
  amountEur: number | null;
  amountGbp: number | null;
  dateIssued: string;
  yearIssued: number;
  monthIssued: number;
  breachType: string;
  breachCategories: string[];
  summary: string;
  finalNoticeUrl: string | null;
  sourceUrl: string;
  rawPayload: string;
}

export function getCliFlags(): CliFlags {
  return {
    dryRun: process.argv.includes('--dry-run'),
    useTestData: process.argv.includes('--test-data'),
    strictLive: process.argv.includes('--strict-live'),
    limit: getNumericArg('limit'),
  };
}

function getNumericArg(name: string): number | null {
  const entry = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!entry) {
    return null;
  }

  const parsed = Number.parseInt(entry.split('=')[1] || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createSqlClient() {
  return postgres(process.env.DATABASE_URL?.trim() || '', {
    ssl: process.env.DATABASE_URL?.includes('sslmode=')
      ? { rejectUnauthorized: false }
      : false,
  });
}

export function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required unless running in --dry-run mode.');
  }
}

export async function fetchText(url: string, config: AxiosRequestConfig = {}) {
  const response = await requestWithRetry<string>({
    method: config.method ?? 'GET',
    url,
    ...config,
    responseType: 'text',
    timeout: config.timeout ?? 60000,
    headers: {
      ...DEFAULT_HEADERS,
      ...(config.headers || {}),
    },
  });

  return response.data;
}

export async function fetchBinary(url: string, config: AxiosRequestConfig = {}) {
  const response = await requestWithRetry<ArrayBuffer>({
    method: config.method ?? 'GET',
    url,
    ...config,
    responseType: 'arraybuffer',
    timeout: config.timeout ?? 60000,
    headers: {
      ...DEFAULT_HEADERS,
      ...(config.headers || {}),
    },
  });

  return Buffer.from(response.data);
}

async function requestWithRetry<T>(config: AxiosRequestConfig, attempts = 4) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await axios.request<T>(config);
    } catch (error) {
      lastError = error;

      if (!shouldRetryRequest(error) || attempt === attempts) {
        throw error;
      }

      await sleep(getRetryDelayMs(error, attempt));
    }
  }

  throw lastError;
}

function shouldRetryRequest(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  if (status && (status >= 500 || status === 429)) {
    return true;
  }

  return ['ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT', 'ERR_BAD_RESPONSE'].includes(error.code || '');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(error: unknown, attempt: number) {
  if (axios.isAxiosError(error)) {
    const retryAfterHeader = error.response?.headers?.["retry-after"];
    if (retryAfterHeader) {
      const retryAfterSeconds = Number.parseInt(String(retryAfterHeader), 10);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return retryAfterSeconds * 1000;
      }
    }

    if (error.response?.status === 429) {
      return 3_000 * attempt;
    }
  }

  return 750 * attempt;
}

export async function extractPdfTextFromUrl(url: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'mema-regulator-pdf-'));
  const pdfPath = join(tempDir, 'document.pdf');

  try {
    const buffer = await fetchBinary(url, { maxRedirects: 5 });
    await writeFile(pdfPath, buffer);
    const { stdout } = await execFileAsync('pdftotext', ['-layout', pdfPath, '-']);
    return normalizeWhitespace(stdout);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toIsoDateFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseMonthNameDate(input: string) {
  const cleaned = normalizeWhitespace(input).replace(/,/g, '');
  const dayFirst = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayFirst) {
    const month = monthNameToNumber(dayFirst[2]);
    if (!month) {
      return null;
    }

    return toIsoDateFromParts(
      Number.parseInt(dayFirst[3], 10),
      month,
      Number.parseInt(dayFirst[1], 10),
    );
  }

  const monthFirst = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (monthFirst) {
    const month = monthNameToNumber(monthFirst[1]);
    if (!month) {
      return null;
    }

    return toIsoDateFromParts(
      Number.parseInt(monthFirst[3], 10),
      month,
      Number.parseInt(monthFirst[2], 10),
    );
  }

  const direct = new Date(cleaned);
  if (Number.isNaN(direct.getTime())) {
    return null;
  }

  return toIsoDateFromParts(
    direct.getUTCFullYear(),
    direct.getUTCMonth() + 1,
    direct.getUTCDate(),
  );
}

export function parseLocalizedDayMonthYear(
  input: string,
  monthMap: Record<string, number>,
) {
  const cleaned = normalizeWhitespace(input)
    .replace(/,/g, "")
    .replace(/\b1er\b/i, "1");
  const match = cleaned.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ.'’]+)\s+(\d{4})$/);
  if (!match) {
    return null;
  }

  const normalizedMonth = match[2]
    .toLowerCase()
    .replace(/[.’']/g, "");
  const month = monthMap[normalizedMonth];
  if (!month) {
    return null;
  }

  return toIsoDateFromParts(
    Number.parseInt(match[3], 10),
    month,
    Number.parseInt(match[1], 10),
  );
}

export function parseSlashDate(input: string) {
  const match = normalizeWhitespace(input).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  return toIsoDateFromParts(
    Number.parseInt(match[3], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[1], 10),
  );
}

export function parseSebiDate(input: string) {
  const cleaned = normalizeWhitespace(input).replace(',', '');
  const match = cleaned.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (!match) {
    return null;
  }

  const month = monthNameToNumber(match[1]);
  if (!month) {
    return null;
  }

  return toIsoDateFromParts(
    Number.parseInt(match[3], 10),
    month,
    Number.parseInt(match[2], 10),
  );
}

function monthNameToNumber(value: string) {
  const normalized = value.toLowerCase();
  const mapping: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  return mapping[normalized] ?? null;
}

export function parsePlainAmount(value: string) {
  const cleaned = value
    .replace(/[^\d.,-]/g, '')
    .trim();

  if (!cleaned) {
    return null;
  }

  let normalized = cleaned;

  if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes(',') && /,\d{3}(?:,|$)/.test(normalized)) {
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',') && !/\.\d+$/.test(normalized)) {
    normalized = normalized.replace(/,/g, '.');
  } else if (normalized.includes('.') && /\.\d{3}(?:\.|$)/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseScaledAmount(rawAmount: string, scale?: string | null) {
  const base = parsePlainAmount(rawAmount);
  if (base === null) {
    return null;
  }

  const normalizedScale = (scale || '').toLowerCase();
  if (normalizedScale.includes('billion') || normalizedScale.includes('bn')) {
    return base * 1_000_000_000;
  }
  if (normalizedScale.includes('million') || normalizedScale.includes('mn') || normalizedScale.includes('m')) {
    return base * 1_000_000;
  }
  if (normalizedScale.includes('crore')) {
    return base * 10_000_000;
  }
  if (normalizedScale.includes('lakh')) {
    return base * 100_000;
  }
  if (normalizedScale.includes('thousand') || normalizedScale.includes('k')) {
    return base * 1_000;
  }

  return base;
}

export function parseLargestAmountFromText(
  text: string,
  options: {
    currency: string;
    symbols?: string[];
    keywords?: string[];
  },
) {
  const normalized = normalizeWhitespace(text);
  const symbols = options.symbols ?? [];
  const keywordGroup = (options.keywords ?? ['fine', 'penalty', 'sanction', 'costs', 'disgorge', 'disgorgement'])
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const amounts: number[] = [];

  const currencyPattern = [options.currency, ...symbols]
    .map((entry) => entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const contextualPatterns = [
    new RegExp(`(?:${keywordGroup})[^\\dA-Z$£€₹]{0,30}(?:${currencyPattern})?\\s*([\\d\\s,]+(?:\\.\\d+)?)\\s*(crore|lakhs?|million|thousand|bn|mn|m|k)?`, 'gi'),
    new RegExp(`(?:${currencyPattern})\\s*([\\d\\s,]+(?:\\.\\d+)?)\\s*(crore|lakhs?|million|thousand|bn|mn|m|k)?`, 'gi'),
  ];

  for (const pattern of contextualPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const amount = parseScaledAmount(match[1], match[2]);
      if (amount !== null) {
        amounts.push(amount);
      }
    }
  }

  if (amounts.length === 0) {
    return null;
  }

  return Math.max(...amounts);
}

export function convertToEur(amount: number | null, currency: string) {
  if (amount === null) {
    return null;
  }

  const rate = EUR_RATES[currency.toUpperCase()];
  if (!rate) {
    return null;
  }

  return roundToTwo(amount * rate);
}

export function convertToGbp(amount: number | null, currency: string) {
  if (amount === null) {
    return null;
  }

  const rate = GBP_RATES[currency.toUpperCase()];
  if (!rate) {
    return null;
  }

  return roundToTwo(amount * rate);
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildEuFineRecord(record: ParsedEnforcementRecord): DbReadyRecord {
  const issuedAt = new Date(record.dateIssued);

  if (Number.isNaN(issuedAt.getTime())) {
    throw new Error(`Invalid date_issued for ${record.regulator}: ${record.dateIssued}`);
  }

  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      regulator: record.regulator,
      firmIndividual: record.firmIndividual,
      amount: record.amount,
      currency: record.currency,
      dateIssued: record.dateIssued,
      finalNoticeUrl: record.finalNoticeUrl,
      sourceUrl: record.sourceUrl,
    }))
    .digest('hex');

  return {
    contentHash,
    regulator: record.regulator,
    regulatorFullName: record.regulatorFullName,
    countryCode: record.countryCode,
    countryName: record.countryName,
    firmIndividual: record.firmIndividual,
    firmCategory: record.firmCategory,
    amount: record.amount,
    currency: record.currency,
    amountEur: convertToEur(record.amount, record.currency),
    amountGbp: convertToGbp(record.amount, record.currency),
    dateIssued: record.dateIssued,
    yearIssued: issuedAt.getUTCFullYear(),
    monthIssued: issuedAt.getUTCMonth() + 1,
    breachType: record.breachType,
    breachCategories: record.breachCategories.length > 0 ? record.breachCategories : ['OTHER'],
    summary: record.summary,
    finalNoticeUrl: record.finalNoticeUrl,
    sourceUrl: record.sourceUrl,
    rawPayload: JSON.stringify(record.rawPayload ?? null),
  };
}

export async function upsertEuFines(sql: Sql, records: DbReadyRecord[]) {
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const result = await sql`
        INSERT INTO eu_fines (
          content_hash, regulator, regulator_full_name,
          country_code, country_name, firm_individual, firm_category,
          amount, currency, amount_eur, amount_gbp,
          date_issued, year_issued, month_issued,
          breach_type, breach_categories, summary,
          final_notice_url, source_url, raw_payload,
          scraped_at
        ) VALUES (
          ${record.contentHash},
          ${record.regulator},
          ${record.regulatorFullName},
          ${record.countryCode},
          ${record.countryName},
          ${record.firmIndividual},
          ${record.firmCategory},
          ${record.amount},
          ${record.currency},
          ${record.amountEur},
          ${record.amountGbp},
          ${record.dateIssued},
          ${record.yearIssued},
          ${record.monthIssued},
          ${record.breachType},
          ${sql.json(record.breachCategories)},
          ${record.summary},
          ${record.finalNoticeUrl},
          ${record.sourceUrl},
          ${sql.json(JSON.parse(record.rawPayload))},
          NOW()
        )
        ON CONFLICT (content_hash) DO UPDATE SET
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          amount_eur = EXCLUDED.amount_eur,
          amount_gbp = EXCLUDED.amount_gbp,
          summary = EXCLUDED.summary,
          breach_type = EXCLUDED.breach_type,
          breach_categories = EXCLUDED.breach_categories,
          final_notice_url = EXCLUDED.final_notice_url,
          source_url = EXCLUDED.source_url,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;

      if (result[0]?.inserted) {
        inserted += 1;
      } else {
        updated += 1;
      }
    } catch (error) {
      errors += 1;
      console.error(`Failed to upsert ${record.regulator} :: ${record.firmIndividual}`, error);
    }
  }

  return { inserted, updated, errors };
}

export function printDryRunSummary(records: DbReadyRecord[]) {
  console.log(`\n🔍 Dry run summary (${records.length} records)\n`);

  records.slice(0, 10).forEach((record, index) => {
    const amount =
      record.amount === null
        ? 'amount n/a'
        : `${record.currency} ${record.amount.toLocaleString('en-GB')}`;

    console.log(`${String(index + 1).padStart(2, ' ')}. ${record.firmIndividual} | ${amount} | ${record.dateIssued}`);
  });

  if (records.length > 10) {
    console.log(`... ${records.length - 10} more`);
  }
}

export function limitRecords<T>(records: T[], limit: number | null) {
  return limit && limit > 0 ? records.slice(0, limit) : records;
}

export function makeAbsoluteUrl(baseUrl: string, maybeRelative: string) {
  if (/^https?:\/\//i.test(maybeRelative)) {
    return maybeRelative;
  }

  return new URL(maybeRelative, baseUrl).toString();
}

export async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
) {
  const results = new Array<U>(items.length);
  let currentIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length || 1) })
      .map(async () => {
        while (true) {
          const index = currentIndex;
          currentIndex += 1;

          if (index >= items.length) {
            return;
          }

          results[index] = await mapper(items[index], index);
        }
      }),
  );

  return results;
}
