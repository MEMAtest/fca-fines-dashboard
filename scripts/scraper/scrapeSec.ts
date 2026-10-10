import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'node:url';
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
} from './lib/euFineHelpers.js';
import { assessEntityName, unnamedParty, UNNAMED_PARTY_CATEGORY } from './lib/entityName.js';
import { confidentSecName, isPlaceLedInstitution } from './lib/secNames.js';
import { runScraper } from './lib/runScraper.js';
import { envInt, isBackfillRun, isoDateDaysAgo } from './lib/incrementalWindow.js';

const SEC_PRESS_RELEASES_URL = 'https://www.sec.gov/newsroom/press-releases';
const SEC_DEFAULT_SINCE_YEAR = Number.parseInt(process.env.SEC_SINCE_YEAR || '2012', 10);
// Incremental by default: the full 2012+ crawl (>1,800 detail pages) cannot finish
// inside a CI slot. Daily runs cover the last SEC_INCREMENTAL_DAYS days; pass
// --backfill (or SEC_BACKFILL=1) for the full archive since SEC_SINCE_YEAR.
const SEC_INCREMENTAL_DAYS = envInt('SEC_INCREMENTAL_DAYS', 120);
const SEC_LISTING_PAGE_DELAY_MS = Number.parseInt(process.env.SEC_LISTING_PAGE_DELAY_MS || '150', 10);
const SEC_DETAIL_BATCH_DELAY_MS = Number.parseInt(process.env.SEC_DETAIL_BATCH_DELAY_MS || '250', 10);
const SEC_DETAIL_BATCH_SIZE = Number.parseInt(process.env.SEC_DETAIL_BATCH_SIZE || '3', 10);
const SEC_USER_AGENT = (process.env.SEC_USER_AGENT || '').trim() || 'MEMA Consultants research@memaconsultants.com';
const SEC_HEADERS = {
  // SEC Fair Access policy expects an identifying user agent with contact info.
  'User-Agent': SEC_USER_AGENT,
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

/**
 * The extractor as it was when the stored rows were hashed. Used for content-hash
 * identity ONLY (identityFirm); never for display.
 */
export function legacyExtractSecPrimaryEntity(title: string) {
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

const SEC_STOP_TOKENS = new Set(
  ('a an the its his her their our and or of in for with to former current registered investment adviser advisers advisor advisors advisory ' +
    'firm firms private fund funds founder founders owner owners ceo ceos cio cfo coo cco president chairman director directors officer officers ' +
    'executive executives manager managers partner partners principal principals representative representatives employee employees ' +
    'individual individuals person persons entity entities company companies corporation resident residents citizen citizens trio pair group ' +
    'operator operators broker broker-dealer broker-dealers dealer dealers promoter promoters trader traders club clubs ' +
    'multiple several various additional other numerous certain purported alleged affiliated boiler room ' +
    'co-founder co-founders dozens dozen texans pair ' +
    'american canadian chinese british german indian mexican brazilian australian korean japanese ' +
    'north south east west northern southern eastern western central bay area san new ' +
    'alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky ' +
    'louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada hampshire jersey mexico york carolina ' +
    'dakota ohio oklahoma oregon pennsylvania rhode island tennessee texas utah vermont virginia washington wisconsin wyoming ' +
    'new-jersey-based sister-in-law brother-in-law toms river').split(/\s+/),
);
/** Words that describe a party only when the segment is otherwise a description ("Alternative Trading Systems Operator X"); alone they can be part of a name ("Crypto Platform Example LLC"). */
const SEC_WEAK_STOP_TOKENS = new Set('general public crypto asset assets trading systems alternative platform platforms top senior chief'.split(' '));
const SEC_TITLE_TOKENS = /^(?:co-)?(?:ceo|cio|cfo|coo|cco|president|chairman|owner|founder|director|officer|executive|manager|partner|principal)s?,?$/i;
const SEC_TRAILING_DESCRIPTORS = new Set(['firms', 'entities', 'companies', 'individuals', 'executives', 'officers', 'representatives', 'trio', 'pair', 'citizen', 'citizens', 'resident', 'residents', 'advisory']);

const SEC_NUMERALS = /^(?:\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)$/i;

function isSecStopToken(token: string, descriptorContext = true) {
  if (token.startsWith('\u0000')) return false;
  if (descriptorContext && SEC_WEAK_STOP_TOKENS.has(token.replace(/[,"“”]/g, '').toLowerCase())) return true;
  const t = token.replace(/[,"“”]/g, '').toLowerCase();
  if (!t) return true;
  if (SEC_NUMERALS.test(t)) return true;
  if (/-based$/.test(t)) return true;
  return SEC_STOP_TOKENS.has(t);
}

/** Reduce one comma/"and"-separated segment to its proper-noun party, or "". */
function reduceSecSegment(segment: string): string {
  if (isPlaceLedInstitution(segment) && !SEC_TITLE_TOKENS.test(segment.split(' ')[0])) return segment.replace(/[,\s]+$/, '');
  let tokens = segment.split(' ').filter(Boolean);
  // A leading number is a count ("Three Texans") when the segment ends in a generic
  // plural, but part of the name otherwise ("Two Sigma", "One Oak Capital").
  const lastWord = (tokens[tokens.length - 1] ?? '').toLowerCase().replace(/[,]/g, '');
  const numeralIsCount = SEC_NUMERALS.test(tokens[0] ?? '') && (SEC_TRAILING_DESCRIPTORS.has(lastWord) || SEC_STOP_TOKENS.has(lastWord) || SEC_WEAK_STOP_TOKENS.has(lastWord));
  if (SEC_NUMERALS.test(tokens[0] ?? '') && !numeralIsCount) {
    tokens[0] = `\u0000${tokens[0]}`; // protect from the stop-token strip below
  }
  // A title word ("Co-CIO", "CEO") inside the segment means the name follows it.
  let lastTitle = -1;
  tokens.forEach((token, index) => { if (SEC_TITLE_TOKENS.test(token)) lastTitle = index; });
  if (lastTitle >= 0) {
    if (lastTitle === tokens.length - 1) return ''; // "PGI Global Founder": the party is a role, not named
    if (tokens.slice(lastTitle + 1).some((token) => /-based$/i.test(token))) return ''; // "Owner of Washington-Based Water Machine Manufacturer"
    tokens = tokens.slice(lastTitle + 1);
  }
  const descriptorContext = numeralIsCount || lastTitle >= 0 || tokens.some((token) => isSecStopToken(token, false) && !SEC_NUMERALS.test(token));
  while (tokens.length > 0 && isSecStopToken(tokens[0], descriptorContext)) tokens.shift();
  let strippedPlural = false;
  while (tokens.length > 0 && SEC_TRAILING_DESCRIPTORS.has(tokens[tokens.length - 1].toLowerCase().replace(/[,]/g, '')) && (strippedPlural || tokens[tokens.length - 1].toLowerCase() !== 'advisory')) {
    tokens.pop();
    strippedPlural = true;
  }
  while (tokens.length > 0 && /^(?:of|and|the|its|his|their|in|for|with)$/i.test(tokens[tokens.length - 1])) tokens.pop();
  const name = tokens.join(' ').replace(/\u0000/g, '').replace(/[,\s]+$/, '');
  if (!name || !/\p{Lu}/u.test(name)) return '';
  return name;
}

/**
 * Real party named in an SEC press-release title, or null when the title only
 * describes the party ("Two Individuals", "Former Executives").
 */
export function extractSecNamedParty(title: string): string | null {
  let candidate = legacyExtractSecPrimaryEntity(title)
    .replace(/^(?:Seeks|Obtains)(?: a)?(?: Final)? Judgment Against\s+/i, '')
    .replace(/\s+(?:Charged|Settle[sd]?|Agrees?|Agreed|Ordered|Sentenced|to Pay)\b.*$/i, '')
    .replace(/\s+in\s+(?=Connection|Alleged|Cherry|Fraud|Offering|Insider)[\s\S]*$/i, '')
    .replace(/\s+in\s+(?=\p{Lu})[\s\S]*$/u, '');
  candidate = normalizeWhitespace(candidate);
  const [head, ...appositives] = candidate.split(/,\s+/);
  void appositives; // "Alan Burak, Founder of Never Alone Capital," -> the appositive is a role, not a second party
  const reduced = head.split(/\s+and\s+(?!Trust\b|Savings\b|Loan\b)/i).map(reduceSecSegment).filter(Boolean);
  // One described segment ("Banker and Plumber", "BKCoin and Kevin Kang for Orchestrating ...") makes the whole party list unreliable.
  const confident = reduced.map((segment) => confidentSecName(segment));
  if (confident.some((segment) => segment === null)) return null;
  const segments = confident.filter((segment): segment is string => Boolean(segment));
  const unique = [...new Set(segments)];
  if (unique.length === 0) return null;
  const name = unique.join(' and ');
  return confidentSecName(name) === name && assessEntityName(name).ok ? name : null;
}

export function extractSecPrimaryEntity(title: string) {
  return extractSecNamedParty(title) ?? unnamedParty('SEC').name;
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
  try {
    const html = await fetchText(row.detailUrl, {
      headers: SEC_HEADERS,
      timeout: 90000, // 90 seconds timeout
    });
    const detail = parseSecDetail(html);
    if (!isSecEnforcementBody(detail.bodyText)) {
      return null;
    }

  const amount = parseSecMonetaryRelief(detail.bodyText);
  const named = extractSecNamedParty(row.title);
  const secParty = { name: named ?? unnamedParty('SEC').name, named: named !== null };
  const summary = detail.subtitle
    ? `${detail.subtitle}. ${detail.bodyText.slice(0, 500)}`
    : detail.bodyText.slice(0, 500);

  return buildEuFineRecord({
    regulator: 'SEC',
    regulatorFullName: 'U.S. Securities and Exchange Commission',
    countryCode: 'US',
    countryName: 'United States',
    firmIndividual: secParty.name,
    identityFirm: legacyExtractSecPrimaryEntity(row.title),
    firmCategory: secParty.named ? 'Firm or Individual' : UNNAMED_PARTY_CATEGORY,
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
  } catch (error) {
    console.warn(`⚠️ Failed to enrich SEC release: ${row.title} (${row.detailUrl})`);
    if (axios.isAxiosError(error)) {
      console.warn(`   HTTP ${error.response?.status || 'N/A'} - ${error.code || 'UNKNOWN'}: ${error.message}`);
    } else {
      console.warn(`   Error:`, error instanceof Error ? error.message : String(error));
    }
    throw error; // Re-throw to be caught by Promise.allSettled
  }
}

export async function loadSecLiveRecords() {
  console.log('🇺🇸 SEC Scraper starting...');
  console.log(`   User-Agent: ${SEC_USER_AGENT}`);
  const backfill = isBackfillRun('SEC');
  const sinceDate = backfill ? `${SEC_DEFAULT_SINCE_YEAR}-01-01` : isoDateDaysAgo(SEC_INCREMENTAL_DAYS);
  console.log(backfill ? `   Mode: backfill since ${sinceDate}` : `   Mode: incremental since ${sinceDate}`);

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

    const oldestDate = pageRows.reduce((min, row) => (row.dateIssued < min ? row.dateIssued : min), pageRows[0].dateIssued);
    if (oldestDate < sinceDate) {
      break;
    }

    await sleep(SEC_LISTING_PAGE_DELAY_MS);
  }

  const candidateRows = Array.from(
    new Map(
      rows
        .filter((row) => row.dateIssued >= sinceDate)
        .filter((row) => isLikelySecEnforcementTitle(row.title))
        .map((row) => [row.detailUrl, row]),
    ).values(),
  );

  const records = [];
  let rejectedCount = 0;

  for (let index = 0; index < candidateRows.length; index += SEC_DETAIL_BATCH_SIZE) {
    const batch = candidateRows.slice(index, index + SEC_DETAIL_BATCH_SIZE);
    const settled = await Promise.allSettled(batch.map((row) => enrichSecRelease(row)));

    for (let i = 0; i < settled.length; i += 1) {
      const result = settled[i];
      if (result.status === 'fulfilled' && result.value) {
        records.push(result.value);
      } else if (result.status === 'rejected') {
        rejectedCount += 1;
        const row = batch[i];
        console.warn(`⚠️ SEC enrichment failed for "${row.title}" (${row.detailUrl}): ${result.reason}`);
      }
    }

    if (index + SEC_DETAIL_BATCH_SIZE < candidateRows.length) {
      await sleep(SEC_DETAIL_BATCH_DELAY_MS);
    }
  }

  if (rejectedCount > 0) {
    console.warn(`⚠️ ${rejectedCount} SEC enrichment(s) failed out of ${candidateRows.length} candidates`);
  }

  return records;
}

export async function main() {
  await runScraper({
    name: '🇺🇸 SEC Press Release Enforcement Scraper',
    region: 'North America',
    liveLoader: loadSecLiveRecords,
    qualityContract: isBackfillRun('SEC')
      ? undefined
      : { preparedBatchScope: 'incremental', minimumPreparedRecords: 3 },
    testLoader: loadSecLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ SEC scraper failed:', error);
    process.exit(1);
  });
}
