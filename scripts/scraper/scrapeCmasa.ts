/**
 * CMASA (Capital Market Authority - Saudi Arabia) Scraper
 *
 * Strategy: Scrape enforcement actions (may require VPN if geo-blocked)
 * URL: https://cma.org.sa/en/RulesRegulations/Enforcement/Pages/default.aspx
 *
 * Difficulty: 8/10 (High) - Possible geo-blocking, Arabic/English bilingual
 * Expected: 50-100 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeCmasa.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const CMASA_CONFIG = {
  baseUrl: 'https://cma.org.sa',
  enforcementUrl: 'https://cma.org.sa/en/RulesRegulations/Enforcement/Pages/default.aspx',
};

const sql = createSqlClient();

interface CMASARecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  violationType: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇸🇦 CMASA Enforcement Actions Scraper\n');
  console.log('Target: Capital Market Authority (Saudi Arabia)');
  console.log('Method: Enforcement actions scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) console.log('⚠️  Using test data (--test-data flag detected)\n');
  if (dryRun) console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');

  try {
    const records = useTestData ? getTestData() : await scrapeCmasaData();

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

    const totalCmasa = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'CMASA'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - CMASA enforcement actions: ${totalCmasa[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ CMASA scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ CMASA scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): CMASARecord[] {
  return [
    {
      firm: 'Saudi National Bank',
      amount: 12000000,
      currency: 'SAR',
      date: '2024-06-10',
      violationType: 'Administrative Fine',
      breach: 'Market conduct violations',
      link: null,
      summary: 'Market conduct failures',
    },
    {
      firm: 'Al Rajhi Bank',
      amount: 8500000,
      currency: 'SAR',
      date: '2023-11-15',
      violationType: 'Administrative Fine',
      breach: 'Disclosure requirement violations',
      link: null,
      summary: 'Disclosure requirement failures',
    },
    {
      firm: 'Riyad Bank',
      amount: 6200000,
      currency: 'SAR',
      date: '2023-08-20',
      violationType: 'Administrative Fine',
      breach: 'Compliance failures',
      link: null,
      summary: 'Regulatory compliance failures',
    },
  ];
}

async function scrapeCmasaData(): Promise<CMASARecord[]> {
  throw new Error('CMASA live scraping is not implemented yet. Use --test-data flag for now.');

  // Future implementation notes:
  // - May require VPN or proxy if geo-blocked from outside Saudi Arabia
  // - Handle Arabic/English bilingual content
  // - Parse SAR currency amounts
  // - Consider authentication or rate limiting
}

function transformToEnforcementRecord(record: CMASARecord): ParsedEnforcementRecord {
  return {
    regulator: 'CMASA',
    regulatorFullName: 'Capital Market Authority',
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined SAR ${(record.amount || 0).toLocaleString('ar-SA')} by CMA. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: CMASA_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('market conduct')) return 'Market Conduct Violations';
  if (lower.includes('disclosure')) return 'Disclosure Violations';
  if (lower.includes('compliance')) return 'Compliance Failures';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('market')) categories.push('MARKET_CONDUCT');
  if (lower.includes('disclosure')) categories.push('DISCLOSURE');
  if (lower.includes('compliance')) categories.push('COMPLIANCE');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
