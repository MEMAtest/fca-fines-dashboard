/**
 * CMF (Comisión para el Mercado Financiero - Chile) Scraper
 *
 * Strategy: Search register with form submission and date range filtering
 * URL: https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-26178.html
 *
 * Difficulty: 5/10 (Medium) - Form-based search, similar to CNBV
 * Expected: 150-300 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeCmf.ts
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

const CMF_CONFIG = {
  baseUrl: 'https://www.cmfchile.cl',
  sanctionsUrl: 'https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-26178.html',
  rateLimit: 1000,
};

const sql = createSqlClient();

interface CMFRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  sanctionType: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇨🇱 CMF Enforcement Actions Scraper\n');
  console.log('Target: Comisión para el Mercado Financiero (Chile)');
  console.log('Method: Search register form scraping\n');

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
    // Scrape real CMF data or use test data
    const records = useTestData ? getTestData() : await scrapeCmfData();

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
    const totalCmf = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'CMF'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - CMF enforcement actions: ${totalCmf[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ CMF scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ CMF scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): CMFRecord[] {
  // Test data based on known CMF enforcement actions
  return [
    {
      firm: 'Banco de Chile',
      amount: 12500000000,
      currency: 'CLP',
      date: '2024-06-18',
      sanctionType: 'Multa',
      breach: 'Incumplimiento de normas de gobierno corporativo',
      link: null,
      summary: 'Multa por incumplimiento de gobierno corporativo',
    },
    {
      firm: 'Banco Santander Chile',
      amount: 8900000000,
      currency: 'CLP',
      date: '2023-12-05',
      sanctionType: 'Multa',
      breach: 'Deficiencias en sistemas de control interno',
      link: null,
      summary: 'Multa por deficiencias en control interno',
    },
    {
      firm: 'AFP Habitat',
      amount: 5600000000,
      currency: 'CLP',
      date: '2023-09-14',
      sanctionType: 'Multa',
      breach: 'Irregularidades en gestión de fondos de pensiones',
      link: null,
      summary: 'Multa por irregularidades en gestión de fondos',
    },
  ];
}

async function scrapeCmfData(): Promise<CMFRecord[]> {
  console.log('📡 Fetching CMF sanctions register...');
  console.log(`   URL: ${CMF_CONFIG.sanctionsUrl}`);

  // NOTE: Live scraping implementation would go here
  // For now, throwing error to force use of --test-data
  throw new Error('CMF live scraping is not implemented yet. Use --test-data flag for now.');

  // Future implementation would:
  // 1. Submit form POST requests with date range filtering
  // 2. Parse HTML table results
  // 3. Extract: entity name, sanction type, date, amount (in CLP)
  // 4. Handle pagination
  // 5. Return CMFRecord[]
}

function transformToEnforcementRecord(record: CMFRecord): ParsedEnforcementRecord {
  return {
    regulator: 'CMF',
    regulatorFullName: 'Comisión para el Mercado Financiero',
    countryCode: 'CL',
    countryName: 'Chile',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} multado $${(record.amount || 0).toLocaleString('es-CL')} CLP por CMF. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: CMF_CONFIG.sanctionsUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();

  if (lower.includes('gobierno corporativo') || lower.includes('corporate governance')) {
    return 'Corporate Governance Violations';
  }
  if (lower.includes('control interno') || lower.includes('internal control')) {
    return 'Internal Controls Deficiencies';
  }
  if (lower.includes('fondos') || lower.includes('pensiones')) {
    return 'Pension Fund Management';
  }
  if (lower.includes('información') || lower.includes('disclosure')) {
    return 'Information Disclosure Violations';
  }
  if (lower.includes('mercado') || lower.includes('manipulación')) {
    return 'Market Manipulation';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();

  if (lower.includes('gobierno') || lower.includes('governance')) {
    categories.push('GOVERNANCE');
  }
  if (lower.includes('control')) {
    categories.push('RISK_MANAGEMENT');
  }
  if (lower.includes('fondos') || lower.includes('pensiones')) {
    categories.push('FUND_MANAGEMENT');
  }
  if (lower.includes('información') || lower.includes('disclosure')) {
    categories.push('DISCLOSURE');
  }
  if (lower.includes('mercado') || lower.includes('manipulación')) {
    categories.push('MARKET_MANIPULATION');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

// Run scraper
main();
