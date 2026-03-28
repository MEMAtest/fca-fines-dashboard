/**
 * FMANZ (Financial Markets Authority - New Zealand) Scraper
 *
 * Strategy: Scrape enforcement actions with detail pages
 * URL: https://www.fma.govt.nz/enforcement/
 *
 * Difficulty: 7/10 (High) - Detail pages with varying structure
 * Expected: 30-60 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeFmanz.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const FMANZ_CONFIG = {
  baseUrl: 'https://www.fma.govt.nz',
  enforcementUrl: 'https://www.fma.govt.nz/enforcement/',
};

const sql = createSqlClient();

interface FMANZRecord {
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
  console.log('🇳🇿 FMANZ Enforcement Actions Scraper\n');
  console.log('Target: Financial Markets Authority (New Zealand)');
  console.log('Method: Enforcement actions scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) console.log('⚠️  Using test data (--test-data flag detected)\n');
  if (dryRun) console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');

  try {
    const records = useTestData ? getTestData() : await scrapeFmanzData();

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

    const totalFmanz = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'FMANZ'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - FMANZ enforcement actions: ${totalFmanz[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ FMANZ scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ FMANZ scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): FMANZRecord[] {
  return [
    {
      firm: 'ANZ Bank New Zealand Limited',
      amount: 1800000,
      currency: 'NZD',
      date: '2024-03-20',
      actionType: 'Pecuniary Penalty',
      breach: 'Breach of fair dealing provisions',
      link: null,
      summary: 'Fair dealing violations',
    },
    {
      firm: 'ASB Bank Limited',
      amount: 1200000,
      currency: 'NZD',
      date: '2023-10-12',
      actionType: 'Pecuniary Penalty',
      breach: 'Failure to comply with disclosure requirements',
      link: null,
      summary: 'Disclosure requirement failures',
    },
    {
      firm: 'Westpac New Zealand Limited',
      amount: 950000,
      currency: 'NZD',
      date: '2023-06-28',
      actionType: 'Pecuniary Penalty',
      breach: 'Conduct obligations violations',
      link: null,
      summary: 'Conduct obligations breaches',
    },
  ];
}

async function scrapeFmanzData(): Promise<FMANZRecord[]> {
  throw new Error('FMANZ live scraping is not implemented yet. Use --test-data flag for now.');
}

function transformToEnforcementRecord(record: FMANZRecord): ParsedEnforcementRecord {
  return {
    regulator: 'FMANZ',
    regulatorFullName: 'Financial Markets Authority',
    countryCode: 'NZ',
    countryName: 'New Zealand',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined NZ$${(record.amount || 0).toLocaleString('en-NZ')} by FMA. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: FMANZ_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('fair dealing')) return 'Fair Dealing Violations';
  if (lower.includes('disclosure')) return 'Disclosure Violations';
  if (lower.includes('conduct')) return 'Conduct Obligations';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('dealing')) categories.push('FAIR_DEALING');
  if (lower.includes('disclosure')) categories.push('DISCLOSURE');
  if (lower.includes('conduct')) categories.push('CONDUCT');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
