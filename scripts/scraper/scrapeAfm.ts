/**
 * AFM (Netherlands Authority for the Financial Markets) Scraper
 *
 * Strategy: Decision page scraping from enforcement register
 * URL: https://www.afm.nl/en/sector/registers/enforcementdecisions
 *
 * Difficulty: 6-7/10 (Moderate) - Individual decision page parsing
 * Expected: ~50-100 enforcement actions
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

const AFM_CONFIG = {
  baseUrl: 'https://www.afm.nl',
  enforcementUrl: '/en/sector/registers/enforcementdecisions',
  rateLimit: 3000,  // 3 seconds (respectful for Netherlands)
  maxRetries: 3,
  maxRecords: 50,  // Limit to avoid excessive scraping
};

interface AFMRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇳🇱 AFM Enforcement Actions Scraper\n');
  console.log('Target: Netherlands Authority for the Financial Markets');
  console.log('Method: Decision page scraping\n');

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
    // Scrape real AFM page or use test data
    const records = useTestData ? getTestData() : await scrapeAfmPage();

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
    const totalAfm = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'AFM'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - AFM enforcement actions: ${totalAfm[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ AFM scraper completed successfully!');
    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ AFM scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): AFMRecord[] {
  // Test data based on known AFM enforcement actions
  return [
    {
      firm: 'ABN AMRO Bank N.V.',
      amount: 300000,
      currency: 'EUR',
      date: '2024-09-12',
      breach: 'Failure to comply with transaction monitoring requirements',
      link: 'https://www.afm.nl/en/nieuws/2024/sep/afm-fines-abn-amro-bank',
      summary: 'Inadequate AML transaction monitoring'
    },
    {
      firm: 'ING Bank N.V.',
      amount: 775000,
      currency: 'EUR',
      date: '2024-03-20',
      breach: 'MiFID II conduct of business violations',
      link: 'https://www.afm.nl/en/nieuws/2024/mar/afm-sanctions-ing-bank',
      summary: 'MiFID II compliance failures'
    },
    {
      firm: 'DEGIRO B.V.',
      amount: 400000,
      currency: 'EUR',
      date: '2023-11-08',
      breach: 'Client money protection breaches',
      link: 'https://www.afm.nl/en/nieuws/2023/nov/afm-fines-degiro',
      summary: 'Failure to protect client assets'
    },
    {
      firm: 'Rabobank',
      amount: 250000,
      currency: 'EUR',
      date: '2023-07-15',
      breach: 'Prospectus disclosure failures',
      link: 'https://www.afm.nl/en/nieuws/2023/jul/afm-sanctions-rabobank',
      summary: 'Inadequate prospectus disclosures'
    }
  ];
}

async function scrapeAfmPage(): Promise<AFMRecord[]> {
  const url = AFM_CONFIG.baseUrl + AFM_CONFIG.enforcementUrl;

  console.log('📄 Fetching AFM enforcement decisions...');
  console.log(`   URL: ${url}`);

  // Rate limiting
  await new Promise(resolve => setTimeout(resolve, AFM_CONFIG.rateLimit));

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

  // Parse enforcement decision links
  const decisionLinks: string[] = [];

  // AFM typically lists decisions in article blocks or tables
  $('article a, .decision-list a, .enforcement-item a, table a').each((i, elem) => {
    const href = $(elem).attr('href');
    if (href && (href.includes('enforcement') || href.includes('decision') || href.includes('sanction'))) {
      const fullUrl = href.startsWith('http') ? href : AFM_CONFIG.baseUrl + href;
      if (!decisionLinks.includes(fullUrl)) {
        decisionLinks.push(fullUrl);
      }
    }
  });

  console.log(`   Found ${decisionLinks.length} decision links`);

  if (decisionLinks.length === 0) {
    throw new Error('No AFM enforcement decision links were found on the live page.');
  }

  throw new Error(
    `AFM live scraping is not implemented yet. Found ${Math.min(decisionLinks.length, AFM_CONFIG.maxRecords)} candidate links but refusing to write fixture data on a live run.`
  );
}

function transformRecord(record: AFMRecord) {
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
      regulator: 'AFM',
      firm: record.firm,
      date: record.date,
      amount: record.amount
    }))
    .digest('hex');

  // Categorize breach
  const breachCategories = categorizeBreachType(record.breach);

  return {
    contentHash,
    regulator: 'AFM',
    regulatorFullName: 'Netherlands Authority for the Financial Markets',
    countryCode: 'NL',
    countryName: 'Netherlands',
    firmIndividual: record.firm,
    firmCategory: determineFirmCategory(record.firm),
    amount: record.amount,
    currency: record.currency,
    amountEur,
    amountGbp,
    dateIssued: dateIssued.toISOString().split('T')[0],
    yearIssued,
    monthIssued,
    breachType: extractBreachType(record.breach),
    breachCategories: breachCategories,
    summary: `${record.firm} fined €${(record.amount || 0).toLocaleString()} by AFM for ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: AFM_CONFIG.baseUrl + AFM_CONFIG.enforcementUrl,
    rawPayload: JSON.stringify(record)
  };
}

function determineFirmCategory(firmName: string): string {
  const lower = firmName.toLowerCase();

  if (lower.includes('bank') || lower.includes('abn') || lower.includes('ing') || lower.includes('rabobank')) {
    return 'Bank';
  }
  if (lower.includes('degiro') || lower.includes('broker')) {
    return 'Investment Firm';
  }
  if (lower.includes('insurance') || lower.includes('verzekering')) {
    return 'Insurance Company';
  }
  if (lower.includes('fund') || lower.includes('asset management')) {
    return 'Asset Manager';
  }

  return 'Financial Institution';
}

function extractBreachType(description: string): string {
  const lower = description.toLowerCase();

  // Dutch/English breach type mapping
  if (lower.includes('aml') || lower.includes('wwft') || lower.includes('anti-money laundering')) {
    return 'Anti-Money Laundering Violations';
  }
  if (lower.includes('mifid') || lower.includes('conduct of business')) {
    return 'MiFID II Violations';
  }
  if (lower.includes('prospectus') || lower.includes('disclosure')) {
    return 'Prospectus/Disclosure Failures';
  }
  if (lower.includes('client money') || lower.includes('client assets')) {
    return 'Client Asset Protection';
  }
  if (lower.includes('market abuse') || lower.includes('insider')) {
    return 'Market Abuse';
  }
  if (lower.includes('governance') || lower.includes('fit and proper')) {
    return 'Governance Failures';
  }
  if (lower.includes('transaction monitoring')) {
    return 'Transaction Monitoring Failures';
  }

  return 'Regulatory Breach';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  // Dutch to English category mapping
  if (lower.includes('aml') || lower.includes('wwft') || lower.includes('anti-money laundering')) {
    categories.push('AML');
  }
  if (lower.includes('mifid')) {
    categories.push('MIFID');
  }
  if (lower.includes('prospectus')) {
    categories.push('PROSPECTUS');
  }
  if (lower.includes('disclosure')) {
    categories.push('DISCLOSURE');
  }
  if (lower.includes('client money') || lower.includes('client assets')) {
    categories.push('CLIENT_ASSETS');
  }
  if (lower.includes('market abuse') || lower.includes('insider')) {
    categories.push('MARKET_ABUSE');
  }
  if (lower.includes('governance') || lower.includes('fit and proper')) {
    categories.push('GOVERNANCE');
  }
  if (lower.includes('conduct') || lower.includes('gedrag')) {
    categories.push('CONDUCT');
  }
  if (lower.includes('transaction monitoring')) {
    categories.push('TRANSACTION_MONITORING');
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
