/**
 * DNB (De Nederlandsche Bank - Dutch Central Bank) Scraper
 *
 * Strategy: RSS feed parsing with enforcement keyword filtering
 * URL: https://www.dnb.nl/en/rss/16451/6882 (General news RSS feed)
 *
 * Run: npx tsx scripts/scraper/scrapeDnb.ts
 */

import 'dotenv/config';
import postgres from 'postgres';
import { parseStringPromise } from 'xml2js';
import crypto from 'crypto';
import { extractNameFromBodyText } from './lib/bodyTextExtractor.js';
import { validateExtractedName } from './lib/nameValidation.js';

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

const DNB_CONFIG = {
  baseUrl: 'https://www.dnb.nl',
  rssUrl: 'https://www.dnb.nl/en/rss/16451/6882',  // General news RSS feed
  rateLimit: 1000,  // 1 second between requests
};

interface DNBRecord {
  firm: string;
  amount: number | null;
  currency: string;
  date: string;
  breach: string;
  link: string | null;
  summary: string;
}

async function main() {
  console.log('🇳🇱 DNB Enforcement Actions Scraper\n');
  console.log('Target: De Nederlandsche Bank (Dutch Central Bank)');
  console.log('Method: Press release parsing\n');

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
    // Scrape real DNB page or use test data
    const records = useTestData ? getTestData() : await scrapeDnbPage();

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
    const totalDnb = await sql`SELECT COUNT(*) as count FROM eu_fines WHERE regulator = 'DNB'`;
    const totalAll = await sql`SELECT COUNT(*) as count FROM all_regulatory_fines`;

    console.log('\n📈 Database Summary:');
    console.log(`   - DNB enforcement actions: ${totalDnb[0].count}`);
    console.log(`   - Total regulatory fines (FCA + EU): ${totalAll[0].count}`);

    console.log('\n✅ DNB scraper completed successfully!');
    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ DNB scraper failed:', error);
    await sql.end();
    process.exit(1);
  }
}

function getTestData(): DNBRecord[] {
  // Test data based on known DNB enforcement actions
  return [
    {
      firm: 'ABN AMRO Bank N.V.',
      amount: 480000000,
      currency: 'EUR',
      date: '2024-04-19',
      breach: 'Serious shortcomings in compliance with anti-money laundering obligations',
      link: 'https://www.dnb.nl/en/news/news-2024/dnb-imposes-fine-on-abn-amro/',
      summary: 'Major AML compliance failures'
    },
    {
      firm: 'ING Bank N.V.',
      amount: 52500000,
      currency: 'EUR',
      date: '2023-09-14',
      breach: 'Inadequate prudential requirements and governance',
      link: 'https://www.dnb.nl/en/news/news-2023/dnb-fines-ing-bank/',
      summary: 'Prudential and governance failures'
    },
    {
      firm: 'Rabobank',
      amount: 15000000,
      currency: 'EUR',
      date: '2023-03-22',
      breach: 'CDD and transaction monitoring deficiencies',
      link: 'https://www.dnb.nl/en/news/news-2023/dnb-sanctions-rabobank/',
      summary: 'Customer due diligence failures'
    }
  ];
}

async function scrapeDnbPage(): Promise<DNBRecord[]> {
  console.log('📡 Fetching DNB RSS feed...');
  console.log(`   URL: ${DNB_CONFIG.rssUrl}`);

  const response = await fetch(DNB_CONFIG.rssUrl);
  const xmlText = await response.text();

  const parsed = await parseStringPromise(xmlText);
  const items = parsed.rss.channel[0].item || [];

  console.log(`✅ Fetched ${items.length} items from RSS feed`);

  // Filter for enforcement-related items
  const enforcementKeywords = [
    'fine', 'fines', 'fined', 'boete', 'boetes',
    'penalty', 'penalties',
    'sanction', 'sanctions', 'sanctioned', 'sanctie',
    'enforcement', 'handhaving',
    'maatregel',  // Dutch: enforcement measure (removed English "measure" - too broad)
    'breach', 'violation', 'overtreding'
  ];

  const records: DNBRecord[] = [];

  for (const item of items) {
    const title = item.title?.[0] || '';
    const link = item.link?.[0] || '';
    const pubDateStr = item.pubDate?.[0] || '';
    const pubDate = new Date(pubDateStr);

    const titleLower = title.toLowerCase();
    const linkLower = link.toLowerCase();

    // Filter by keywords OR URL pattern (enforcement-measures-YYYY)
    const isEnforcement = enforcementKeywords.some(kw => titleLower.includes(kw)) ||
                          linkLower.includes('/enforcement-measures-');

    if (!isEnforcement) continue;

    console.log(`\n📄 Processing: ${title}`);

    // Fetch detail page
    await new Promise(resolve => setTimeout(resolve, DNB_CONFIG.rateLimit));

    try {
      const detailResponse = await fetch(link);
      const html = await detailResponse.text();

      // Extract metadata
      const metaDescMatch = html.match(/<meta name="description" content="([^"]+)"/i);
      const description = metaDescMatch ? metaDescMatch[1] : '';

      // PHASE 3 FIX: Extract firm name with body text fallback
      const firm = extractFirmName(title, html);

      // Extract fine amount
      const amount = extractFineAmount(title, html);

      // Extract breach type
      const breach = classifyBreachType(title, html);

      records.push({
        firm,
        amount,
        currency: 'EUR',
        date: pubDate.toISOString().split('T')[0],
        breach,
        link,
        summary: description || title
      });

      console.log(`   👤 Firm: ${firm}`);
      console.log(`   💰 Amount: ${amount ? `€${amount.toLocaleString()}` : 'Not specified'}`);
      console.log(`   ⚖️  Breach: ${breach}`);
    } catch (error) {
      console.error(`   ⚠️  Failed to fetch ${link}:`, error);
    }
  }

  console.log(`\n🎯 Filtered to ${records.length} enforcement-related items`);
  return records;
}

function extractFirmName(title: string, html?: string): string {
  // Pattern 1: "DNB fines [Firm]" or "Fine imposed on [Firm]"
  const pattern1 = /(?:DNB fines?|Fine imposed on|Boete opgelegd aan)\s+([^for]+?)(?:\s+for|\s+wegens|$)/i;
  const match1 = title.match(pattern1);
  if (match1) {
    const candidate = validateExtractedName(match1[1].trim());
    if (candidate) return candidate;
  }

  // Pattern 2: Company names (B.V., N.V., etc.)
  const pattern2 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:B\.V\.|N\.V\.|Bank|Group))/;
  const match2 = title.match(pattern2);
  if (match2) {
    const candidate = validateExtractedName(match2[1].trim());
    if (candidate) return candidate;
  }

  // Pattern 3: "[Firm] fined"
  const pattern3 = /^([A-Z][^\s]+(?:\s+[A-Z][^\s]+)*)\s+fined/i;
  const match3 = title.match(pattern3);
  if (match3) {
    const candidate = validateExtractedName(match3[1].trim());
    if (candidate) return candidate;
  }

  // PHASE 3 FIX: Try body text extraction if HTML provided
  if (html) {
    const bodyExtraction = extractNameFromBodyText(html, 'nl');
    if (bodyExtraction) {
      return bodyExtraction;
    }
  }

  // PHASE 3 FIX: Return 'Unknown' instead of title fallback
  return 'Unknown';
}

function extractFineAmount(title: string, html: string): number | null {
  const text = `${title} ${html}`;

  // Patterns: €10,125 or €2.6 million (Dutch/English formats)
  const patterns = [
    /€\s*([\d,\.]+)\s*(?:million|miljoen|mln)?/i,
    /EUR\s*([\d,\.]+)\s*(?:million|miljoen|mln)?/i,
    /([\d,\.]+)\s*euro/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Handle Dutch number format (periods as thousand separators, commas as decimals)
      let amount = match[1].replace(/\./g, '').replace(/,/g, '.');
      let numAmount = parseFloat(amount);

      // Only multiply by 1M if the number is small (< 1000) AND text contains "million"
      // This prevents double-counting when amounts are already in full euros (e.g., "€3,325,000")
      if (numAmount < 1000 && (text.toLowerCase().includes('million') || text.toLowerCase().includes('miljoen') || text.toLowerCase().includes('mln'))) {
        numAmount *= 1_000_000;
      }

      return numAmount;
    }
  }

  return null;
}

function classifyBreachType(title: string, html: string): string {
  const text = `${title} ${html}`.toLowerCase();

  if (text.includes('aml') || text.includes('wwft') || text.includes('money laundering') || text.includes('witwassen')) return 'AML_CTF';
  if (text.includes('capital') || text.includes('kapitaal')) return 'CAPITAL_REQUIREMENTS';
  if (text.includes('liquidity') || text.includes('liquiditeit')) return 'LIQUIDITY';
  if (text.includes('governance') || text.includes('bestuur')) return 'GOVERNANCE';
  if (text.includes('prudential') || text.includes('prudentieel')) return 'PRUDENTIAL';
  if (text.includes('risk management') || text.includes('risicobeheer')) return 'RISK_MANAGEMENT';
  if (text.includes('reporting') || text.includes('rapportage')) return 'REPORTING';
  if (text.includes('cdd') || text.includes('customer due diligence')) return 'CDD';

  return 'OTHER';
}

function transformRecord(record: DNBRecord) {
  const dateIssued = new Date(record.date);
  const yearIssued = dateIssued.getFullYear();
  const monthIssued = dateIssued.getMonth() + 1;

  // Currency conversion
  const amountEur = record.amount;
  const amountGbp = amountEur ? Math.round(amountEur * 0.85 * 100) / 100 : null;

  // Generate content hash using link instead of firm name to avoid collisions
  // when multiple records have 'Unknown' as firm name on the same date
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      regulator: 'DNB',
      link: record.link,
      date: record.date
    }))
    .digest('hex');

  // Categorize breach
  const breachCategories = categorizeBreachType(record.breach);

  return {
    contentHash,
    regulator: 'DNB',
    regulatorFullName: 'De Nederlandsche Bank',
    countryCode: 'NL',
    countryName: 'Netherlands',
    firmIndividual: record.firm,
    firmCategory: 'Bank',  // DNB supervises banks primarily
    amount: record.amount,
    currency: record.currency,
    amountEur,
    amountGbp,
    dateIssued: dateIssued.toISOString().split('T')[0],
    yearIssued,
    monthIssued,
    breachType: extractBreachType(record.breach),
    breachCategories: breachCategories,
    summary: `${record.firm} fined €${(record.amount || 0).toLocaleString()} by DNB for ${record.summary}`,
    finalNoticeUrl: record.link,
    sourceUrl: DNB_CONFIG.rssUrl,
    rawPayload: JSON.stringify(record)
  };
}

function extractBreachType(description: string): string {
  const lower = description.toLowerCase();

  // Dutch banking supervision breach type mapping
  if (lower.includes('aml') || lower.includes('wwft') || lower.includes('anti-money laundering') || lower.includes('cdd')) {
    return 'Anti-Money Laundering Violations';
  }
  if (lower.includes('prudential') || lower.includes('capital requirements') || lower.includes('liquidity')) {
    return 'Prudential Requirements';
  }
  if (lower.includes('governance') || lower.includes('fit and proper') || lower.includes('management')) {
    return 'Governance Failures';
  }
  if (lower.includes('transaction monitoring')) {
    return 'Transaction Monitoring Failures';
  }
  if (lower.includes('customer due diligence') || lower.includes('cdd')) {
    return 'Customer Due Diligence';
  }
  if (lower.includes('reporting') || lower.includes('disclosure')) {
    return 'Reporting/Disclosure Failures';
  }
  if (lower.includes('risk management')) {
    return 'Risk Management Deficiencies';
  }

  return 'Banking Supervision Breach';
}

function categorizeBreachType(description: string): string[] {
  const categories: string[] = [];
  const lower = description.toLowerCase();

  // Dutch to English category mapping (banking focus)
  if (lower.includes('aml') || lower.includes('wwft') || lower.includes('anti-money laundering')) {
    categories.push('AML');
  }
  if (lower.includes('cdd') || lower.includes('customer due diligence')) {
    categories.push('CDD');
  }
  if (lower.includes('transaction monitoring')) {
    categories.push('TRANSACTION_MONITORING');
  }
  if (lower.includes('prudential') || lower.includes('capital')) {
    categories.push('PRUDENTIAL');
  }
  if (lower.includes('governance') || lower.includes('fit and proper')) {
    categories.push('GOVERNANCE');
  }
  if (lower.includes('risk management')) {
    categories.push('RISK_MANAGEMENT');
  }
  if (lower.includes('reporting') || lower.includes('disclosure')) {
    categories.push('REPORTING');
  }
  if (lower.includes('liquidity')) {
    categories.push('LIQUIDITY');
  }
  if (lower.includes('compliance')) {
    categories.push('COMPLIANCE');
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
