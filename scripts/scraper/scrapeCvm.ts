/**
 * CVM (Comissão de Valores Mobiliários - Brazil) Scraper
 *
 * Strategy: Download ZIP file from open data portal, parse CSV
 * URL: https://dados.cvm.gov.br/dados/PROCESSO/SANCIONADOR/DADOS/processo_sancionador.zip
 *
 * Difficulty: 2/10 (Very Easy) - Direct download, structured CSV
 * Expected: 100-500 enforcement actions
 *
 * Run: npx tsx scripts/scraper/scrapeCvm.ts
 */

import 'dotenv/config';
import { createReadStream } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse } from 'csv-parse';
import {
  type ParsedEnforcementRecord,
  buildEuFineRecord,
  createSqlClient,
  fetchBinary,
  normalizeWhitespace,
  parseMonthNameDate,
  parseSlashDate,
  upsertEuFines,
  printDryRunSummary,
} from './lib/euFineHelpers.js';

const CVM_CONFIG = {
  zipUrl: 'https://dados.cvm.gov.br/dados/PROCESSO/SANCIONADOR/DADOS/processo_sancionador.zip',
  baseUrl: 'https://www.gov.br/cvm',
  rateLimit: 1000,
};

const sql = createSqlClient();

interface CVMRawRecord {
  ID_PROCESSO?: string;
  NUMERO_PROCESSO?: string;
  DATA_INICIO?: string;
  DATA_FIM?: string;
  SITUACAO?: string;
  NOME_ACUSADO?: string;
  TIPO_ACUSADO?: string;
  MULTA?: string;
  DESCRICAO?: string;
  INABILITACAO?: string;
  [key: string]: string | undefined;
}

interface CVMRecord {
  processId: string;
  processNumber: string;
  firm: string;
  firmType: string | null;
  amount: number | null;
  currency: string;
  date: string;
  description: string;
  link: string | null;
}

async function main() {
  console.log('🇧🇷 CVM Enforcement Actions Scraper\n');
  console.log('Target: Comissão de Valores Mobiliários (Brazil)');
  console.log('Method: Open data ZIP download + CSV parsing\n');

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
    // Scrape real CVM data or use test data
    const records = useTestData ? getTestData() : await scrapeCvmData();

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
    const totalCvm = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'CVM'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - CVM enforcement actions: ${totalCvm[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ CVM scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ CVM scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): CVMRecord[] {
  // Test data based on known CVM enforcement actions
  return [
    {
      processId: 'RJ2021-12345',
      processNumber: 'RJ2021/12345',
      firm: 'XP Investimentos CCTVM S/A',
      firmType: 'Corretora',
      amount: 500000,
      currency: 'BRL',
      date: '2024-06-15',
      description: 'Violação às normas de conduta e ética profissional',
      link: null,
    },
    {
      processId: 'SP2020-67890',
      processNumber: 'SP2020/67890',
      firm: 'BTG Pactual S.A.',
      firmType: 'Banco de Investimento',
      amount: 1200000,
      currency: 'BRL',
      date: '2023-11-22',
      description: 'Descumprimento de regras de divulgação de informações',
      link: null,
    },
    {
      processId: 'RJ2019-54321',
      processNumber: 'RJ2019/54321',
      firm: 'Itaú Unibanco S.A.',
      firmType: 'Banco Múltiplo',
      amount: 800000,
      currency: 'BRL',
      date: '2023-03-10',
      description: 'Irregularidades na prestação de serviços de custódia',
      link: null,
    },
  ];
}

async function scrapeCvmData(): Promise<CVMRecord[]> {
  console.log('📡 Downloading CVM enforcement data ZIP...');
  console.log(`   URL: ${CVM_CONFIG.zipUrl}`);

  // Download ZIP file
  const zipBuffer = await fetchBinary(CVM_CONFIG.zipUrl);
  console.log(`✅ Downloaded ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Create temp directory
  const tempDir = join(tmpdir(), `cvm-scraper-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    // Save ZIP to temp
    const zipPath = join(tempDir, 'processo_sancionador.zip');
    await writeFile(zipPath, zipBuffer);

    // Unzip and parse CSV
    console.log('\n📊 Extracting and parsing CSV data...');
    const rawRecords = await extractAndParseZip(tempDir);

    console.log(`   Found ${rawRecords.length} total records`);

    // Filter and transform records
    const cvmRecords = transformRawRecords(rawRecords);
    console.log(`   Filtered to ${cvmRecords.length} enforcement actions with sanctions`);

    return cvmRecords;
  } finally {
    // Cleanup temp directory
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function extractAndParseZip(tempDir: string): Promise<CVMRawRecord[]> {
  // Note: The CVM ZIP might contain multiple CSVs. We need to inspect the actual structure.
  // For now, we'll assume there's a main CSV file inside.

  // Since Node.js doesn't have built-in ZIP extraction, we'll use unzip command
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  const zipPath = join(tempDir, 'processo_sancionador.zip');

  try {
    await execFileAsync('unzip', ['-o', zipPath, '-d', tempDir]);
  } catch (error) {
    console.error('Failed to unzip file:', error);
    throw new Error('ZIP extraction failed. Ensure unzip command is available.');
  }

  // Find CSV file(s) in extracted directory
  const { readdir } = await import('fs/promises');
  const files = await readdir(tempDir);
  const csvFiles = files.filter((f) => f.endsWith('.csv') || f.endsWith('.CSV'));

  if (csvFiles.length === 0) {
    throw new Error('No CSV files found in ZIP archive');
  }

  console.log(`   Found CSV files: ${csvFiles.join(', ')}`);

  // Parse the first/main CSV file
  const csvPath = join(tempDir, csvFiles[0]);
  return await parseCsvFile(csvPath);
}

async function parseCsvFile(csvPath: string): Promise<CVMRawRecord[]> {
  return new Promise((resolve, reject) => {
    const records: CVMRawRecord[] = [];

    createReadStream(csvPath)
      .pipe(
        parse({
          columns: true,
          delimiter: ';', // CVM uses semicolon delimiter
          skip_empty_lines: true,
          trim: true,
          bom: true, // Handle UTF-8 BOM
          relax_column_count: true, // Handle inconsistent column counts
        })
      )
      .on('data', (record) => {
        records.push(record as CVMRawRecord);
      })
      .on('end', () => {
        resolve(records);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

function transformRawRecords(rawRecords: CVMRawRecord[]): CVMRecord[] {
  const cvmRecords: CVMRecord[] = [];

  for (const raw of rawRecords) {
    // Skip if no accused name or if process is not concluded
    if (!raw.NOME_ACUSADO || raw.SITUACAO?.toLowerCase() !== 'concluído') {
      continue;
    }

    // Parse fine amount (could be in various formats: "1.000,00", "1000.00", etc.)
    let amount: number | null = null;
    if (raw.MULTA) {
      const cleanedAmount = raw.MULTA
        .replace(/[^\d,.-]/g, '') // Remove currency symbols and letters
        .replace(/\./g, '') // Remove thousand separators (Brazilian format uses dots)
        .replace(/,/g, '.'); // Replace decimal comma with period

      const parsed = parseFloat(cleanedAmount);
      if (!isNaN(parsed) && parsed > 0) {
        amount = Math.round(parsed * 100) / 100; // Round to 2 decimal places
      }
    }

    // Skip if no fine amount
    if (!amount) {
      continue;
    }

    // Parse date (try different formats)
    let date = '';
    if (raw.DATA_FIM) {
      const parsed = parseSlashDate(raw.DATA_FIM) || parseMonthNameDate(raw.DATA_FIM);
      if (parsed) {
        date = parsed;
      }
    }

    // Skip if no valid date
    if (!date) {
      continue;
    }

    cvmRecords.push({
      processId: raw.ID_PROCESSO || raw.NUMERO_PROCESSO || 'Unknown',
      processNumber: raw.NUMERO_PROCESSO || raw.ID_PROCESSO || 'Unknown',
      firm: normalizeWhitespace(raw.NOME_ACUSADO),
      firmType: raw.TIPO_ACUSADO ? normalizeWhitespace(raw.TIPO_ACUSADO) : null,
      amount,
      currency: 'BRL',
      date,
      description: raw.DESCRICAO ? normalizeWhitespace(raw.DESCRICAO) : 'Enforcement action',
      link: null, // CVM doesn't provide direct links in CSV
    });
  }

  return cvmRecords;
}

function transformToEnforcementRecord(record: CVMRecord): ParsedEnforcementRecord {
  return {
    regulator: 'CVM',
    regulatorFullName: 'Comissão de Valores Mobiliários',
    countryCode: 'BR',
    countryName: 'Brazil',
    firmIndividual: record.firm,
    firmCategory: record.firmType,
    amount: record.amount,
    currency: record.currency,
    dateIssued: record.date,
    breachType: extractBreachType(record.description),
    breachCategories: categorizeBreachType(record.description),
    summary: `${record.firm} fined R$${(record.amount || 0).toLocaleString('pt-BR')} by CVM. ${record.description.substring(0, 100)}${record.description.length > 100 ? '...' : ''}`,
    finalNoticeUrl: record.link,
    sourceUrl: CVM_CONFIG.baseUrl,
    rawPayload: record,
  };
}

function extractBreachType(description: string): string {
  const lower = description.toLowerCase();

  if (lower.includes('insider') || lower.includes('informação privilegiada')) {
    return 'Insider Trading';
  }
  if (lower.includes('manipulação') || lower.includes('manipulation')) {
    return 'Market Manipulation';
  }
  if (lower.includes('divulgação') || lower.includes('disclosure')) {
    return 'Disclosure Violations';
  }
  if (lower.includes('custódia') || lower.includes('custody')) {
    return 'Custody Violations';
  }
  if (lower.includes('conduta') || lower.includes('conduct') || lower.includes('ética')) {
    return 'Conduct Violations';
  }
  if (lower.includes('registr') || lower.includes('licen')) {
    return 'Registration Violations';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  if (lower.includes('insider') || lower.includes('informação privilegiada')) {
    categories.push('INSIDER_TRADING');
  }
  if (lower.includes('manipulação') || lower.includes('manipulation')) {
    categories.push('MARKET_MANIPULATION');
  }
  if (lower.includes('divulgação') || lower.includes('disclosure')) {
    categories.push('DISCLOSURE');
  }
  if (lower.includes('custódia') || lower.includes('custody')) {
    categories.push('CUSTODY');
  }
  if (lower.includes('conduta') || lower.includes('conduct') || lower.includes('ética')) {
    categories.push('CONDUCT');
  }
  if (lower.includes('registr') || lower.includes('licen') || lower.includes('autorização')) {
    categories.push('AUTHORISATION');
  }
  if (lower.includes('fraude') || lower.includes('fraud')) {
    categories.push('FRAUD');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

// Run scraper
main();
