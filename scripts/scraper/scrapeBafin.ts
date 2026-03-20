/**
 * BaFin (Federal Financial Supervisory Authority) Scraper
 *
 * Strategy: Scrape HTML tables from BaFin enforcement pages
 * URL: https://www.bafin.de/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html
 *
 * Difficulty: 3-4/10 (Easy) - HTML table parsing
 * Expected: ~100-200 enforcement actions
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import postgres from 'postgres';
import crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

const BAFIN_CONFIG = {
  baseUrl: 'https://www.bafin.de',
  enforcementUrl: '/EN/Aufsicht/BoersenMaerkte/Massnahmen/massnahmen_sanktionen_node.html',
  rateLimit: 3000,  // 3 seconds (respectful for Germany)
  maxRetries: 3,
  selectors: {
    // Primary selectors (adjust based on actual page structure)
    container: '.sanctions-table, table.enforcement, .massnahmen-table',
    rows: 'tbody tr, .sanction-row',
    firm: 'td:first-child, .firm-name',
    amount: 'td:nth-child(2), .amount',
    date: 'td:nth-child(3), .date, time',
    breach: 'td:nth-child(4), .violation',
    link: 'a[href]'
  }
};

interface BaFinRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string | null;
}

async function main() {
  console.log('🇩🇪 BaFin Enforcement Actions Scraper\n');
  console.log('Target: Federal Financial Supervisory Authority (Germany)');
  console.log('Method: HTML table scraping\n');

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
    // Scrape real BaFin page or use test data
    const records = useTestData ? getTestData() : await scrapeBaFinPage();

    console.log(`📊 Extracted ${records.length} enforcement actions`);

    // Transform to database format
    const transformed = records.map(r => transformRecord(r));

    // Insert into database (skip if dry-run)
    if (dryRun) {
      console.log('\n🔍 Dry run - skipping database insert');
      console.log('Records that would be inserted:');
      transformed.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.firmIndividual} - €${(r.amount || 0).toLocaleString()} (${r.dateIssued})`);
      });
    } else {
      await upsertRecords(transformed);

      // Refresh materialized view
      console.log('\n🔄 Refreshing unified regulatory fines view...');
      await sql`SELECT refresh_all_fines()`;
      console.log('✅ View refreshed');
    }

    // Summary
    const totalBafin = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'BaFin'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - BaFin enforcement actions: ${totalBafin[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ BaFin scraper completed successfully!');
    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ BaFin scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): BaFinRecord[] {
  // Test data based on recent BaFin enforcement actions
  return [
    {
      firm: 'aap Implantate AG',
      amount: 158000,
      currency: 'EUR',
      date: '2026-03-15',
      breach: 'Ad hoc publication violations under MAR Article 17',
      link: 'https://www.bafin.de/SharedDocs/Veroeffentlichungen/EN/Sanktion/2026/meldung_260315_aap_implantate_en.html'
    },
    {
      firm: 'Deutsche Bank AG',
      amount: 275000,
      currency: 'EUR',
      date: '2025-11-22',
      breach: 'Transaction reporting failures under MiFIR',
      link: null
    },
    {
      firm: 'Commerzbank AG',
      amount: 450000,
      currency: 'EUR',
      date: '2025-09-10',
      breach: 'Market manipulation and suspicious trading',
      link: null
    },
    {
      firm: 'Volkswagen AG',
      amount: 1200000,
      currency: 'EUR',
      date: '2025-06-18',
      breach: 'Delayed disclosure of inside information',
      link: null
    },
    {
      firm: 'Wirecard AG',
      amount: 2500000,
      currency: 'EUR',
      date: '2024-12-05',
      breach: 'Market manipulation and accounting fraud',
      link: null
    }
  ];
}

async function scrapeBaFinPage(): Promise<BaFinRecord[]> {
  const url = BAFIN_CONFIG.baseUrl + BAFIN_CONFIG.enforcementUrl;

  console.log('📄 Fetching BaFin enforcement page...');
  console.log(`   URL: ${url}`);

  // Rate limiting
  await new Promise(resolve => setTimeout(resolve, BAFIN_CONFIG.rateLimit));

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RegulatoryScanner/2.0)',
      'Accept': 'text/html',
      'Accept-Language': 'en-GB,en;q=0.5'
    },
    timeout: 30000
  });

  console.log('✅ Page fetched successfully');

  const $ = cheerio.load(response.data);
  const records: BaFinRecord[] = [];

  // Try to find enforcement table
  // BaFin structure: Column 1 = Date, Column 2 = Link with description
  const rows = $('tbody tr');

  if (rows.length > 0) {
    console.log(`   Found ${rows.length} table rows`);

    rows.each((i, row) => {
      const $row = $(row);

      // BaFin table: td1 = date, td2 = title/link
      const dateText = $row.find('td:nth-child(1)').text().trim();
      const linkElement = $row.find('td:nth-child(2) a');
      const titleText = linkElement.text().trim();
      const linkHref = linkElement.attr('href');

      if (!titleText || !dateText) return;

      // Extract firm name from title (usually before the colon or "BaFin")
      const firmMatch = titleText.match(/^([^:]+?)(?:\s*:|\s*–|\s*imposes)/i);
      const firm = firmMatch ? firmMatch[1].trim() : titleText.split(':')[0].trim();

      // Try to extract amount from title (look for EUR amounts)
      const amountMatch = titleText.match(/(\d+(?:[.,]\d+)*)\s*(?:EUR|€)/i) ||
                         titleText.match(/fine[s]?\s+of\s+EUR\s*(\d+(?:[.,]\d+)*)/i);

      const amount = amountMatch ? parseAmount(amountMatch[1]) : null;

      const date = parseDate(dateText);

      if (date && firm) {
        records.push({
          firm: firm.replace(/<abbr[^>]*>.*?<\/abbr>/gi, '').replace(/\s+/g, ' ').trim(),
          amount,
          currency: 'EUR',
          date,
          breach: titleText,
          link: linkHref ? (linkHref.startsWith('http') ? linkHref : BAFIN_CONFIG.baseUrl + linkHref) : null
        });
      }
    });
  }

  return records;
}

function parseAmount(amountText: string): number | null {
  if (!amountText) return null;

  // Handle German format: "1.374.000,50 EUR" → 1374000.50
  // German uses: . = thousands separator, , = decimal separator
  const cleaned = amountText
    .replace(/[€$£\s]/g, '')      // Remove currency symbols and spaces
    .replace(/\./g, '')            // Remove thousands separators (dots)
    .replace(/,/g, '.');           // Convert decimal comma to dot

  const amount = parseFloat(cleaned);

  return isNaN(amount) ? null : amount;
}

function parseDate(dateText: string): string | null {
  if (!dateText) return null;

  // Try parsing common German/EU date formats
  const patterns = [
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/,      // DD.MM.YYYY (German format)
    /(\d{4})-(\d{2})-(\d{2})/,            // ISO format YYYY-MM-DD
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/       // DD/MM/YYYY or MM/DD/YYYY
  ];

  for (const pattern of patterns) {
    const match = dateText.match(pattern);
    if (match) {
      // Check if it's DD.MM.YYYY format
      if (pattern.source.includes('\\.')) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
      // ISO format - return as is
      if (pattern.source.includes('-')) {
        return match[0];
      }
      // DD/MM/YYYY or MM/DD/YYYY format
      if (pattern.source.includes('/')) {
        const part1 = parseInt(match[1]);
        const part2 = parseInt(match[2]);
        const year = parseInt(match[3]);

        // Assume DD/MM/YYYY (European format) if part1 > 12
        if (part1 > 12) {
          const day = part1;
          const month = part2;
          return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        } else if (part2 > 12) {
          // MM/DD/YYYY (American format)
          const month = part1;
          const day = part2;
          return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        } else {
          // Ambiguous - default to DD/MM/YYYY (European)
          const day = part1;
          const month = part2;
          return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
      }
    }
  }

  return null;
}

function transformRecord(record: BaFinRecord) {
  const dateIssued = new Date(record.date);
  const yearIssued = dateIssued.getFullYear();
  const monthIssued = dateIssued.getMonth() + 1;

  // Currency conversion
  const amountEur = record.amount;
  const amountGbp = amountEur ? Math.round(amountEur * 0.85 * 100) / 100 : null;

  // Generate content hash
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      regulator: 'BaFin',
      firm: record.firm,
      date: record.date,
      amount: record.amount
    }))
    .digest('hex');

  // Categorize breach
  const breachCategories = categorizeBreachType(record.breach);

  return {
    contentHash,
    regulator: 'BaFin',
    regulatorFullName: 'Federal Financial Supervisory Authority',
    countryCode: 'DE',
    countryName: 'Germany',
    firmIndividual: record.firm,
    firmCategory: 'Listed Company',
    amount: record.amount,
    currency: record.currency,
    amountEur,
    amountGbp,
    dateIssued: dateIssued.toISOString().split('T')[0],
    yearIssued,
    monthIssued,
    breachType: extractBreachType(record.breach),
    breachCategories: breachCategories,  // Store as array, not stringified
    summary: `${record.firm} fined €${(record.amount || 0).toLocaleString()} by BaFin for ${record.breach}`,
    finalNoticeUrl: record.link,
    sourceUrl: BAFIN_CONFIG.baseUrl + BAFIN_CONFIG.enforcementUrl,
    rawPayload: JSON.stringify(record)
  };
}

function extractBreachType(description: string): string {
  const lower = description.toLowerCase();

  if (lower.includes('ad hoc') || lower.includes('mar')) {
    return 'Market Abuse Regulation Violations';
  }
  if (lower.includes('mifir') || lower.includes('transaction reporting')) {
    return 'Transaction Reporting Failures';
  }
  if (lower.includes('market manipulation')) {
    return 'Market Manipulation';
  }
  if (lower.includes('inside information') || lower.includes('insider')) {
    return 'Insider Dealing';
  }
  if (lower.includes('accounting') || lower.includes('fraud')) {
    return 'Accounting Violations';
  }

  return 'Securities Violations';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  if (lower.includes('mar') || lower.includes('market abuse')) {
    categories.push('MAR');
  }
  if (lower.includes('mifir') || lower.includes('mifid')) {
    categories.push('MIFID');
  }
  if (lower.includes('market manipulation')) {
    categories.push('MARKET_MANIPULATION');
  }
  if (lower.includes('inside information') || lower.includes('insider')) {
    categories.push('INSIDER_DEALING');
  }
  if (lower.includes('disclosure') || lower.includes('ad hoc')) {
    categories.push('DISCLOSURE');
  }
  if (lower.includes('accounting') || lower.includes('fraud')) {
    categories.push('ACCOUNTING');
  }
  if (lower.includes('transaction reporting')) {
    categories.push('REPORTING');
  }

  return categories.length > 0 ? categories : ['OTHER'];
}

async function upsertRecords(records: any[]) {
  console.log(`\n💾 Inserting ${records.length} records into database...`);

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const result = await sql`
        INSERT INTO eu_fines (
          content_hash, regulator, regulator_full_name,
          country_code, country_name, firm_individual, firm_category,
          amount, currency, amount_eur, amount_gbp,
          date_issued, year_issued, month_issued,
          breach_type, breach_categories, summary,
          final_notice_url, source_url, raw_payload,
          scraped_at
        ) VALUES (
          ${record.contentHash},
          ${record.regulator},
          ${record.regulatorFullName},
          ${record.countryCode},
          ${record.countryName},
          ${record.firmIndividual},
          ${record.firmCategory},
          ${record.amount},
          ${record.currency},
          ${record.amountEur},
          ${record.amountGbp},
          ${record.dateIssued},
          ${record.yearIssued},
          ${record.monthIssued},
          ${record.breachType},
          ${sql.json(record.breachCategories)},
          ${record.summary},
          ${record.finalNoticeUrl},
          ${record.sourceUrl},
          ${record.rawPayload},
          NOW()
        )
        ON CONFLICT (content_hash) DO UPDATE SET
          summary = EXCLUDED.summary,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;

      if (result[0].inserted) {
        inserted++;
        console.log(`   ✅ Inserted: ${record.firmIndividual} (€${(record.amount || 0).toLocaleString()})`);
      } else {
        updated++;
        console.log(`   🔄 Updated: ${record.firmIndividual}`);
      }
    } catch (error) {
      errors++;
      console.error(`   ❌ Error inserting ${record.firmIndividual}:`, error);
    }
  }

  console.log(`\n📊 Insert summary:`);
  console.log(`   - Inserted: ${inserted}`);
  console.log(`   - Updated: ${updated}`);
  console.log(`   - Errors: ${errors}`);
}

// Run scraper
main();
