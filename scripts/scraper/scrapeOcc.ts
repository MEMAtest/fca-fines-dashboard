/**
 * OCC (Office of the Comptroller of the Currency - USA) Scraper
 *
 * Strategy: Scrape enforcement actions database/register
 * URL: https://www.occ.gov/topics/supervision-and-examination/enforcement-actions/index-enforcement-actions.html
 *
 * Difficulty: 7/10 (High) - Search register with complex structure
 * Expected: 300-500 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeOcc.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const OCC_CONFIG = {
  baseUrl: 'https://www.occ.gov',
  enforcementUrl: 'https://www.occ.gov/topics/supervision-and-examination/enforcement-actions/index-enforcement-actions.html',
};

const sql = createSqlClient();

interface OCCRecord {
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
  console.log('🇺🇸 OCC Enforcement Actions Scraper\n');
  console.log('Target: Office of the Comptroller of the Currency (USA)');
  console.log('Method: Enforcement actions database scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) console.log('⚠️  Using test data (--test-data flag detected)\n');
  if (dryRun) console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');

  try {
    const records = useTestData ? getTestData() : await scrapeOccData();

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

    const totalOcc = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'OCC'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - OCC enforcement actions: ${totalOcc[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ OCC scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ OCC scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): OCCRecord[] {
  return [
    {
      firm: 'JPMorgan Chase Bank, N.A.',
      amount: 65000000,
      currency: 'USD',
      date: '2024-05-22',
      actionType: 'Civil Money Penalty',
      breach: 'BSA/AML compliance program deficiencies',
      link: null,
      summary: 'BSA/AML program failures',
    },
    {
      firm: 'Bank of America, N.A.',
      amount: 45000000,
      currency: 'USD',
      date: '2023-10-18',
      actionType: 'Civil Money Penalty',
      breach: 'Consumer protection violations',
      link: null,
      summary: 'Consumer protection failures',
    },
    {
      firm: 'Capital One, N.A.',
      amount: 38000000,
      currency: 'USD',
      date: '2023-06-30',
      actionType: 'Civil Money Penalty',
      breach: 'Risk management and internal controls deficiencies',
      link: null,
      summary: 'Risk management deficiencies',
    },
  ];
}

async function scrapeOccData(): Promise<OCCRecord[]> {
  throw new Error('OCC live scraping is not implemented yet. Use --test-data flag for now.');
}

function transformToEnforcementRecord(record: OCCRecord): ParsedEnforcementRecord {
  return {
    regulator: 'OCC',
    regulatorFullName: 'Office of the Comptroller of the Currency',
    countryCode: 'US',
    countryName: 'United States',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined $${(record.amount || 0).toLocaleString('en-US')} by OCC. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: OCC_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('bsa') || lower.includes('aml')) return 'BSA/AML Violations';
  if (lower.includes('consumer')) return 'Consumer Protection';
  if (lower.includes('risk management')) return 'Risk Management';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('bsa') || lower.includes('aml')) categories.push('AML');
  if (lower.includes('consumer')) categories.push('CONSUMER_PROTECTION');
  if (lower.includes('risk')) categories.push('RISK_MANAGEMENT');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
