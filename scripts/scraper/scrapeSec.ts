import 'dotenv/config';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
} from './lib/euFineHelpers.ts';
import { runScraper } from './lib/runScraper.ts';

const SEC_PRESS_RELEASES_URL = 'https://www.sec.gov/newsroom/press-releases';
const SEC_DEFAULT_SINCE_YEAR = Number.parseInt(process.env.SEC_SINCE_YEAR || '2012', 10);
const SEC_LISTING_PAGE_DELAY_MS = Number.parseInt(process.env.SEC_LISTING_PAGE_DELAY_MS || '150', 10);
const SEC_DETAIL_BATCH_DELAY_MS = Number.parseInt(process.env.SEC_DETAIL_BATCH_DELAY_MS || '250', 10);
const SEC_DETAIL_BATCH_SIZE = Number.parseInt(process.env.SEC_DETAIL_BATCH_SIZE || '3', 10);
const SEC_HEADERS = {
  // SEC Fair Access policy expects an identifying user agent with contact info.
  'User-Agent': process.env.SEC_USER_AGENT || 'MEMA Consultants research@memaconsultants.com',
  'Accept-Language': 'en-US,en;q=0.9',
};

const SEC_TITLE_PREFIX_REGEX =
  /^SEC (Charges|Settles|Sues|Sanctions?|Bars?|Orders?|Obtains|Files|Halts|Announces Charges Against|Announces Fraud Charges Against)\b/i;

interface SecPressReleaseRow {
  dateIssued: string;
  title: string;
  detailUrl: string;
  releaseNumber: string;
}

interface SecPressReleaseDetail {
  subtitle: string | null;
  bodyText: string;
  resourceUrls: string[];
}

const SEC_ENFORCEMENT_TITLE_REGEX =
  /\b(charges?|charged|settles?|settlement|sanctions?|bars?|barred|sues?|fraud|scheme|manipulation|insider|unregistered|misleading|disclosure|accounting|ponzi|bribery|kickback|emergency action|final judgment|halts?)\b/i;

const SEC_EXCLUDED_TITLE_REGEX =
  /\b(manual|director|committee|advisory|budget|meeting|appoints?|names?|publishes?|proposes?|adopts?|dialogue|roundtable|forum|report|event|resigned|retirement|staff|mou|clarifies|host|formation|task force|pcaob)\b/i;

const SEC_BODY_MONETARY_REGEX =
  /(civil penalty|penalty|disgorgement|prejudgment interest|restitution|forfeiture|monetary relief|fair fund)/i;

const SEC_BODY_ACTION_REGEX =
  /(agreed to pay|ordered to pay|will pay|pay(?:ing)?|settled|without admitting or denying|consented|consent(?:ed)? to|final judgment|ordered)/i;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseSecPressReleaseListing(html: string) {
  const $ = cheerio.load(html);
  const rows: SecPressReleaseRow[] = [];

  $('tr.pr-list-page-row').each((_, element) => {
    const time = $(element).find('time.datetime').first();
    const titleLink = $(element).find('td.views-field-field-display-title a').first();
    const releaseNumber = normalizeWhitespace(
      $(element).find('td.views-field-field-release-number').first().text(),
    );
    const dateIssued = normalizeWhitespace(time.attr('datetime') || '').slice(0, 10);
    const title = normalizeWhitespace(titleLink.text());
    const detailUrl = makeAbsoluteUrl(SEC_PRESS_RELEASES_URL, titleLink.attr('href') || '');

    if (!dateIssued || !title || !detailUrl || !releaseNumber) {
      return;
    }

    rows.push({
      dateIssued,
      title,
      detailUrl,
      releaseNumber,
    });
  });

  return rows;
}

export function isLikelySecEnforcementTitle(title: string) {
  return (
    SEC_TITLE_PREFIX_REGEX.test(title)
    || (SEC_ENFORCEMENT_TITLE_REGEX.test(title) && !SEC_EXCLUDED_TITLE_REGEX.test(title))
  );
}

function extractSecPageCount(html: string) {
  const matches = [...html.matchAll(/\?page=(\d+)/g)];
  const highestPageIndex = matches.reduce((max, match) => Math.max(max, Number.parseInt(match[1], 10)), 0);
  return highestPageIndex + 1;
}

function parseSecDetail(html: string): SecPressReleaseDetail {
  const $ = cheerio.load(html);
  const subtitle = normalizeWhitespace($('.field--name-field-sub-title').first().text()) || null;
  const bodyText = normalizeWhitespace($('.field--name-body').first().text());
  const resourceUrls = $('.field--name-field-related-materials a')
    .map((_, element) => makeAbsoluteUrl(SEC_PRESS_RELEASES_URL, $(element).attr('href') || ''))
    .get()
    .filter(Boolean);

  return {
    subtitle,
    bodyText,
    resourceUrls,
  };
}

export function extractSecPrimaryEntity(title: string) {
  const clean = (value: string) =>
    normalizeWhitespace(value)
      .replace(/[.]+$/g, '')
      .replace(/^against\s+/i, '')
      .replace(/^charges against\s+/i, '');

  const patterns = [
    /^SEC Charges\s+(.+?)\s+with\b/i,
    /^SEC Charges\s+(.+?)\s+for\b/i,
    /^SEC Charges\s+(.+?)\s+in\b/i,
    /^SEC Charges\s+(.+)$/i,
    /^SEC Settles(?: Charges)? Against\s+(.+?)\s+for\b/i,
    /^SEC Settles(?: Charges)? Against\s+(.+)$/i,
    /^SEC Sues\s+(.+?)\s+for\b/i,
    /^SEC Sues\s+(.+)$/i,
    /^SEC Bars\s+(.+)$/i,
    /^SEC Sanctions?\s+(.+)$/i,
    /^SEC Orders\s+(.+?)\s+to\b/i,
    /^SEC Obtains(?: a)?(?: Final)? Judgment Against\s+(.+)$/i,
    /^SEC Announces Charges Against\s+(.+?)\s+for\b/i,
    /^SEC Announces Charges Against\s+(.+)$/i,
    /^SEC Files Emergency Action Against\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return clean(title.replace(/^SEC\s+/i, ''));
}

function extractUsdAmounts(text: string) {
  const matches = [...text.matchAll(/\$([\d,]+(?:\.\d+)?)(?:\s*(million|billion|thousand))?/gi)];

  return matches
    .map((match) => {
      const base = Number.parseFloat((match[1] || '').replace(/,/g, ''));
      if (!Number.isFinite(base)) {
        return null;
      }

      const multiplier = (match[2] || '').toLowerCase();
      if (multiplier === 'billion') {
        return base * 1_000_000_000;
      }
      if (multiplier === 'million') {
        return base * 1_000_000;
      }
      if (multiplier === 'thousand') {
        return base * 1_000;
      }

      return base;
    })
    .filter((value): value is number => value !== null);
}

export function parseSecMonetaryRelief(bodyText: string) {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);

  const relevantParagraphs = Array.from(
    new Set(
      paragraphs.filter(
        (paragraph) => SEC_BODY_MONETARY_REGEX.test(paragraph) && SEC_BODY_ACTION_REGEX.test(paragraph),
      ),
    ),
  );

  if (relevantParagraphs.length === 0) {
    return null;
  }

  const relevantSentences = relevantParagraphs
    .flatMap((paragraph) => paragraph.split(/(?<=[.?!])\s+/))
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(
      (sentence) =>
        SEC_BODY_MONETARY_REGEX.test(sentence)
        && (SEC_BODY_ACTION_REGEX.test(sentence) || /without admitting or denying/i.test(sentence)),
    );

  const amounts = relevantSentences.flatMap((sentence) => extractUsdAmounts(sentence));
  if (amounts.length === 0) {
    return null;
  }

  return amounts.reduce((sum, amount) => sum + amount, 0);
}

function isSecEnforcementBody(bodyText: string) {
  return /(complaint|charges?|charged|settled order|agreed to pay|cease and desist|cease-and-desist|civil penalty|disgorgement|prejudgment interest|permanent injunction|officer and director bar|fraud scheme)/i.test(
    bodyText,
  );
}

function categorizeSecRelease(title: string, bodyText: string) {
  const haystack = `${title} ${bodyText}`.toLowerCase();
  const categories: string[] = [];

  if (haystack.includes('accounting')) {
    categories.push('ACCOUNTING');
  }
  if (haystack.includes('disclosure')) {
    categories.push('DISCLOSURE');
  }
  if (haystack.includes('insider')) {
    categories.push('INSIDER_TRADING');
  }
  if (haystack.includes('crypto')) {
    categories.push('CRYPTO');
  }
  if (haystack.includes('ponzi') || haystack.includes('fraud')) {
    categories.push('FRAUD');
  }
  if (haystack.includes('unregistered')) {
    categories.push('UNREGISTERED_ACTIVITY');
  }
  if (haystack.includes('manipulation') || haystack.includes('spoof')) {
    categories.push('MARKET_MANIPULATION');
  }
  if (haystack.includes('brib') || haystack.includes('fcp')) {
    categories.push('BRIBERY');
  }
  if (haystack.includes('adviser') || haystack.includes('advisor')) {
    categories.push('ADVISORY');
  }
  if (haystack.includes('books and records') || haystack.includes('internal accounting control')) {
    categories.push('BOOKS_AND_RECORDS');
  }

  return categories.length > 0 ? categories : ['SEC_ENFORCEMENT'];
}

async function fetchSecListingPage(pageIndex: number) {
  const url = `${SEC_PRESS_RELEASES_URL}?page=${pageIndex}`;
  return fetchText(url, {
    headers: SEC_HEADERS,
  });
}

async function enrichSecRelease(row: SecPressReleaseRow) {
  const html = await fetchText(row.detailUrl, {
    headers: SEC_HEADERS,
  });
  const detail = parseSecDetail(html);
  if (!isSecEnforcementBody(detail.bodyText)) {
    return null;
  }

  const amount = parseSecMonetaryRelief(detail.bodyText);
  const summary = detail.subtitle
    ? `${detail.subtitle}. ${detail.bodyText.slice(0, 500)}`
    : detail.bodyText.slice(0, 500);

  return buildEuFineRecord({
    regulator: 'SEC',
    regulatorFullName: 'U.S. Securities and Exchange Commission',
    countryCode: 'US',
    countryName: 'United States',
    firmIndividual: extractSecPrimaryEntity(row.title),
    firmCategory: 'Firm or Individual',
    amount,
    currency: 'USD',
    dateIssued: row.dateIssued,
    breachType: row.title,
    breachCategories: categorizeSecRelease(row.title, detail.bodyText),
    summary,
    finalNoticeUrl: detail.resourceUrls[0] || row.detailUrl,
    sourceUrl: row.detailUrl,
    rawPayload: {
      ...row,
      subtitle: detail.subtitle,
      resourceUrls: detail.resourceUrls,
      amount,
    },
  });
}

export async function loadSecLiveRecords() {
  const firstPageHtml = await fetchSecListingPage(0);
  const pageCount = extractSecPageCount(firstPageHtml);
  const rows = [...parseSecPressReleaseListing(firstPageHtml)];

  for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
    const pageHtml = await fetchSecListingPage(pageIndex);
    const pageRows = parseSecPressReleaseListing(pageHtml);
    if (pageRows.length === 0) {
      break;
    }

    rows.push(...pageRows);

    const oldestYear = Math.min(...pageRows.map((row) => Number.parseInt(row.dateIssued.slice(0, 4), 10)));
    if (oldestYear < SEC_DEFAULT_SINCE_YEAR) {
      break;
    }

    await sleep(SEC_LISTING_PAGE_DELAY_MS);
  }

  const candidateRows = Array.from(
    new Map(
      rows
        .filter((row) => Number.parseInt(row.dateIssued.slice(0, 4), 10) >= SEC_DEFAULT_SINCE_YEAR)
        .filter((row) => isLikelySecEnforcementTitle(row.title))
        .map((row) => [row.detailUrl, row]),
    ).values(),
  );

  const records = [];

  for (let index = 0; index < candidateRows.length; index += SEC_DETAIL_BATCH_SIZE) {
    const batch = candidateRows.slice(index, index + SEC_DETAIL_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((row) => enrichSecRelease(row)));

    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) {
        records.push(result.value);
      }
    }

    if (index + SEC_DETAIL_BATCH_SIZE < candidateRows.length) {
      await sleep(SEC_DETAIL_BATCH_DELAY_MS);
    }
  }

  return records;
}

export async function main() {
  await runScraper({
    name: '🇺🇸 SEC Press Release Enforcement Scraper',
    liveLoader: loadSecLiveRecords,
    testLoader: loadSecLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ SEC scraper failed:', error);
    process.exit(1);
  });
}
