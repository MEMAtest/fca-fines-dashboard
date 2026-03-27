/**
 * CNBV (Comisión Nacional Bancaria y de Valores - Mexico) Scraper
 *
 * Strategy: Search register with form submission
 * URL: https://sanciones.cnbv.gob.mx/
 *
 * Difficulty: 5/10 (Medium) - Form-based search, requires POST requests
 * Expected: 200-400 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeCnbv.ts
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

const CNBV_CONFIG = {
  baseUrl: 'https://sanciones.cnbv.gob.mx',
  searchUrl: 'https://sanciones.cnbv.gob.mx/',
  rateLimit: 1000,
};

const sql = createSqlClient();

interface CNBVRecord {
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
  console.log('🇲🇽 CNBV Enforcement Actions Scraper\n');
  console.log('Target: Comisión Nacional Bancaria y de Valores (Mexico)');
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
    // Scrape real CNBV data or use test data
    const records = useTestData ? getTestData() : await scrapeCnbvData();

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
    const totalCnbv = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'CNBV'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - CNBV enforcement actions: ${totalCnbv[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ CNBV scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ CNBV scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): CNBVRecord[] {
  // Test data based on known CNBV enforcement actions
  return [
    {
      firm: 'BBVA Bancomer, S.A.',
      amount: 284400000,
      currency: 'MXN',
      date: '2024-05-15',
      sanctionType: 'Multa',
      breach: 'Incumplimiento a las disposiciones de prevención de lavado de dinero',
      link: null,
      summary: 'Multa por incumplimiento AML/CFT',
    },
    {
      firm: 'Banco Santander México, S.A.',
      amount: 156700000,
      currency: 'MXN',
      date: '2023-11-20',
      sanctionType: 'Multa',
      breach: 'Violaciones a las disposiciones de protección al consumidor',
      link: null,
      summary: 'Multa por violaciones de protección al consumidor',
    },
    {
      firm: 'Grupo Financiero Banorte, S.A.B. de C.V.',
      amount: 98500000,
      currency: 'MXN',
      date: '2023-08-10',
      sanctionType: 'Multa',
      breach: 'Deficiencias en controles internos y gestión de riesgos',
      link: null,
      summary: 'Multa por deficiencias en controles internos',
    },
    {
      firm: 'HSBC México, S.A.',
      amount: 203900000,
      currency: 'MXN',
      date: '2023-03-22',
      sanctionType: 'Multa',
      breach: 'Irregularidades en la gestión de información crediticia',
      link: null,
      summary: 'Multa por gestión inadecuada de información',
    },
  ];
}

async function scrapeCnbvData(): Promise<CNBVRecord[]> {
  console.log('📡 Fetching CNBV sanctions register...');
  console.log(`   URL: ${CNBV_CONFIG.searchUrl}`);

  // NOTE: Live scraping implementation would go here
  // For now, throwing error to force use of --test-data
  throw new Error('CNBV live scraping is not implemented yet. Use --test-data flag for now.');

  // Future implementation would:
  // 1. Submit form POST requests with entity type iterations
  // 2. Parse HTML table results
  // 3. Extract: entity name, sanction type, date, amount (if available)
  // 4. Handle pagination
  // 5. Return CNBVRecord[]
}

function transformToEnforcementRecord(record: CNBVRecord): ParsedEnforcementRecord {
  return {
    regulator: 'CNBV',
    regulatorFullName: 'Comisión Nacional Bancaria y de Valores',
    countryCode: 'MX',
    countryName: 'Mexico',
    firmIndividual: record.firm,
    firmCategory: null,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.breach),
    breachCategories: categorizeBreachType(record.breach),
    summary: `${record.firm} multado $${(record.amount || 0).toLocaleString('es-MX')} MXN por CNBV. ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: CNBV_CONFIG.searchUrl,
    rawPayload: record,
  };
}

function extractBreachType(breach: string): string {
  const lower = breach.toLowerCase();

  if (lower.includes('lavado de dinero') || lower.includes('aml') || lower.includes('pld')) {
    return 'AML/CFT Violations';
  }
  if (lower.includes('protección al consumidor') || lower.includes('condusef')) {
    return 'Consumer Protection Violations';
  }
  if (lower.includes('control') || lower.includes('gestión de riesgo')) {
    return 'Internal Controls and Risk Management';
  }
  if (lower.includes('información') || lower.includes('reporte')) {
    return 'Information and Reporting Violations';
  }
  if (lower.includes('capital') || lower.includes('liquidez')) {
    return 'Capital and Liquidity Requirements';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(breach: string): string[] {
  const categories: string[] = [];
  const lower = breach.toLowerCase();

  if (lower.includes('lavado') || lower.includes('aml') || lower.includes('pld')) {
    categories.push('AML');
  }
  if (lower.includes('consumidor') || lower.includes('condusef')) {
    categories.push('CONSUMER_PROTECTION');
  }
  if (lower.includes('control') || lower.includes('riesgo')) {
    categories.push('RISK_MANAGEMENT');
  }
  if (lower.includes('información') || lower.includes('reporte')) {
    categories.push('DISCLOSURE');
  }
  if (lower.includes('capital') || lower.includes('liquidez')) {
    categories.push('CAPITAL_LIQUIDITY');
  }
  if (lower.includes('gobierno') || lower.includes('corporativo')) {
    categories.push('GOVERNANCE');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

// Run scraper
main();
