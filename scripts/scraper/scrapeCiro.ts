import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import { CIRO_SNAPSHOT_RECORDS } from './data/ciroSnapshot.ts';
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
} from './lib/euFineHelpers.ts';
import { runScraper } from './lib/runScraper.ts';

const CIRO_PUBLICATIONS_URL = 'https://www.ciro.ca/newsroom/publications?field_type_of_publication=471';

interface CiroListingRow {
  title: string;
  detailUrl: string;
  dateIssued: string;
  rulebook: string | null;
  noticeType: string | null;
}

export function loadCiroSnapshotRecords() {
  return CIRO_SNAPSHOT_RECORDS.map((record) =>
    buildEuFineRecord({
      regulator: 'CIRO',
      regulatorFullName: 'Canadian Investment Regulatory Organization',
      countryCode: 'CA',
      countryName: 'Canada',
      firmIndividual: record.firmIndividual,
      firmCategory: 'Dealer or Individual',
      amount: record.amount,
      currency: record.currency,
      dateIssued: record.dateIssued,
      breachType: record.breachType,
      breachCategories: record.breachCategories,
      summary: record.summary,
      finalNoticeUrl: record.sourceUrl,
      sourceUrl: record.sourceUrl,
      rawPayload: record,
    }),
  );
}

export function parseCiroListingHtml(html: string): CiroListingRow[] {
  const $ = cheerio.load(html);
  const rows: CiroListingRow[] = [];

  $('div.coh-container.views-row.coh-ce-a2b7edc0').each((_, element) => {
    const titleLink = $(element).find('.views-field-title a').first();
    const title = normalizeWhitespace(titleLink.text());
    const detailUrl = makeAbsoluteUrl(CIRO_PUBLICATIONS_URL, titleLink.attr('href') || '');
    const dateIssued = normalizeWhitespace($(element).find('time.datetime').first().attr('datetime') || '').slice(0, 10);
    const rulebook = normalizeWhitespace(
      $(element).find('.views-field-field-rulebook .field-content').first().text(),
    ) || null;
    const noticeType = normalizeWhitespace(
      $(element).find('.views-field-field-type-of-publication .field-content').first().text(),
    ) || null;

    if (!title || !detailUrl || !dateIssued) {
      return;
    }

    rows.push({
      title,
      detailUrl,
      dateIssued,
      rulebook,
      noticeType,
    });
  });

  return rows;
}

function extractCiroPageCount(html: string) {
  const matches = [...html.matchAll(/page=(\d+)/g)];
  const highestPageIndex = matches.reduce((max, match) => Math.max(max, Number.parseInt(match[1], 10)), 0);
  return highestPageIndex + 1;
}

export function extractCiroFirm(title: string) {
  const patterns = [
    /^CIRO Sanctions\s+(.+)$/i,
    /^CIRO Hearing Panel issues .*? in the matter of\s+(.+)$/i,
    /^MFDA Hearing Panel .*? in the matter of\s+(.+)$/i,
    /^.*? in the matter of\s+(.+)$/i,
    /^CIRO Hearing Panel Finds\s+(.+?)\s+Liable$/i,
    // Additional patterns to avoid including "A CIRO Hearing Panel" in the name
    /^(?:A\s+)?CIRO Hearing Panel (?:sanctions|fines|reprimands)\s+(.+?)(?:\s+and|$)/i,
    /^Decision and Reasons .*? - (.+?)(?:\s*\(|$)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1].replace(/[.]+$/g, ''));
    }
  }

  // Fallback: truncate to first 150 chars to avoid overly verbose firm names
  const fallback = normalizeWhitespace(title.replace(/[.]+$/g, ''));
  if (fallback.length > 150) {
    // Try to find a natural break point
    const breakMatch = fallback.match(/^(.{20,150}?)(?:\s*(?:-|in the matter|regarding|concerning))/i);
    if (breakMatch?.[1]) {
      return breakMatch[1].trim();
    }
    return fallback.substring(0, 150) + '...';
  }

  return fallback;
}

function categorizeCiroTitle(title: string) {
  const normalized = title.toLowerCase();
  const categories = ['SRO_ENFORCEMENT'];

  if (normalized.startsWith('ciro sanctions')) {
    categories.push('DISCIPLINARY_ACTION', 'MONETARY_SANCTION');
  }
  if (normalized.includes('reasons for decision') || normalized.includes('decision and reasons')) {
    categories.push('DECISION_NOTICE');
  }
  if (normalized.includes('hearing panel')) {
    categories.push('HEARING_PANEL');
  }
  if (normalized.includes('liable')) {
    categories.push('FINDING');
  }

  return Array.from(new Set(categories));
}

function buildCiroListingRecord(row: CiroListingRow) {
  const snapshot = CIRO_SNAPSHOT_RECORDS.find((record) => record.sourceUrl === row.detailUrl);

  return buildEuFineRecord({
    regulator: 'CIRO',
    regulatorFullName: 'Canadian Investment Regulatory Organization',
    countryCode: 'CA',
    countryName: 'Canada',
    firmIndividual: snapshot?.firmIndividual || extractCiroFirm(row.title),
    firmCategory: 'Dealer or Individual',
    amount: snapshot?.amount ?? null,
    currency: snapshot?.currency || 'CAD',
    dateIssued: row.dateIssued,
    breachType: snapshot?.breachType || row.title,
    breachCategories: snapshot?.breachCategories || categorizeCiroTitle(row.title),
    summary:
      snapshot?.summary
      || `Decision notice published by CIRO${row.rulebook ? ` under ${row.rulebook}` : ''}: ${row.title}.`,
    finalNoticeUrl: row.detailUrl,
    sourceUrl: row.detailUrl,
    rawPayload: {
      ...row,
      snapshotMatch: Boolean(snapshot),
    },
  });
}

export async function loadCiroLiveRecords() {
  const firstPageHtml = await fetchText(CIRO_PUBLICATIONS_URL);
  const pageCount = extractCiroPageCount(firstPageHtml);
  const rows = [...parseCiroListingHtml(firstPageHtml)];

  for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
    const pageHtml = await fetchText(`${CIRO_PUBLICATIONS_URL}&page=${pageIndex}`);
    rows.push(...parseCiroListingHtml(pageHtml));
  }

  const uniqueRows = Array.from(new Map(rows.map((row) => [row.detailUrl, row])).values());
  return uniqueRows.map((row) => buildCiroListingRecord(row));
}

export async function main() {
  await runScraper({
    name: '🇨🇦 CIRO Decision Notices Scraper',
    liveLoader: loadCiroLiveRecords,
    testLoader: async () => loadCiroSnapshotRecords(),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ CIRO scraper failed:', error);
    process.exit(1);
  });
}
