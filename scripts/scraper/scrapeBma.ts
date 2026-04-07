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

const BMA_BASE_URL = "https://www.bma.bm";
const BMA_ENFORCEMENT_URL = `${BMA_BASE_URL}/enforcement-action`;

export interface BmaActionRow {
  date: string;
  entity: string;
  title: string;
  actionUrl: string;
  description: string;
}

function parseBmaDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

export function parseBmaAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "BMD",
    symbols: ["BMD", "$"],
    keywords: ["fine", "penalty", "civil penalty", "sanction"],
  });
}

export function parseBmaActionsHtml(html: string, pageUrl = BMA_ENFORCEMENT_URL) {
  const $ = cheerio.load(html);
  const rows: BmaActionRow[] = [];

  // BMA lists enforcement actions with dates and descriptions
  $(".enforcement-action, .action-item, article, .press-release").each((_, element) => {
    const $el = $(element);

    const dateText = $el.find(".date, .published-date, time").text();
    const date = parseBmaDate(dateText);

    const title = normalizeWhitespace($el.find("h2, h3, .title").first().text());
    const description = normalizeWhitespace($el.find(".description, .summary, p").first().text());

    const link = $el.find("a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const actionUrl = href ? makeAbsoluteUrl(pageUrl, href) : "";

    // Extract entity name from title (e.g., "BMA imposes $900,000 fine on Acadia Life")
    const entity = extractBmaEntity(title);

    if (!entity || !date) {
      return;
    }

    rows.push({
      date,
      entity,
      title,
      actionUrl,
      description,
    });
  });

  // Also try table format
  $("table tr").each((_, element) => {
    const $el = $(element);
    const cells = $el.find("td");

    if (cells.length < 2) {
      return;
    }

    const date = parseBmaDate(cells.eq(0).text());
    const title = normalizeWhitespace(cells.eq(1).text());

    const link = cells.eq(1).find("a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const actionUrl = href ? makeAbsoluteUrl(pageUrl, href) : "";

    const entity = extractBmaEntity(title);

    if (!entity || !date) {
      return;
    }

    rows.push({
      date,
      entity,
      title,
      actionUrl,
      description: "",
    });
  });

  return rows;
}

function extractBmaEntity(title: string): string {
  // Try to extract entity name from titles like:
  // "BMA imposes $900,000 fine on Acadia Life"
  // "Civil penalty imposed on Allianz Life Bermuda Limited"
  const patterns = [
    /\bon\s+([^,]+?)(?:\s+for|\s+Limited|\s+Ltd\.?|\s*$)/i,
    /against\s+([^,]+?)(?:\s+for|\s+Limited|\s+Ltd\.?|\s*$)/i,
    /(?:Limited|Ltd\.?)\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      let entity = match[1].trim();
      // Add back "Limited" if it was part of the name
      if (title.includes(`${entity} Limited`)) {
        entity += " Limited";
      } else if (title.includes(`${entity} Ltd`)) {
        entity += " Ltd";
      }
      return entity;
    }
  }

  // Fallback: return the title
  return title;
}

function categorizeBmaRecord(title: string, description: string) {
  const corpus = `${title} ${description}`.toLowerCase();
  const categories: string[] = [];

  if (/aml|anti-money laundering|atf|terrorist financing/.test(corpus)) {
    categories.push("AML");
  }
  if (/disclosure|reporting|financial statement/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/fraud|misrepresentation/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/governance|director|management|oversight/.test(corpus)) {
    categories.push("GOVERNANCE");
  }
  if (/regulatory breach|compliance/.test(corpus)) {
    categories.push("SUPERVISORY_SANCTION");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildBmaRecords(rows: BmaActionRow[]) {
  return rows.map((row) => {
    const summary = row.description || row.title;
    const breachType = row.title || "BMA Enforcement Action";

    return buildEuFineRecord({
      regulator: "BMA",
      regulatorFullName: "Bermuda Monetary Authority",
      countryCode: "BM",
      countryName: "Bermuda",
      firmIndividual: row.entity,
      firmCategory: "Financial Entity",
      amount: parseBmaAmount(`${row.title} ${row.description}`),
      currency: "BMD",
      dateIssued: row.date,
      breachType,
      breachCategories: categorizeBmaRecord(row.title, row.description),
      summary,
      finalNoticeUrl: row.actionUrl || null,
      sourceUrl: BMA_ENFORCEMENT_URL,
      rawPayload: row,
    });
  });
}

export async function loadBmaLiveRecords() {
  console.log("📄 Fetching BMA enforcement actions...");
  const html = await fetchText(BMA_ENFORCEMENT_URL);
  const rows = parseBmaActionsHtml(html);

  console.log(`📊 Found ${rows.length} BMA enforcement actions`);
  return buildBmaRecords(rows);
}

export async function main() {
  await runScraper({
    name: "🇧🇲 BMA Enforcement Actions Scraper",
    region: "Offshore",
    liveLoader: loadBmaLiveRecords,
    testLoader: loadBmaLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ BMA scraper failed:", error);
    process.exit(1);
  });
}
