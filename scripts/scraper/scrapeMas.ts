/**
 * MAS (Monetary Authority of Singapore) Scraper
 *
 * Strategy: Scrape enforcement actions with detail pages
 * URL: https://www.mas.gov.sg/regulation/enforcement
 *
 * Difficulty: 7/10 (High) - Detail pages with complex extraction
 * Expected: 100-200 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeMas.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const MAS_CONFIG = {
  baseUrl: 'https://www.mas.gov.sg',
  enforcementUrl: 'https://www.mas.gov.sg/regulation/enforcement',
};

const sql = createSqlClient();

interface MASRecord {
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
  console.log('🇸🇬 MAS Enforcement Actions Scraper\n');
  console.log('Target: Monetary Authority of Singapore');
  console.log('Method: Enforcement actions scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) console.log('⚠️  Using test data (--test-data flag detected)\n');
  if (dryRun) console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');

  try {
    const records = useTestData ? getTestData() : await scrapeMasData();

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

    const totalMas = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'MAS'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - MAS enforcement actions: ${totalMas[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ MAS scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ MAS scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): MASRecord[] {
  return [
    {
      firm: 'DBS Bank Ltd',
      amount: 2200000,
      currency: 'SGD',
      date: '2024-08-15',
      actionType: 'Composition Fine',
      breach: 'AML/CFT control deficiencies',
      link: null,
      summary: 'Anti-money laundering control failures',
    },
    {
      firm: 'United Overseas Bank Limited',
      amount: 1900000,
      currency: 'SGD',
      date: '2023-11-20',
      actionType: 'Composition Fine',
      breach: 'Breach of technology risk management guidelines',
      link: null,
      summary: 'Technology risk management violations',
    },
    {
      firm: 'OCBC Bank',
      amount: 1500000,
      currency: 'SGD',
      date: '2023-07-12',
      actionType: 'Composition Fine',
      breach: 'Customer due diligence failures',
      link: null,
      summary: 'CDD compliance failures',
    },
  ];
}

async function scrapeMasData(): Promise<MASRecord[]> {
  throw new Error('MAS live scraping is not implemented yet. Use --test-data flag for now.');
}

function transformToEnforcementRecord(record: MASRecord): ParsedEnforcementRecord {
  return {
    regulator: 'MAS',
    regulatorFullName: 'Monetary Authority of Singapore',
    countryCode: 'SG',
    countryName: 'Singapore',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined S$${(record.amount || 0).toLocaleString('en-SG')} by MAS. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: MAS_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('aml') || lower.includes('cft')) return 'AML/CFT Violations';
  if (lower.includes('technology')) return 'Technology Risk Management';
  if (lower.includes('due diligence')) return 'Customer Due Diligence';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('aml')) categories.push('AML');
  if (lower.includes('technology')) categories.push('TECHNOLOGY');
  if (lower.includes('diligence')) categories.push('CDD');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
