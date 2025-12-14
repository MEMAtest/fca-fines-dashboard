/**
 * FCA Fines Scraper (Puppeteer Version)
 *
 * This version uses Puppeteer to render pages in a real browser,
 * which can bypass some bot detection mechanisms.
 *
 * Usage:
 *   npm install puppeteer
 *   FCA_YEARS="2024,2025" ts-node scripts/scraper/scrapeFcaFinesPuppeteer.ts
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

// Dynamically import puppeteer (so it's optional)
let puppeteer: any;
try {
  puppeteer = await import('puppeteer');
} catch (e) {
  console.error('❌ Puppeteer not installed. Run: npm install puppeteer');
  process.exit(1);
}

const BASE_URL = 'https://www.fca.org.uk';
const FINES_PATH = 'news/news-stories';
const neonUrl = process.env.NEON_FCA_FINES_URL;
const dryRun = process.argv.includes('--dry-run') && !process.argv.includes('--upsert');

const yearEnv = process.env.FCA_YEARS;
const yearsToScrape = yearEnv
  ? yearEnv.split(',').map((y) => Number(y.trim())).filter((y) => !Number.isNaN(y))
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

async function scrapeYearWithPuppeteer(year: number): Promise<FcaFineRecord[]> {
  const url = `${BASE_URL}/${FINES_PATH}/${year}-fines`;
  console.log(`   ➤ Fetching ${url} with Puppeteer`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920x1080'
    ]
  });

  try {
    const page = await browser.newPage();

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-GB,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.google.com/'
    });

    // Navigate to page
    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    if (!response) {
      console.warn(`   ⚠️ No response from ${url}`);
      return [];
    }

    const status = response.status();
    if (status === 404) {
      console.warn(`   ⚠️ ${url} returned 404 (year ${year} may not exist)`);
      return [];
    }

    if (status === 403) {
      console.warn(`   ⚠️ ${url} returned 403 - Even Puppeteer is blocked!`);
      console.warn(`   💡 FCA may have strong anti-bot protection. Consider manual download.`);
      return [];
    }

    if (status !== 200) {
      console.warn(`   ⚠️ ${url} returned status ${status}`);
      return [];
    }

    // Wait for table to load
    try {
      await page.waitForSelector('table', { timeout: 5000 });
    } catch (e) {
      console.warn(`   ⚠️ No table found on ${url}`);
      return [];
    }

    // Extract data from table
    const records = await page.evaluate((year) => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      if (!rows.length) {
        return [];
      }

      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 4) return null;

        const firmCell = cells[0];
        const dateCell = cells[1];
        const amountCell = cells[2];
        const reasonCell = cells[3];

        const firm = firmCell.textContent?.replace(/\\s+/g, ' ').trim() || '';
        if (!firm) return null;

        const link = firmCell.querySelector('a')?.getAttribute('href');
        const finalNoticeUrl = link || '';

        return {
          firm,
          dateText: dateCell.textContent?.trim() || '',
          amountText: amountCell.textContent?.trim() || '',
          reason: reasonCell.textContent?.replace(/\\s+/g, ' ').trim() || '',
          finalNoticeUrl,
          sourceUrl: window.location.href
        };
      }).filter(Boolean);
    }, year);

    await browser.close();

    // Process extracted data
    const processedRecords: FcaFineRecord[] = [];
    for (const raw of records) {
      if (!raw) continue;

      const dateIssued = parseDate(raw.dateText);
      if (!dateIssued) continue;

      const amount = parseCurrency(raw.amountText);
      if (amount <= 0) continue;

      const summary = raw.reason || `Fine issued in ${year}`;
      const breachType = detectPrimaryBreach(summary);
      const breachCategories = detectBreachCategories(summary);
      const firmCategory = detectFirmCategory(summary);
      const fineReference = generateReference(raw.firm, dateIssued, amount);
      const contentHash = hashRecord(raw.firm, amount, dateIssued.toISOString().slice(0, 10));

      const finalNoticeUrl = raw.finalNoticeUrl.startsWith('http')
        ? raw.finalNoticeUrl
        : new URL(raw.finalNoticeUrl, BASE_URL).href;

      processedRecords.push({
        contentHash,
        fineReference,
        firm: raw.firm,
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
          firm: raw.firm,
          dateText: raw.dateText,
          amountText: raw.amountText,
          reason: raw.reason,
        },
      });
    }

    return processedRecords;
  } catch (error: any) {
    console.error(`   ❌ Failed to scrape ${url}:`, error.message);
    await browser.close();
    return [];
  }
}

function parseDate(text: string): Date | null {
  if (!text) return null;
  const cleaned = text.replace(/(st|nd|rd|th)/gi, '').replace(/\\./g, '/');
  const parts = cleaned.split(/[\\/\\-]/).map((part) => part.trim());
  if (parts.length !== 3) return null;
  let [day, month, year] = parts;
  const yearNum = Number(year);
  if (Number.isNaN(yearNum)) return null;
  let monthNum = Number(month);
  if (Number.isNaN(monthNum)) {
    const monthMap: Record<string, number> = {
      january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
      april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
      august: 8, aug: 8, september: 9, sep: 9, october: 10, oct: 10,
      november: 11, nov: 11, december: 12, dec: 12,
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
  if (/billion|bn/i.test(text)) multiplier = 1_000_000_000;
  else if (/million|m/i.test(text)) multiplier = 1_000_000;
  else if (/thousand|k/i.test(text)) multiplier = 1_000;
  const cleaned = text.replace(/[^0-9.-]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return value * multiplier;
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
  return `FCA-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}-${slug}-${Math.round(amount / 1000)}`;
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
        content_hash, fine_reference, firm_individual, firm_category,
        regulator, final_notice_url, summary, breach_type, breach_categories,
        amount, date_issued, year_issued, month_issued, raw_payload
      ) VALUES (
        ${record.contentHash}, ${record.fineReference}, ${record.firm}, ${record.firmCategory},
        ${record.regulator}, ${record.finalNoticeUrl}, ${record.summary},
        ${record.breachType}, ${JSON.stringify(record.breachCategories)},
        ${record.amount}, ${record.dateIssued.toISOString().slice(0, 10)},
        ${record.dateIssued.getUTCFullYear()}, ${record.dateIssued.getUTCMonth() + 1},
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
  console.log(`🚀 Starting Puppeteer-based FCA fines scrape for years: ${yearsToScrape.join(', ')}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE (will upsert to database)'}`);

  const allRecords: FcaFineRecord[] = [];
  for (const year of yearsToScrape) {
    const yearRecords = await scrapeYearWithPuppeteer(year);
    console.log(`   ✓ ${year}: ${yearRecords.length} fines extracted`);
    allRecords.push(...yearRecords);

    // Rate limiting: wait between years
    if (yearsToScrape.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log(`\\n📊 Collected ${allRecords.length} total records.`);

  if (dryRun) {
    console.log('\\n📋 Sample records (first 10):');
    console.table(
      allRecords.slice(0, 10).map((record) => ({
        firm: record.firm,
        amount: `£${(record.amount / 1_000_000).toFixed(2)}M`,
        issued: record.dateIssued.toISOString().slice(0, 10),
        breach: record.breachType
      })),
    );
    return;
  }

  console.log('\\n💾 Upserting records to database...');
  await upsertRecords(allRecords);
  console.log('✅ Upsert complete.');
}

main().catch((error) => {
  console.error('❌ Scraper failed:', error);
  process.exit(1);
});
