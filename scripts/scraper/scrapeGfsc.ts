import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import {
  buildEuFineRecord,
  fetchText,
  normalizeWhitespace,
  parseMonthNameDate,
  parsePlainAmount,
} from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

const GFSC_URL = 'https://www.gfsc.gg/commission/enforcement/public-statements';

interface GfscRecord {
  dateIssued: string;
  firmIndividual: string;
  amount: number | null;
  summary: string;
}

function resolveGfscEntity(summaryText: string, extractedEntity: string) {
  const normalizedEntity = normalizeWhitespace(extractedEntity);
  if (/^the\s+/i.test(normalizedEntity) && summaryText) {
    return summaryText;
  }

  return normalizedEntity;
}

export function parseGfscHtml(html: string): GfscRecord[] {
  const $ = cheerio.load(html);
  const records: GfscRecord[] = [];

  $('details').each((_, element) => {
    const summaryText = normalizeWhitespace($(element).find('summary').first().text());
    const bodyText = normalizeWhitespace($(element).text());
    const dateMatch = bodyText.match(/On (\d{1,2} [A-Za-z]+ \d{4}),/i);
    const dateIssued = dateMatch ? parseMonthNameDate(dateMatch[1]) : null;

    if (!dateIssued) {
      return;
    }

    const penaltyMatches = bodyText.matchAll(
      /financial penalty of £([\d,]+(?:\.\d+)?) on ([A-Z][^.;]+?)(?: under|;| and|,|\.|$)/gi,
    );

    for (const match of penaltyMatches) {
      records.push({
        dateIssued,
        firmIndividual: resolveGfscEntity(summaryText, match[2]),
        amount: parsePlainAmount(match[1]),
        summary: summaryText || bodyText.slice(0, 300),
      });
    }
  });

  return records;
}

export function buildGfscRecords(rows: GfscRecord[]) {
  return rows.map((row) =>
    buildEuFineRecord({
      regulator: 'GFSC',
      regulatorFullName: 'Guernsey Financial Services Commission',
      countryCode: 'GG',
      countryName: 'Guernsey',
      firmIndividual: row.firmIndividual,
      firmCategory: 'Firm or Individual',
      amount: row.amount,
      currency: 'GBP',
      dateIssued: row.dateIssued,
      breachType: 'Public statement financial penalty',
      breachCategories: ['AML', 'CONTROLS', 'PUBLIC_STATEMENT'],
      summary: row.summary,
      finalNoticeUrl: GFSC_URL,
      sourceUrl: GFSC_URL,
      rawPayload: row,
    }),
  );
}

export async function loadGfscLiveRecords() {
  const html = await fetchText(GFSC_URL);
  return buildGfscRecords(parseGfscHtml(html));
}

export async function main() {
  await runScraper({
    name: '🇬🇬 GFSC Public Statements Scraper',
    liveLoader: loadGfscLiveRecords,
    testLoader: loadGfscLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ GFSC scraper failed:', error);
    process.exit(1);
  });
}
