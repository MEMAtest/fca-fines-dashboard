import 'dotenv/config';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import { parseStringPromise } from 'xml2js';
import {
  buildEuFineRecord,
  fetchText,
  normalizeWhitespace,
  parseMonthNameDate,
  parseScaledAmount,
} from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

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

interface JfscSourceEntry {
  loc: string;
  publishedAt: string | null;
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

  const amount = parseJfscPenaltyAmount(bodyText);

  if (amount === null) {
    return null;
  }

  const dateIssued = extractJfscDate(bodyText, publishedAt);

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

export function parseJfscPenaltyAmount(bodyText: string) {
  const sentences = normalizeWhitespace(bodyText)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /civil financial penalty|financial penalty/i.test(sentence));
  const amounts = sentences.flatMap((sentence) =>
    [...sentence.matchAll(/£\s*([\d,]+(?:\.\d+)?)(?:\s*(million|m))?/gi)]
      .map((match) => parseScaledAmount(match[1], match[2]))
      .filter((amount): amount is number => amount !== null),
  );

  return amounts.length > 0 ? Math.max(...amounts) : null;
}

export function extractJfscDate(bodyText: string, publishedAt?: string) {
  const datePatterns = [
    /\bOn\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4}),/i,
    /\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i,
  ];

  for (const pattern of datePatterns) {
    const match = bodyText.match(pattern);
    const parsed = match?.[1] ? parseMonthNameDate(match[1]) : null;
    if (isPlausibleJfscDate(parsed)) {
      return parsed;
    }
  }

  const fallback = normalizeJfscPublishedDate(publishedAt);
  return isPlausibleJfscDate(fallback) ? fallback : null;
}

function normalizeJfscPublishedDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().split('T')[0];
}

function isPlausibleJfscDate(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  const earliest = new Date('2000-01-01T00:00:00Z');
  const latest = new Date();
  latest.setUTCDate(latest.getUTCDate() + 30);
  return parsed >= earliest && parsed <= latest;
}

function isJfscNewsUrl(detailUrl: string) {
  return detailUrl.includes('/news-and-events/') && !detailUrl.endsWith('/news-and-events/');
}

function buildJfscFallbackTitle(detailUrl: string) {
  const pathParts = detailUrl.split('/').filter(Boolean);
  const slug = pathParts[pathParts.length - 1] || '';
  return normalizeWhitespace(
    slug
      .split('-')
      .map((part: string) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(' '),
  );
}

export function buildJfscSourceEntries(
  rssItems: JfscRssItem[],
  sitemapEntries: JfscSitemapEntry[],
) {
  const combined = [
    ...rssItems.map((item) => ({
      loc: normalizeWhitespace(item.link?.[0] || ''),
      publishedAt: normalizeWhitespace(item.pubDate?.[0] || '') || null,
    })),
    ...sitemapEntries.map((entry) => ({
      loc: entry.loc,
      publishedAt: entry.lastmod,
    })),
  ].filter((entry) => entry.loc && isJfscNewsUrl(entry.loc));

  return Array.from(
    combined.reduce((entries, entry) => {
      const existing = entries.get(entry.loc);
      if (
        !existing
        || (entry.publishedAt || '').localeCompare(existing.publishedAt || '') > 0
      ) {
        entries.set(entry.loc, entry);
      }
      return entries;
    }, new Map<string, JfscSourceEntry>()),
  )
    .map(([, entry]) => entry)
    .sort((left, right) =>
      (right.publishedAt || '').localeCompare(left.publishedAt || ''),
    );
}

async function fetchJfscRecord(entry: JfscSourceEntry): Promise<JfscRecord | null> {
  const detailUrl = entry.loc;
  if (!isJfscNewsUrl(detailUrl)) {
    return null;
  }

  const html = await fetchText(detailUrl);
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($('h1').first().text()) || buildJfscFallbackTitle(detailUrl);
  const bodyText = normalizeWhitespace(($('main').text() || $('body').text() || '').trim());
  const pagePublishedAt =
    normalizeWhitespace($('time[datetime]').first().attr('datetime') || '')
    || normalizeWhitespace($('meta[property="article:published_time"]').attr('content') || '')
    || normalizeWhitespace($('meta[name="date"]').attr('content') || '')
    || entry.publishedAt
    || undefined;
  return extractJfscRecordFromBody(title, detailUrl, bodyText, pagePublishedAt);
}

export async function loadJfscLiveRecords() {
  const [rssXml, sitemapXml] = await Promise.all([
    fetchText(JFSC_RSS_URL),
    fetchText(JFSC_SITEMAP_URL),
  ]);
  const items = buildJfscSourceEntries(
    await parseJfscFeed(rssXml),
    await parseJfscSitemap(sitemapXml),
  );
  const records: JfscRecord[] = [];

  for (let index = 0; index < items.length; index += 6) {
    const batch = items.slice(index, index + 6);
    const settled = await Promise.allSettled(
      batch.map((item: JfscSourceEntry) => fetchJfscRecord(item)),
    );

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
