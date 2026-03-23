/**
 * CBI (Central Bank of Ireland) Scraper
 *
 * Strategy: Parse the published appData array from the enforcement actions page
 * URL: https://www.centralbank.ie/news-media/legal-notices/enforcement-actions
 *
 * Difficulty: 5-6/10 (Moderate) - Large in-page JavaScript dataset with PDFs
 * Expected: 100+ enforcement actions
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import postgres from 'postgres';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { runInNewContext } from 'node:vm';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

const CBI_CONFIG = {
  baseUrl: 'https://www.centralbank.ie',
  enforcementUrl: '/news-media/legal-notices/enforcement-actions',
  rateLimit: 1000,
  maxRetries: 3,
  maxRecords: 500,
};

interface CBIRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇮🇪 Central Bank of Ireland Enforcement Actions Scraper\n');
  console.log('Target: Central Bank of Ireland');
  console.log('Method: In-page appData extraction\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) {
    console.log('⚠️  Using test data (--test-data flag detected)\n');
  }
  if (dryRun) {
    console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');
  }

  try {
    const records = useTestData ? getTestData() : await scrapeCbiPage();

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

    const totalCbi = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'CBI'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - CBI enforcement actions: ${totalCbi[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ CBI scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ CBI scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): CBIRecord[] {
  return [
    {
      firm: 'Coinbase Europe Limited',
      amount: 3398975,
      currency: 'EUR',
      date: '2025-11-06',
      breach: 'Settlement notice',
      link: 'https://www.centralbank.ie/docs/default-source/news-and-media/legal-notices/settlement-agreements/settlement-notice-coinbase-europe-limited-(sanctions-confirmed-by-the-high-court).pdf',
      summary: 'Settlement Notice - Coinbase Europe Limited (Sanctions confirmed by the High Court)',
    },
    {
      firm: 'Cantor Fitzgerald Ireland Limited',
      amount: null,
      currency: 'EUR',
      date: '2025-02-27',
      breach: 'Enforcement action',
      link: 'https://www.centralbank.ie/docs/default-source/news-and-media/legal-notices/settlement-agreements/public-statement-enforcement-action-between-central-bank-of-ireland-and-cantor-fitzgerald-ireland-limited.pdf',
      summary: 'Public statement relating to Enforcement Action between Central Bank of Ireland and Cantor Fitzgerald Ireland Limited',
    },
  ];
}

async function scrapeCbiPage(): Promise<CBIRecord[]> {
  const url = CBI_CONFIG.baseUrl + CBI_CONFIG.enforcementUrl;

  console.log('📄 Fetching CBI enforcement page...');
  console.log(`   URL: ${url}`);

  await new Promise((resolve) => setTimeout(resolve, CBI_CONFIG.rateLimit));

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RegulatoryScanner/2.0)',
      'Accept': 'text/html',
      'Accept-Language': 'en-GB,en;q=0.5',
    },
    timeout: 30000,
  });

  console.log('✅ Page fetched successfully');

  const data = extractPublishedAppData(response.data);
  console.log(`   Found ${data.length} enforcement actions in page data`);

  const records = data
    .slice(0, CBI_CONFIG.maxRecords)
    .map((item) => normalizeCbiRecord(item))
    .filter((record): record is CBIRecord => Boolean(record));

  if (records.length === 0) {
    throw new Error('No CBI enforcement actions were extracted from the live page.');
  }

  return records;
}

function extractPublishedAppData(html: string) {
  const match = html.match(/var\s+appData\s*=\s*(\[[\s\S]*?\]);/);
  if (!match?.[1]) {
    throw new Error('Unable to locate appData on the CBI enforcement page.');
  }

  const data = runInNewContext(match[1], {
    decodeTitle: decodeHtmlEntities,
  });

  if (!Array.isArray(data)) {
    throw new Error('CBI appData did not evaluate to an array.');
  }

  return data as Array<Record<string, unknown>>;
}

function normalizeCbiRecord(item: Record<string, unknown>): CBIRecord | null {
  const documentName = String(item.documentName || item.name || item.title || '').trim();
  const date = String(item.date || item.publicationDate || '').trim();
  const url = typeof item.url === 'string' ? item.url : typeof item.link === 'string' ? item.link : null;

  if (!documentName || !date || !url) {
    return null;
  }

  if (/summary of actions under part iiic/i.test(documentName)) {
    return null;
  }

  const firm = extractFirmName(documentName);
  if (!firm) {
    return null;
  }

  return {
    firm,
    amount: null,
    currency: 'EUR',
    date: parseIrishDate(date),
    breach: classifyCbiNotice(documentName),
    link: normalizeCbiLink(url),
    summary: documentName,
  };
}

function decodeHtmlEntities(value: string) {
  const $ = cheerio.load('<div></div>');
  return $('<div>').html(value).text();
}

function normalizeCbiLink(link: string) {
  return link.startsWith('http') ? link : new URL(link, CBI_CONFIG.baseUrl).toString();
}

function extractFirmName(title: string): string | null {
  const matches = [
    title.match(/Settlement (?:Notice|Agreement)\s*-\s*([^(]+)/i),
    title.match(/Public statement relating to (?:Settlement Agreement between the Central Bank of Ireland and|Settlement Agreement between the Financial Regulator and)\s+(.+?)(?:\s*\(|$)/i),
    title.match(/Public statement relating to Enforcement Action between Central Bank of Ireland and\s+(.+?)(?:\s*\(|$)/i),
    title.match(/Public statement relating to Enforcement Action against\s+(.+?)(?:\s*\(|$)/i),
    title.match(/^([A-Z][^-]+?)\s*-\s*Settlement/i),
  ];

  for (const match of matches) {
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function classifyCbiNotice(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('settlement notice')) {
    return 'Settlement notice';
  }
  if (lower.includes('settlement agreement')) {
    return 'Settlement agreement';
  }
  if (lower.includes('enforcement action')) {
    return 'Enforcement action';
  }
  return 'Regulatory notice';
}

function parseIrishDate(dateStr: string): string {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }

  return new Date().toISOString().split('T')[0];
}

function transformRecord(record: CBIRecord) {
  const dateIssued = new Date(record.date);
  const yearIssued = dateIssued.getFullYear();
  const monthIssued = dateIssued.getMonth() + 1;

  const amountEur = record.amount;
  const amountGbp = amountEur ? Math.round(amountEur * 0.85 * 100) / 100 : null;

  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      regulator: 'CBI',
      firm: record.firm,
      date: record.date,
      link: record.link,
    }))
    .digest('hex');

  const breachCategories = categorizeBreachType(record.breach);

  return {
    contentHash,
    regulator: 'CBI',
    regulatorFullName: 'Central Bank of Ireland',
    countryCode: 'IE',
    countryName: 'Ireland',
    firmIndividual: record.firm,
    firmCategory: determineFirmCategory(record.firm),
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
    sourceUrl: CBI_CONFIG.baseUrl + CBI_CONFIG.enforcementUrl,
    rawPayload: JSON.stringify(record),
  };
}

function determineFirmCategory(firmName: string): string {
  const lower = firmName.toLowerCase();

  if (lower.includes('bank') || lower.includes('ulster') || lower.includes('aib')) {
    return 'Bank';
  }
  if (lower.includes('revolut') || lower.includes('coinbase') || lower.includes('paypal') || lower.includes('payment')) {
    return 'Fintech/Payment Services';
  }
  if (lower.includes('insurance') || lower.includes('assurance')) {
    return 'Insurance Company';
  }
  if (lower.includes('davy') || lower.includes('broker')) {
    return 'Investment Firm';
  }
  if (lower.includes('credit union')) {
    return 'Credit Union';
  }

  return 'Financial Institution';
}

function extractBreachType(description: string): string {
  const lower = description.toLowerCase();

  if (lower.includes('settlement notice')) {
    return 'Settlement Notice';
  }
  if (lower.includes('settlement agreement')) {
    return 'Settlement Agreement';
  }
  if (lower.includes('enforcement action')) {
    return 'Enforcement Action';
  }
  return 'Regulatory Breach';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  if (lower.includes('settlement notice')) {
    categories.push('SETTLEMENT_NOTICE');
  }
  if (lower.includes('settlement agreement')) {
    categories.push('SETTLEMENT_AGREEMENT');
  }
  if (lower.includes('enforcement action')) {
    categories.push('ENFORCEMENT_ACTION');
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
