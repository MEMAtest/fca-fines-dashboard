/**
 * AFM (Netherlands Authority for the Financial Markets) Scraper
 *
 * Strategy: RSS feed parsing with enforcement keyword filtering
 * URL: https://www.afm.nl/en/rss-feed/nieuws-professionals
 *
 * Run: DATABASE_URL="postgresql://fca_app:...@89.167.95.173:5432/fcafines?sslmode=no-verify" npx tsx scripts/scraper/scrapeAfm.ts
 */

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

const AFM_CONFIG = {
  baseUrl: 'https://www.afm.nl',
  rssUrl: 'https://www.afm.nl/en/rss-feed/nieuws-professionals',
  rateLimit: 1000,  // 1 second between requests
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
  console.log('📡 Fetching AFM RSS feed...');
  console.log(`   URL: ${AFM_CONFIG.rssUrl}`);

  const response = await fetch(AFM_CONFIG.rssUrl);
  const xmlText = await response.text();

  const parsed = await parseStringPromise(xmlText);
  const items = parsed.rss.channel[0].item || [];

  console.log(`✅ Fetched ${items.length} items from RSS feed`);

  // Filter for enforcement-related items
  const enforcementKeywords = [
    'fine', 'fines', 'fined', 'penalty', 'penalties',
    'sanction', 'sanctions', 'sanctioned',
    'ban', 'banned', 'bans',
    'enforcement', 'measure', 'disciplinary',
    'breach', 'violation', 'boete', 'boetes'
  ];

  const records: AFMRecord[] = [];

  for (const item of items) {
    const title = item.title?.[0] || '';
    const link = item.link?.[0] || '';
    const pubDateStr = item.pubDate?.[0] || '';
    const pubDate = new Date(pubDateStr);

    const titleLower = title.toLowerCase();
    const isEnforcement = enforcementKeywords.some(kw => titleLower.includes(kw));

    if (!isEnforcement) continue;

    console.log(`\n📄 Processing: ${title}`);

    // Fetch detail page
    await new Promise(resolve => setTimeout(resolve, AFM_CONFIG.rateLimit));

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
  // Pattern 1: "AFM fines [Firm] for..."
  const pattern1 = /AFM (?:fines?|sancties|sanctions?) ([^for]+) (?:for|wegens)/i;
  const match1 = title.match(pattern1);
  if (match1) {
    const candidate = validateExtractedName(match1[1].trim());
    if (candidate) return candidate;
  }

  // Pattern 2: "[Firm] fined..."
  const pattern2 = /^([A-Z][^\s]+(?:\s+[A-Z][^\s]+)*)\s+(?:fined|sanctioned)/i;
  const match2 = title.match(pattern2);
  if (match2) {
    const candidate = validateExtractedName(match2[1].trim());
    if (candidate) return candidate;
  }

  // Pattern 3: Company names (B.V., N.V., etc.)
  const pattern3 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:B\.V\.|N\.V\.|Ltd\.|Inc\.|AG|GmbH))/;
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

  // PHASE 3 FIX: Reduce fallback length from 100 to 60
  return title.slice(0, 60);
}

function extractFineAmount(title: string, html: string): number | null {
  const text = `${title} ${html}`;

  // Patterns: €300,000 or €1.600.000 (Dutch format)
  const patterns = [
    /€\s*([\d,\.]+)\s*(?:million|miljoen|mln)?/i,
    /EUR\s*([\d,\.]+)\s*(?:million|miljoen|mln)?/i,
    /([\d,\.]+)\s*euro/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Handle Dutch number format (dots as thousand separators)
      let amount = match[1].replace(/\./g, '').replace(/,/g, '');
      let numAmount = parseFloat(amount);

      // Check if in millions
      if (text.toLowerCase().includes('million') || text.toLowerCase().includes('miljoen') || text.toLowerCase().includes('mln')) {
        numAmount *= 1_000_000;
      }

      return numAmount;
    }
  }

  return null;
}

function classifyBreachType(title: string, html: string): string {
  const text = `${title} ${html}`.toLowerCase();

  if (text.includes('advertising') || text.includes('reclame')) return 'ADVERTISING_BREACH';
  if (text.includes('aml') || text.includes('wwft') || text.includes('money laundering')) return 'AML_CTF';
  if (text.includes('exam') || text.includes('fraud')) return 'FRAUD';
  if (text.includes('conduct') || text.includes('gedrag')) return 'CONDUCT';
  if (text.includes('disclosure') || text.includes('reporting')) return 'DISCLOSURE';
  if (text.includes('governance') || text.includes('bestuur')) return 'GOVERNANCE';
  if (text.includes('client') || text.includes('klant')) return 'CLIENT_PROTECTION';
  if (text.includes('license') || text.includes('vergunning')) return 'UNAUTHORIZED_ACTIVITY';

  return 'OTHER';
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
    sourceUrl: AFM_CONFIG.rssUrl,
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
