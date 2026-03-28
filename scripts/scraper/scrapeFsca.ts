/**
 * FSCA (Financial Sector Conduct Authority - South Africa) Scraper
 *
 * Strategy: Scrape enforcement actions archive (possibly SharePoint)
 * URL: https://www.fsca.co.za/Enforcement/Pages/default.aspx
 *
 * Difficulty: 8/10 (High) - Archive structure, possibly SharePoint-based
 * Expected: 50-100 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeFsca.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const FSCA_CONFIG = {
  baseUrl: 'https://www.fsca.co.za',
  enforcementUrl: 'https://www.fsca.co.za/Enforcement/Pages/default.aspx',
};

const sql = createSqlClient();

interface FSCARecord {
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
  console.log('🇿🇦 FSCA Enforcement Actions Scraper\n');
  console.log('Target: Financial Sector Conduct Authority (South Africa)');
  console.log('Method: Enforcement archive scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) console.log('⚠️  Using test data (--test-data flag detected)\n');
  if (dryRun) console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');

  try {
    const records = useTestData ? getTestData() : await scrapeFscaData();

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

    const totalFsca = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'FSCA'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - FSCA enforcement actions: ${totalFsca[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ FSCA scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ FSCA scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): FSCARecord[] {
  return [
    {
      firm: 'Standard Bank of South Africa Limited',
      amount: 25000000,
      currency: 'ZAR',
      date: '2024-04-18',
      actionType: 'Administrative Penalty',
      breach: 'Market conduct violations',
      link: null,
      summary: 'Market conduct failures',
    },
    {
      firm: 'FirstRand Bank Limited',
      amount: 18000000,
      currency: 'ZAR',
      date: '2023-11-05',
      actionType: 'Administrative Penalty',
      breach: 'Customer treatment failures',
      link: null,
      summary: 'Customer treatment violations',
    },
    {
      firm: 'Absa Bank Limited',
      amount: 15000000,
      currency: 'ZAR',
      date: '2023-08-22',
      actionType: 'Administrative Penalty',
      breach: 'Disclosure and reporting violations',
      link: null,
      summary: 'Disclosure failures',
    },
  ];
}

async function scrapeFscaData(): Promise<FSCARecord[]> {
  throw new Error('FSCA live scraping is not implemented yet. Use --test-data flag for now.');
}

function transformToEnforcementRecord(record: FSCARecord): ParsedEnforcementRecord {
  return {
    regulator: 'FSCA',
    regulatorFullName: 'Financial Sector Conduct Authority',
    countryCode: 'ZA',
    countryName: 'South Africa',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined R${(record.amount || 0).toLocaleString('en-ZA')} by FSCA. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: FSCA_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('market conduct')) return 'Market Conduct Violations';
  if (lower.includes('customer treatment')) return 'Customer Treatment';
  if (lower.includes('disclosure')) return 'Disclosure Violations';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('market')) categories.push('MARKET_CONDUCT');
  if (lower.includes('customer')) categories.push('CUSTOMER_TREATMENT');
  if (lower.includes('disclosure')) categories.push('DISCLOSURE');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
