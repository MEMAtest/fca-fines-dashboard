/**
 * ASIC (Australian Securities and Investments Commission) Scraper
 *
 * Strategy: Scrape enforcement actions archive
 * URL: https://asic.gov.au/about-asic/enforcement/
 *
 * Difficulty: 7/10 (High) - Archive with pagination
 * Expected: 200-400 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeAsic.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const ASIC_CONFIG = {
  baseUrl: 'https://asic.gov.au',
  enforcementUrl: 'https://asic.gov.au/about-asic/enforcement/',
};

const sql = createSqlClient();

interface ASICRecord {
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
  console.log('🇦🇺 ASIC Enforcement Actions Scraper\n');
  console.log('Target: Australian Securities and Investments Commission');
  console.log('Method: Enforcement archive scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) console.log('⚠️  Using test data (--test-data flag detected)\n');
  if (dryRun) console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');

  try {
    const records = useTestData ? getTestData() : await scrapeAsicData();

    console.log(`\n📊 Extracted ${records.length} enforcement actions`);

    const parsedRecords = records.map((r) => transformToEnforcementRecord(r));
    const dbRecords = parsedRecords.map((r) => buildEuFineRecord(r));

    if (dryRun) {
      printDryRunSummary(dbRecords);
    } else {
      await upsertEuFines(sql, dbRecords);
      console.log('\n🔄 Refreshing unified regulatory fines view...');
      await sql`SELECT refresh_all_fines()`;
      console.log('✅ View refreshed');
    }

    const totalAsic = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'ASIC'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - ASIC enforcement actions: ${totalAsic[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ ASIC scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ ASIC scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): ASICRecord[] {
  return [
    {
      firm: 'Commonwealth Bank of Australia',
      amount: 3500000,
      currency: 'AUD',
      date: '2024-06-20',
      actionType: 'Infringement Notice',
      breach: 'Breach of responsible lending obligations',
      link: null,
      summary: 'Responsible lending violations',
    },
    {
      firm: 'Westpac Banking Corporation',
      amount: 2800000,
      currency: 'AUD',
      date: '2023-12-12',
      actionType: 'Infringement Notice',
      breach: 'Misleading or deceptive conduct',
      link: null,
      summary: 'Misleading conduct penalties',
    },
    {
      firm: 'AMP Limited',
      amount: 2100000,
      currency: 'AUD',
      date: '2023-09-05',
      actionType: 'Infringement Notice',
      breach: 'Fee disclosure failures',
      link: null,
      summary: 'Fee disclosure violations',
    },
  ];
}

async function scrapeAsicData(): Promise<ASICRecord[]> {
  throw new Error('ASIC live scraping is not implemented yet. Use --test-data flag for now.');
}

function transformToEnforcementRecord(record: ASICRecord): ParsedEnforcementRecord {
  return {
    regulator: 'ASIC',
    regulatorFullName: 'Australian Securities and Investments Commission',
    countryCode: 'AU',
    countryName: 'Australia',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined A$${(record.amount || 0).toLocaleString('en-AU')} by ASIC. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: ASIC_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('lending')) return 'Responsible Lending Violations';
  if (lower.includes('misleading')) return 'Misleading Conduct';
  if (lower.includes('disclosure')) return 'Disclosure Violations';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('lending')) categories.push('LENDING');
  if (lower.includes('misleading')) categories.push('CONDUCT');
  if (lower.includes('disclosure')) categories.push('DISCLOSURE');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
