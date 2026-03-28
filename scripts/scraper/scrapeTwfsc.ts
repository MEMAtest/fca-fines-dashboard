/**
 * TWFSC (Taiwan Financial Supervisory Commission) Scraper
 *
 * Strategy: Multi-domain scraping across 3 regulatory bodies
 * URLs: banking.gov.tw, sfb.gov.tw, ib.gov.tw
 *
 * Difficulty: 7/10 (High) - Coordinates across 3 domains, Traditional Chinese
 * Expected: 100-200 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeTwfsc.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const TWFSC_CONFIG = {
  baseUrl: 'https://www.fsc.gov.tw',
  bankingUrl: 'https://www.banking.gov.tw',
  securitiesUrl: 'https://www.sfb.gov.tw',
  insuranceUrl: 'https://www.ib.gov.tw',
};

const sql = createSqlClient();

interface TWFSCRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  domain: 'Banking' | 'Securities' | 'Insurance';
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇹🇼 TWFSC Enforcement Actions Scraper\n');
  console.log('Target: Taiwan Financial Supervisory Commission');
  console.log('Method: Multi-domain scraping (Banking, Securities, Insurance)\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) {
    console.log('⚠️  Using test data (--test-data flag detected)\n');
  }
  if (dryRun) {
    console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');
  }

  try {
    const records = useTestData ? getTestData() : await scrapeTwfscData();

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

    const totalTwfsc = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'TWFSC'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - TWFSC enforcement actions: ${totalTwfsc[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ TWFSC scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ TWFSC scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): TWFSCRecord[] {
  return [
    {
      firm: 'Cathay United Bank',
      amount: 50000000,
      currency: 'TWD',
      date: '2024-05-20',
      domain: 'Banking',
      breach: 'AML compliance deficiencies',
      link: null,
      summary: 'Anti-money laundering violations',
    },
    {
      firm: 'Yuanta Securities',
      amount: 35000000,
      currency: 'TWD',
      date: '2023-12-15',
      domain: 'Securities',
      breach: 'Market manipulation violations',
      link: null,
      summary: 'Stock price manipulation',
    },
    {
      firm: 'Fubon Life Insurance',
      amount: 28000000,
      currency: 'TWD',
      date: '2023-09-08',
      domain: 'Insurance',
      breach: 'Investment compliance violations',
      link: null,
      summary: 'Investment regulation breaches',
    },
  ];
}

async function scrapeTwfscData(): Promise<TWFSCRecord[]> {
  throw new Error('TWFSC live scraping is not implemented yet. Use --test-data flag for now.');
}

function transformToEnforcementRecord(record: TWFSCRecord): ParsedEnforcementRecord {
  return {
    regulator: 'TWFSC',
    regulatorFullName: 'Taiwan Financial Supervisory Commission',
    countryCode: 'TW',
    countryName: 'Taiwan',
    firmIndividual: record.firm,
    firmCategory: record.domain,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined NT$${(record.amount || 0).toLocaleString('zh-TW')} by TWFSC. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: TWFSC_CONFIG.baseUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('aml') || lower.includes('money laundering')) return 'AML Violations';
  if (lower.includes('manipulation')) return 'Market Manipulation';
  if (lower.includes('investment')) return 'Investment Compliance';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('aml')) categories.push('AML');
  if (lower.includes('manipulation')) categories.push('MARKET_MANIPULATION');
  if (lower.includes('investment')) categories.push('INVESTMENT');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
