/**
 * Import FCA Fines from CSV/Excel
 *
 * This script allows manual import of fines data from downloaded CSV or Excel files.
 * Useful when the scraper is blocked or for bulk historical imports.
 *
 * Usage:
 *   npm run import:fines -- path/to/fines.csv
 *   npm run import:fines -- path/to/fines.xlsx
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { parse } from 'papaparse';
import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const neonUrl = process.env.NEON_FCA_FINES_URL;
const dryRun = process.argv.includes('--dry-run');
const filePath = process.argv[process.argv.length - 1];

if (!filePath || filePath.includes('importFinesFromCSV')) {
  console.error('❌ Please provide a CSV/Excel file path');
  console.error('Usage: npm run import:fines -- path/to/fines.csv');
  process.exit(1);
}

if (!neonUrl && !dryRun) {
  throw new Error('NEON_FCA_FINES_URL is required unless running in --dry-run mode');
}

interface FcaFineRecord {
  contentHash: string;
  fineReference: string | null;
  firm: string;
  firmCategory: string | null;
  amount: number;
  dateIssued: Date;
  breachType: string | null;
  breachCategories: string[];
  summary: string;
  regulator: string;
  finalNoticeUrl: string;
  rawPayload: Record<string, any>;
}

function parseDate(text: string): Date | null {
  if (!text) return null;

  // Try ISO format first
  const isoDate = new Date(text);
  if (!isNaN(isoDate.getTime())) return isoDate;

  // Try DD/MM/YYYY or DD-MM-YYYY
  const cleaned = text.replace(/(st|nd|rd|th)/gi, '').replace(/\./g, '/');
  const parts = cleaned.split(/[\/-]/).map((part) => part.trim());
  if (parts.length !== 3) return null;

  let [day, month, year] = parts;
  const yearNum = Number(year);
  if (Number.isNaN(yearNum)) return null;

  let monthNum = Number(month);
  if (Number.isNaN(monthNum)) {
    const monthMap: Record<string, number> = {
      january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
      april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
      august: 8, aug: 8, september: 9, sep: 9, october: 10, oct: 10,
      november: 11, nov: 11, december: 12, dec: 12,
    };
    monthNum = monthMap[month.toLowerCase()] || 0;
  }

  const dayNum = Number(day);
  if (!monthNum || Number.isNaN(dayNum)) return null;

  const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCurrency(text: string): number {
  if (!text) return 0;
  let multiplier = 1;
  if (/billion|bn/i.test(text)) multiplier = 1_000_000_000;
  else if (/million|m/i.test(text)) multiplier = 1_000_000;
  else if (/thousand|k/i.test(text)) multiplier = 1_000;
  const cleaned = text.replace(/[^0-9.-]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return value * multiplier;
}

const BREACH_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /money laundering|aml/i, label: 'AML' },
  { pattern: /systems? and controls?|SYSC/i, label: 'SYSTEMS_CONTROLS' },
  { pattern: /client money|cobs/i, label: 'CLIENT_MONEY' },
  { pattern: /market abuse|insider dealing|MAR/i, label: 'MARKET_ABUSE' },
  { pattern: /financial promotion|marketing/i, label: 'FINANCIAL_PROMOTIONS' },
  { pattern: /consumer duty|treating customers fairly|tcf/i, label: 'CONDUCT' },
  { pattern: /governance|oversight/i, label: 'GOVERNANCE' },
  { pattern: /reporting|regulatory reporting/i, label: 'REPORTING' },
];

function detectPrimaryBreach(text: string): string | null {
  const entry = BREACH_KEYWORDS.find((item) => item.pattern.test(text));
  return entry ? entry.label : null;
}

function detectBreachCategories(text: string): string[] {
  return BREACH_KEYWORDS.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function detectFirmCategory(text: string): string | null {
  if (/bank|lender|loan/i.test(text)) return 'Banking';
  if (/insur(er|ance)|underwriter/i.test(text)) return 'Insurance';
  if (/investment|asset manager|broker|wealth/i.test(text)) return 'Investment';
  if (/payments?|remittance|money transfer/i.test(text)) return 'Payments';
  return null;
}

function generateReference(firm: string, date: Date, amount: number): string {
  const slug = firm.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'FIRM';
  return `FCA-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}-${slug}-${Math.round(amount / 1000)}`;
}

function hashRecord(firm: string, amount: number, dateKey: string): string {
  return crypto.createHash('sha256').update(`${firm}|${amount}|${dateKey}`).digest('hex');
}

async function importFromCSV(filePath: string): Promise<FcaFineRecord[]> {
  console.log(`📂 Reading file: ${filePath}`);
  const fileContent = readFileSync(filePath, 'utf-8');

  const parsed = parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });

  if (parsed.errors.length > 0) {
    console.warn(`⚠️ CSV parsing warnings:`, parsed.errors);
  }

  const rows = parsed.data as any[];
  console.log(`📊 Found ${rows.length} rows in CSV`);

  const records: FcaFineRecord[] = [];
  let skipped = 0;

  for (const row of rows) {
    // Try to find the right columns (flexible column names)
    const firm = row['Firm/Individual'] || row['Firm'] || row['Entity'] || row['Name'] || '';
    const dateText = row['Date'] || row['Date Issued'] || row['Fine Date'] || row['Date_MM/YYYY'] || '';
    const amountText = row['Amount'] || row['Fine Amount'] || row['Amount (£)'] || row['Penalty'] || '';
    const reason = row['Summary'] || row['Reason'] || row['Description'] || row['Breach'] || '';
    const url = row['URL'] || row['Link'] || row['Final Notice URL'] || 'https://www.fca.org.uk';

    if (!firm || !dateText || !amountText) {
      skipped++;
      continue;
    }

    const dateIssued = parseDate(dateText);
    if (!dateIssued) {
      console.warn(`   ⚠️ Invalid date: ${dateText}`);
      skipped++;
      continue;
    }

    const amount = parseCurrency(amountText);
    if (amount <= 0) {
      console.warn(`   ⚠️ Invalid amount: ${amountText}`);
      skipped++;
      continue;
    }

    const summary = reason || `Fine issued`;
    const breachType = detectPrimaryBreach(summary);
    const breachCategories = detectBreachCategories(summary);
    const firmCategory = detectFirmCategory(summary);
    const fineReference = generateReference(firm, dateIssued, amount);
    const contentHash = hashRecord(firm, amount, dateIssued.toISOString().slice(0, 10));

    records.push({
      contentHash,
      fineReference,
      firm,
      firmCategory,
      amount,
      dateIssued,
      breachType,
      breachCategories,
      summary,
      regulator: row['Regulator'] || 'FCA',
      finalNoticeUrl: url,
      rawPayload: {
        source: filePath,
        originalRow: row
      }
    });
  }

  console.log(`✅ Processed ${records.length} valid records (${skipped} skipped)`);
  return records;
}

async function upsertRecords(records: FcaFineRecord[]) {
  if (!neonUrl) return;
  const sql = neon(neonUrl);

  console.log(`💾 Upserting ${records.length} records to database...`);

  for (const record of records) {
    await sql`
      INSERT INTO fca_fines (
        content_hash, fine_reference, firm_individual, firm_category,
        regulator, final_notice_url, summary, breach_type, breach_categories,
        amount, date_issued, year_issued, month_issued, raw_payload
      ) VALUES (
        ${record.contentHash}, ${record.fineReference}, ${record.firm}, ${record.firmCategory},
        ${record.regulator}, ${record.finalNoticeUrl}, ${record.summary},
        ${record.breachType}, ${JSON.stringify(record.breachCategories)},
        ${record.amount}, ${record.dateIssued.toISOString().slice(0, 10)},
        ${record.dateIssued.getUTCFullYear()}, ${record.dateIssued.getUTCMonth() + 1},
        ${JSON.stringify(record.rawPayload)}
      )
      ON CONFLICT (content_hash) DO UPDATE SET
        firm_individual = EXCLUDED.firm_individual,
        firm_category = EXCLUDED.firm_category,
        regulator = EXCLUDED.regulator,
        final_notice_url = EXCLUDED.final_notice_url,
        summary = EXCLUDED.summary,
        breach_type = EXCLUDED.breach_type,
        breach_categories = EXCLUDED.breach_categories,
        amount = EXCLUDED.amount,
        date_issued = EXCLUDED.date_issued,
        year_issued = EXCLUDED.year_issued,
        month_issued = EXCLUDED.month_issued,
        raw_payload = EXCLUDED.raw_payload;
    `;
  }

  await sql`SELECT refresh_fca_fine_trends();`;
  console.log('✅ Upsert complete.');
}

async function main() {
  console.log(`🚀 FCA Fines CSV/Excel Importer`);
  console.log(`   File: ${filePath}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE (will upsert to database)'}\n`);

  const records = await importFromCSV(filePath);

  if (dryRun) {
    console.log('\n📋 Sample records (first 10):');
    console.table(
      records.slice(0, 10).map((record) => ({
        firm: record.firm,
        amount: `£${(record.amount / 1_000_000).toFixed(2)}M`,
        issued: record.dateIssued.toISOString().slice(0, 10),
        breach: record.breachType
      }))
    );
    console.log(`\n💡 To import for real, remove --dry-run flag`);
    return;
  }

  await upsertRecords(records);
}

main().catch((error) => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
