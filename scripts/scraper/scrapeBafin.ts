/**
 * BaFin (Federal Financial Supervisory Authority) Scraper
 *
 * Strategy: Crawl the live paginated non-anonymised sanctions table and enrich
 * each linked case page with metadata and narrative detail.
 * URL: https://www.bafin.de/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html
 *
 * Difficulty: 5-6/10 (Moderate) - Paginated HTML tables with linked detail pages
 * Expected: 150-250 enforcement actions
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import postgres from 'postgres';
import crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

const BAFIN_CONFIG = {
  baseUrl: 'https://www.bafin.de',
  enforcementUrl: '/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html',
  nonAnonymizedListId: '19584194',
  anonymizedListId: '19584192',
  rateLimit: 1000,
  detailRateLimit: 800,
  maxRetries: 3,
  maxPages: 30,
  maxRecords: 400,
};

interface BaFinRow {
  date: string;
  title: string;
  link: string;
  listingUrl: string;
}

interface BaFinRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string;
  summary: string;
  listingUrl: string;
}

async function main() {
  console.log('🇩🇪 BaFin Enforcement Actions Scraper\n');
  console.log('Target: Federal Financial Supervisory Authority (Germany)');
  console.log('Method: Paginated sanctions table + case page enrichment\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) {
    console.log('⚠️  Using test data (--test-data flag detected)\n');
  }
  if (dryRun) {
    console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');
  }

  try {
    const records = useTestData ? getTestData() : await scrapeBaFinPage();

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

    const totalBafin = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'BaFin'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - BaFin enforcement actions: ${totalBafin[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ BaFin scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ BaFin scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): BaFinRecord[] {
  return [
    {
      firm: 'aap Implantate AG',
      amount: 158000,
      currency: 'EUR',
      date: '2026-03-23',
      breach: 'BaFin imposes administrative fine for Securities Trading Act disclosure failures.',
      link: 'https://www.bafin.de/SharedDocs/Veroeffentlichungen/EN/Massnahmen/40c_neu_124_WpHG/meldung_2026_03_18_aap_Implantate_AG_en.html',
      summary: 'On 3 March 2026, BaFin imposed an administrative fine amounting to 158,000 euros on aap Implantate AG.',
      listingUrl: BAFIN_CONFIG.baseUrl + BAFIN_CONFIG.enforcementUrl,
    },
    {
      firm: 'ROY Asset Holding SE',
      amount: null,
      currency: 'EUR',
      date: '2025-07-08',
      breach: 'BaFin imposes administrative fine.',
      link: 'https://www.bafin.de/SharedDocs/Veroeffentlichungen/EN/Massnahmen/40c_neu_124_WpHG/meldung_2025_07_08_ROY_Asset_Holding_SE_en.html',
      summary: 'BaFin imposed an administrative fine on ROY Asset Holding SE.',
      listingUrl: BAFIN_CONFIG.baseUrl + BAFIN_CONFIG.enforcementUrl,
    },
  ];
}

async function scrapeBaFinPage(): Promise<BaFinRecord[]> {
  const queue = [normalizeBaFinPageUrl(BAFIN_CONFIG.baseUrl + BAFIN_CONFIG.enforcementUrl)];
  const seenPages = new Set<string>();
  const seenRecords = new Set<string>();
  const records: BaFinRecord[] = [];

  while (queue.length > 0 && seenPages.size < BAFIN_CONFIG.maxPages && records.length < BAFIN_CONFIG.maxRecords) {
    const pageUrl = queue.shift();
    if (!pageUrl || seenPages.has(pageUrl)) {
      continue;
    }

    if (seenPages.size > 0) {
      await sleep(BAFIN_CONFIG.rateLimit);
    }

    console.log(`📄 Fetching BaFin table page ${seenPages.size + 1}: ${pageUrl}`);

    const html = await fetchTextWithRetry(pageUrl);
    const $ = cheerio.load(html);

    seenPages.add(pageUrl);

    const rows = extractBaFinRows($, pageUrl);
    console.log(`   Found ${rows.length} non-anonymised rows`);

    for (const row of rows) {
      const key = `${row.link}|${row.date}`;
      if (seenRecords.has(key)) {
        continue;
      }
      seenRecords.add(key);

      if (records.length >= BAFIN_CONFIG.maxRecords) {
        break;
      }

      await sleep(BAFIN_CONFIG.detailRateLimit);

      try {
        const record = await enrichBaFinRow(row);
        if (!record) {
          continue;
        }

        records.push(record);
        console.log(`   ✓ Parsed: ${record.firm} - €${record.amount?.toLocaleString() || 'N/A'}`);
      } catch (error) {
        console.log(`   ✗ Failed to parse ${row.link}`);
      }
    }

    const nextLinks = extractBaFinPageLinks($, pageUrl);
    for (const nextLink of nextLinks) {
      if (!seenPages.has(nextLink) && !queue.includes(nextLink)) {
        queue.push(nextLink);
      }
    }
  }

  if (records.length === 0) {
    throw new Error('No BaFin enforcement rows were extracted from the live sanctions archive.');
  }

  return records;
}

function extractBaFinRows($: cheerio.CheerioAPI, pageUrl: string): BaFinRow[] {
  const table = getNonAnonymizedTable($);
  const rows: BaFinRow[] = [];

  table.find('tbody tr').each((_, element) => {
    const row = $(element);
    const date = parseDate(normalizeText(row.find('td').eq(0).text()));
    const linkElement = row.find('td').eq(1).find('a').first();
    const title = normalizeText(linkElement.text());
    const link = normalizeBaFinLink(linkElement.attr('href') || null);

    if (!date || !title || !link) {
      return;
    }

    rows.push({
      date,
      title,
      link,
      listingUrl: pageUrl,
    });
  });

  return rows;
}

function getNonAnonymizedTable($: cheerio.CheerioAPI) {
  const anchor = $(`#ID_${BAFIN_CONFIG.nonAnonymizedListId}`).first();

  if (anchor.length > 0) {
    const table = anchor.parent().nextAll('div.wrapperTable').first().find('table.textualData.links').first();
    if (table.length > 0) {
      return table;
    }
  }

  return $('div.wrapperTable table.textualData.links').first();
}

function extractBaFinPageLinks($: cheerio.CheerioAPI, pageUrl: string) {
  const anchor = $(`#ID_${BAFIN_CONFIG.nonAnonymizedListId}`).first();
  const nav = anchor.parent().nextAll('div.navIndex').first();

  const links = nav
    .find(`a[href*="${BAFIN_CONFIG.nonAnonymizedListId}_list%253D"]`)
    .map((_, element) => normalizeBaFinPageUrl($(element).attr('href') || pageUrl))
    .get()
    .filter(Boolean);

  return [...new Set(links)];
}

async function enrichBaFinRow(row: BaFinRow): Promise<BaFinRecord | null> {
  const html = await fetchTextWithRetry(row.link);
  const $ = cheerio.load(html);

  const title = normalizeText(
    $('meta[property="og:title"]').attr('content')
    || $('title').first().text().replace(/\s*\|\s*BaFin\s*$/i, '')
    || row.title
  );
  const summary = normalizeText(
    $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
    || extractBaFinBodyText($)
    || row.title
  );
  const canonicalLink = normalizeBaFinLink($('link[rel="canonical"]').attr('href') || row.link);
  const bodyText = extractBaFinBodyText($);
  const firm = extractBaFinFirm(title, summary, row.title);

  if (!firm || /^bafin imposes administrative fine/i.test(firm)) {
    return null;
  }

  return {
    firm,
    amount: extractBaFinAmount([summary, title, bodyText, row.title]),
    currency: 'EUR',
    date: row.date,
    breach: normalizeText(summary || title),
    link: canonicalLink || row.link,
    summary: normalizeText(summary || title),
    listingUrl: row.listingUrl,
  };
}

function extractBaFinBodyText($: cheerio.CheerioAPI) {
  const selectors = [
    '.abstract p',
    '.wrapBodytext > p',
    '.wrapBodytext p',
    '#content p',
  ];

  for (const selector of selectors) {
    const parts = $(selector)
      .map((_, element) => normalizeText($(element).text()))
      .get()
      .filter((part) => part.length > 30);

    if (parts.length > 0) {
      return normalizeText(parts.slice(0, 3).join(' '));
    }
  }

  return '';
}

function extractBaFinFirm(...sources: string[]) {
  const patterns = [
    /^(.+?):\s*BaFin imposes administrative fines?/i,
    /^Publication of financial reports:\s*Federal Office of Justice imposes disciplinary fine on\s+(.+?)$/i,
    /imposed .*? on\s+(.+?)(?:\.\s|,|$)/i,
    /fine amounting to .*? on\s+(.+?)(?:\.\s|,|$)/i,
  ];

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match?.[1]) {
        const cleaned = normalizeFirmName(match[1]);
        if (cleaned) {
          return cleaned;
        }
      }
    }
  }

  return normalizeFirmName(sources[0] || '');
}

function normalizeFirmName(value: string) {
  const cleaned = normalizeText(
    value
      .replace(/^the\s+/i, '')
      .replace(/[.;:,]+$/g, '')
      .replace(/\s+had contravened[\s\S]*$/i, '')
  );

  if (!cleaned || cleaned.length < 3 || cleaned.length > 180) {
    return null;
  }

  return cleaned;
}

function extractBaFinAmount(texts: string[]) {
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

    const wordMatches = text.matchAll(/amounting to\s+([\d.,\s]+)\s*(million|thousand|billion)?\s*euros?/gi);
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

async function fetchTextWithRetry(url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= BAFIN_CONFIG.maxRetries; attempt += 1) {
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
      if (attempt < BAFIN_CONFIG.maxRetries) {
        await sleep(BAFIN_CONFIG.rateLimit * attempt);
      }
    }
  }

  throw lastError;
}

function normalizeBaFinLink(link: string | null) {
  if (!link) {
    return null;
  }

  const trimmed = link.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('javascript:')) {
    return null;
  }

  const absolute = trimmed.startsWith('http') ? trimmed : new URL(trimmed, BAFIN_CONFIG.baseUrl).toString();
  const url = new URL(absolute);
  url.pathname = url.pathname.replace(/;jsessionid=[^/?#]+/i, '');

  return url.toString();
}

function normalizeBaFinPageUrl(url: string) {
  const absolute = normalizeBaFinLink(url);
  if (!absolute) {
    return BAFIN_CONFIG.baseUrl + BAFIN_CONFIG.enforcementUrl;
  }

  const parsed = new URL(absolute);
  parsed.hash = `#ID_${BAFIN_CONFIG.nonAnonymizedListId}`;
  return parsed.toString();
}

function parseScaledAmount(amountText: string, scale: string | undefined): number | null {
  const parsed = parseAmount(amountText);
  if (parsed === null) {
    return null;
  }

  const multiplier = scale?.toLowerCase();
  if (multiplier === 'billion') {
    return parsed * 1_000_000_000;
  }
  if (multiplier === 'million') {
    return parsed * 1_000_000;
  }
  if (multiplier === 'thousand') {
    return parsed * 1_000;
  }

  return parsed;
}

function parseAmount(amountText: string): number | null {
  if (!amountText) {
    return null;
  }

  let cleaned = amountText.replace(/[€$£\s]/g, '');

  if (cleaned.includes('.') && cleaned.includes(',')) {
    if (cleaned.lastIndexOf('.') < cleaned.lastIndexOf(',')) {
      cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = /,\d{3}(?:,|$)/.test(cleaned)
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(/,/g, '.');
  } else if (cleaned.includes('.') && /\.\d{3}(?:\.|$)/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  }

  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function parseDate(dateText: string): string | null {
  const match = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);

  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
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

function transformRecord(record: BaFinRecord) {
  const dateIssued = new Date(record.date);
  const yearIssued = dateIssued.getFullYear();
  const monthIssued = dateIssued.getMonth() + 1;
  const amountEur = record.amount;
  const amountGbp = amountEur ? Math.round(amountEur * 0.85 * 100) / 100 : null;

  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      regulator: 'BaFin',
      firm: record.firm,
      date: record.date,
      amount: record.amount,
      link: record.link,
    }))
    .digest('hex');

  const breachCategories = categorizeBreachType(record.breach);

  return {
    contentHash,
    regulator: 'BaFin',
    regulatorFullName: 'Federal Financial Supervisory Authority',
    countryCode: 'DE',
    countryName: 'Germany',
    firmIndividual: record.firm,
    firmCategory: 'Listed Company',
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

  if (lower.includes('market abuse') || lower.includes('mar')) {
    return 'Market Abuse Regulation Violations';
  }
  if (lower.includes('publication of financial reports')) {
    return 'Financial Reporting Publication Failures';
  }
  if (lower.includes('insider')) {
    return 'Insider Dealing';
  }
  if (lower.includes('manipulation')) {
    return 'Market Manipulation';
  }

  return 'Securities Violations';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  if (lower.includes('mar') || lower.includes('market abuse')) {
    categories.push('MARKET_ABUSE');
  }
  if (lower.includes('publication of financial reports') || lower.includes('financial report')) {
    categories.push('DISCLOSURE');
    categories.push('REPORTING');
  }
  if (lower.includes('insider')) {
    categories.push('INSIDER_DEALING');
  }
  if (lower.includes('manipulation')) {
    categories.push('MARKET_MANIPULATION');
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
