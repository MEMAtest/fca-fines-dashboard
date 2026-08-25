/**
 * AFM (Netherlands Authority for the Financial Markets) Scraper
 *
 * Strategy: RSS feed parsing with enforcement keyword filtering
 * URL: https://www.afm.nl/en/rss-feed/nieuws-professionals
 *
 * Run: npx tsx scripts/scraper/scrapeAfm.ts
 */

import 'dotenv/config';
import { parseStringPromise } from 'xml2js';
import { extractNameFromBodyText } from './lib/bodyTextExtractor.js';
import { validateExtractedName } from './lib/nameValidation.js';
import { buildEuFineRecord, type DbReadyRecord } from './lib/euFineHelpers.js';
import { runScraper } from './lib/runScraper.js';

const AFM_CONFIG = {
  baseUrl: 'https://www.afm.nl',
  rssUrl: 'https://www.afm.nl/en/rss-feed/nieuws-professionals',
  rateLimit: 1000,  // 1 second between requests
};

interface AFMRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇳🇱 AFM Enforcement Actions Scraper\n');
  console.log('Target: Netherlands Authority for the Financial Markets');
  console.log('Method: Decision page scraping\n');

  await runScraper({
    name: '🇳🇱 AFM Enforcement Actions Scraper',
    regulatorCode: 'AFM',
    liveLoader: loadAfmLiveRecords,
    testLoader: async () => getTestData().map(transformRecord),
  });
}

export async function loadAfmLiveRecords(): Promise<DbReadyRecord[]> {
  const records = await scrapeAfmPage();
  return records.map(transformRecord);
}

function getTestData(): AFMRecord[] {
  // Test data based on known AFM enforcement actions
  return [
    {
      firm: 'ABN AMRO Bank N.V.',
      amount: 300000,
      currency: 'EUR',
      date: '2024-09-12',
      breach: 'Failure to comply with transaction monitoring requirements',
      link: 'https://www.afm.nl/en/nieuws/2024/sep/afm-fines-abn-amro-bank',
      summary: 'Inadequate AML transaction monitoring'
    },
    {
      firm: 'ING Bank N.V.',
      amount: 775000,
      currency: 'EUR',
      date: '2024-03-20',
      breach: 'MiFID II conduct of business violations',
      link: 'https://www.afm.nl/en/nieuws/2024/mar/afm-sanctions-ing-bank',
      summary: 'MiFID II compliance failures'
    },
    {
      firm: 'DEGIRO B.V.',
      amount: 400000,
      currency: 'EUR',
      date: '2023-11-08',
      breach: 'Client money protection breaches',
      link: 'https://www.afm.nl/en/nieuws/2023/nov/afm-fines-degiro',
      summary: 'Failure to protect client assets'
    },
    {
      firm: 'Rabobank',
      amount: 250000,
      currency: 'EUR',
      date: '2023-07-15',
      breach: 'Prospectus disclosure failures',
      link: 'https://www.afm.nl/en/nieuws/2023/jul/afm-sanctions-rabobank',
      summary: 'Inadequate prospectus disclosures'
    }
  ];
}

async function scrapeAfmPage(): Promise<AFMRecord[]> {
  console.log('📡 Fetching AFM RSS feed...');
  console.log(`   URL: ${AFM_CONFIG.rssUrl}`);

  const response = await fetch(AFM_CONFIG.rssUrl);
  const xmlText = await response.text();

  const parsed = await parseStringPromise(xmlText);
  const items = parsed.rss.channel[0].item || [];

  console.log(`✅ Fetched ${items.length} items from RSS feed`);

  // Filter for enforcement-related items
  const enforcementKeywords = [
    'fine', 'fines', 'fined', 'penalty', 'penalties',
    'sanction', 'sanctions', 'sanctioned',
    'ban', 'banned', 'bans',
    'enforcement', 'measure', 'disciplinary',
    'breach', 'violation', 'boete', 'boetes'
  ];

  const records: AFMRecord[] = [];

  for (const item of items) {
    const title = item.title?.[0] || '';
    const link = item.link?.[0] || '';
    const pubDateStr = item.pubDate?.[0] || '';
    const pubDate = new Date(pubDateStr);

    const titleLower = title.toLowerCase();
    const isEnforcement = enforcementKeywords.some(kw => titleLower.includes(kw));

    if (!isEnforcement) continue;

    console.log(`\n📄 Processing: ${title}`);

    // Fetch detail page
    await new Promise(resolve => setTimeout(resolve, AFM_CONFIG.rateLimit));

    try {
      const detailResponse = await fetch(link);
      const html = await detailResponse.text();

      // Extract metadata
      const metaDescMatch = html.match(/<meta name="description" content="([^"]+)"/i);
      const description = metaDescMatch ? metaDescMatch[1] : '';

      // PHASE 3 FIX: Extract firm name with body text fallback
      const firm = extractFirmName(title, html);

      // Extract fine amount
      const amount = extractFineAmount(title, html);

      // Extract breach type
      const breach = classifyBreachType(title, html);

      records.push({
        firm,
        amount,
        currency: 'EUR',
        date: pubDate.toISOString().split('T')[0],
        breach,
        link,
        summary: description || title
      });

      console.log(`   👤 Firm: ${firm}`);
      console.log(`   💰 Amount: ${amount ? `€${amount.toLocaleString()}` : 'Not specified'}`);
      console.log(`   ⚖️  Breach: ${breach}`);
    } catch (error) {
      console.error(`   ⚠️  Failed to fetch ${link}:`, error);
    }
  }

  console.log(`\n🎯 Filtered to ${records.length} enforcement-related items`);
  return records;
}

export function isLikelyAfmEntityName(value: string) {
  const normalized = value.trim();
  if (!normalized || /^(?:afm|instruction|decision|notice|warning|measure)\b/i.test(normalized)) return false;
  if (/\b(?:issued to|for breach|for failure|for violating|sanction(?:ed)?|fined|boete|boetes|enforcement action)\b/i.test(normalized)) return false;
  return validateAfmCandidate(normalized) !== null;
}

function validateAfmCandidate(value: string) {
  const normalized = value.trim();
  const candidate = validateExtractedName(normalized);
  if (candidate) return candidate;

  // The shared validator treats any name ending in "financial services" as
  // generic page furniture. AFM also publishes genuine entities with that
  // suffix, so retain validation for the identifying prefix before accepting
  // this narrowly bounded legal-name form.
  if (/^.+\s+financial services$/i.test(normalized)) {
    const prefix = normalized.replace(/\s+financial services$/i, "").trim();
    if (validateExtractedName(prefix)) return normalized;
  }

  return null;
}

export function extractFirmName(title: string, html?: string): string {
  // Prefer explicit headline grammar over body/fallback extraction. The
  // capture must be non-greedy: a character class such as [^for] rejects any
  // firm containing the letters f, o, or r and broke normal AFM headlines.
  const titlePatterns: RegExp[] = [
    /AFM\s+(?:fines?|sancties|sanctions?)\s+(.+?)\s+(?:for|wegens)\b/i,
    /^(.+?)\s+krijgt\s+(?:een\s+)?boete\s+(?:voor|wegens)\b/i,
    /^Boete\s+van\s+€?\s*[\d.,]+\s+(?:voor|for)\s+(.+?)\s+(?:wegens|for)\b/i,
    /^Instruction\s+issued\s+to\s+(.+?)\s+for\s+(?:breach|failure|violating)\b/i,
    /^(.+?)\s+(?:fined|sanctioned)\b/i,
  ];

  for (const pattern of titlePatterns) {
    const match = title.match(pattern);
    if (!match?.[1]) continue;
    const candidate = validateAfmCandidate(match[1]);
    if (candidate && isLikelyAfmEntityName(candidate)) return candidate;
  }

  // Company names (B.V., N.V., etc.)
  const pattern3 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:B\.V\.|N\.V\.|Ltd\.|Inc\.|AG|GmbH))/;
  const match3 = title.match(pattern3);
  if (match3) {
    const candidate = validateAfmCandidate(match3[1]);
    if (candidate && isLikelyAfmEntityName(candidate)) return candidate;
  }

  // PHASE 3 FIX: Try body text extraction if HTML provided
  if (html) {
    const bodyExtraction = extractNameFromBodyText(html, 'nl');
    if (bodyExtraction && isLikelyAfmEntityName(bodyExtraction)) {
      return bodyExtraction;
    }
  }

  // PHASE 3 FIX: Reduce fallback length from 100 to 60
  // Do not promote a headline or page furniture as the regulated party. An
  // unrecognisable extraction is deliberately blank and will be quarantined by
  // the common ingestion validator with the source payload retained.
  const fallback = validateAfmCandidate(title.slice(0, 60)) || '';
  return fallback && isLikelyAfmEntityName(fallback) ? fallback : '';
}

function extractFineAmount(title: string, html: string): number | null {
  const text = `${title} ${html}`;

  // Patterns: €300,000 or €1.600.000 (Dutch format)
  const patterns = [
    /€\s*([\d,\.]+)\s*(?:million|miljoen|mln)?/i,
    /EUR\s*([\d,\.]+)\s*(?:million|miljoen|mln)?/i,
    /([\d,\.]+)\s*euro/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Handle Dutch number format (periods as thousand separators, commas as decimals)
      let amount = match[1].replace(/\./g, '').replace(/,/g, '.');
      let numAmount = parseFloat(amount);

      // Only multiply by 1M if the number is small (< 1000) AND text contains "million"
      // This prevents double-counting when amounts are already in full euros (e.g., "€300,000")
      if (numAmount < 1000 && (text.toLowerCase().includes('million') || text.toLowerCase().includes('miljoen') || text.toLowerCase().includes('mln'))) {
        numAmount *= 1_000_000;
      }

      return Number.isFinite(numAmount) ? numAmount : null;
    }
  }

  return null;
}

function classifyBreachType(title: string, html: string): string {
  const text = `${title} ${html}`.toLowerCase();

  if (text.includes('advertising') || text.includes('reclame')) return 'ADVERTISING_BREACH';
  if (text.includes('aml') || text.includes('wwft') || text.includes('money laundering')) return 'AML_CTF';
  if (text.includes('exam') || text.includes('fraud')) return 'FRAUD';
  if (text.includes('conduct') || text.includes('gedrag')) return 'CONDUCT';
  if (text.includes('disclosure') || text.includes('reporting')) return 'DISCLOSURE';
  if (text.includes('governance') || text.includes('bestuur')) return 'GOVERNANCE';
  if (text.includes('client') || text.includes('klant')) return 'CLIENT_PROTECTION';
  if (text.includes('license') || text.includes('vergunning')) return 'UNAUTHORIZED_ACTIVITY';

  return 'OTHER';
}

export function transformRecord(record: AFMRecord): DbReadyRecord {
  return buildEuFineRecord({
    regulator: 'AFM',
    regulatorFullName: 'Netherlands Authority for the Financial Markets',
    countryCode: 'NL',
    countryName: 'Netherlands',
    firmIndividual: record.firm,
    firmCategory: determineFirmCategory(record.firm),
    amount: Number.isFinite(record.amount) ? record.amount : null,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined ${record.amount === null ? 'an undisclosed amount' : `€${record.amount.toLocaleString()}`} by AFM for ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: record.link || AFM_CONFIG.rssUrl,
    rawPayload: record,
  });
}

function determineFirmCategory(firmName: string): string {
  const lower = firmName.toLowerCase();

  if (lower.includes('bank') || lower.includes('abn') || lower.includes('ing') || lower.includes('rabobank')) {
    return 'Bank';
  }
  if (lower.includes('degiro') || lower.includes('broker')) {
    return 'Investment Firm';
  }
  if (lower.includes('insurance') || lower.includes('verzekering')) {
    return 'Insurance Company';
  }
  if (lower.includes('fund') || lower.includes('asset management')) {
    return 'Asset Manager';
  }

  return 'Financial Institution';
}

function extractBreachType(description: string): string {
  const lower = description.toLowerCase();

  // Dutch/English breach type mapping
  if (lower.includes('aml') || lower.includes('wwft') || lower.includes('anti-money laundering')) {
    return 'Anti-Money Laundering Violations';
  }
  if (lower.includes('mifid') || lower.includes('conduct of business')) {
    return 'MiFID II Violations';
  }
  if (lower.includes('prospectus') || lower.includes('disclosure')) {
    return 'Prospectus/Disclosure Failures';
  }
  if (lower.includes('client money') || lower.includes('client assets')) {
    return 'Client Asset Protection';
  }
  if (lower.includes('market abuse') || lower.includes('insider')) {
    return 'Market Abuse';
  }
  if (lower.includes('governance') || lower.includes('fit and proper')) {
    return 'Governance Failures';
  }
  if (lower.includes('transaction monitoring')) {
    return 'Transaction Monitoring Failures';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  // Dutch to English category mapping
  if (lower.includes('aml') || lower.includes('wwft') || lower.includes('anti-money laundering')) {
    categories.push('AML');
  }
  if (lower.includes('mifid')) {
    categories.push('MIFID');
  }
  if (lower.includes('prospectus')) {
    categories.push('PROSPECTUS');
  }
  if (lower.includes('disclosure')) {
    categories.push('DISCLOSURE');
  }
  if (lower.includes('client money') || lower.includes('client assets')) {
    categories.push('CLIENT_ASSETS');
  }
  if (lower.includes('market abuse') || lower.includes('insider')) {
    categories.push('MARKET_ABUSE');
  }
  if (lower.includes('governance') || lower.includes('fit and proper')) {
    categories.push('GOVERNANCE');
  }
  if (lower.includes('conduct') || lower.includes('gedrag')) {
    categories.push('CONDUCT');
  }
  if (lower.includes('transaction monitoring')) {
    categories.push('TRANSACTION_MONITORING');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    console.error('❌ AFM scraper failed:', error);
    process.exit(1);
  });
}
