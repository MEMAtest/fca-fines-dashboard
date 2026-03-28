/**
 * CSRC (China Securities Regulatory Commission) Scraper
 *
 * Strategy: Scrape administrative penalties (Chinese language, UTF-8 encoding)
 * URL: http://www.csrc.gov.cn/csrc/c100028/common_list.shtml
 *
 * Difficulty: 8/10 (High) - Chinese language, number formats, encoding
 * Expected: 500-1000 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeCsrc.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const CSRC_CONFIG = {
  baseUrl: 'http://www.csrc.gov.cn',
  penaltiesUrl: 'http://www.csrc.gov.cn/csrc/c100028/common_list.shtml',
};

const sql = createSqlClient();

interface CSRCRecord {
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
  console.log('🇨🇳 CSRC Enforcement Actions Scraper\n');
  console.log('Target: China Securities Regulatory Commission');
  console.log('Method: Administrative penalties scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) console.log('⚠️  Using test data (--test-data flag detected)\n');
  if (dryRun) console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');

  try {
    const records = useTestData ? getTestData() : await scrapeCsrcData();

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

    const totalCsrc = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'CSRC'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - CSRC enforcement actions: ${totalCsrc[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ CSRC scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ CSRC scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): CSRCRecord[] {
  return [
    {
      firm: 'China International Capital Corporation',
      amount: 180000000,
      currency: 'CNY',
      date: '2024-07-25',
      violationType: 'Administrative Penalty',
      breach: 'Information disclosure violations',
      link: null,
      summary: 'Information disclosure failures',
    },
    {
      firm: 'Guotai Junan Securities',
      amount: 125000000,
      currency: 'CNY',
      date: '2023-12-18',
      violationType: 'Administrative Penalty',
      breach: 'Market manipulation',
      link: null,
      summary: 'Market manipulation violations',
    },
    {
      firm: 'Haitong Securities',
      amount: 95000000,
      currency: 'CNY',
      date: '2023-09-22',
      violationType: 'Administrative Penalty',
      breach: 'Internal controls deficiencies',
      link: null,
      summary: 'Internal control failures',
    },
  ];
}

async function scrapeCsrcData(): Promise<CSRCRecord[]> {
  throw new Error('CSRC live scraping is not implemented yet. Use --test-data flag for now.');

  // Future implementation notes:
  // - Handle UTF-8 encoding for Chinese text
  // - Parse Chinese number formats (e.g., 万元 = 10,000 yuan)
  // - Extract dates in Chinese format (年月日)
  // - Consider translation of breach descriptions to English
}

function transformToEnforcementRecord(record: CSRCRecord): ParsedEnforcementRecord {
  return {
    regulator: 'CSRC',
    regulatorFullName: 'China Securities Regulatory Commission',
    countryCode: 'CN',
    countryName: 'China',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined ¥${(record.amount || 0).toLocaleString('zh-CN')} by CSRC. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: CSRC_CONFIG.penaltiesUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();
  if (lower.includes('disclosure')) return 'Information Disclosure Violations';
  if (lower.includes('manipulation')) return 'Market Manipulation';
  if (lower.includes('control')) return 'Internal Controls';
  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();
  if (lower.includes('disclosure')) categories.push('DISCLOSURE');
  if (lower.includes('manipulation')) categories.push('MARKET_MANIPULATION');
  if (lower.includes('control')) categories.push('RISK_MANAGEMENT');
  return categories.length > 0 ? categories : ['OTHER'];
}

main();
