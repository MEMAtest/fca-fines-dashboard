import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const SC_BASE_URL = "https://www.sc.com.my";
const SC_ACTIONS_BASE_URL = `${SC_BASE_URL}/regulation/enforcement/actions`;

// Years to scrape (can be overridden by env var)
const YEARS_TO_SCRAPE = process.env.SC_YEARS?.split(",").map((y) => y.trim()) || [
  "2026",
  "2025",
  "2024",
  "2023",
  "2022",
];

export interface ScMalaysiaActionRow {
  date: string;
  entity: string;
  action: string;
  actionUrl: string | null;
  year: string;
}

function parseScDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

export function parseScAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "MYR",
    symbols: ["RM", "MYR"],
    keywords: ["fine", "penalty", "compound", "sanction"],
  });
}

export function parseScActionsHtml(html: string, year: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const rows: ScMalaysiaActionRow[] = [];

  // SC Malaysia uses a 6-column table:
  // No. | Nature of Misconduct | Parties Involved | Brief description | Action Taken | Date of Action
  $("table tr").each((_, element) => {
    const $el = $(element);
    const cells = $el.find("td");

    // Skip header rows and rows with fewer than 3 cells
    if (cells.length < 3 || $el.find("th").length > 0) {
      return;
    }

    // Extract data based on expected column structure
    let entity = "";
    let action = "";
    let dateStr = "";
    let actionUrl: string | null = null;

    if (cells.length >= 6) {
      // Full 6-column format
      // Column 2 (index 1): Nature of Misconduct
      const misconduct = normalizeWhitespace(cells.eq(1).text());
      // Column 3 (index 2): Parties Involved
      entity = normalizeWhitespace(cells.eq(2).text());
      // Column 4 (index 3): Brief description
      const description = normalizeWhitespace(cells.eq(3).text());
      // Column 5 (index 4): Action Taken
      action = normalizeWhitespace(cells.eq(4).text());
      // Column 6 (index 5): Date of Action
      dateStr = normalizeWhitespace(cells.eq(5).text());

      // Combine misconduct and description for full context
      if (misconduct && description) {
        action = `${misconduct}. ${description}. ${action}`;
      }
    } else if (cells.length >= 3) {
      // Fallback: assume last cell is date, second-to-last is entity
      dateStr = normalizeWhitespace(cells.eq(cells.length - 1).text());
      entity = normalizeWhitespace(cells.eq(cells.length - 2).text());
      action = normalizeWhitespace(cells.eq(cells.length - 3).text());
    }

    // Check for links in any cell
    for (let i = 0; i < cells.length; i++) {
      const link = cells.eq(i).find("a[href]").first();
      if (link.length) {
        const href = normalizeWhitespace(link.attr("href") || "");
        actionUrl = href ? makeAbsoluteUrl(pageUrl, href) : null;
        break;
      }
    }

    // Parse the date (format: "22 December 2025")
    const date = parseScDate(dateStr);

    // Skip if we couldn't parse essential fields
    if (!date || !entity) {
      return;
    }

    rows.push({
      date,
      entity,
      action: action || entity,
      actionUrl,
      year,
    });
  });

  return rows;
}

function categorizeScRecord(action: string) {
  const corpus = action.toLowerCase();
  const categories: string[] = [];

  if (/fraud|misrepresentation|false/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/disclosure|prospectus|statement/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/market|insider|manipulation/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/unlicensed|unauthorized|licence/.test(corpus)) {
    categories.push("MARKETS_SUPERVISION");
  }
  if (/aml|money laundering/.test(corpus)) {
    categories.push("AML");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildScRecords(rows: ScMalaysiaActionRow[]) {
  return rows.map((row) => {
    const summary = row.action || `SC Malaysia enforcement action against ${row.entity}`;
    const breachType = row.action || "Administrative Action";

    return buildEuFineRecord({
      regulator: "SC",
      regulatorFullName: "Securities Commission Malaysia",
      countryCode: "MY",
      countryName: "Malaysia",
      firmIndividual: row.entity,
      firmCategory: "Financial Entity",
      amount: parseScAmount(summary),
      currency: "MYR",
      dateIssued: row.date,
      breachType,
      breachCategories: categorizeScRecord(summary),
      summary,
      finalNoticeUrl: row.actionUrl,
      sourceUrl: `${SC_ACTIONS_BASE_URL}/administrative-actions/administrative-actions-in-${row.year}`,
      rawPayload: row,
    });
  });
}

export async function loadScMalaysiaLiveRecords() {
  const allRows: ScMalaysiaActionRow[] = [];

  console.log(`📅 Scraping SC Malaysia actions for years: ${YEARS_TO_SCRAPE.join(", ")}`);

  for (const year of YEARS_TO_SCRAPE) {
    const url = `${SC_ACTIONS_BASE_URL}/administrative-actions/administrative-actions-in-${year}`;

    try {
      console.log(`   Fetching ${year}...`);
      const html = await fetchText(url);
      const rows = parseScActionsHtml(html, year, url);
      allRows.push(...rows);
      console.log(`   Found ${rows.length} actions in ${year}`);

      // Be nice to the server
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.warn(`   ⚠️ Could not fetch ${year}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n📊 Total actions found: ${allRows.length}`);
  return buildScRecords(allRows);
}

export async function main() {
  await runScraper({
    name: "🇲🇾 SC Malaysia Enforcement Actions Scraper",
    region: "APAC",
    liveLoader: loadScMalaysiaLiveRecords,
    testLoader: loadScMalaysiaLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ SC Malaysia scraper failed:", error);
    process.exit(1);
  });
}
