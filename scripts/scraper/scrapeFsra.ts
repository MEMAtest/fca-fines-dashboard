import 'dotenv/config';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import {
  buildEuFineRecord,
  extractPdfTextFromUrl,
  fetchText,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

const FSRA_URL =
  'https://www.adgm.com/operating-in-adgm/additional-obligations-of-financial-services-entities/enforcement/regulatory-actions';

interface FsraRow {
  dateIssued: string;
  title: string;
  firmIndividual: string;
  category: string;
  noticeUrl: string | null;
}

export function parseFsraHtml(html: string): FsraRow[] {
  const $ = cheerio.load(html);
  const rows: FsraRow[] = [];

  $('adgm-table-row.removable_element').each((_, element) => {
    const cells = $(element).find('adgm-table-cell');
    if (cells.length < 4) {
      return;
    }

    const dateIssued = parseMonthNameDate($(cells[0]).text());
    const title = normalizeWhitespace($(cells[1]).text());
    const noticeUrl = normalizeWhitespace($(cells[1]).attr('href') || '') || null;
    const firmIndividual = normalizeWhitespace($(cells[2]).text());
    const category = normalizeWhitespace($(cells[3]).text());

    if (!dateIssued || !title || !firmIndividual) {
      return;
    }

    rows.push({
      dateIssued,
      title,
      firmIndividual,
      category,
      noticeUrl,
    });
  });

  return rows;
}

async function enrichFsraAmount(row: FsraRow) {
  if (!row.noticeUrl || !/penalty/i.test(row.title)) {
    return null;
  }

  try {
    const pdfText = await extractPdfTextFromUrl(row.noticeUrl);
    return parseLargestAmountFromText(pdfText, {
      currency: 'USD',
      symbols: ['US$', '$'],
      keywords: ['financial penalty', 'penalty', 'fine'],
    });
  } catch {
    return null;
  }
}

export async function buildFsraRecords(rows: FsraRow[]) {
  const records = [];

  for (const row of rows) {
    const amount = await enrichFsraAmount(row);

    records.push(
      buildEuFineRecord({
        regulator: 'FSRA',
        regulatorFullName: 'Financial Services Regulatory Authority',
        countryCode: 'AE',
        countryName: 'United Arab Emirates',
        firmIndividual: row.firmIndividual,
        firmCategory: row.category || 'Firm or Individual',
        amount,
        currency: 'USD',
        dateIssued: row.dateIssued,
        breachType: row.title,
        breachCategories: categorizeFsraTitle(row.title),
        summary: `${row.firmIndividual}: ${row.title}`,
        finalNoticeUrl: row.noticeUrl,
        sourceUrl: FSRA_URL,
        rawPayload: row,
      }),
    );
  }

  return records;
}

function categorizeFsraTitle(title: string) {
  const normalized = title.toLowerCase();
  const categories: string[] = [];

  if (normalized.includes('anti-money laundering')) {
    categories.push('AML');
  }
  if (normalized.includes('unauthorised') || normalized.includes('unauthorized')) {
    categories.push('UNAUTHORISED_ACTIVITY');
  }
  if (normalized.includes('virtual asset')) {
    categories.push('CRYPTO');
  }
  if (normalized.includes('misleading')) {
    categories.push('MISLEADING_CONDUCT');
  }
  if (normalized.includes('fatca') || normalized.includes('crs')) {
    categories.push('REPORTING');
  }

  return categories.length > 0 ? categories : ['ENFORCEMENT'];
}

export async function loadFsraLiveRecords() {
  const html = await fetchText(FSRA_URL);
  return buildFsraRecords(parseFsraHtml(html));
}

export async function main() {
  await runScraper({
    name: '🇦🇪 ADGM FSRA Regulatory Actions Scraper',
    liveLoader: loadFsraLiveRecords,
    testLoader: loadFsraLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ FSRA scraper failed:', error);
    process.exit(1);
  });
}
