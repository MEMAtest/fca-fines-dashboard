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

const FINRA_BASE_URL = "https://www.finra.org";
const FINRA_ACTIONS_URL =
  "https://www.finra.org/rules-guidance/oversight-enforcement/finra-disciplinary-actions";

export interface FinraActionRow {
  caseNumber: string;
  firmIndividual: string;
  dateIssued: string;
  documentType: string;
  actionUrl: string;
  summary: string;
}

function parseFinraDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

export function parseFinraAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "USD",
    symbols: ["$"],
    keywords: ["fine", "penalty", "restitution", "disgorgement", "sanction"],
  });
}

export function parseFinraActionsHtml(html: string, pageUrl = FINRA_ACTIONS_URL) {
  const $ = cheerio.load(html);
  const rows = new Map<string, FinraActionRow>();

  // FINRA's monthly disciplinary actions page lists actions in various formats
  // This is a simplified parser that extracts from common patterns
  $("table tr, .action-item, .enforcement-action").each((_, element) => {
    const $el = $(element);

    // Try to extract case number (format: YYYY-NNNNNN)
    const caseNumberText = $el.find(".case-number, td:first-child").text();
    const caseNumber = normalizeWhitespace(caseNumberText).match(/\d{4}-\d{6}/)?.[0];

    if (!caseNumber) {
      return;
    }

    const firmIndividual = normalizeWhitespace(
      $el.find(".respondent, .firm-name, td:nth-child(2)").text()
    );

    const dateText = $el.find(".action-date, .date, td:nth-child(3)").text();
    const dateIssued = parseFinraDate(dateText);

    const documentType = normalizeWhitespace(
      $el.find(".document-type, td:nth-child(4)").text()
    );

    const link = $el.find("a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const actionUrl = href ? makeAbsoluteUrl(pageUrl, href) : "";

    const summary = normalizeWhitespace(
      $el.find(".summary, .description").text() || link.attr("title") || ""
    );

    if (!firmIndividual || !dateIssued) {
      return;
    }

    const dedupeKey = `${caseNumber}::${firmIndividual}::${dateIssued}`;

    rows.set(dedupeKey, {
      caseNumber,
      firmIndividual,
      dateIssued,
      documentType: documentType || "Disciplinary Action",
      actionUrl,
      summary,
    });
  });

  return [...rows.values()];
}

function categorizeFinraRecord(documentType: string, summary: string) {
  const corpus = `${documentType} ${summary}`.toLowerCase();
  const categories: string[] = [];

  if (/fraud|misrepresentation|false statement|misleading/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/disclosure|financial report|statement/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/market manipulation|insider trading|trading/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/supervision|supervisory|oversight/.test(corpus)) {
    categories.push("GOVERNANCE");
  }
  if (/aml|money laundering|customer due diligence/.test(corpus)) {
    categories.push("AML");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildFinraSummary(row: FinraActionRow) {
  if (row.summary) {
    return row.summary;
  }

  return `${row.firmIndividual} - FINRA ${row.documentType} (Case ${row.caseNumber})`;
}

function buildFinraRecords(rows: FinraActionRow[]) {
  return rows.map((row) => {
    const summary = buildFinraSummary(row);
    const breachType = row.documentType || "FINRA Disciplinary Action";

    return buildEuFineRecord({
      regulator: "FINRA",
      regulatorFullName: "Financial Industry Regulatory Authority",
      countryCode: "US",
      countryName: "United States",
      firmIndividual: row.firmIndividual,
      firmCategory: "Financial Entity",
      amount: parseFinraAmount(summary),
      currency: "USD",
      dateIssued: row.dateIssued,
      breachType,
      breachCategories: categorizeFinraRecord(row.documentType, summary),
      summary,
      finalNoticeUrl: row.actionUrl || null,
      sourceUrl: FINRA_ACTIONS_URL,
      rawPayload: row,
    });
  });
}

export async function loadFinraLiveRecords() {
  // FINRA publishes monthly PDF reports, but for scraping we'll target the HTML page
  // In production, this should be enhanced to scrape the searchable database
  // or parse the monthly PDF reports
  const html = await fetchText(FINRA_ACTIONS_URL);
  const rows = parseFinraActionsHtml(html);

  // FINRA's main page may have limited data, so we log a warning
  console.log(`⚠️ FINRA scraper found ${rows.length} actions from main page`);
  console.log("   For production use, implement the searchable database scraper");

  return buildFinraRecords(rows);
}

export async function main() {
  await runScraper({
    name: "🇺🇸 FINRA Disciplinary Actions Scraper",
    region: "North America",
    liveLoader: loadFinraLiveRecords,
    testLoader: loadFinraLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FINRA scraper failed:", error);
    process.exit(1);
  });
}
