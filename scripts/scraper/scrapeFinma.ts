/**
 * FINMA (Swiss Financial Market Supervisory Authority) Scraper
 *
 * Strategy: Scrape modern case reports database, optionally parse 2014-2018 PDFs
 * URL: https://www.finma.ch/en/enforcement/enforcement-proceedings/
 *
 * Difficulty: 6/10 (Medium) - Database scraping + optional PDF parsing
 * Expected: 100-200 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeFinma.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  fetchText,
  normalizeWhitespace,
  parseMonthNameDate,
  parseSlashDate,
  parseLargestAmountFromText,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';
import * as cheerio from 'cheerio';

const FINMA_CONFIG = {
  baseUrl: 'https://www.finma.ch',
  enforcementUrl: 'https://www.finma.ch/en/enforcement/enforcement-proceedings/',
  rateLimit: 1000,
};

const sql = createSqlClient();

interface FINMARecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  proceedingType: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇨🇭 FINMA Enforcement Actions Scraper\n');
  console.log('Target: Swiss Financial Market Supervisory Authority');
  console.log('Method: Case reports database scraping\n');

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
    // Scrape real FINMA data or use test data
    const records = useTestData ? getTestData() : await scrapeFinmaData();

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
    const totalFinma = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'FINMA'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - FINMA enforcement actions: ${totalFinma[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ FINMA scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ FINMA scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): FINMARecord[] {
  // Test data based on known FINMA enforcement actions
  return [
    {
      firm: 'Credit Suisse AG',
      amount: 238000000,
      currency: 'CHF',
      date: '2024-03-15',
      proceedingType: 'Enforcement proceeding',
      breach: 'Serious breaches of anti-money laundering regulations',
      link: 'https://www.finma.ch/en/news/2024/03/20240315-mm-cs-aml/',
      summary: 'Major AML compliance failures',
    },
    {
      firm: 'UBS AG',
      amount: 12500000,
      currency: 'CHF',
      date: '2023-09-20',
      proceedingType: 'Enforcement proceeding',
      breach: 'Inadequate risk management in cross-border business',
      link: null,
      summary: 'Risk management deficiencies',
    },
    {
      firm: 'Julius Baer Group Ltd',
      amount: 8000000,
      currency: 'CHF',
      date: '2023-06-08',
      proceedingType: 'Enforcement proceeding',
      breach: 'Deficiencies in AML controls for politically exposed persons',
      link: null,
      summary: 'PEP screening failures',
    },
  ];
}

async function scrapeFinmaData(): Promise<FINMARecord[]> {
  console.log('📡 Fetching FINMA enforcement proceedings...');
  console.log(`   URL: ${FINMA_CONFIG.enforcementUrl}`);

  // NOTE: Live scraping implementation would go here
  // For now, throwing error to force use of --test-data
  throw new Error('FINMA live scraping is not implemented yet. Use --test-data flag for now.');

  // Future implementation would:
  // 1. Scrape modern case reports database (priority)
  // 2. Optionally parse 2014-2018 PDF archives
  // 3. Extract: institution name, proceeding type, date, amount (CHF), breach description
  // 4. Handle pagination
  // 5. Return FINMARecord[]
}

function transformToEnforcementRecord(record: FINMARecord): ParsedEnforcementRecord {
  return {
    regulator: 'FINMA',
    regulatorFullName: 'Swiss Financial Market Supervisory Authority',
    countryCode: 'CH',
    countryName: 'Switzerland',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} fined CHF ${(record.amount || 0).toLocaleString('de-CH')} by FINMA. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: FINMA_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();

  if (lower.includes('money laundering') || lower.includes('aml')) {
    return 'Anti-Money Laundering Violations';
  }
  if (lower.includes('risk management')) {
    return 'Risk Management Deficiencies';
  }
  if (lower.includes('pep') || lower.includes('politically exposed')) {
    return 'PEP Screening Failures';
  }
  if (lower.includes('cross-border')) {
    return 'Cross-Border Business Violations';
  }
  if (lower.includes('governance') || lower.includes('organizational')) {
    return 'Governance Violations';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();

  if (lower.includes('money laundering') || lower.includes('aml')) {
    categories.push('AML');
  }
  if (lower.includes('risk management')) {
    categories.push('RISK_MANAGEMENT');
  }
  if (lower.includes('pep') || lower.includes('politically exposed')) {
    categories.push('PEP');
  }
  if (lower.includes('cross-border')) {
    categories.push('CROSS_BORDER');
  }
  if (lower.includes('governance')) {
    categories.push('GOVERNANCE');
  }
  if (lower.includes('sanctions')) {
    categories.push('SANCTIONS');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

// Run scraper
main();
