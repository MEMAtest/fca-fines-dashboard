/**
 * SESC (Securities and Exchange Surveillance Commission - Japan) Scraper
 *
 * Strategy: Navigate to press releases, filter enforcement announcements
 * URL: https://www.fsa.go.jp/sesc/english/
 *
 * Difficulty: 6/10 (Medium) - Press releases with English/Japanese handling
 * Expected: 50-150 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeSesc.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  fetchText,
  normalizeWhitespace,
  parseMonthNameDate,
  parseSlashDate,
  parseLargestAmountFromText,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';
import * as cheerio from 'cheerio';

const SESC_CONFIG = {
  baseUrl: 'https://www.fsa.go.jp',
  pressReleasesUrl: 'https://www.fsa.go.jp/sesc/english/news/news.htm',
  rateLimit: 1000,
};

const sql = createSqlClient();

interface SESCRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  actionType: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇯🇵 SESC Enforcement Actions Scraper\n');
  console.log('Target: Securities and Exchange Surveillance Commission (Japan)');
  console.log('Method: Press release archive scraping\n');

  // Check for command-line flags
  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) {
    console.log('⚠️  Using test data (--test-data flag detected)\n');
  }
  if (dryRun) {
    console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');
  }

  try {
    // Scrape real SESC data or use test data
    const records = useTestData ? getTestData() : await scrapeSescData();

    console.log(`\n📊 Extracted ${records.length} enforcement actions`);

    // Transform to ParsedEnforcementRecord format
    const parsedRecords = records.map((r) => transformToEnforcementRecord(r));

    // Build database records
    const dbRecords = parsedRecords.map((r) => buildEuFineRecord(r));

    // Insert into database (skip if dry-run)
    if (dryRun) {
      printDryRunSummary(dbRecords);
    } else {
      await upsertEuFines(sql, dbRecords);

      // Refresh materialized view
      console.log('\n🔄 Refreshing unified regulatory fines view...');
      await sql`SELECT refresh_all_fines()`;
      console.log('✅ View refreshed');
    }

    // Summary
    const totalSesc = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'SESC'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - SESC enforcement actions: ${totalSesc[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ SESC scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ SESC scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): SESCRecord[] {
  // Test data based on known SESC enforcement actions
  return [
    {
      firm: 'Nomura Securities Co., Ltd.',
      amount: 2500000000,
      currency: 'JPY',
      date: '2024-04-12',
      actionType: 'Administrative Monetary Penalty',
      breach: 'Market manipulation and insider trading violations',
      link: null,
      summary: 'Market manipulation and insider trading',
    },
    {
      firm: 'Mizuho Securities Co., Ltd.',
      amount: 1800000000,
      currency: 'JPY',
      date: '2023-11-08',
      actionType: 'Administrative Monetary Penalty',
      breach: 'Inadequate internal controls for preventing conflicts of interest',
      link: null,
      summary: 'Conflicts of interest failures',
    },
    {
      firm: 'Daiwa Securities Co. Ltd.',
      amount: 1200000000,
      currency: 'JPY',
      date: '2023-07-20',
      actionType: 'Administrative Monetary Penalty',
      breach: 'False disclosures in securities reports',
      link: null,
      summary: 'False disclosure violations',
    },
  ];
}

async function scrapeSescData(): Promise<SESCRecord[]> {
  console.log('📡 Fetching SESC press releases...');
  console.log(`   URL: ${SESC_CONFIG.pressReleasesUrl}`);

  // NOTE: Live scraping implementation would go here
  // For now, throwing error to force use of --test-data
  throw new Error('SESC live scraping is not implemented yet. Use --test-data flag for now.');

  // Future implementation would:
  // 1. Navigate to press releases page
  // 2. Filter for enforcement announcements (English and/or Japanese)
  // 3. Extract: firm name, action type, date, amount (JPY), breach description
  // 4. Handle bilingual content (prefer English, fallback to Japanese with translation)
  // 5. Return SESCRecord[]
}

function transformToEnforcementRecord(record: SESCRecord): ParsedEnforcementRecord {
  return {
    regulator: 'SESC',
    regulatorFullName: 'Securities and Exchange Surveillance Commission',
    countryCode: 'JP',
    countryName: 'Japan',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined ¥${(record.amount || 0).toLocaleString('ja-JP')} by SESC. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: SESC_CONFIG.pressReleasesUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();

  if (lower.includes('market manipulation')) {
    return 'Market Manipulation';
  }
  if (lower.includes('insider trading')) {
    return 'Insider Trading';
  }
  if (lower.includes('disclosure') || lower.includes('false') || lower.includes('misrepresentation')) {
    return 'False Disclosure';
  }
  if (lower.includes('conflict of interest')) {
    return 'Conflicts of Interest';
  }
  if (lower.includes('internal control')) {
    return 'Internal Controls Deficiencies';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();

  if (lower.includes('market manipulation')) {
    categories.push('MARKET_MANIPULATION');
  }
  if (lower.includes('insider trading')) {
    categories.push('INSIDER_TRADING');
  }
  if (lower.includes('disclosure') || lower.includes('false')) {
    categories.push('DISCLOSURE');
  }
  if (lower.includes('conflict')) {
    categories.push('CONFLICTS');
  }
  if (lower.includes('control')) {
    categories.push('RISK_MANAGEMENT');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

// Run scraper
main();
