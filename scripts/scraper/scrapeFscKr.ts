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

const FSC_BASE_URL = "https://www.fsc.go.kr";
const FSC_ENG_PRESS_URL = `${FSC_BASE_URL}/eng/pr010101/`;

export interface FscKrActionRow {
  date: string;
  entity: string;
  title: string;
  actionUrl: string;
  description: string;
  amount: number | null;
}

function parseFscDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

export function parseFscAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "KRW",
    symbols: ["₩", "KRW"],
    keywords: ["fine", "penalty", "sanction", "administrative fine"],
  });
}

export function parseFscPressReleasesHtml(html: string, pageUrl = FSC_ENG_PRESS_URL) {
  const $ = cheerio.load(html);
  const rows: FscKrActionRow[] = [];

  // FSC publishes English press releases
  $(".press-release, .news-item, article, .board-list tr").each((_, element) => {
    const $el = $(element);

    // Try article/press release format
    let dateText = $el.find(".date, .published-date, time, .regdate").text();
    let title = normalizeWhitespace($el.find("h2, h3, .title, .subject").first().text());
    let description = normalizeWhitespace($el.find(".description, .summary, p").first().text());

    // Try table row format (common in Korean gov sites)
    if (!title) {
      const cells = $el.find("td");
      if (cells.length >= 2) {
        // Typical format: Number | Title | Date
        title = normalizeWhitespace(cells.eq(1).text() || cells.eq(0).text());
        dateText = cells.eq(2).text() || cells.eq(cells.length - 1).text();
      }
    }

    const date = parseFscDate(dateText);

    const link = $el.find("a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const actionUrl = href ? makeAbsoluteUrl(pageUrl, href) : "";

    // Filter for enforcement/sanction-related press releases
    const titleLower = title.toLowerCase();
    const isEnforcement =
      titleLower.includes("sanction") ||
      titleLower.includes("penalty") ||
      titleLower.includes("fine") ||
      titleLower.includes("administrative action") ||
      titleLower.includes("disciplinary") ||
      titleLower.includes("enforcement");

    if (!isEnforcement || !date || !title) {
      return;
    }

    // Extract entity name from title
    const entity = extractFscEntity(title);

    // Try to parse amount from title/description
    const amount = parseFscAmount(`${title} ${description}`);

    rows.push({
      date,
      entity,
      title,
      actionUrl,
      description,
      amount,
    });
  });

  return rows;
}

function extractFscEntity(title: string): string {
  // FSC press releases typically name the entity
  // Examples:
  // "FSC Imposes Administrative Sanctions on ABC Securities"
  // "Administrative Fine Imposed on XYZ Bank"

  const patterns = [
    /\bon\s+([A-Z][A-Za-z\s&]+?)(?:\s+for|\s+in\s+connection|$)/i,
    /against\s+([A-Z][A-Za-z\s&]+?)(?:\s+for|\s+in\s+connection|$)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: look for capitalized words that might be entity names
  const capitalizedWords = title.match(/[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*/g);
  if (capitalizedWords && capitalizedWords.length > 0) {
    // Filter out common non-entity words
    const filtered = capitalizedWords.filter(
      (w) =>
        !["FSC", "Financial", "Services", "Commission", "Korea", "Administrative", "Action"].includes(w)
    );
    if (filtered.length > 0) {
      return filtered[0];
    }
  }

  return "Financial Entity";
}

function categorizeFscRecord(title: string, description: string) {
  const corpus = `${title} ${description}`.toLowerCase();
  const categories: string[] = [];

  if (/market manipulation|insider trading|unfair trading/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/disclosure|financial report|reporting/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/fraud|misrepresentation/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/governance|director/.test(corpus)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildFscRecords(rows: FscKrActionRow[]) {
  return rows.map((row) => {
    const summary = row.description || row.title;
    const breachType = row.title || "FSC Administrative Sanction";

    return buildEuFineRecord({
      regulator: "FSC-KR",
      regulatorFullName: "Financial Services Commission (Korea)",
      countryCode: "KR",
      countryName: "South Korea",
      firmIndividual: row.entity,
      firmCategory: "Financial Entity",
      amount: row.amount,
      currency: "KRW",
      dateIssued: row.date,
      breachType,
      breachCategories: categorizeFscRecord(row.title, row.description),
      summary,
      finalNoticeUrl: row.actionUrl || null,
      sourceUrl: FSC_ENG_PRESS_URL,
      rawPayload: row,
    });
  });
}

export async function loadFscKrLiveRecords() {
  console.log("📄 Fetching FSC Korea press releases...");
  console.log("ℹ️ Scraping English press releases - Korean site may have more data");
  console.log("");
  console.log("⚠️ LIMITATION: FSC Korea's enforcement data is not readily available");
  console.log("   in a structured English format. The Korean site (fss.or.kr) has");
  console.log("   comprehensive data but requires Korean language parsing.");
  console.log("   This scraper is a placeholder pending Korean site implementation.");
  console.log("");

  try {
    const html = await fetchText(FSC_ENG_PRESS_URL);
    const rows = parseFscPressReleasesHtml(html);

    console.log(`📊 Found ${rows.length} FSC enforcement actions from English sources`);

    if (rows.length === 0) {
      console.log("ℹ️ No enforcement-specific press releases found in English");
      console.log("   This is expected - most enforcement data is on the Korean site");
    }

    return buildFscRecords(rows);
  } catch (error) {
    console.warn(`⚠️ Could not fetch FSC press releases: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("   FSC Korea may require Korean language scraper or API access");
    return [];
  }
}

export async function main() {
  await runScraper({
    name: "🇰🇷 FSC Korea Enforcement Actions Scraper",
    region: "APAC",
    liveLoader: loadFscKrLiveRecords,
    testLoader: loadFscKrLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FSC Korea scraper failed:", error);
    process.exit(1);
  });
}
