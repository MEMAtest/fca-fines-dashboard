/**
 * FDIC (Federal Deposit Insurance Corporation - USA) Scraper
 *
 * Strategy: Scrape press releases archive with enforcement keyword filtering
 * URL: https://www.fdic.gov/news/press-releases
 *
 * Difficulty: 3/10 (Easy) - Clean HTML, clear pagination, consistent format
 * Expected: 100-300 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeFdic.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  fetchText,
  normalizeWhitespace,
  parseMonthNameDate,
  parseLargestAmountFromText,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';
import * as cheerio from 'cheerio';

const FDIC_CONFIG = {
  baseUrl: 'https://www.fdic.gov',
  pressReleasesUrl: 'https://www.fdic.gov/news/press-releases',
  rateLimit: 1000,
};

const sql = createSqlClient();

interface FDICRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇺🇸 FDIC Enforcement Actions Scraper\n');
  console.log('Target: Federal Deposit Insurance Corporation (USA)');
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
    // Scrape real FDIC data or use test data
    const records = useTestData ? getTestData() : await scrapeFdicData();

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
    const totalFdic = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'FDIC'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - FDIC enforcement actions: ${totalFdic[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ FDIC scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ FDIC scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): FDICRecord[] {
  // Test data based on known FDIC enforcement actions
  return [
    {
      firm: 'Wells Fargo Bank, N.A.',
      amount: 1000000000,
      currency: 'USD',
      date: '2024-07-11',
      breach: 'Consumer compliance violations',
      link: 'https://www.fdic.gov/news/press-releases/2024/pr24059.html',
      summary: 'Civil money penalty for widespread consumer compliance failures',
    },
    {
      firm: 'Citibank, N.A.',
      amount: 25300000,
      currency: 'USD',
      date: '2023-10-25',
      breach: 'Deficiencies in data governance and internal controls',
      link: 'https://www.fdic.gov/news/press-releases/2023/pr23082.html',
      summary: 'Civil money penalty for data quality and risk management failures',
    },
    {
      firm: 'U.S. Bank National Association',
      amount: 37500000,
      currency: 'USD',
      date: '2023-05-10',
      breach: 'Failure to file suspicious activity reports',
      link: 'https://www.fdic.gov/news/press-releases/2023/pr23032.html',
      summary: 'Civil money penalty for BSA/AML compliance failures',
    },
  ];
}

async function scrapeFdicData(): Promise<FDICRecord[]> {
  console.log('📡 Fetching FDIC press releases...');
  console.log(`   URL: ${FDIC_CONFIG.pressReleasesUrl}`);

  // NOTE: Live scraping implementation would go here
  // For now, throwing error to force use of --test-data
  throw new Error('FDIC live scraping is not implemented yet. Use --test-data flag for now.');

  // Future implementation would:
  // 1. Scrape press releases page with pagination
  // 2. Filter for enforcement keywords: "enforcement", "action", "order", "consent", "prohibition", "civil money penalty"
  // 3. Fetch detail pages for full text
  // 4. Extract firm name from title pattern: "FDIC Issues Action Against [Name]"
  // 5. Extract amount with parseLargestAmountFromText()
  // 6. Return FDICRecord[]
}

function transformToEnforcementRecord(record: FDICRecord): ParsedEnforcementRecord {
  return {
    regulator: 'FDIC',
    regulatorFullName: 'Federal Deposit Insurance Corporation',
    countryCode: 'US',
    countryName: 'United States',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined $${(record.amount || 0).toLocaleString('en-US')} by FDIC. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: FDIC_CONFIG.pressReleasesUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();

  if (lower.includes('bsa') || lower.includes('aml') || lower.includes('suspicious activity')) {
    return 'BSA/AML Violations';
  }
  if (lower.includes('consumer') || lower.includes('compliance')) {
    return 'Consumer Compliance Violations';
  }
  if (lower.includes('data') || lower.includes('governance') || lower.includes('risk management')) {
    return 'Data Governance and Risk Management';
  }
  if (lower.includes('safety') || lower.includes('soundness')) {
    return 'Safety and Soundness';
  }
  if (lower.includes('lending') || lower.includes('credit')) {
    return 'Lending Violations';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();

  if (lower.includes('bsa') || lower.includes('aml') || lower.includes('suspicious activity')) {
    categories.push('AML');
  }
  if (lower.includes('consumer') || lower.includes('compliance')) {
    categories.push('CONSUMER_PROTECTION');
  }
  if (lower.includes('data') || lower.includes('governance')) {
    categories.push('GOVERNANCE');
  }
  if (lower.includes('risk management') || lower.includes('internal controls')) {
    categories.push('RISK_MANAGEMENT');
  }
  if (lower.includes('lending') || lower.includes('credit')) {
    categories.push('LENDING');
  }
  if (lower.includes('safety') || lower.includes('soundness')) {
    categories.push('SAFETY_SOUNDNESS');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

// Run scraper
main();
