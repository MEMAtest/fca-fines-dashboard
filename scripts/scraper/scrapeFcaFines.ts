import 'dotenv/config';
import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  createFlareSolverrClient,
  flareSolverrEnabled,
  type FlareSolverrClient,
} from './lib/flaresolverr.js';

const BASE_URL = 'https://www.fca.org.uk';
const FINES_PATH = 'news/news-stories';
const neonUrl = process.env.DATABASE_URL?.trim();
const horizonUrl = process.env.HORIZON_DB_URL?.trim();
const dryRun = process.argv.includes('--dry-run') && !process.argv.includes('--upsert');
const sinceCutoff = process.env.FCA_SINCE_DATE ? new Date(process.env.FCA_SINCE_DATE) : null;
const userAgent =
  process.env.FCA_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FCA_HEADERS: Record<string, string> = {
  'User-Agent': userAgent,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
  Referer: `${BASE_URL}/news`,
};

// When FLARESOLVERR_URL is set, all FCA fetches route through a shared
// FlareSolverr browser session that clears Cloudflare's "Just a moment"
// challenge. fca.org.uk now serves that challenge to datacenter IPs (the
// Hetzner cron), so direct axios fetches 403 — same fix as scrapeFcaEnforcement.
// Falls back to direct fetch when unset (local/residential IPs still pass).
let flareClient: FlareSolverrClient | null = null;

async function fetchWithRetry(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      if (flareClient) {
        return await flareClient.get(url);
      }
      const response = await axios.get(url, { headers: FCA_HEADERS, timeout: 30000 });
      return response.data as string;
    } catch (err: any) {
      lastErr = err;
      const status = err?.response?.status;
      const transient = status === 403 || status === 429 || status === 502 || status === 503;
      if (!transient || i === attempts - 1) break;
      const backoffMs = 1500 * Math.pow(2, i) + Math.floor(Math.random() * 750);
      console.warn(
        `   ⚠️ ${url} returned ${status}; retrying in ${backoffMs}ms (attempt ${i + 2}/${attempts})`,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

const currentYear = new Date().getFullYear();
const yearEnv = process.env.FCA_YEARS;
const yearsToScrape = yearEnv
  ? (() => {
      const parsed = yearEnv
        .split(',')
        .map((y) => Number(y.trim()))
        .filter((y) => !Number.isNaN(y));
      if (!parsed.includes(currentYear)) {
        console.log(`   ➤ Adding current year ${currentYear} to FCA_YEARS for forward coverage`);
        parsed.unshift(currentYear);
      }
      return Array.from(new Set(parsed));
    })()
  : (() => {
      const start = Number(process.env.FCA_START_YEAR || 2013);
      const end = Number(process.env.FCA_END_YEAR || currentYear);
      const years: number[] = [];
      for (let y = start; y <= end; y++) years.push(y);
      return years;
    })();

if (!horizonUrl && !dryRun) {
  console.warn('⚠️  HORIZON_DB_URL not set - skipping sync to horizon_scanning database');
}

export interface FcaFineRecord {
  contentHash: string;
  fineReference: string | null;
  firm: string;
  firmCategory: string | null;
  amount: number;
  dateIssued: Date;
  breachType: string | null;
  breachCategories: string[];
  summary: string;
  regulator: string;
  finalNoticeUrl: string;
  rawPayload: Record<string, any>;
}

const PRIMARY_RUN_REGULATOR = 'FCA_FINES';

/** Parse one official FCA annual fines table without network or database side effects. */
export function parseFcaFineTable(
  body: string,
  year: number,
  since: Date | null = null,
): FcaFineRecord[] {
  const sourceUrl = `${BASE_URL}/${FINES_PATH}/${year}-fines`;
  const $ = load(body);
  const rows = $('table tbody tr').length ? $('table tbody tr') : $('table tr').slice(1);
  const records: FcaFineRecord[] = [];

  rows.each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    const firmCell = cells.eq(0);
    const dateCell = cells.eq(1);
    const amountCell = cells.eq(2);
    const reasonCell = cells.eq(3);
    const firm = firmCell.text().replace(/\s+/g, ' ').trim();
    if (!firm) return;

    const link = firmCell.find('a').attr('href');
    const finalNoticeUrl = link ? new URL(link, BASE_URL).href : sourceUrl;
    const dateIssued = parseDate(dateCell.text().trim());
    if (!dateIssued || (since && dateIssued < since)) return;

    const amount = parseCurrency(amountCell.text().trim());
    if (amount <= 0) return;

    const reason = reasonCell.text().replace(/\s+/g, ' ').trim();
    const summary = reason || `Fine issued in ${year}`;
    records.push({
      contentHash: hashRecord(firm, amount, dateIssued.toISOString().slice(0, 10)),
      fineReference: generateReference(firm, dateIssued, amount),
      firm,
      firmCategory: detectFirmCategory(summary),
      amount,
      dateIssued,
      breachType: detectPrimaryBreach(summary),
      breachCategories: detectBreachCategories(summary),
      summary,
      regulator: 'FCA',
      finalNoticeUrl,
      rawPayload: {
        source: sourceUrl,
        firm,
        dateText: dateCell.text().trim(),
        amountText: amountCell.text().trim(),
        reason,
      },
    });
  });

  return records;
}

async function scrapeYear(year: number): Promise<FcaFineRecord[]> {
  const url = `${BASE_URL}/${FINES_PATH}/${year}-fines`;
  console.log(`   ➤ Fetching ${url}`);
  try {
    const body = await fetchWithRetry(url);
    const records = parseFcaFineTable(body, year, sinceCutoff);
    if (!records.length) {
      console.warn(`   ⚠️ No table rows found for ${year}`);
    }
    return records;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      console.warn(`   ⚠️ ${url} returned 404 (skipping year ${year})`);
      return [];
    }
    console.error(`   ❌ Failed to fetch ${url}:`, error.message || error);
    return [];
  }
}

function parseDate(text: string): Date | null {
  if (!text) return null;
  const cleaned = text.replace(/(st|nd|rd|th)/gi, '').replace(/\./g, '/');
  const parts = cleaned.split(/[\/-]/).map((part) => part.trim());
  if (parts.length !== 3) return null;
  let [day, month, year] = parts;
  let yearNum = Number(year);
  if (Number.isNaN(yearNum)) return null;
  // Handle 2-digit years: assume 2000-2099
  if (yearNum < 100) {
    yearNum += 2000;
  }
  let monthNum = Number(month);
  if (Number.isNaN(monthNum)) {
    const monthMap: Record<string, number> = {
      january: 1,
      jan: 1,
      february: 2,
      feb: 2,
      march: 3,
      mar: 3,
      april: 4,
      apr: 4,
      may: 5,
      june: 6,
      jun: 6,
      july: 7,
      jul: 7,
      august: 8,
      aug: 8,
      september: 9,
      sep: 9,
      october: 10,
      oct: 10,
      november: 11,
      nov: 11,
      december: 12,
      dec: 12,
    };
    monthNum = monthMap[month.toLowerCase()] || 0;
  }
  const dayNum = Number(day);
  if (
    !Number.isInteger(dayNum) ||
    !Number.isInteger(monthNum) ||
    !Number.isInteger(yearNum) ||
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    return null;
  }
  const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getUTCFullYear() !== yearNum ||
    date.getUTCMonth() !== monthNum - 1 ||
    date.getUTCDate() !== dayNum
  ) {
    return null;
  }
  return date;
}

function parseCurrency(text: string): number {
  if (!text) return 0;
  let multiplier = 1;
  if (/billion|bn/i.test(text)) {
    multiplier = 1_000_000_000;
  } else if (/million|m/i.test(text)) {
    multiplier = 1_000_000;
  } else if (/thousand|k/i.test(text)) {
    multiplier = 1_000;
  }
  const cleaned = text.replace(/[^0-9.-]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  const computed = value * multiplier;
  const maxValue = 9_000_000_000_000_000; // below NUMERIC(18,2) limit
  if (computed >= maxValue) {
    console.warn(`   ⚠️ Amount too large (${text}), skipping.`);
    return 0;
  }
  return computed;
}

const BREACH_KEYWORDS: { pattern: RegExp; label: string }[] = [
  // Financial Crime & AML
  { pattern: /money laundering|aml|anti-money|financial crime|proceeds of crime|sanctions?|terrorist financ/i, label: 'AML' },
  { pattern: /fraud|fraudulent|dishonest|decepti|mislead|false|forgery/i, label: 'FRAUD' },

  // Systems & Controls
  { pattern: /systems? and controls?|SYSC|control (framework|failure|weakness)|inadequate controls?|risk management|operational risk/i, label: 'SYSTEMS_CONTROLS' },
  { pattern: /governance|oversight|board|senior management|SM&CR|SMCR|approved person|CF\d|controlled function/i, label: 'GOVERNANCE' },

  // Client Protection
  { pattern: /client money|client assets?|cass|CASS|segregat|safeguard/i, label: 'CLIENT_MONEY' },
  { pattern: /consumer duty|treating customers fairly|tcf|customer(s)?( )?('s)? (best )?interest|fair treatment|vulnerable customer/i, label: 'CONDUCT' },
  { pattern: /mis-?sell|unsuitable|suitability|advice|recommend|inappropriate/i, label: 'MIS_SELLING' },
  { pattern: /best execution|execution quality|order handling|fair dealing/i, label: 'BEST_EXECUTION' },

  // Market Integrity
  { pattern: /market abuse|insider (dealing|trading|information)|MAR|market manipulation|front.?running|layering|spoofing/i, label: 'MARKET_ABUSE' },
  { pattern: /conflict(s)? of interest|chinese wall|information barrier/i, label: 'CONFLICTS' },

  // Communications & Disclosure
  { pattern: /financial promotion|marketing|advert|promot|communicat|disclosure/i, label: 'FINANCIAL_PROMOTIONS' },
  { pattern: /report(ing)?|regulatory report|transaction report|SUP|supervision|filing|submit/i, label: 'REPORTING' },
  { pattern: /record.?keep|documentation|audit trail|data|retention/i, label: 'RECORD_KEEPING' },

  // Specific Products
  { pattern: /pension|annuit|retirement|SIPP|drawdown/i, label: 'PENSIONS' },
  { pattern: /mortgage|lending|loan|credit|borrower/i, label: 'LENDING' },
  { pattern: /insurance|insurer|underwriting|claims?( )?handling|policy/i, label: 'INSURANCE' },
  { pattern: /investment|portfolio|fund|asset management|wealth management/i, label: 'INVESTMENT' },
  { pattern: /payment|PSD|e-?money|remittance|transfer/i, label: 'PAYMENTS' },

  // Regulatory Breaches
  { pattern: /principle(s)?( \d+)?|PRIN|threshold condition|authoris(ation|ed)|permission|regulated activit/i, label: 'PRINCIPLES' },
  { pattern: /complaint(s)?( )?handling|redress|compensation|refund/i, label: 'COMPLAINTS' },
  { pattern: /capital|liquidity|prudential|solvency|financial resource/i, label: 'PRUDENTIAL' },
];

function detectPrimaryBreach(text: string): string | null {
  const entry = BREACH_KEYWORDS.find((item) => item.pattern.test(text));
  return entry ? entry.label : null;
}

function detectBreachCategories(text: string): string[] {
  return BREACH_KEYWORDS.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function detectFirmCategory(text: string): string | null {
  if (/bank|lender|loan/i.test(text)) return 'Banking';
  if (/insur(er|ance)|underwriter/i.test(text)) return 'Insurance';
  if (/investment|asset manager|broker|wealth/i.test(text)) return 'Investment';
  if (/payments?|remittance|money transfer/i.test(text)) return 'Payments';
  return null;
}

function generateReference(firm: string, date: Date, amount: number): string {
  const slug = firm.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'FIRM';
  return `FCA-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}-${slug}-${Math.round(
    amount / 1000,
  )}`;
}

function hashRecord(firm: string, amount: number, dateKey: string): string {
  return crypto.createHash('sha256').update(`${firm}|${amount}|${dateKey}`).digest('hex');
}

async function upsertRecords(records: FcaFineRecord[]) {
  if (!neonUrl) return;

  // Connect to fcafines database
  const sql = postgres(neonUrl, {
    ssl: neonUrl.includes('sslmode=') ? { rejectUnauthorized: false } : false,
  });

  // Connect to horizon_scanning database (if configured)
  let horizonSql: postgres.Sql | null = null;
  if (horizonUrl) {
    try {
      horizonSql = postgres(horizonUrl, {
        ssl: horizonUrl.includes('sslmode=') ? { rejectUnauthorized: false } : false,
      });
    } catch (error) {
      console.warn(
        `⚠️ Could not initialise Horizon dual-write client; primary FCA publication will continue: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  try {
    let fcaSuccess = 0;

    for (const record of records) {
      // Write to fcafines.fca_fines (source of truth)
      await sql`
        INSERT INTO fca_fines (
          content_hash,
          fine_reference,
          firm_individual,
          firm_category,
          regulator,
          final_notice_url,
          summary,
          breach_type,
          breach_categories,
          amount,
          date_issued,
          year_issued,
          month_issued,
          raw_payload
        ) VALUES (
          ${record.contentHash},
          ${record.fineReference},
          ${record.firm},
          ${record.firmCategory},
          ${record.regulator},
          ${record.finalNoticeUrl},
          ${record.summary},
          ${record.breachType},
          ${JSON.stringify(record.breachCategories)},
          ${record.amount},
          ${record.dateIssued.toISOString().slice(0, 10)},
          ${record.dateIssued.getUTCFullYear()},
          ${record.dateIssued.getUTCMonth() + 1},
          ${JSON.stringify(record.rawPayload)}
        )
        ON CONFLICT (content_hash) DO UPDATE SET
          firm_individual = EXCLUDED.firm_individual,
          firm_category = EXCLUDED.firm_category,
          regulator = EXCLUDED.regulator,
          final_notice_url = EXCLUDED.final_notice_url,
          summary = EXCLUDED.summary,
          breach_type = EXCLUDED.breach_type,
          breach_categories = EXCLUDED.breach_categories,
          amount = EXCLUDED.amount,
          date_issued = EXCLUDED.date_issued,
          year_issued = EXCLUDED.year_issued,
          month_issued = EXCLUDED.month_issued,
          raw_payload = EXCLUDED.raw_payload;
      `;
      fcaSuccess++;
    }

    // Complete all primary writes and refresh public views before touching the
    // secondary Horizon consumer. Horizon must not delay primary promotion.
    await sql`SELECT refresh_fca_fine_trends();`;
    await sql`SELECT refresh_all_fines();`;

    // Horizon is a secondary consumer. Its credential or schema must never
    // prevent the primary FCA dataset from completing and refreshing.
    if (horizonSql) {
      const horizonResult = await syncHorizonRecords(records, async (record) => {
        await horizonSql`
          INSERT INTO fca_fines (
            fine_reference,
            firm_individual,
            firm_category,
            final_notice_url,
            summary,
            breach_type,
            breach_categories,
            amount,
            date_issued,
            year_issued,
            month_issued,
            source_url
          ) VALUES (
            ${record.fineReference},
            ${record.firm},
            ${record.firmCategory},
            ${record.finalNoticeUrl},
            ${record.summary},
            ${record.breachType},
            ${JSON.stringify(record.breachCategories)},
            ${record.amount},
            ${record.dateIssued.toISOString().slice(0, 10)},
            ${record.dateIssued.getUTCFullYear()},
            ${record.dateIssued.getUTCMonth() + 1},
            ${record.rawPayload.source}
          )
          ON CONFLICT (fine_reference) DO UPDATE SET
            firm_individual = EXCLUDED.firm_individual,
            firm_category = EXCLUDED.firm_category,
            final_notice_url = EXCLUDED.final_notice_url,
            summary = EXCLUDED.summary,
            breach_type = EXCLUDED.breach_type,
            breach_categories = EXCLUDED.breach_categories,
            amount = EXCLUDED.amount,
            date_issued = EXCLUDED.date_issued,
            year_issued = EXCLUDED.year_issued,
            month_issued = EXCLUDED.month_issued,
          source_url = EXCLUDED.source_url;
        `;
      });
      console.log(`   ✓ Wrote ${horizonResult.succeeded} fines to horizon_scanning.fca_fines`);
      if (horizonResult.failed > 0) {
        console.warn(
          `   ⚠️ Horizon dual-write unavailable for ${horizonResult.failed}/${horizonResult.attempted} fines; primary FCA publication completed.`,
        );
      }
    }

    console.log(`   ✓ Wrote ${fcaSuccess} fines to fcafines.fca_fines`);
  } finally {
    await sql.end();
    if (horizonSql) {
      await horizonSql.end().catch((error) => {
        console.warn(
          `⚠️ Could not close Horizon dual-write client: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }
}

export interface HorizonSyncResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

export type HorizonRecordWriter = (record: FcaFineRecord) => Promise<void>;

/** Best-effort secondary sync with per-record isolation and observable errors. */
export async function syncHorizonRecords(
  records: FcaFineRecord[],
  writeRecord: HorizonRecordWriter,
): Promise<HorizonSyncResult> {
  let succeeded = 0;
  let failed = 0;
  let attempted = 0;

  for (const [index, record] of records.entries()) {
    attempted += 1;
    try {
      await writeRecord(record);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`   ⚠️ Horizon dual-write failed: ${message}`);
      if (/28p01|28p02|password authentication failed|authentication failed/i.test(message)) {
        const skipped = records.length - index - 1;
        if (skipped > 0) {
          console.warn(`   ⚠️ Horizon dual-write circuit opened; skipped ${skipped} remaining secondary writes.`);
        }
        break;
      }
    }
  }

  return { attempted, succeeded, failed };
}

async function main() {
  if (flareSolverrEnabled()) {
    flareClient = await createFlareSolverrClient();
    console.log('[FCA fines] Routing fetches through FlareSolverr to clear the Cloudflare challenge');
  }
  let runSql: postgres.Sql | null = null;
  let runId: string | number | null = null;
  let recordsPrepared = 0;
  try {
    if (!dryRun) {
      if (!neonUrl) {
        throw new Error('DATABASE_URL is required unless running in --dry-run mode');
      }
      // Open and identify the monetary-fines run before fetching. A source
      // fetch, parser, view, or database failure must be visible as an error
      // run rather than leaving health checks to infer failure from old data.
      runSql = postgres(neonUrl, {
        ssl: neonUrl.includes('sslmode=') ? { rejectUnauthorized: false } : false,
      });
      runId = await insertPrimaryFcaRun(runSql);
    }
    console.log(`Starting FCA fines scrape for years: ${yearsToScrape.join(', ')} (dryRun=${dryRun})`);
    const allRecords: FcaFineRecord[] = [];
    for (const year of yearsToScrape) {
      const yearRecords = await scrapeYear(year);
      console.log(`   ✓ ${year}: ${yearRecords.length} fines extracted`);
      allRecords.push(...yearRecords);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`Collected ${allRecords.length} records.`);
    recordsPrepared = allRecords.length;
    if (dryRun) {
      console.table(
        allRecords.slice(0, 10).map((record) => ({
          firm: record.firm,
          amount: record.amount,
          issued: record.dateIssued.toISOString().slice(0, 10),
          url: record.finalNoticeUrl,
        })),
      );
      return;
    }

    await upsertRecords(allRecords);
    if (runId !== null) {
      await updatePrimaryFcaRun(runSql!, runId, {
        status: 'success',
        recordsPrepared,
        errorMessage: null,
      });
    }
    console.log('Upsert complete.');
  } catch (error) {
    if (runSql && runId !== null) {
      await updatePrimaryFcaRun(runSql, runId, {
        status: 'error',
        recordsPrepared,
        errorMessage: error instanceof Error ? error.message : String(error),
      }).catch((trackingError) => {
        console.warn(
          `⚠️ Could not close FCA monetary scraper run ${runId}: ${trackingError instanceof Error ? trackingError.message : String(trackingError)}`,
        );
      });
    }
    throw error;
  } finally {
    if (flareClient) {
      await flareClient.destroy();
      flareClient = null;
    }
    if (runSql) await runSql.end();
  }
}

async function insertPrimaryFcaRun(sql: postgres.Sql): Promise<string | number | null> {
  try {
    const rows = await sql`
      INSERT INTO scraper_runs (
        regulator, region, started_at, status, source, run_url
      ) VALUES (
        ${PRIMARY_RUN_REGULATOR}, ${'UK'}, ${new Date().toISOString()}, ${'running'},
        ${process.env.GITHUB_ACTIONS ? 'github-actions' : 'manual'}, ${null}
      )
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  } catch (error) {
    console.warn(
      `⚠️ Could not create ${PRIMARY_RUN_REGULATOR} scraper run: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

async function updatePrimaryFcaRun(
  sql: postgres.Sql,
  runId: string | number,
  summary: {
    status: 'success' | 'error';
    recordsPrepared: number;
    errorMessage: string | null;
  },
) {
  await sql`
    UPDATE scraper_runs
    SET
      finished_at = ${new Date().toISOString()},
      status = ${summary.status},
      records_prepared = ${summary.recordsPrepared},
      records_inserted = ${summary.status === 'success' ? summary.recordsPrepared : 0},
      errors = ${summary.status === 'error' ? 1 : 0},
      error_message = ${summary.errorMessage},
      duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::bigint * 1000
    WHERE id = ${runId} AND regulator = ${PRIMARY_RUN_REGULATOR}
  `;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Scraper failed:', error);
      process.exit(1);
    });
}
