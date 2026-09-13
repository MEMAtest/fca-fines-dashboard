/**
 * DNB (De Nederlandsche Bank - Dutch Central Bank) Scraper
 *
 * Strategy: official English sitemap discovery plus enforcement-page parsing.
 * The legacy RSS endpoint is Akamai-blocked for unattended clients, while the
 * official sitemap and linked enforcement pages remain publicly retrievable.
 *
 * Run: npx tsx scripts/scraper/scrapeDnb.ts
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { load } from 'cheerio';
import { fileURLToPath } from 'node:url';
import { extractNameFromBodyText } from './lib/bodyTextExtractor.js';
import { validateExtractedName } from './lib/nameValidation.js';
import {
  buildEuFineRecord,
  parseScaledAmount,
  type DbReadyRecord,
} from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

const DNB_CONFIG = {
  baseUrl: 'https://www.dnb.nl',
  sitemapUrl: 'https://www.dnb.nl/en/sitemap.xml',
  rateLimit: 1000,  // 1 second between requests
};

interface DNBRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  await runScraper({
    name: '🇳🇱 DNB Enforcement Actions Scraper',
    regulatorCode: 'DNB',
    liveLoader: loadDnbLiveRecords,
    testLoader: async () => getTestData().map(transformRecord),
    // The RSS endpoint is known to return a deterministic Akamai 403 from
    // unattended runners. Do not spend another minute retrying that same
    // blocked source; quarantine the run and preserve the stored archive.
    retryOnTransientFailure: false,
  });
}

function getTestData(): DNBRecord[] {
  // Test data based on known DNB enforcement actions
  return [
    {
      firm: 'ABN AMRO Bank N.V.',
      amount: 480000000,
      currency: 'EUR',
      date: '2024-04-19',
      breach: 'Serious shortcomings in compliance with anti-money laundering obligations',
      link: 'https://www.dnb.nl/en/news/news-2024/dnb-imposes-fine-on-abn-amro/',
      summary: 'Major AML compliance failures'
    },
    {
      firm: 'ING Bank N.V.',
      amount: 52500000,
      currency: 'EUR',
      date: '2023-09-14',
      breach: 'Inadequate prudential requirements and governance',
      link: 'https://www.dnb.nl/en/news/news-2023/dnb-fines-ing-bank/',
      summary: 'Prudential and governance failures'
    },
    {
      firm: 'Rabobank',
      amount: 15000000,
      currency: 'EUR',
      date: '2023-03-22',
      breach: 'CDD and transaction monitoring deficiencies',
      link: 'https://www.dnb.nl/en/news/news-2023/dnb-sanctions-rabobank/',
      summary: 'Customer due diligence failures'
    }
  ];
}

export async function scrapeDnbPage(): Promise<DNBRecord[]> {
  console.log('📡 Fetching DNB English sitemap...');
  console.log(`   URL: ${DNB_CONFIG.sitemapUrl}`);

  const response = await fetch(DNB_CONFIG.sitemapUrl);
  if (!response.ok) {
    throw new Error(`DNB sitemap request failed with status ${response.status}`);
  }
  const xmlText = await response.text();
  if (!xmlText.trim()) {
    throw new Error('DNB sitemap response was empty');
  }

  // DNB's sitemap mixes absolute and relative locations. Parsing each URL
  // block directly avoids namespace/case differences between XML parsers.
  const items = Array.from(xmlText.matchAll(/<url>([\s\S]*?)<\/url>/gi))
    .map(([, block]) => ({
      title: [''],
      link: [new URL(block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]?.trim() || '', DNB_CONFIG.baseUrl).href],
      pubDate: [block.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim() || ''],
    }))
    .filter((item: { link: string[] }) => item.link[0].includes('/en/general-news/enforcement-measures-'));

  if (items.length === 0) {
    throw new Error('DNB sitemap contained no English enforcement-measure pages');
  }
  console.log(`✅ Discovered ${items.length} enforcement pages from the official sitemap`);

  // Filter for enforcement-related items
  const enforcementKeywords = [
    'fine', 'fines', 'fined', 'boete', 'boetes',
    'penalty', 'penalties',
    'sanction', 'sanctions', 'sanctioned', 'sanctie',
    'enforcement', 'handhaving',
    'maatregel',  // Dutch: enforcement measure (removed English "measure" - too broad)
    'breach', 'violation', 'overtreding'
  ];

  const records: DNBRecord[] = [];

  for (const item of items) {
    const title = item.title?.[0] || '';
    const link = item.link?.[0] || '';
    const sitemapDate = new Date(item.pubDate?.[0] || '');
    if (!link) continue;

    const titleLower = title.toLowerCase();
    const linkLower = link.toLowerCase();

    // Filter by keywords OR URL pattern (enforcement-measures-YYYY)
    const isEnforcement = enforcementKeywords.some(kw => titleLower.includes(kw)) ||
                          linkLower.includes('/enforcement-measures-');

    if (!isEnforcement) continue;

    console.log(`\n📄 Processing: ${title}`);

    // Fetch detail page
    await new Promise(resolve => setTimeout(resolve, DNB_CONFIG.rateLimit));

    try {
      const detailResponse = await fetch(link);
      if (!detailResponse.ok) {
        throw new Error(`DNB detail request failed with status ${detailResponse.status}`);
      }
      const html = await detailResponse.text();

      const structuredTitle = html.match(/"headline"\s*:\s*"([^"]+)"/i)?.[1]
        ?.replace(/\\u([0-9a-f]{4})/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
      const pageTitle = structuredTitle || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        || title;
      const publishedValue = html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1];
      const publishedDate = new Date(publishedValue || '');
      const recordDate = Number.isNaN(publishedDate.getTime()) ? sitemapDate : publishedDate;
      if (Number.isNaN(recordDate.getTime())) {
        throw new Error('DNB detail page did not expose a valid publication date');
      }

      // Extract metadata
      const metaDescMatch = html.match(/<meta name="description" content="([^"]+)"/i);
      const description = metaDescMatch ? metaDescMatch[1] : '';

      // PHASE 3 FIX: Extract firm name with body text fallback
      const firm = extractFirmName(pageTitle, html);

      // Log when firm name extraction fails for manual review
      if (firm === 'Unknown') {
        console.warn(`   ⚠️  Unknown firm: "${title.substring(0, 60)}..." - ${link}`);
      }

      // Extract fine amount
      const amount = extractFineAmount(pageTitle, html);

      // Extract breach type
      const breach = classifyBreachType(pageTitle, html);

      records.push({
        firm,
        amount,
        currency: 'EUR',
        date: recordDate.toISOString().split('T')[0],
        breach,
        link,
        summary: description || pageTitle
      });

      console.log(`   👤 Firm: ${firm}`);
      console.log(`   💰 Amount: ${amount ? `€${amount.toLocaleString()}` : 'Not specified'}`);
      console.log(`   ⚖️  Breach: ${breach}`);
    } catch (error) {
      // A partially parsed feed is not safe to promote: the runner must
      // quarantine the whole batch and leave the previously stored archive
      // untouched when any official detail page cannot be retrieved.
      throw new Error(
        `DNB detail page failed for ${link}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`\n🎯 Filtered to ${records.length} enforcement-related items`);
  return records;
}

export function extractFirmName(title: string, html?: string): string {
  const titlePatterns = [
    /^(?:administrative\s+)?fine(?:s\s+totalling[^\s]+)?(?:\s+imposed)?\s+on\s+(.+?)(?:\s+for\b|$)/i,
    /^fines?.*?\s+imposed on\s+(.+?)(?:\s+for\b|$)/i,
    /^fine\s+for\s+(?:trust office\s+)?(.+?)(?:\s+for\b|$)/i,
    /^order subject to penalty(?:\s+imposed)?\s+on\s+(.+?)(?:\s+for\b|$)/i,
    /^instruction\s+for\s+(.+?)(?:\s+for\b|$)/i,
    /^DNB imposes instruction on\s+(.+?)(?:\s+for\b|$)/i,
    /^(.+?)(?:[’']s)? licences? withdrawn\b/i,
    /^DNB issued an instruction to\s+(.+?)(?:\s+in\b|\s+for\b|$)/i,
    /^ban on value transfer for pension fund\s+(.+?)(?:\s+due\b|$)/i,
  ];
  for (const pattern of titlePatterns) {
    const candidate = validateExtractedName(title.match(pattern)?.[1]?.trim() || '');
    if (candidate) return candidate;
  }

  // Pattern 2: Company names (B.V., N.V., etc.)
  const pattern2 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:B\.V\.|N\.V\.|Bank|Group))/;
  const match2 = title.match(pattern2);
  if (match2) {
    const candidate = validateExtractedName(match2[1].trim());
    if (candidate) return candidate;
  }

  // Pattern 3: "[Firm] fined"
  const pattern3 = /^([A-Z][^\s]+(?:\s+[A-Z][^\s]+)*)\s+fined/i;
  const match3 = title.match(pattern3);
  if (match3) {
    const candidate = validateExtractedName(match3[1].trim());
    if (candidate) return candidate;
  }

  // PHASE 3 FIX: Try body text extraction if HTML provided
  if (html) {
    const bodyExtraction = extractNameFromBodyText(html, 'nl');
    if (bodyExtraction) {
      return bodyExtraction;
    }
  }

  // PHASE 3 FIX: Return 'Unknown' instead of title fallback
  return 'Unknown';
}

function extractBodyText(html: string): string {
  const $ = load(html);
  $('script, style, nav, footer').remove();
  const scoped = $('#rs-content').first().text()
    || $('.main-grid-layout__content').first().text()
    || $('main').first().text()
    || $.root().text();
  return scoped.replace(/\s+/g, ' ').trim().substring(0, 20_000);
}

export function extractFineAmount(title: string, html: string): number | null {
  const bodyText = extractBodyText(html);
  const text = `${title} ${bodyText}`;

  // Patterns: €10,125 or €2.6 million (Dutch/English formats)
  // Capture scale word in group 2 for more precise multiplier logic
  const patterns = [
    /€\s*([\d,\.]+)\s*(million|miljoen|mln)?/i,
    /EUR\s*([\d,\.]+)\s*(million|miljoen|mln)?/i,
    /([\d,\.]+)\s*euro/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseScaledAmount(match[1], match[2]);
    }
  }

  return null;
}

function classifyBreachType(title: string, html: string): string {
  const bodyText = extractBodyText(html);
  const text = `${title} ${bodyText}`.toLowerCase();

  if (text.includes('aml') || text.includes('wwft') || text.includes('money laundering') || text.includes('witwassen')) return 'AML_CTF';
  if (text.includes('capital') || text.includes('kapitaal')) return 'CAPITAL_REQUIREMENTS';
  if (text.includes('liquidity') || text.includes('liquiditeit')) return 'LIQUIDITY';
  if (text.includes('governance') || text.includes('bestuur')) return 'GOVERNANCE';
  if (text.includes('prudential') || text.includes('prudentieel')) return 'PRUDENTIAL';
  if (text.includes('risk management') || text.includes('risicobeheer')) return 'RISK_MANAGEMENT';
  if (text.includes('reporting') || text.includes('rapportage')) return 'REPORTING';
  if (text.includes('cdd') || text.includes('customer due diligence')) return 'CDD';

  return 'OTHER';
}

export function transformRecord(record: DNBRecord): DbReadyRecord {
  const transformed = buildEuFineRecord({
    regulator: 'DNB',
    regulatorFullName: 'De Nederlandsche Bank',
    countryCode: 'NL',
    countryName: 'Netherlands',
    firmIndividual: record.firm,
    firmCategory: 'Bank',
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined by DNB for ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: record.link || DNB_CONFIG.baseUrl,
    rawPayload: record,
  });
  // DNB has corrected amounts and titles after publication. Keep identity tied
  // to the canonical official notice URL so those corrections update one row
  // instead of creating duplicates when parsed fields change.
  const canonicalPath = new URL(record.link || DNB_CONFIG.baseUrl).pathname.replace(/\/+$/, '');
  return {
    ...transformed,
    contentHash: crypto.createHash('sha256').update(`DNB|${canonicalPath}`).digest('hex'),
  };
}

export async function loadDnbLiveRecords(): Promise<DbReadyRecord[]> {
  return (await scrapeDnbPage()).map(transformRecord);
}

function extractBreachType(description: string): string {
  const lower = description.toLowerCase();

  // Dutch banking supervision breach type mapping
  if (lower.includes('aml') || lower.includes('wwft') || lower.includes('anti-money laundering') || lower.includes('cdd')) {
    return 'Anti-Money Laundering Violations';
  }
  if (lower.includes('prudential') || lower.includes('capital requirements') || lower.includes('liquidity')) {
    return 'Prudential Requirements';
  }
  if (lower.includes('governance') || lower.includes('fit and proper') || lower.includes('management')) {
    return 'Governance Failures';
  }
  if (lower.includes('transaction monitoring')) {
    return 'Transaction Monitoring Failures';
  }
  if (lower.includes('customer due diligence') || lower.includes('cdd')) {
    return 'Customer Due Diligence';
  }
  if (lower.includes('reporting') || lower.includes('disclosure')) {
    return 'Reporting/Disclosure Failures';
  }
  if (lower.includes('risk management')) {
    return 'Risk Management Deficiencies';
  }

  return 'Banking Supervision Breach';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  // Dutch to English category mapping (banking focus)
  if (lower.includes('aml') || lower.includes('wwft') || lower.includes('anti-money laundering')) {
    categories.push('AML');
  }
  if (lower.includes('cdd') || lower.includes('customer due diligence')) {
    categories.push('CDD');
  }
  if (lower.includes('transaction monitoring')) {
    categories.push('TRANSACTION_MONITORING');
  }
  if (lower.includes('prudential') || lower.includes('capital')) {
    categories.push('PRUDENTIAL');
  }
  if (lower.includes('governance') || lower.includes('fit and proper')) {
    categories.push('GOVERNANCE');
  }
  if (lower.includes('risk management')) {
    categories.push('RISK_MANAGEMENT');
  }
  if (lower.includes('reporting') || lower.includes('disclosure')) {
    categories.push('REPORTING');
  }
  if (lower.includes('liquidity')) {
    categories.push('LIQUIDITY');
  }
  if (lower.includes('compliance')) {
    categories.push('COMPLIANCE');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ DNB scraper failed:', error);
    process.exit(1);
  });
}
