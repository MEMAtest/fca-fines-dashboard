/**
 * CNMV (Comisión Nacional del Mercado de Valores - Spain) Scraper
 *
 * Strategy: Paginated HTML register scraping
 * URL: https://www.cnmv.es/portal/consultas/registrosanciones/verregsanciones?lang=en
 *
 * Difficulty: 4-5/10 (Moderate) - Static paginated register with PDF links
 * Expected: ~150-200 enforcement actions
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

const CNMV_CONFIG = {
  baseUrl: 'https://www.cnmv.es',
  registroUrl: 'https://www.cnmv.es/portal/consultas/registrosanciones/verregsanciones?lang=en',
  rateLimit: 1200,
  maxRetries: 3,
  maxRecords: 250,
};

interface CNMVRecord {
  firm: string;
  resolution: string;
  sanctionType: string;
  amount: number | null;
  currency: string;
  date: string;
  reference: string | null;
  detailUrl: string | null;
  listingUrl: string;
}

async function main() {
  console.log('🇪🇸 CNMV Enforcement Actions Scraper\n');
  console.log('Target: Comisión Nacional del Mercado de Valores (Spain)');
  console.log('Method: Paginated HTML register scraping\n');

  const useTestData = process.argv.includes('--test-data');
  const dryRun = process.argv.includes('--dry-run');

  if (useTestData) {
    console.log('⚠️  Using test data (--test-data flag detected)\n');
  }
  if (dryRun) {
    console.log('🔍 Dry run mode - no database writes (--dry-run flag detected)\n');
  }

  try {
    const records = useTestData ? getTestData() : await scrapeCnmvPage();

    console.log(`📊 Extracted ${records.length} enforcement actions`);

    const transformed = records.map((record) => transformRecord(record));

    if (dryRun) {
      console.log('\n🔍 Dry run - skipping database insert');
      console.log('Records that would be inserted:');
      transformed.forEach((record, index) => {
        console.log(`   ${index + 1}. ${record.firmIndividual} - €${(record.amount || 0).toLocaleString()} (${record.dateIssued})`);
      });
    } else {
      await upsertRecords(transformed);

      console.log('\n🔄 Refreshing unified regulatory fines view...');
      await sql`SELECT refresh_all_fines()`;
      console.log('✅ View refreshed');
    }

    const totalCnmv = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'CNMV'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - CNMV enforcement actions: ${totalCnmv[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ CNMV scraper completed successfully!');
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ CNMV scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): CNMVRecord[] {
  return [
    {
      firm: 'X (formerly Twitter)',
      resolution: 'Resolución de ejemplo sobre sanción por infracción muy grave a X (formerly Twitter).',
      sanctionType: 'Very serious infringement',
      amount: 5000000,
      currency: 'EUR',
      date: '2024-11-15',
      reference: 'S/2024/123',
      detailUrl: 'https://www.cnmv.es/webservices/verdocumento/ver?e=test1',
      listingUrl: CNMV_CONFIG.registroUrl,
    },
    {
      firm: 'Banco Santander SA',
      resolution: 'Resolución de ejemplo sobre sanción por infracción grave a Banco Santander SA.',
      sanctionType: 'Serious infringement',
      amount: 250000,
      currency: 'EUR',
      date: '2024-06-20',
      reference: 'S/2024/089',
      detailUrl: 'https://www.cnmv.es/webservices/verdocumento/ver?e=test2',
      listingUrl: CNMV_CONFIG.registroUrl,
    },
  ];
}

async function scrapeCnmvPage(): Promise<CNMVRecord[]> {
  console.log('📄 Fetching CNMV sanctions register...');

  const firstPage = await fetchCnmvPageHtml(0);
  const totalPages = extractTotalPages(firstPage.$);
  const seen = new Set<string>();
  const records: CNMVRecord[] = [];

  console.log(`   Found ${totalPages} CNMV result pages`);

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const pageData = pageIndex === 0 ? firstPage : await fetchCnmvPageHtml(pageIndex);
    const pageRecords = extractPageRecords(pageData.$, pageData.url);

    console.log(`   Page ${pageIndex + 1}/${totalPages}: ${pageRecords.length} records`);

    pageRecords.forEach((record) => {
      const key = record.detailUrl || `${record.date}|${record.firm}|${record.resolution}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      records.push(record);
    });

    if (records.length >= CNMV_CONFIG.maxRecords) {
      break;
    }

    if (pageIndex < totalPages - 1) {
      await new Promise((resolve) => setTimeout(resolve, CNMV_CONFIG.rateLimit));
    }
  }

  if (records.length === 0) {
    throw new Error('No CNMV sanctions were extracted from the live register.');
  }

  return records.slice(0, CNMV_CONFIG.maxRecords);
}

async function fetchCnmvPageHtml(pageIndex: number) {
  const url = pageIndex === 0 ? CNMV_CONFIG.registroUrl : `${CNMV_CONFIG.registroUrl}&page=${pageIndex}`;
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RegulatoryScanner/2.0)',
      'Accept': 'text/html',
      'Accept-Language': 'en-GB,en;q=0.5',
    },
    timeout: 30000,
  });

  return {
    url,
    $: cheerio.load(response.data),
  };
}

function extractTotalPages($: cheerio.CheerioAPI) {
  const text = $('#ctl00_ContentPrincipal_ctl00_lblInfoPaginacion, .PagActivaTXT').first().text().trim();
  const match = text.match(/Page\s+\d+\s+out\s+of\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

function extractPageRecords($: cheerio.CheerioAPI, pageUrl: string): CNMVRecord[] {
  const records: CNMVRecord[] = [];

  $('td[data-th="Date of incorporation into the register"]').each((_, cell) => {
    const row = $(cell).closest('tr');
    const dateLink = row.find('td[data-th="Date of incorporation into the register"] a').first();
    const resolution = normalizeText(row.find('td[data-th="Resolution"]').first().text());
    const dateText = normalizeText(dateLink.text());

    if (!resolution || !dateText) {
      return;
    }

    const detailHref = dateLink.attr('href') || null;
    const detailUrl = detailHref ? new URL(detailHref, CNMV_CONFIG.baseUrl).toString() : null;
    const firm = extractFirmFromResolution(resolution);

    if (!firm) {
      return;
    }

    records.push({
      firm,
      resolution,
      sanctionType: extractSanctionType(resolution),
      amount: extractEuroAmount(resolution),
      currency: 'EUR',
      date: parseSpanishDate(dateText),
      reference: extractReference(resolution),
      detailUrl,
      listingUrl: pageUrl,
    });
  });

  return records;
}

function parseSpanishDate(dateStr: string): string {
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    if (year < 100) {
      year += 2000;
    }

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2035) {
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  return new Date().toISOString().split('T')[0];
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractSanctionType(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes('muy grave') || lower.includes('very serious')) {
    return 'Very serious infringement';
  }
  if (lower.includes('grave') || lower.includes('serious')) {
    return 'Serious infringement';
  }
  if (lower.includes('leve') || lower.includes('minor')) {
    return 'Minor infringement';
  }

  return 'Regulatory infringement';
}

function extractReference(text: string): string | null {
  const refMatch = text.match(/S\/\d{4}\/\d+/i);
  return refMatch ? refMatch[0] : null;
}

function extractEuroAmount(text: string): number | null {
  const match = text.match(/(?:€|EUR)\s*(\d[\d.,\s]*)/i) || text.match(/(\d[\d.,\s]*)\s*(?:euros?|EUR)/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1].replace(/\./g, '').replace(/,/g, '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFirmFromResolution(resolution: string) {
  const normalized = normalizeText(resolution);
  const patterns = [
    /sanci[oó]n(?:es)?(?:\s+por\s+infracciones?)?(?:\s+\w+)*\s+a\s+(.+?)(?:\s+\(BOE|\.$)/i,
    /infracci[oó]n(?:es)?(?:\s+\w+)*\s+a\s+(.+?)(?:\s+\(BOE|\.$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const fallback = normalized.match(/a\s+([A-ZÁÉÍÓÚÑ][^.]+?)(?:\s+\(BOE|\.$)/);
  return fallback?.[1]?.trim() || null;
}

function transformRecord(record: CNMVRecord) {
  const dateIssued = new Date(record.date);
  const yearIssued = dateIssued.getFullYear();
  const monthIssued = dateIssued.getMonth() + 1;

  const amountEur = record.amount;
  const amountGbp = amountEur ? Math.round(amountEur * 0.85 * 100) / 100 : null;

  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      regulator: 'CNMV',
      firm: record.firm,
      date: record.date,
      amount: record.amount,
      detailUrl: record.detailUrl,
    }))
    .digest('hex');

  const breachCategories = categorizeBreachType(record.sanctionType);

  return {
    contentHash,
    regulator: 'CNMV',
    regulatorFullName: 'Comisión Nacional del Mercado de Valores',
    countryCode: 'ES',
    countryName: 'Spain',
    firmIndividual: record.firm,
    firmCategory: determineFirmCategory(record.firm),
    amount: record.amount,
    currency: record.currency,
    amountEur,
    amountGbp,
    dateIssued: dateIssued.toISOString().split('T')[0],
    yearIssued,
    monthIssued,
    breachType: extractBreachType(record.sanctionType),
    breachCategories,
    summary: record.resolution,
    finalNoticeUrl: record.detailUrl,
    sourceUrl: record.listingUrl,
    rawPayload: JSON.stringify(record),
  };
}

function determineFirmCategory(firmName: string): string {
  const lower = firmName.toLowerCase();

  if (lower.includes('banco') || lower.includes('bank')) {
    return 'Bank';
  }
  if (lower.includes('bbva') || lower.includes('santander') || lower.includes('caixa')) {
    return 'Major Bank';
  }
  if (lower.includes('seguros') || lower.includes('insurance')) {
    return 'Insurance Company';
  }

  return 'Financial Institution';
}

function extractBreachType(sanctionType: string): string {
  const lower = sanctionType.toLowerCase();

  if (lower.includes('very serious')) {
    return 'Very Serious Infringement';
  }
  if (lower.includes('serious')) {
    return 'Serious Infringement';
  }
  if (lower.includes('minor')) {
    return 'Minor Infringement';
  }
  if (lower.includes('crypto') || lower.includes('advertisement')) {
    return 'Crypto Advertisement Violations';
  }
  if (lower.includes('disclosure') || lower.includes('information')) {
    return 'Disclosure Failures';
  }
  if (lower.includes('market')) {
    return 'Market Conduct Violations';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(sanctionType: string): string[] {
  const categories: string[] = [];
  const lower = sanctionType.toLowerCase();

  if (lower.includes('very serious')) {
    categories.push('VERY_SERIOUS');
  }
  if (lower.includes('serious')) {
    categories.push('SERIOUS');
  }
  if (lower.includes('minor')) {
    categories.push('MINOR');
  }
  if (lower.includes('crypto') || lower.includes('advertisement')) {
    categories.push('CRYPTO_ADS');
  }
  if (lower.includes('disclosure')) {
    categories.push('DISCLOSURE');
  }
  if (lower.includes('market')) {
    categories.push('MARKET_CONDUCT');
  }
  if (lower.includes('mifid')) {
    categories.push('MIFID');
  }
  if (lower.includes('prospectus')) {
    categories.push('PROSPECTUS');
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

main();
