/**
 * AMF (Autorite des marches financiers - France) Scraper
 *
 * Strategy: Fetch the live JSON listing endpoint used by the AMF page,
 * then enrich each enforcement article via its canonical detail page.
 * URL: https://www.amf-france.org/en/news-publications/news-releases/enforcement-committee-news-releases
 *
 * Difficulty: 5-6/10 (Moderate) - JSON listing + article metadata parsing
 * Expected: 100+ enforcement actions
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import postgres from 'postgres';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { isGenericDescription, validateExtractedName, normalizeFirmName as sharedNormalizeFirmName } from './lib/nameValidation.js';
import { extractNameFromBodyText } from './lib/bodyTextExtractor.js';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

const AMF_CONFIG = {
  baseUrl: 'https://www.amf-france.org',
  enforcementUrl: '/en/news-publications/news-releases/enforcement-committee-news-releases',
  rateLimit: 900,
  detailRateLimit: 700,
  maxRetries: 3,
  maxRecords: 300,
};

interface AMFListingConfig {
  endpoint: string;
  listingUrl: string;
}

interface AMFListingItem {
  date: string;
  theme: string;
  infos?: {
    title?: string;
    text?: string;
    link?: {
      url?: string;
    };
  };
}

interface AMFRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string;
  summary: string;
  theme: string;
  listingUrl: string;
}

async function main() {
  console.log('🇫🇷 AMF Enforcement Actions Scraper\n');
  console.log('Target: Autorite des marches financiers (France)');
  console.log('Method: Listing API + article metadata parsing\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) {
    console.log('⚠️  Using test data (--test-data flag detected)\n');
  }
  if (dryRun) {
    console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');
  }

  try {
    const records = useTestData ? getTestData() : await scrapeAmfPage();

    console.log(`📊 Extracted ${records.length} enforcement actions`);

    const transformed = records.map((record) => transformRecord(record));

    if (dryRun) {
      console.log('\n🔍 Dry run - skipping database insert');
      console.log('Records that would be inserted:');
      transformed.forEach((record, index) => {
        console.log(`   ${index + 1}. ${record.firmIndividual} - €${(record.amount || 0).toLocaleString()} (${record.dateIssued})`);
      });
    } else {
      await upsertRecords(transformed);

      console.log('\n🔄 Refreshing unified regulatory fines view...');
      await sql`SELECT refresh_all_fines()`;
      console.log('✅ View refreshed');
    }

    const totalAmf = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'AMF'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - AMF enforcement actions: ${totalAmf[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ AMF scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ AMF scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): AMFRecord[] {
  return [
    {
      firm: 'Natixis Investment Managers International',
      amount: 35000000,
      currency: 'EUR',
      date: '2024-07-04',
      breach: 'Manquement aux obligations de bonne conduite et respect des procedures',
      link: 'https://www.amf-france.org/en/news-publications/news-releases/enforcement-committee-news/enforcement-committee-sanctions-natixis-investment-managers-international-and-its',
      summary: 'Failure to comply with conduct of business obligations and respect procedures.',
      theme: 'Sanctions & settlements',
      listingUrl: AMF_CONFIG.baseUrl + AMF_CONFIG.enforcementUrl,
    },
    {
      firm: 'CACEIS Bank',
      amount: 3500000,
      currency: 'EUR',
      date: '2025-12-22',
      breach: 'Deficiencies in professional obligations and internal controls',
      link: 'https://www.amf-france.org/en/news-publications/news-releases/enforcement-committee-news-releases/amf-enforcement-committee-fines-depositary-caceis-bank-breaches-its-professional-obligations',
      summary: 'In its decision of 17 December 2025, the Enforcement Committee imposed a fine of €3.5 million on CACEIS Bank and issued it with a warning.',
      theme: 'Sanctions & settlements',
      listingUrl: AMF_CONFIG.baseUrl + AMF_CONFIG.enforcementUrl,
    },
  ];
}

async function scrapeAmfPage(): Promise<AMFRecord[]> {
  console.log('📄 Fetching AMF enforcement listing configuration...');

  const listingConfig = await getListingConfig();
  console.log(`   Listing endpoint: ${listingConfig.endpoint}`);

  const payload = await fetchJsonWithRetry<{ data?: AMFListingItem[] }>(listingConfig.endpoint);
  const items = Array.isArray(payload.data) ? payload.data : [];

  if (items.length === 0) {
    throw new Error('No AMF enforcement listing items were returned by the live endpoint.');
  }

  console.log(`   Found ${items.length} listing entries`);

  const records: AMFRecord[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const title = normalizeText(item.infos?.title || '');
    const detailUrl = normalizeAbsoluteUrl(item.infos?.link?.url || '', AMF_CONFIG.baseUrl);

    if (!title || !detailUrl || !isAmfEnforcementTitle(title)) {
      continue;
    }

    const key = `${detailUrl}|${item.date}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (records.length >= AMF_CONFIG.maxRecords) {
      break;
    }

    if (records.length > 0) {
      await sleep(AMF_CONFIG.detailRateLimit);
    }

    try {
      const record = await enrichAmfListingItem(item, detailUrl, listingConfig.listingUrl);
      if (!record) {
        continue;
      }

      records.push(record);
      console.log(`   ✓ Parsed: ${record.firm} - €${record.amount?.toLocaleString() || 'N/A'}`);
    } catch (error) {
      console.log(`   ✗ Failed to parse ${detailUrl}`);
    }
  }

  if (records.length === 0) {
    throw new Error('No AMF enforcement records were parsed from the live listing.');
  }

  return records;
}

async function getListingConfig(): Promise<AMFListingConfig> {
  const listingUrl = AMF_CONFIG.baseUrl + AMF_CONFIG.enforcementUrl;
  const html = await fetchTextWithRetry(listingUrl);
  const $ = cheerio.load(html);

  const lang = $('html').attr('lang') || 'en';
  const nid = $('body').attr('data-nid');
  const format = $('input[name="format"]').first().attr('value') || 'format';
  const filtre = $('input[name="filtre"]').first().attr('value');
  const filtreActeur = $('input[name="filtre_acteur"]').first().attr('value') || 'all';

  if (!nid || !filtre) {
    throw new Error('Unable to derive AMF listing parameters from the live page.');
  }

  return {
    listingUrl,
    endpoint: `${AMF_CONFIG.baseUrl}/${lang}/getlisting/${format}/${filtre}/${filtreActeur || 'all'}/all/all/all/${nid}`,
  };
}

async function enrichAmfListingItem(item: AMFListingItem, detailUrl: string, listingUrl: string): Promise<AMFRecord | null> {
  const detailHtml = await fetchTextWithRetry(detailUrl);
  const $ = cheerio.load(detailHtml);

  const title = normalizeText(
    $('meta[property="og:title"]').attr('content')
    || $('title').first().text().replace(/\s*\|\s*AMF\s*$/i, '')
    || item.infos?.title
    || ''
  );
  const metaDescription = normalizeText($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '');
  const canonicalUrl = normalizeAbsoluteUrl($('link[rel="canonical"]').attr('href') || detailUrl, AMF_CONFIG.baseUrl);
  const bodyText = extractAmfBodyText($);
  const summary = normalizeText(metaDescription || bodyText || title);
  const firm = extractAmfFirm(title, summary, bodyText) || 'Unknown';

  // Note: We intentionally keep records with 'Unknown' firm names
  // Better to have honest unknowns than misleading title fragments

  return {
    firm,
    amount: extractAmfAmount([title, summary, bodyText]),
    currency: 'EUR',
    date: parseAmfTimestamp(item.date),
    breach: extractAmfBreach(`${title} ${summary}`, bodyText),
    link: canonicalUrl,
    summary,
    theme: normalizeText(item.theme || ''),
    listingUrl,
  };
}

async function fetchTextWithRetry(url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= AMF_CONFIG.maxRetries; attempt += 1) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RegulatoryScanner/2.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-GB,en;q=0.5',
        },
        timeout: 30000,
      });

      return response.data as string;
    } catch (error) {
      lastError = error;
      if (attempt < AMF_CONFIG.maxRetries) {
        await sleep(AMF_CONFIG.rateLimit * attempt);
      }
    }
  }

  throw lastError;
}

async function fetchJsonWithRetry<T>(url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= AMF_CONFIG.maxRetries; attempt += 1) {
    try {
      const response = await axios.get<T>(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RegulatoryScanner/2.0)',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-GB,en;q=0.5',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt < AMF_CONFIG.maxRetries) {
        await sleep(AMF_CONFIG.rateLimit * attempt);
      }
    }
  }

  throw lastError;
}

function extractAmfBodyText($: cheerio.CheerioAPI) {
  // Always use the full main text to ensure we capture enforcement decision details
  const mainText = $('main').text().trim();

  if (mainText.length > 100) {
    // Return the full text (up to reasonable limit for processing)
    return normalizeText(mainText.substring(0, 5000));
  }

  // Fallback to specific selectors if main is empty
  const selectors = [
    'main .field--name-body p',
    'main .paragraph p',
    'main article p',
    'main .wrapper-wysiwyg p',
    'main .content p',
  ];

  for (const selector of selectors) {
    const parts = $(selector)
      .map((_, element) => normalizeText($(element).text()))
      .get()
      .filter((part) => part.length > 40);

    if (parts.length > 0) {
      return normalizeText(parts.slice(0, 10).join(' '));
    }
  }

  return '';
}

function extractAmfFirm(title: string, summary: string, bodyText: string = '') {
  // PHASE 2 FIX: Enhanced body text extraction with French patterns
  // First, try to extract the COMPLETE list from body text "respectively on [FIRM, PERSON1, PERSON2]"
  if (bodyText && bodyText.length > 100) {
    // Scan first 3 paragraphs for "respectively on" pattern
    const bodyRespectivelyMatch = bodyText.match(/respectively on\s+(.+?)(?:\s+for|\s+in relation|\s+and issued|,\s+with effect|\.\s)/i);
    if (bodyRespectivelyMatch?.[1]) {
      const fullList = bodyRespectivelyMatch[1].trim();
      // Clean up the list (remove trailing commas, etc.)
      const cleaned = fullList.replace(/,\s*$/, '').trim();

      // Only use if it's not generic and contains actual names
      if (cleaned.length > 10 && cleaned.length < 300 && !isGenericDescription(cleaned)) {
        return normalizeFirmName(cleaned);
      }
    }

    // Try French-specific patterns
    const frenchPatterns = [
      /la société\s+([A-Z][A-Za-zéèàçùÉÈÀÇÙ\s&\.]{3,60})/i,
      /l'entreprise\s+([A-Z][A-Za-zéèàçùÉÈÀÇÙ\s&\.]{3,60})/i,
      /M\.\s+([A-Z][a-zéèàçù]+\s+[A-Z][a-zéèàçù]+)/i  // Mr. FirstName LastName
    ];

    for (const pattern of frenchPatterns) {
      const match = bodyText.match(pattern);
      if (match?.[1]) {
        const candidate = normalizeFirmName(match[1]);
        if (candidate && !isGenericDescription(candidate)) {
          return candidate;
        }
      }
    }

    // Try generic body text extraction as final attempt
    const bodyExtraction = extractNameFromBodyText(bodyText, 'fr');
    if (bodyExtraction && !isGenericDescription(bodyExtraction)) {
      return normalizeFirmName(bodyExtraction);
    }
  }

  // Fallback to summary extraction
  // Pattern: "imposed fines of €X, €Y and €Z respectively on [FIRM], [PERSON 1] and [PERSON 2]"
  const respectivelyMatch = summary.match(/respectively on\s+(.+?)(?:\s+for|\s+in relation|\s+and issued|\.\s|$)/i);
  if (respectivelyMatch?.[1]) {
    const names = extractNamesFromList(respectivelyMatch[1]);
    if (names) {
      return names;
    }
  }

  // Pattern: "imposed a fine/penalty of €X on [FIRM/PERSON]"
  const singleFineMatch = summary.match(/imposed (?:a (?:fine|financial penalty|penalty)|fines?|penalties) of .*? on\s+(.+?)(?:\s+for|\s+in relation|\s+and issued|\.\s|$)/i);
  if (singleFineMatch?.[1]) {
    const cleaned = normalizeFirmName(singleFineMatch[1]);
    if (cleaned && !isGenericDescription(cleaned)) {
      return cleaned;
    }
  }

  // Pattern: "penalty on [FIRM]" or "fine on [FIRM]" (without amount)
  const simplePenaltyMatch = summary.match(/(?:fine|penalty|financial penalty)\s+on\s+(.+?)(?:\s+for|\s+in relation|\s+and issued|\.\s|$)/i);
  if (simplePenaltyMatch?.[1]) {
    const cleaned = normalizeFirmName(simplePenaltyMatch[1]);
    if (cleaned && !isGenericDescription(cleaned)) {
      return cleaned;
    }
  }

  // Try title patterns
  const titleCandidates = [
    title.match(/fines?\s+(?:the\s+)?(.+?)\s+for\b/i),
    title.match(/fines?\s+(?:the\s+)?(.+?)\s+a total of\b/i),
    title.match(/fines?\s+(?:the\s+)?(.+?)\s+and its\b/i),
    title.match(/sanctions?\s+(?:the\s+)?(.+?)\s+a total of\b/i),
    title.match(/sanctions?\s+(?:the\s+)?(.+?)\s+for\b/i),
    title.match(/clears?\s+(?:the\s+)?(.+?)(?:\s+of all charges|\s+and|\s*$)/i),
  ];

  for (const candidate of titleCandidates) {
    if (candidate?.[1]) {
      const cleaned = normalizeFirmName(candidate[1]);
      if (cleaned && !isGenericDescription(cleaned)) {
        return cleaned;
      }
    }
  }

  // PHASE 2 FIX: Reduced aggressive title stripping to preserve context
  const strippedTitle = normalizeFirmName(
    title
      .replace(/^The AMF Enforcement Committee fines?\s+/i, '')
      .replace(/^AMF Enforcement Committee fines?\s+/i, '')
      .replace(/^The AMF Enforcement Committee sanctions?\s+/i, '')
      .replace(/^AMF Enforcement Committee sanctions?\s+/i, '')
      .replace(/^The AMF Enforcement Committee clears?\s+/i, '')
      .replace(/^AMF Enforcement Committee clears?\s+/i, '')
      .replace(/\s+fined by the Enforcement Committee.*$/i, '')
      .replace(/\s+by the Enforcement Committee.*$/i, '')
      .replace(/\s+by the Autorité.*$/i, '')
      .replace(/\s+for\b[\s\S]*$/i, '')
      .replace(/\s+a total of\b[\s\S]*$/i, '')
      .replace(/\s+totalling\b[\s\S]*$/i, '')
      .replace(/\s+and issued.*$/i, '')
      .replace(/\s+and (?:given|ordered).*$/i, '')
  );

  // PHASE 2 FIX: Reject if still looks like title boilerplate
  if (strippedTitle && /^(?:The|AMF|Enforcement Committee)/i.test(strippedTitle)) {
    return null;
  }

  // PHASE 2 FIX: Only use if reasonable length (not full title)
  if (strippedTitle && strippedTitle.length > 100) {
    return null; // Too long, likely full title
  }

  // Final validation
  return validateExtractedName(strippedTitle);
}

function extractNamesFromList(text: string): string | null {
  // Extract actual firm/individual names from list like "M Capital Partners, Rudy Secco and Isabelle Palisse"
  // or "CACEIS Bank" or "Gilbert Rodriguez and Jean-Pierre Martin"

  const cleaned = text
    .replace(/\s+for\b.*$/i, '')
    .replace(/\s+in relation.*$/i, '')
    .replace(/\s+and issued.*$/i, '')
    .trim();

  // Check if it contains multiple names separated by commas or "and"
  if (cleaned.includes(',') || (cleaned.includes(' and ') && cleaned.split(' and ').length <= 4)) {
    return normalizeFirmName(cleaned);
  }

  // Single name/firm
  return normalizeFirmName(cleaned);
}

// PHASE 2 FIX: Use shared utilities - local functions removed, replaced by imports
// isGenericDescription and normalizeFirmName now imported from lib/nameValidation.js

function normalizeFirmName(value: string): string | null {
  const cleaned = normalizeText(
    value
      .replace(/^the\s+/i, '')
      .replace(/\s+a total of\s+€[\d.,\s]+(?:\s*(?:million|thousand|billion))?/gi, '')
      .replace(/\s+totalling\s+€[\d.,\s]+(?:\s*(?:million|thousand|billion))?/gi, '')
      .replace(/\s+€[\d.,\s]+(?:\s*(?:million|thousand|billion))?/gi, '')
      .replace(/[.;:,]+$/g, '')
      .replace(/\s+respectively$/i, '')
      .replace(/\s+-\s*$/g, '')
  );

  if (!cleaned || cleaned.length < 3 || cleaned.length > 160) {
    return null;
  }

  // Use shared normalization for final cleanup
  return sharedNormalizeFirmName(cleaned);
}

function extractAmfAmount(texts: string[]) {
  for (const text of texts) {
    if (!text) {
      continue;
    }

    const totalMatch = text.match(/(?:a\s+total\s+of|totalling)\s+€\s*([\d.,\s]+)(?:\s*(million|thousand|billion))?/i)
      || text.match(/(?:a\s+total\s+of|totalling)\s+([\d.,\s]+)\s*(million|thousand|billion)?\s*euros?/i);

    if (totalMatch) {
      const total = parseScaledAmount(totalMatch[1], totalMatch[2]);
      if (total !== null) {
        return total;
      }
    }
  }

  const amounts: number[] = [];

  for (const text of texts) {
    if (!text) {
      continue;
    }

    const euroMatches = text.matchAll(/€\s*([\d.,\s]+)(?:\s*(million|thousand|billion))?/gi);
    for (const match of euroMatches) {
      const parsed = parseScaledAmount(match[1], match[2]);
      if (parsed !== null) {
        amounts.push(parsed);
      }
    }

    const wordMatches = text.matchAll(/([\d.,\s]+)\s*(million|thousand|billion)?\s*euros?/gi);
    for (const match of wordMatches) {
      const parsed = parseScaledAmount(match[1], match[2]);
      if (parsed !== null) {
        amounts.push(parsed);
      }
    }
  }

  const unique = [...new Set(amounts)];
  if (unique.length === 0) {
    return null;
  }
  if (unique.length === 1) {
    return unique[0];
  }

  return unique.reduce((sum, amount) => sum + amount, 0);
}

function parseScaledAmount(rawAmount: string, scale: string | undefined) {
  const cleaned = rawAmount.replace(/\s+/g, '').replace(/,/g, '');
  const numeric = Number.parseFloat(cleaned);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  const multiplier = scale?.toLowerCase();
  if (multiplier === 'billion') {
    return numeric * 1_000_000_000;
  }
  if (multiplier === 'million') {
    return numeric * 1_000_000;
  }
  if (multiplier === 'thousand') {
    return numeric * 1_000;
  }

  return numeric;
}

function parseAmfTimestamp(rawValue: string) {
  if (/^\d{9,}$/.test(rawValue)) {
    const timestamp = Number.parseInt(rawValue, 10) * 1000;
    return new Date(timestamp).toISOString().split('T')[0];
  }

  return parseFrenchDate(rawValue);
}

function normalizeAbsoluteUrl(rawUrl: string, baseUrl: string) {
  if (!rawUrl) {
    return '';
  }

  const absolute = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, baseUrl).toString();
  return absolute.replace(/#.*$/, '');
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAmfEnforcementTitle(title: string) {
  const lower = title.toLowerCase();

  if (lower.includes('appoint') || lower.includes('becomes chair') || lower.includes('becomes chairman')) {
    return false;
  }

  return lower.includes('fine')
    || lower.includes('sanction')
    || lower.includes('clear');
}

function parseFrenchDate(dateStr: string): string {
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const frenchMonths: Record<string, number> = {
    janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  const monthMatch = dateStr.match(/(\d{1,2})\s+([a-zéûôîêèç]+)\s+(\d{4})/i);
  if (monthMatch) {
    const day = Number.parseInt(monthMatch[1], 10);
    const month = frenchMonths[monthMatch[2].toLowerCase()];
    const year = Number.parseInt(monthMatch[3], 10);

    if (month && day >= 1 && day <= 31) {
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  const dayMonthMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dayMonthMatch) {
    const day = Number.parseInt(dayMonthMatch[1], 10);
    const month = Number.parseInt(dayMonthMatch[2], 10);
    let year = Number.parseInt(dayMonthMatch[3], 10);

    if (year < 100) {
      year += 2000;
    }

    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  return new Date().toISOString().split('T')[0];
}

function extractAmfBreach(title: string, body: string): string {
  const combinedText = `${title} ${body}`.toLowerCase();

  if (combinedText.includes('abus de marche') || combinedText.includes('market abuse')) {
    return 'Market abuse violations';
  }
  if (combinedText.includes('delit d\'initie') || combinedText.includes('délit d\'initié') || combinedText.includes('insider')) {
    return 'Insider dealing';
  }
  if (combinedText.includes('manipulation')) {
    return 'Market manipulation';
  }
  if (combinedText.includes('blanchiment') || combinedText.includes('anti-money laundering') || combinedText.includes('aml')) {
    return 'Anti-money laundering violations';
  }
  if (combinedText.includes('control') || combinedText.includes('controle interne') || combinedText.includes('contrôle interne')) {
    return 'Internal controls and governance failures';
  }
  if (combinedText.includes('conduct') || combinedText.includes('bonne conduite')) {
    return 'Conduct of business violations';
  }

  return 'Regulatory violations';
}

function transformRecord(record: AMFRecord) {
  const dateIssued = new Date(record.date);
  const yearIssued = dateIssued.getFullYear();
  const monthIssued = dateIssued.getMonth() + 1;
  const amountEur = record.amount;
  const amountGbp = amountEur ? Math.round(amountEur * 0.85 * 100) / 100 : null;

  // Content hash for deduplication - uses stable fields (regulator, date, link)
  // Excludes firm name so improved extraction updates existing records instead of creating duplicates
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      regulator: 'AMF',
      date: record.date,
      link: record.link,
    }))
    .digest('hex');

  const breachCategories = categorizeBreachType(record.breach);

  return {
    contentHash,
    regulator: 'AMF',
    regulatorFullName: 'Autorité des marchés financiers',
    countryCode: 'FR',
    countryName: 'France',
    firmIndividual: record.firm,
    firmCategory: 'Financial Institution',
    amount: record.amount,
    currency: record.currency,
    amountEur,
    amountGbp,
    dateIssued: dateIssued.toISOString().split('T')[0],
    yearIssued,
    monthIssued,
    breachType: extractBreachType(record.breach),
    breachCategories,
    summary: record.summary,
    finalNoticeUrl: record.link,
    sourceUrl: record.listingUrl,
    rawPayload: JSON.stringify(record),
  };
}

function extractBreachType(description: string): string {
  const lower = description.toLowerCase();

  if (lower.includes('market abuse')) {
    return 'Market Abuse';
  }
  if (lower.includes('insider')) {
    return 'Insider Dealing';
  }
  if (lower.includes('manipulation')) {
    return 'Market Manipulation';
  }
  if (lower.includes('anti-money laundering') || lower.includes('aml')) {
    return 'Anti-Money Laundering Violations';
  }
  if (lower.includes('conduct')) {
    return 'Conduct of Business Violations';
  }
  if (lower.includes('control') || lower.includes('governance')) {
    return 'Internal Controls';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  if (lower.includes('market abuse')) {
    categories.push('MARKET_ABUSE');
  }
  if (lower.includes('insider')) {
    categories.push('INSIDER_DEALING');
  }
  if (lower.includes('manipulation')) {
    categories.push('MARKET_MANIPULATION');
  }
  if (lower.includes('anti-money laundering') || lower.includes('aml')) {
    categories.push('AML');
  }
  if (lower.includes('conduct')) {
    categories.push('CONDUCT');
  }
  if (lower.includes('control') || lower.includes('governance')) {
    categories.push('GOVERNANCE');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

async function upsertRecords(records: any[]) {
  console.log(`\n💾 Inserting ${records.length} records into database...`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const result = await sql`
        INSERT INTO eu_fines (
          content_hash, regulator, regulator_full_name,
          country_code, country_name, firm_individual, firm_category,
          amount, currency, amount_eur, amount_gbp,
          date_issued, year_issued, month_issued,
          breach_type, breach_categories, summary,
          final_notice_url, source_url, raw_payload,
          scraped_at
        ) VALUES (
          ${record.contentHash},
          ${record.regulator},
          ${record.regulatorFullName},
          ${record.countryCode},
          ${record.countryName},
          ${record.firmIndividual},
          ${record.firmCategory},
          ${record.amount},
          ${record.currency},
          ${record.amountEur},
          ${record.amountGbp},
          ${record.dateIssued},
          ${record.yearIssued},
          ${record.monthIssued},
          ${record.breachType},
          ${sql.json(record.breachCategories)},
          ${record.summary},
          ${record.finalNoticeUrl},
          ${record.sourceUrl},
          ${record.rawPayload},
          NOW()
        )
        ON CONFLICT (content_hash) DO UPDATE SET
          firm_individual = EXCLUDED.firm_individual,
          summary = EXCLUDED.summary,
          final_notice_url = EXCLUDED.final_notice_url,
          source_url = EXCLUDED.source_url,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;

      if (result[0].inserted) {
        inserted++;
        console.log(`   ✅ Inserted: ${record.firmIndividual} (€${(record.amount || 0).toLocaleString()})`);
      } else {
        updated++;
        console.log(`   🔄 Updated: ${record.firmIndividual}`);
      }
    } catch (error) {
      errors++;
      console.error(`   ❌ Error inserting ${record.firmIndividual}:`, error);
    }
  }

  console.log(`\n📊 Insert summary:`);
  console.log(`   - Inserted: ${inserted}`);
  console.log(`   - Updated: ${updated}`);
  console.log(`   - Errors: ${errors}`);
}

main();
