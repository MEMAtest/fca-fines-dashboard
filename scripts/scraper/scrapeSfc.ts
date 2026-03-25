/**
 * SFC (Securities and Futures Commission - Hong Kong) Enforcement Scraper
 * Source: RSS feed of press releases
 * Focuses on enforcement signals: fines, bans, sanctions
 */

import postgres from 'postgres';
import { parseStringPromise } from 'xml2js';
import crypto from 'crypto';

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

interface RssItem {
  guid: string[];
  link: string[];
  title: string[];
  pubDate: string[];
}

interface RssFeed {
  rss: {
    channel: [{
      item: RssItem[];
    }];
  };
}

function generateContentHash(regulator: string, firmIndividual: string, dateIssued: Date): string {
  const data = `${regulator}|${firmIndividual}|${dateIssued.toISOString().split('T')[0]}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function scrapeSfc() {
  console.log('🇭🇰 SFC (Hong Kong) Enforcement Actions Scraper\n');
  console.log('Target: Securities and Futures Commission - Hong Kong');
  console.log('Source: Press releases API (historical + recent)\n');

  const actions: any[] = [];
  const allItems: RssItem[] = [];

  // Strategy 1: Fetch recent RSS feed
  console.log('📄 Step 1: Fetching recent press releases from RSS feed...');
  try {
    const rssResponse = await fetch('https://www.sfc.hk/en/RSS-Feeds/Press-releases');
    const rssText = await rssResponse.text();
    const parsed: RssFeed = await parseStringPromise(rssText);
    const rssItems = parsed.rss.channel[0].item;
    allItems.push(...rssItems);
    console.log(`   ✅ Found ${rssItems.length} recent press releases\n`);
  } catch (error) {
    console.error('   ⚠️  Failed to fetch RSS feed:', error);
  }

  // Strategy 2: Fetch historical data by year (2020-2026)
  console.log('📄 Step 2: Fetching historical press releases (2020-2026)...');
  const startYear = 2020;
  const endYear = 2026;

  for (let year = startYear; year <= endYear; year++) {
    const yearShort = year.toString().slice(-2); // e.g., "20" for 2020
    console.log(`   📅 Scanning year ${year}...`);

    let found = 0;
    let consecutive404 = 0;
    const maxConsecutive404 = 10; // Stop after 10 consecutive 404s

    // Try press releases 1-200 for each year
    for (let num = 1; num <= 200; num++) {
      const refNo = `${yearShort}PR${num}`;
      const url = `https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/doc?refNo=${refNo}`;

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow'
        });

        if (response.ok) {
          // Found a valid press release
          consecutive404 = 0;
          found++;

          // Create a minimal item structure for processing
          const item: RssItem = {
            guid: [refNo],
            link: [url],
            title: [`Press release ${refNo}`], // Will be fetched later if needed
            pubDate: [new Date(year, 0, 1).toISOString()] // Placeholder date
          };

          // Check if already in allItems
          const exists = allItems.some(existing => existing.guid[0] === refNo);
          if (!exists) {
            allItems.push(item);
          }
        } else if (response.status === 404) {
          consecutive404++;
          if (consecutive404 >= maxConsecutive404) {
            break; // Stop scanning this year
          }
        }
      } catch (error) {
        // Network error or other issue, continue
      }

      // Small delay to avoid rate limiting
      if (num % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`   ✅ Year ${year}: Found ${found} press releases`);
  }

  console.log(`\n📊 Total press releases found: ${allItems.length}\n`);

  // Filter for enforcement-related items (fines, bans, sanctions, reprimands)
  console.log('📄 Step 3: Filtering for enforcement-related press releases...');
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

  const enforcementItems = allItems.filter(item => {
    const title = item.title[0].toLowerCase();
    const refNo = item.guid[0];

    // Include if title contains enforcement keywords OR if it's a PR reference
    // (we'll fetch full title later for historical items)
    return enforcementKeywords.some(keyword => title.includes(keyword)) || refNo.match(/^\d{2}PR\d+$/);
  });

  console.log(`🎯 Filtered to ${enforcementItems.length} potential enforcement press releases\n`);

  // Process each enforcement item
  for (const item of enforcementItems) {
    const title = item.title[0].trim();
    const link = item.link[0];
    const pubDate = new Date(item.pubDate[0]);
    const refNo = item.guid[0];

    console.log(`📰 Processing: ${title}`);
    console.log(`   Date: ${pubDate.toISOString().split('T')[0]}`);
    console.log(`   Link: ${link}`);

    // Extract fine amount from title if present
    const fineMatch = title.match(/\$?([\d,]+(?:\.\d+)?)\s*million/i);
    let fineAmount = null;

    if (fineMatch) {
      // Convert to numeric (in HKD millions)
      const millions = parseFloat(fineMatch[1].replace(/,/g, ''));
      fineAmount = millions * 1_000_000; // Convert to HKD
      console.log(`   💰 Fine: HK$${millions}M`);
    }

    // Extract firm/individual name from title
    // Multiple patterns to capture various title formats
    let firmIndividual = 'Unknown';

    const patterns = [
      // "SFC [action] [name] for..."
      /SFC (?:bans?|fines?|reprimands?|suspends?|prohibits?) (.+?) (?:for|and)/i,
      // "SFAT affirms [decision] against [name]"
      /SFAT affirms .+? against (.+?)(?:\s*(?:for|and|$))/i,
      // "SFAT [action] [name]"
      /SFAT (?:affirms?|upholds?|dismisses?) .+? (?:of|against|on) (.+?)(?:\s*(?:for|and|\(|$))/i,
      // "[Name] fined/banned..."
      /^([A-Z][^-]+?)\s+(?:fined|banned|reprimanded|suspended)/i,
      // "SFC and [name]"
      /SFC and (.+?) (?:enter|reach|agree)/i,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match?.[1]) {
        firmIndividual = match[1].trim();
        break;
      }
    }

    // If still Unknown, try to extract first substantial phrase before common keywords
    if (firmIndividual === 'Unknown') {
      const fallbackMatch = title.match(/^([A-Z][^:;]+?)(?:\s*(?:-|:|;|fined|banned|reprimanded))/);
      if (fallbackMatch?.[1] && fallbackMatch[1].length > 3 && fallbackMatch[1].length < 150) {
        firmIndividual = fallbackMatch[1].trim();
      }
    }

    // Determine breach type from title
    let breachType = 'Other';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('market misconduct') || titleLower.includes('market manipulation')) {
      breachType = 'Market Misconduct';
    } else if (titleLower.includes('insider') || titleLower.includes('inside information')) {
      breachType = 'Insider Dealing';
    } else if (titleLower.includes('aml') || titleLower.includes('anti-money laundering')) {
      breachType = 'AML/CTF';
    } else if (titleLower.includes('disclosure') || titleLower.includes('reporting')) {
      breachType = 'Disclosure Failures';
    } else if (titleLower.includes('misconduct')) {
      breachType = 'Misconduct';
    } else if (titleLower.includes('fraud')) {
      breachType = 'Fraud';
    }

    // Prepare action for database
    const contentHash = generateContentHash('SFC', firmIndividual, pubDate);

    const action = {
      content_hash: contentHash,
      regulator: 'SFC',
      regulator_full_name: 'Securities and Futures Commission',
      country_code: 'HK',
      country_name: 'Hong Kong',
      firm_individual: firmIndividual,
      firm_category: null, // Would need detail page scraping
      amount: fineAmount,
      currency: 'HKD',
      amount_gbp: fineAmount ? fineAmount * 0.10 : null, // Approximate HKD to GBP
      amount_eur: fineAmount ? fineAmount * 0.12 : null, // Approximate HKD to EUR
      date_issued: pubDate,
      year_issued: pubDate.getFullYear(),
      month_issued: pubDate.getMonth() + 1,
      breach_type: breachType,
      breach_categories: [breachType],
      summary: title,
      final_notice_url: link,
      source_url: link,
      raw_payload: {
        refNo,
        originalTitle: title,
        scrapedAt: new Date().toISOString()
      }
    };

    actions.push(action);
    console.log(`   ✅ Processed\n`);
  }

  // Insert into database
  console.log(`\n💾 Inserting ${actions.length} records into database...`);

  let inserted = 0;
  let skipped = 0;

  for (const action of actions) {
    try {
      await sql`
        INSERT INTO eu_fines (
          content_hash,
          regulator,
          regulator_full_name,
          country_code,
          country_name,
          firm_individual,
          firm_category,
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
          ${action.content_hash},
          ${action.regulator},
          ${action.regulator_full_name},
          ${action.country_code},
          ${action.country_name},
          ${action.firm_individual},
          ${action.firm_category},
          ${action.amount},
          ${action.currency},
          ${action.amount_eur},
          ${action.amount_gbp},
          ${action.date_issued},
          ${action.year_issued},
          ${action.month_issued},
          ${action.breach_type},
          ${action.breach_categories},
          ${action.summary},
          ${action.final_notice_url},
          ${action.source_url},
          ${sql.json(action.raw_payload)}
        )
        ON CONFLICT (content_hash) DO NOTHING
      `;
      inserted++;
      console.log(`   ✅ Inserted: ${action.firm_individual} (${action.date_issued.toISOString().split('T')[0]})`);
    } catch (error: any) {
      if (error.message?.includes('duplicate key') || error.message?.includes('content_hash')) {
        skipped++;
        console.log(`   ⏭️  Skipped (duplicate): ${action.firm_individual}`);
      } else {
        console.error(`   ❌ Error inserting ${action.firm_individual}:`, error);
        console.error(`   Full error:`, JSON.stringify(error, null, 2));
      }
    }
  }

  console.log(`\n✅ SFC scraper completed!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${actions.length}`);

  // Close connection
  await sql.end();
}

scrapeSfc().catch(error => {
  console.error('❌ Scraper failed:', error);
  process.exit(1);
});
