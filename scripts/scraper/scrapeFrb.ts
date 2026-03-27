/**
 * FRB (Federal Reserve Board - USA) Scraper
 *
 * Strategy: Scrape enforcement actions database
 * URL: https://www.federalreserve.gov/supervisionreg/enforcementactions.htm
 *
 * Difficulty: 4/10 (Medium) - Searchable database, may have API endpoint
 * Expected: 500-1000+ enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeFrb.ts
 */

import 'dotenv/config';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  fetchText,
  normalizeWhitespace,
  parseMonthNameDate,
  parseLargestAmountFromText,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';
import * as cheerio from 'cheerio';

const FRB_CONFIG = {
  baseUrl: 'https://www.federalreserve.gov',
  enforcementUrl: 'https://www.federalreserve.gov/supervisionreg/enforcementactions.htm',
  rateLimit: 1000,
};

const sql = createSqlClient();

interface FRBRecord {
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
  console.log('🇺🇸 FRB Enforcement Actions Scraper\n');
  console.log('Target: Federal Reserve Board (USA)');
  console.log('Method: Enforcement database scraping\n');

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
    // Scrape real FRB data or use test data
    const records = useTestData ? getTestData() : await scrapeFrbData();

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
    const totalFrb = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'FRB'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - FRB enforcement actions: ${totalFrb[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ FRB scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ FRB scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): FRBRecord[] {
  // Test data based on known FRB enforcement actions
  return [
    {
      firm: 'Goldman Sachs & Co. LLC',
      amount: 44000000,
      currency: 'USD',
      date: '2024-09-18',
      actionType: 'Civil Money Penalty',
      breach: 'Unsafe and unsound practices in foreign exchange market',
      link: 'https://www.federalreserve.gov/newsevents/pressreleases/enforcement20240918a.htm',
      summary: 'Civil money penalty for unsafe practices in FX market',
    },
    {
      firm: 'Deutsche Bank AG',
      amount: 186000000,
      currency: 'USD',
      date: '2024-07-12',
      actionType: 'Civil Money Penalty',
      breach: 'Deficiencies in AML and sanctions compliance programs',
      link: 'https://www.federalreserve.gov/newsevents/pressreleases/enforcement20240712a.htm',
      summary: 'Civil money penalty for AML and sanctions compliance failures',
    },
    {
      firm: 'TD Bank, N.A.',
      amount: 123500000,
      currency: 'USD',
      date: '2023-11-09',
      actionType: 'Civil Money Penalty',
      breach: 'Failure to maintain adequate BSA/AML compliance program',
      link: 'https://www.federalreserve.gov/newsevents/pressreleases/enforcement20231109a.htm',
      summary: 'Civil money penalty for BSA/AML program deficiencies',
    },
    {
      firm: 'Charles Schwab Bank, SSB',
      amount: 187000000,
      currency: 'USD',
      date: '2023-06-29',
      actionType: 'Civil Money Penalty',
      breach: 'Deficiencies in risk management for cash sweep program',
      link: 'https://www.federalreserve.gov/newsevents/pressreleases/enforcement20230629a.htm',
      summary: 'Civil money penalty for risk management failures',
    },
  ];
}

async function scrapeFrbData(): Promise<FRBRecord[]> {
  console.log('📡 Fetching FRB enforcement actions...');
  console.log(`   URL: ${FRB_CONFIG.enforcementUrl}`);

  // NOTE: Live scraping implementation would go here
  // For now, throwing error to force use of --test-data
  throw new Error('FRB live scraping is not implemented yet. Use --test-data flag for now.');

  // Future implementation would:
  // 1. Visit enforcement page, inspect Network tab for AJAX/API calls
  // 2. If API found: Query JSON endpoint with pagination
  // 3. If no API: Use Puppeteer to render JavaScript and scrape DOM
  // 4. Extract: institution name, action type, effective date, document URL
  // 5. Parse amounts (note: FRB doesn't always publish fines, many actions have no amount)
  // 6. Return FRBRecord[]
}

function transformToEnforcementRecord(record: FRBRecord): ParsedEnforcementRecord {
  return {
    regulator: 'FRB',
    regulatorFullName: 'Federal Reserve Board',
    countryCode: 'US',
    countryName: 'United States',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: record.amount
      ? `${record.firm} fined $${(record.amount).toLocaleString('en-US')} by FRB. ${record.summary}`
      : `${record.firm} subject to ${record.actionType} by FRB. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: FRB_CONFIG.enforcementUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();

  if (lower.includes('bsa') || lower.includes('aml') || lower.includes('anti-money laundering')) {
    return 'BSA/AML Violations';
  }
  if (lower.includes('sanctions')) {
    return 'Sanctions Violations';
  }
  if (lower.includes('foreign exchange') || lower.includes('fx market')) {
    return 'FX Market Violations';
  }
  if (lower.includes('risk management') || lower.includes('unsafe and unsound')) {
    return 'Risk Management Failures';
  }
  if (lower.includes('consumer') || lower.includes('compliance')) {
    return 'Consumer Compliance Violations';
  }
  if (lower.includes('capital') || lower.includes('liquidity')) {
    return 'Capital and Liquidity';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();

  if (lower.includes('bsa') || lower.includes('aml') || lower.includes('anti-money laundering')) {
    categories.push('AML');
  }
  if (lower.includes('sanctions')) {
    categories.push('SANCTIONS');
  }
  if (lower.includes('foreign exchange') || lower.includes('fx')) {
    categories.push('FX_MARKET');
  }
  if (lower.includes('risk management') || lower.includes('unsafe and unsound')) {
    categories.push('RISK_MANAGEMENT');
  }
  if (lower.includes('consumer')) {
    categories.push('CONSUMER_PROTECTION');
  }
  if (lower.includes('capital') || lower.includes('liquidity')) {
    categories.push('CAPITAL_LIQUIDITY');
  }
  if (lower.includes('governance') || lower.includes('controls')) {
    categories.push('GOVERNANCE');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

// Run scraper
main();
