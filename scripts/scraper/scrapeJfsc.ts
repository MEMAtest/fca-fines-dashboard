import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import { parseStringPromise } from 'xml2js';
import {
  buildEuFineRecord,
  fetchText,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from './lib/euFineHelpers.ts';
import { runScraper } from './lib/runScraper.ts';

const JFSC_RSS_URL = 'https://www.jerseyfsc.org/subscribe-to-our-rss/jfsc-public-statements-and-warnings/';
const JFSC_SITEMAP_URL = 'https://www.jerseyfsc.org/sitemapxml';

interface JfscRssItem {
  title: string[];
  link: string[];
  pubDate: string[];
}

interface JfscSitemapEntry {
  loc: string;
  lastmod: string | null;
}

interface JfscRecord {
  dateIssued: string;
  firmIndividual: string;
  amount: number | null;
  summary: string;
  detailUrl: string;
}

export async function parseJfscFeed(xml: string) {
  const parsed = await parseStringPromise(xml);
  const items: JfscRssItem[] = parsed.rss.channel[0].item || [];
  return items;
}

export async function parseJfscSitemap(xml: string) {
  const parsed = await parseStringPromise(xml);
  const entries = parsed.urlset?.url || [];

  return entries.map((entry: { loc?: string[]; lastmod?: string[] }) => ({
    loc: normalizeWhitespace(entry.loc?.[0] || ''),
    lastmod: normalizeWhitespace(entry.lastmod?.[0] || '') || null,
  }));
}

export function extractJfscRecordFromBody(
  title: string,
  detailUrl: string,
  bodyText: string,
  publishedAt?: string,
): JfscRecord | null {
  if (!/civil financial penalty|financial penalty/i.test(bodyText)) {
    return null;
  }

  const amount = parseLargestAmountFromText(bodyText, {
    currency: 'GBP',
    symbols: ['£'],
    keywords: ['civil financial penalty', 'financial penalty', 'penalty'],
  });

  if (amount === null) {
    return null;
  }

  const dateMatch = bodyText.match(/On (\d{1,2} [A-Za-z]+ \d{4}),/i);
  const fallbackDate = publishedAt ? new Date(publishedAt) : null;
  const fallbackIsoDate =
    fallbackDate && !Number.isNaN(fallbackDate.getTime())
      ? fallbackDate.toISOString().split('T')[0]
      : null;
  const dateIssued =
    (dateMatch ? parseMonthNameDate(dateMatch[1]) : null)
    || fallbackIsoDate;

  if (!dateIssued) {
    return null;
  }

  return {
    dateIssued,
    firmIndividual: title,
    amount,
    summary: bodyText.slice(0, 400),
    detailUrl,
  };
}

function isJfscNewsUrl(detailUrl: string) {
  return detailUrl.includes('/news-and-events/') && !detailUrl.endsWith('/news-and-events/');
}

function buildJfscFallbackTitle(detailUrl: string) {
  const slug = detailUrl.split('/').filter(Boolean).at(-1) || '';
  return normalizeWhitespace(
    slug
      .split('-')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(' '),
  );
}

async function fetchJfscRecord(entry: JfscSitemapEntry): Promise<JfscRecord | null> {
  const detailUrl = entry.loc;
  if (!isJfscNewsUrl(detailUrl)) {
    return null;
  }

  const html = await fetchText(detailUrl);
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($('h1').first().text()) || buildJfscFallbackTitle(detailUrl);
  const bodyText = normalizeWhitespace(($('main').text() || $('body').text() || '').trim());
  return extractJfscRecordFromBody(title, detailUrl, bodyText, entry.lastmod || undefined);
}

export async function loadJfscLiveRecords() {
  const xml = await fetchText(JFSC_SITEMAP_URL);
  const items = (await parseJfscSitemap(xml))
    .filter((entry) => isJfscNewsUrl(entry.loc))
    .sort((left, right) => (right.lastmod || '').localeCompare(left.lastmod || ''));
  const records: JfscRecord[] = [];

  for (let index = 0; index < items.length; index += 6) {
    const batch = items.slice(index, index + 6);
    const settled = await Promise.allSettled(batch.map((item) => fetchJfscRecord(item)));

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        records.push(result.value);
      }
    }
  }

  return records.map((record) =>
    buildEuFineRecord({
      regulator: 'JFSC',
      regulatorFullName: 'Jersey Financial Services Commission',
      countryCode: 'JE',
      countryName: 'Jersey',
      firmIndividual: record.firmIndividual,
      firmCategory: 'Firm or Individual',
      amount: record.amount,
      currency: 'GBP',
      dateIssued: record.dateIssued,
      breachType: 'Civil financial penalty',
      breachCategories: ['AML', 'CONTROLS', 'PUBLIC_STATEMENT'],
      summary: record.summary,
      finalNoticeUrl: record.detailUrl,
      sourceUrl: JFSC_SITEMAP_URL,
      rawPayload: record,
    }),
  );
}

export async function main() {
  await runScraper({
    name: '🇯🇪 JFSC Public Statements Scraper',
    liveLoader: loadJfscLiveRecords,
    testLoader: loadJfscLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ JFSC scraper failed:', error);
    process.exit(1);
  });
}
