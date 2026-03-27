import 'dotenv/config';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import {
  buildEuFineRecord,
  extractPdfTextFromUrl,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseSebiDate,
} from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

const SEBI_LIST_URL =
  'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=2&smid=133&ssid=9';
const SEBI_AJAX_URL = 'https://www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp';
const DEFAULT_SINCE_YEAR = Number.parseInt(process.env.SEBI_SINCE_YEAR || '1900', 10);
const DEFAULT_ENRICH_LIMIT = Number.parseInt(process.env.SEBI_ENRICH_LIMIT || '120', 10);

interface SebiRow {
  dateIssued: string;
  title: string;
  detailUrl: string;
}

export function parseSebiListingHtml(html: string): SebiRow[] {
  const $ = cheerio.load(html);
  const rows: SebiRow[] = [];

  $('table#sample_1 tbody tr, table#sample_1 tr').each((_, element) => {
    const cells = $(element).find('td');
    if (cells.length < 2) {
      return;
    }

    const dateIssued = parseSebiDate($(cells[0]).text());
    const link = $(cells[1]).find('a').first();
    const title = normalizeWhitespace(link.text());
    const detailUrl = makeAbsoluteUrl(SEBI_LIST_URL, link.attr('href') || '');

    if (!dateIssued || !title || !detailUrl) {
      return;
    }

    rows.push({ dateIssued, title, detailUrl });
  });

  return rows;
}

async function fetchSebiAjaxPage(pageIndex: number) {
  const body = new URLSearchParams({
    nextValue: String(pageIndex),
    next: 'n',
    search: '',
    fromDate: '',
    toDate: '',
    fromYear: '',
    toYear: '',
    deptId: '-1',
    sid: '2',
    ssid: '9',
    smid: '133',
    ssidhidden: '9',
    intmid: '-1',
    sText: 'Enforcement',
    ssText: 'Orders',
    smText: 'Orders of ED / CGM (Quasi-Judicial Authorities)',
    doDirect: String(pageIndex),
  });

  const response = await fetchText(SEBI_AJAX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body.toString(),
  });

  return response.split('#@#')[0] || '';
}

async function fetchSebiDetailText(url: string) {
  if (/\.pdf(?:$|\?)/i.test(url)) {
    return extractPdfTextFromUrl(url);
  }

  const html = await fetchText(url);
  const text = cheerio.load(html)('body').text();
  return normalizeWhitespace(text);
}

export function extractSebiFirm(title: string) {
  const cleanFirm = (value: string) =>
    normalizeWhitespace(value)
      .replace(/^inspection of\s+/i, '')
      .replace(/^unregistered investment advisory by\s+/i, '')
      .replace(/[._-]+$/g, '');

  const patterns = [
    /front[- ]running trades of .*?-\s+(.+?)(?:\s+by|$|\.)/i,
    /inspection of\s+(.+?)(?:-|–|—|$|\.)/i,
    /unregistered investment advisory by\s+(.+?)(?:-|–|—|$|\.)/i,
    /matter of\s+(.+?)(?:-|–|—|$)/i,
    /respect of\s+(.+?)(?:-|–|—|$)/i,
    /against\s+(.+?)(?:-|–|—|$)/i,
    // Additional patterns for common SEBI title formats
    /order in respect of (.+?)(?:\s+in the matter|$)/i,
    /order against (.+?)(?:\s+in the matter|$)/i,
    /proceedings against (.+?)(?:\s+in|$)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return cleanFirm(match[1]);
    }
  }

  // Fallback: truncate to first 150 chars to avoid overly verbose firm names
  const fallback = cleanFirm(title);
  if (fallback.length > 150) {
    // Try to find a natural break point (comma, dash, or "in the matter")
    const breakMatch = fallback.match(/^(.{20,150}?)(?:\s*(?:,|-|in the matter|for|regarding))/i);
    if (breakMatch?.[1]) {
      return breakMatch[1].trim();
    }
    return fallback.substring(0, 150) + '...';
  }

  return fallback;
}

function categorizeSebiTitle(title: string) {
  const normalized = title.toLowerCase();
  const categories: string[] = [];

  if (normalized.includes('unregistered investment advisory')) {
    categories.push('UNREGISTERED_ADVISORY');
  }
  if (normalized.includes('front-running')) {
    categories.push('FRONT_RUNNING');
  }
  if (normalized.includes('research analyst')) {
    categories.push('RESEARCH_ANALYST');
  }
  if (normalized.includes('market gainer') || normalized.includes('trade money')) {
    categories.push('MISLEADING_CONDUCT');
  }
  if (normalized.includes('exchange') || normalized.includes('stockbrokers')) {
    categories.push('MARKET_INTERMEDIARY');
  }

  return categories.length > 0 ? categories : ['SEBI_ORDER'];
}

async function enrichSebiRow(row: SebiRow, shouldEnrichAmount: boolean) {
  let amount: number | null = null;

  if (shouldEnrichAmount) {
    try {
      const detailText = await fetchSebiDetailText(row.detailUrl);
      amount = parseLargestAmountFromText(detailText, {
        currency: 'INR',
        symbols: ['Rs.', 'Rs', '₹'],
        keywords: ['penalty', 'fine', 'disgorgement', 'monetary penalty'],
      });
    } catch {
      amount = null;
    }
  }

  return buildEuFineRecord({
    regulator: 'SEBI',
    regulatorFullName: 'Securities and Exchange Board of India',
    countryCode: 'IN',
    countryName: 'India',
    firmIndividual: extractSebiFirm(row.title),
    firmCategory: 'Firm or Individual',
    amount,
    currency: 'INR',
    dateIssued: row.dateIssued,
    breachType: row.title,
    breachCategories: categorizeSebiTitle(row.title),
    summary: row.title,
    finalNoticeUrl: row.detailUrl,
    sourceUrl: SEBI_LIST_URL,
    rawPayload: row,
  });
}

export async function loadSebiLiveRecords() {
  const firstPageHtml = await fetchText(SEBI_LIST_URL);
  const initialRows = parseSebiListingHtml(firstPageHtml);
  const rows: SebiRow[] = [...initialRows];

  const totalPagesMatch = firstPageHtml.match(/of\s+(\d+)\s+records/i);
  const maxPagesByCount = totalPagesMatch ? Math.ceil(Number.parseInt(totalPagesMatch[1], 10) / 25) : 1;

  for (let pageIndex = 1; pageIndex < maxPagesByCount; pageIndex += 1) {
    const pageHtml = await fetchSebiAjaxPage(pageIndex);
    const pageRows = parseSebiListingHtml(pageHtml);

    if (pageRows.length === 0) {
      break;
    }

    rows.push(...pageRows);
  }

  const filteredRows = rows.filter((row) => Number.parseInt(row.dateIssued.slice(0, 4), 10) >= DEFAULT_SINCE_YEAR);
  const uniqueRows = Array.from(new Map(filteredRows.map((row) => [`${row.dateIssued}|${row.detailUrl}`, row])).values());
  const records = [];

  for (let index = 0; index < uniqueRows.length; index += 6) {
    const batch = uniqueRows.slice(index, index + 6);
    const settled = await Promise.allSettled(
      batch.map((row, batchIndex) => enrichSebiRow(row, index + batchIndex < DEFAULT_ENRICH_LIMIT)),
    );

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        records.push(result.value);
      }
    }
  }

  return records;
}

export async function main() {
  await runScraper({
    name: '🇮🇳 SEBI Orders Scraper',
    liveLoader: loadSebiLiveRecords,
    testLoader: loadSebiLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ SEBI scraper failed:', error);
    process.exit(1);
  });
}
