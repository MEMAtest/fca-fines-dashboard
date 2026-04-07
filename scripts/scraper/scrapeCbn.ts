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

const CBN_BASE_URL = "https://www.cbn.gov.ng";
const CBN_PRESS_RELEASES_URL = `${CBN_BASE_URL}/Out/PressRelease/PressRelease.asp`;

export interface CbnActionRow {
  date: string;
  entity: string;
  title: string;
  actionUrl: string;
  description: string;
  actionType: "license_revocation" | "sanction" | "penalty";
}

function parseCbnDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

export function parseCbnAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "NGN",
    symbols: ["₦", "N"],
    keywords: ["fine", "penalty", "sanction"],
  });
}

export function parseCbnPressReleasesHtml(html: string, pageUrl = CBN_PRESS_RELEASES_URL) {
  const $ = cheerio.load(html);
  const rows: CbnActionRow[] = [];

  // CBN enforcement actions are typically published as press releases
  // Look for press releases mentioning license revocation, sanctions, or penalties
  $(".press-release, .news-item, article, tr").each((_, element) => {
    const $el = $(element);

    // Try article/press release format
    let dateText = $el.find(".date, .published-date, time").text();
    let title = normalizeWhitespace($el.find("h2, h3, .title").first().text());
    let description = normalizeWhitespace($el.find(".description, .summary, p").first().text());

    // Try table row format
    if (!title) {
      const cells = $el.find("td");
      if (cells.length >= 2) {
        dateText = cells.eq(0).text();
        title = normalizeWhitespace(cells.eq(1).text());
      }
    }

    const date = parseCbnDate(dateText);

    const link = $el.find("a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const actionUrl = href ? makeAbsoluteUrl(pageUrl, href) : "";

    // Filter for enforcement-related press releases
    const titleLower = title.toLowerCase();
    const isEnforcement =
      titleLower.includes("revok") ||
      titleLower.includes("licence") ||
      titleLower.includes("license") ||
      titleLower.includes("sanction") ||
      titleLower.includes("penalty") ||
      titleLower.includes("fine") ||
      titleLower.includes("suspend");

    if (!isEnforcement || !date) {
      return;
    }

    // Determine action type
    let actionType: "license_revocation" | "sanction" | "penalty" = "sanction";
    if (titleLower.includes("revok")) {
      actionType = "license_revocation";
    } else if (titleLower.includes("penalty") || titleLower.includes("fine")) {
      actionType = "penalty";
    }

    // Extract entity names from title
    const entities = extractCbnEntities(title);

    for (const entity of entities) {
      rows.push({
        date,
        entity,
        title,
        actionUrl,
        description,
        actionType,
      });
    }
  });

  return rows;
}

function extractCbnEntities(title: string): string[] {
  // CBN press releases often list multiple entities
  // Examples:
  // "CBN Revokes Licences of 179 Microfinance Banks"
  // "CBN Sanctions XYZ Bank Limited"

  const entities: string[] = [];

  // Look for specific bank names
  const bankNamePattern = /([A-Z][A-Za-z\s&]+(?:Bank|Limited|Ltd|Plc))/g;
  const matches = title.match(bankNamePattern);

  if (matches) {
    entities.push(...matches.map((m) => normalizeWhitespace(m)));
  }

  // If no specific names found but it's a bulk action, use a generic entry
  if (entities.length === 0) {
    const bulkMatch = title.match(/(\d+)\s+(Microfinance Banks?|Primary Mortgage Banks?|Finance Companies|Bureau de Change)/i);
    if (bulkMatch) {
      entities.push(`${bulkMatch[1]} ${bulkMatch[2]}`);
    }
  }

  // Fallback: use title as entity
  if (entities.length === 0) {
    entities.push(title);
  }

  return entities;
}

function categorizeCbnRecord(title: string, actionType: string) {
  const corpus = `${title}`.toLowerCase();
  const categories: string[] = [];

  if (actionType === "license_revocation") {
    categories.push("MARKETS_SUPERVISION");
  }
  if (/aml|anti-money laundering/.test(corpus)) {
    categories.push("AML");
  }
  if (/capital|adequacy|undercapitalized/.test(corpus)) {
    categories.push("PRUDENTIAL");
  }
  if (/governance|director/.test(corpus)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildCbnRecords(rows: CbnActionRow[]) {
  return rows.map((row) => {
    const summary = row.description || row.title;
    const breachType = row.title || "CBN Enforcement Action";

    return buildEuFineRecord({
      regulator: "CBN",
      regulatorFullName: "Central Bank of Nigeria",
      countryCode: "NG",
      countryName: "Nigeria",
      firmIndividual: row.entity,
      firmCategory: "Financial Entity",
      amount: parseCbnAmount(`${row.title} ${row.description}`),
      currency: "NGN",
      dateIssued: row.date,
      breachType,
      breachCategories: categorizeCbnRecord(row.title, row.actionType),
      summary,
      finalNoticeUrl: row.actionUrl || null,
      sourceUrl: CBN_PRESS_RELEASES_URL,
      rawPayload: row,
    });
  });
}

export async function loadCbnLiveRecords() {
  console.log("📄 Fetching CBN enforcement data...");
  console.log("");
  console.log("⚠️ LIMITATION: CBN does not maintain a structured enforcement database");
  console.log("   License revocations and sanctions are published via press releases");
  console.log("   and require manual tracking or alternative data sources.");
  console.log("   This scraper is a placeholder pending alternative implementation.");
  console.log("");

  // CBN enforcement data is typically announced via:
  // 1. Press releases (no structured archive)
  // 2. Annual reports
  // 3. Banking supervision reports
  //
  // A production implementation would need to:
  // - Monitor press releases manually
  // - Parse annual supervision reports
  // - Use third-party aggregators
  // - Or maintain a curated dataset

  console.log("ℹ️ Returning empty dataset - CBN requires manual curation");
  console.log("   See CBN Banking Supervision Annual Reports for historical data");

  return [];
}

export async function main() {
  await runScraper({
    name: "🇳🇬 CBN Enforcement Actions Scraper",
    region: "Africa",
    liveLoader: loadCbnLiveRecords,
    testLoader: loadCbnLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CBN scraper failed:", error);
    process.exit(1);
  });
}
