import 'dotenv/config';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parsePlainAmount,
  parseSlashDate,
} from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

const ECB_URL =
  'https://www.bankingsupervision.europa.eu/activities/sanctions/supervisory-sanctions/html/index.en.html';

interface EcbRow {
  dateIssued: string;
  firmIndividual: string;
  amount: number | null;
  currency: string;
  area: string;
  finalNoticeUrl: string | null;
  sourceUrl: string;
  decisionStatus: string;
}

export function parseEcbHtml(html: string): EcbRow[] {
  const $ = cheerio.load(html);
  const rows: EcbRow[] = [];
  let currentDate: string | null = null;
  let currentEntity: string | null = null;
  let currentFurtherLink: string | null = null;
  let currentStatus: string | null = null;

  $('table tr').each((_, element) => {
    const row = $(element);
    const headerText = normalizeWhitespace(row.find('th').first().text());

    if (/Date of ECB decision/i.test(headerText)) {
      return;
    }

    if (headerText) {
      currentDate = parseSlashDate(headerText);
    }

    const cells = row.find('td');
    if (cells.length === 0 || !currentDate) {
      return;
    }

    if (cells.length >= 5) {
      currentEntity = normalizeWhitespace($(cells[0]).text());
      currentFurtherLink = makeAbsoluteUrl(
        ECB_URL,
        $(cells[3]).find('a').first().attr('href') || '',
      );
      currentStatus = normalizeWhitespace($(cells[4]).text());

      rows.push({
        dateIssued: currentDate,
        firmIndividual: currentEntity,
        amount: parsePlainAmount($(cells[1]).text()),
        currency: 'EUR',
        area: normalizeWhitespace($(cells[2]).text()),
        finalNoticeUrl: currentFurtherLink,
        sourceUrl: ECB_URL,
        decisionStatus: currentStatus,
      });

      return;
    }

    if (cells.length === 2 && currentEntity) {
      rows.push({
        dateIssued: currentDate,
        firmIndividual: currentEntity,
        amount: parsePlainAmount($(cells[0]).text()),
        currency: 'EUR',
        area: normalizeWhitespace($(cells[1]).text()),
        finalNoticeUrl: currentFurtherLink,
        sourceUrl: ECB_URL,
        decisionStatus: currentStatus || '',
      });
    }
  });

  return rows;
}

export function buildEcbRecords(rows: EcbRow[]) {
  return rows.map((row) =>
    buildEuFineRecord({
      regulator: 'ECB',
      regulatorFullName: 'European Central Bank Banking Supervision',
      countryCode: 'EU',
      countryName: 'European Union',
      firmIndividual: row.firmIndividual,
      firmCategory: 'Credit Institution',
      amount: row.amount,
      currency: row.currency,
      dateIssued: row.dateIssued,
      breachType: row.area,
      breachCategories: categorizeEcbArea(row.area),
      summary: `${row.firmIndividual} was sanctioned by the ECB for ${row.area}. Status: ${row.decisionStatus || 'Not stated'}.`,
      finalNoticeUrl: row.finalNoticeUrl,
      sourceUrl: row.sourceUrl,
      rawPayload: row,
    }),
  );
}

function categorizeEcbArea(area: string) {
  const normalized = area.toLowerCase();
  const categories: string[] = [];

  if (normalized.includes('report')) {
    categories.push('REPORTING');
  }
  if (normalized.includes('capital')) {
    categories.push('CAPITAL');
  }
  if (normalized.includes('large exposure')) {
    categories.push('LARGE_EXPOSURES');
  }
  if (normalized.includes('governance')) {
    categories.push('GOVERNANCE');
  }

  return categories.length > 0 ? categories : ['BANKING_SUPERVISION'];
}

export async function loadEcbLiveRecords() {
  const html = await fetchText(ECB_URL);
  return buildEcbRecords(parseEcbHtml(html));
}

export async function main() {
  await runScraper({
    name: '🇪🇺 ECB Supervisory Sanctions Scraper',
    liveLoader: loadEcbLiveRecords,
    testLoader: loadEcbLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ ECB scraper failed:', error);
    process.exit(1);
  });
}
