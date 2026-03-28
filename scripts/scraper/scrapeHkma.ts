/**
 * HKMA (Hong Kong Monetary Authority) Scraper
 *
 * Strategy: Scrape enforcement actions archive with detail pages
 * URL: https://www.hkma.gov.hk/eng/key-functions/banking-stability/enforcement/
 *
 * Difficulty: 7/10 (High) - Detail pages with complex structure
 * Expected: 50-100 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeHkma.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const HKMA_CONFIG = {
  baseUrl: 'https://www.hkma.gov.hk',
  enforcementUrl: 'https://www.hkma.gov.hk/eng/key-functions/banking-stability/enforcement/',
};

const sql = createSqlClient();

interface HKMARecord {
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
  console.log('🇭🇰 HKMA Enforcement Actions Scraper\n');
  console.log('Target: Hong Kong Monetary Authority');
  console.log('Method: Enforcement archive scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) console.log('⚠️  Using test data (--test-data flag detected)\n');
  if (dryRun) console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');

  try {
    const records = useTestData ? getTestData() : await scrapeHkmaData();

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

    const totalHkma = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'HKMA'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - HKMA enforcement actions: ${totalHkma[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ HKMA scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ HKMA scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): HKMARecord[] {
  return [
    {
      firm: 'HSBC Bank (Hong Kong) Limited',
      amount: 4000000,
      currency: 'HKD',
      date: '2024-07-15',
      actionType: 'Reprimand and Fine',
      breach: 'AML/CFT compliance deficiencies',
      link: null,
      summary: 'Anti-money laundering failures',
    },
    {
      firm: 'Standard Chartered Bank (Hong Kong) Limited',
      amount: 3200000,
      currency: 'HKD',
      date: '2023-11-28',
      actionType: 'Reprimand and Fine',
      breach: 'Breach of Banking Ordinance requirements',
      link: null,
      summary: 'Regulatory compliance failures',
    },
    {
      firm: 'Bank of China (Hong Kong) Limited',
      amount: 2800000,
      currency: 'HKD',
      date: '2023-08-10',
      actionType: 'Reprimand and Fine',
      breach: 'Internal controls deficiencies',
      link: null,
      summary: 'Internal control weaknesses',
    },
  ];
}

async function scrapeHkmaData(): Promise<HKMARecord[]> {
  throw new Error('HKMA live scraping is not implemented yet. Use --test-data flag for now.');
}

function transformToEnforcementRecord(record: HKMARecord): ParsedEnforcementRecord {
  return {
    regulator: 'HKMA',
    regulatorFullName: 'Hong Kong Monetary Authority',
    countryCode: 'HK',
    countryName: 'Hong Kong',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined HK$${(record.amount || 0).toLocaleString('en-HK')} by HKMA. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: HKMA_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('aml') || lower.includes('cft')) return 'AML/CFT Violations';
  if (lower.includes('ordinance')) return 'Banking Ordinance Breach';
  if (lower.includes('control')) return 'Internal Controls';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('aml')) categories.push('AML');
  if (lower.includes('ordinance')) categories.push('REGULATORY');
  if (lower.includes('control')) categories.push('RISK_MANAGEMENT');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
