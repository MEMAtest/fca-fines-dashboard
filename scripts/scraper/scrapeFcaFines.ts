import 'dotenv/config';
import axios from 'axios';
import { load } from 'cheerio';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const BASE_URL = 'https://www.fca.org.uk';
const FINES_PATH = 'news/news-stories';
const neonUrl = process.env.NEON_FCA_FINES_URL;
const dryRun = process.argv.includes('--dry-run') && !process.argv.includes('--upsert');
const sinceCutoff = process.env.FCA_SINCE_DATE ? new Date(process.env.FCA_SINCE_DATE) : null;
const userAgent =
  process.env.FCA_USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

const yearEnv = process.env.FCA_YEARS;
const yearsToScrape = yearEnv
  ? yearEnv
      .split(',')
      .map((y) => Number(y.trim()))
      .filter((y) => !Number.isNaN(y))
  : (() => {
      const start = Number(process.env.FCA_START_YEAR || 2013);
      const end = Number(process.env.FCA_END_YEAR || new Date().getFullYear());
      const years: number[] = [];
      for (let y = start; y <= end; y++) years.push(y);
      return years;
    })();

if (!neonUrl && !dryRun) {
  throw new Error('NEON_FCA_FINES_URL is required unless running in --dry-run mode');
}

interface FcaFineRecord {
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

async function scrapeYear(year: number): Promise<FcaFineRecord[]> {
  const url = `${BASE_URL}/${FINES_PATH}/${year}-fines`;
  console.log(`   ➤ Fetching ${url}`);
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': userAgent },
      timeout: 30000,
    });
    const $ = load(response.data);
    const rows = $('table tbody tr').length ? $('table tbody tr') : $('table tr').slice(1);
    if (!rows.length) {
      console.warn(`   ⚠️ No table rows found for ${year}`);
      return [];
    }
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
      const finalNoticeUrl = link ? new URL(link, BASE_URL).href : url;
      const dateIssued = parseDate(dateCell.text().trim());
      if (!dateIssued) return;
      if (sinceCutoff && dateIssued < sinceCutoff) return;

      const amount = parseCurrency(amountCell.text().trim());
      if (amount <= 0) return;

      const reason = reasonCell.text().replace(/\s+/g, ' ').trim();
      const summary = reason || `Fine issued in ${year}`;
      const breachType = detectPrimaryBreach(summary);
      const breachCategories = detectBreachCategories(summary);
      const firmCategory = detectFirmCategory(summary);
      const fineReference = generateReference(firm, dateIssued, amount);
      const contentHash = hashRecord(firm, amount, dateIssued.toISOString().slice(0, 10));

      records.push({
        contentHash,
        fineReference,
        firm,
        firmCategory,
        amount,
        dateIssued,
        breachType,
        breachCategories,
        summary,
        regulator: 'FCA',
        finalNoticeUrl,
        rawPayload: {
          source: url,
          firm,
          dateText: dateCell.text().trim(),
          amountText: amountCell.text().trim(),
          reason,
        },
      });
    });
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
  const yearNum = Number(year);
  if (Number.isNaN(yearNum)) return null;
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
  if (!monthNum || Number.isNaN(dayNum)) return null;
  const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  return Number.isNaN(date.getTime()) ? null : date;
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
  { pattern: /money laundering|aml/i, label: 'AML' },
  { pattern: /systems? and controls?|SYSC/i, label: 'SYSTEMS_CONTROLS' },
  { pattern: /client money|cobs/i, label: 'CLIENT_MONEY' },
  { pattern: /market abuse|insider dealing|MAR/i, label: 'MARKET_ABUSE' },
  { pattern: /financial promotion|marketing/i, label: 'FINANCIAL_PROMOTIONS' },
  { pattern: /consumer duty|treating customers fairly|tcf/i, label: 'CONDUCT' },
  { pattern: /governance|oversight/i, label: 'GOVERNANCE' },
  { pattern: /reporting|regulatory reporting/i, label: 'REPORTING' },
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
  const sql = neon(neonUrl);
  for (const record of records) {
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
  }
  await sql`SELECT refresh_fca_fine_trends();`;
}

async function main() {
  console.log(`Starting FCA fines scrape for years: ${yearsToScrape.join(', ')} (dryRun=${dryRun})`);
  const allRecords: FcaFineRecord[] = [];
  for (const year of yearsToScrape) {
    const yearRecords = await scrapeYear(year);
    console.log(`   ✓ ${year}: ${yearRecords.length} fines extracted`);
    allRecords.push(...yearRecords);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`Collected ${allRecords.length} records.`);
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
  console.log('Upsert complete.');
}

main().catch((error) => {
  console.error('Scraper failed:', error);
  process.exit(1);
});
