/**
 * SFC Historical Data Scraper - Fast Batch Processing
 *
 * Scans SFC press releases from 2020-2026 for enforcement actions
 * Uses concurrent requests for speed
 */

import 'dotenv/config';
import postgres from 'postgres';
import crypto from 'crypto';

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

function generateContentHash(regulator: string, firmIndividual: string, dateIssued: Date): string {
  const data = `${regulator}|${firmIndividual}|${dateIssued.toISOString().split('T')[0]}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function fetchPressRelease(refNo: string): Promise<any | null> {
  const apiUrl = `https://apps.sfc.hk/edistributionWeb/api/news/list-content?refNo=${refNo}&lang=EN`;
  const pageUrl = `https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/doc?refNo=${refNo}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) return null;

    const html = await response.text();

    // Check if content exists (not a 404 page)
    if (html.includes('not found') || html.length < 200) return null;

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' | SFC', '').trim() : '';

    // Extract date from meta tag
    const dateMetaMatch = html.match(/<meta name="date" content="([^"]+)"/i);
    let pubDate = new Date();
    if (dateMetaMatch) {
      pubDate = new Date(dateMetaMatch[1]);
    } else {
      // Fallback: extract from content
      const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4})/);
      if (dateMatch) {
        pubDate = new Date(dateMatch[1]);
      }
    }

    // Filter for enforcement keywords
    const enforcementKeywords = [
      'fine', 'fines', 'fined',
      'ban', 'bans', 'banned',
      'sanction', 'sanctions',
      'reprimand', 'reprimands',
      'penalty', 'penalties',
      'disciplinary', 'discipline',
      'prohibited', 'prohibition',
      'suspend', 'suspended', 'suspension',
      'prosecution', 'prosecuted'
    ];

    const titleLower = title.toLowerCase();
    const isEnforcement = enforcementKeywords.some(kw => titleLower.includes(kw));

    if (!isEnforcement) return null;

    return { title, url: pageUrl, pubDate, refNo };
  } catch (error) {
    return null;
  }
}

async function scrapeYear(year: number, concurrency: number = 20): Promise<any[]> {
  const yearShort = year.toString().slice(-2);
  const maxPR = 200; // Check up to PR200 for each year

  console.log(`📅 Scraping year ${year} (checking PR1-${maxPR})...`);

  const results: any[] = [];
  const promises: Promise<any>[] = [];

  for (let num = 1; num <= maxPR; num++) {
    const refNo = `${yearShort}PR${num}`;

    promises.push(
      fetchPressRelease(refNo).then(result => {
        if (result) {
          console.log(`   ✅ ${refNo}: ${result.title.substring(0, 80)}...`);
          results.push(result);
        }
        return result;
      })
    );

    // Process in batches to avoid overwhelming the server
    if (promises.length >= concurrency || num === maxPR) {
      await Promise.all(promises);
      promises.length = 0;
      await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between batches
    }
  }

  console.log(`   ✅ Found ${results.length} enforcement actions for ${year}\n`);
  return results;
}

async function scrapeSfcHistorical() {
  console.log('🇭🇰 SFC Historical Enforcement Actions Scraper\n');
  console.log('Scanning years: 2020-2026\n');

  const allActions: any[] = [];

  // Scrape each year
  for (let year = 2020; year <= 2026; year++) {
    const yearActions = await scrapeYear(year, 20);
    allActions.push(...yearActions);
  }

  console.log(`\n📊 Total enforcement actions found: ${allActions.length}\n`);

  // Process and insert into database
  console.log('💾 Processing and inserting into database...\n');

  let inserted = 0;
  let skipped = 0;

  for (const item of allActions) {
    const { title, url, pubDate, refNo } = item;

    // Extract fine amount from title
    const fineMatch = title.match(/\$?([\d,]+(?:\.\d+)?)\s*million/i);
    let fineAmount = null;

    if (fineMatch) {
      const millions = parseFloat(fineMatch[1].replace(/,/g, ''));
      fineAmount = millions * 1_000_000;
    }

    // Extract firm/individual name
    let firmIndividual = 'Unknown';
    const nameMatch = title.match(/SFC (?:bans?|fines?|reprimands?|suspends?|prohibits?) (.+?) (?:for|and)/i);
    if (nameMatch) {
      firmIndividual = nameMatch[1].trim();
    } else {
      // Fallback: use first part of title
      firmIndividual = title.split(' ')[0] + ' ' + (title.split(' ')[1] || '');
    }

    // Determine breach type
    let breachType = 'Other';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('market misconduct') || titleLower.includes('market manipulation')) {
      breachType = 'Market Misconduct';
    } else if (titleLower.includes('insider') || titleLower.includes('inside information')) {
      breachType = 'Insider Dealing';
    } else if (titleLower.includes('aml') || titleLower.includes('anti-money laundering')) {
      breachType = 'AML/CTF';
    } else if (titleLower.includes('disclosure')) {
      breachType = 'Disclosure Failures';
    } else if (titleLower.includes('misconduct')) {
      breachType = 'Misconduct';
    } else if (titleLower.includes('fraud')) {
      breachType = 'Fraud';
    }

    const contentHash = generateContentHash('SFC', firmIndividual, pubDate);

    try {
      await sql`
        INSERT INTO eu_fines (
          content_hash,
          regulator,
          regulator_full_name,
          country_code,
          country_name,
          firm_individual,
          amount,
          currency,
          amount_eur,
          amount_gbp,
          date_issued,
          year_issued,
          month_issued,
          breach_type,
          breach_categories,
          summary,
          final_notice_url,
          source_url,
          raw_payload
        ) VALUES (
          ${contentHash},
          'SFC',
          'Securities and Futures Commission',
          'HK',
          'Hong Kong',
          ${firmIndividual},
          ${fineAmount},
          'HKD',
          ${fineAmount ? fineAmount * 0.12 : null},
          ${fineAmount ? fineAmount * 0.10 : null},
          ${pubDate},
          ${pubDate.getFullYear()},
          ${pubDate.getMonth() + 1},
          ${breachType},
          ${[breachType]},
          ${title},
          ${url},
          ${url},
          ${sql.json({ refNo, scrapedAt: new Date().toISOString() })}
        )
        ON CONFLICT (content_hash) DO NOTHING
      `;
      inserted++;
      console.log(`   ✅ Inserted: ${firmIndividual.substring(0, 40)} (${pubDate.toISOString().split('T')[0]})`);
    } catch (error: any) {
      if (error.message?.includes('duplicate key') || error.message?.includes('content_hash')) {
        skipped++;
        console.log(`   ⏭️  Skipped (duplicate): ${firmIndividual.substring(0, 40)}`);
      } else {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
  }

  console.log(`\n✅ SFC historical scraper completed!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${allActions.length}`);

  await sql.end();
}

scrapeSfcHistorical().catch(error => {
  console.error('❌ Scraper failed:', error);
  process.exit(1);
});
