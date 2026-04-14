import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FINCEN_ENFORCEMENT_URL = "https://www.fincen.gov/news/enforcement-actions";
const FINCEN_TIMEOUT_MS = Number.parseInt(
  process.env.FINCEN_TIMEOUT_MS || "120000",
  10,
);

function parseUsSlashDate(input: string) {
  const match = normalizeWhitespace(input).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1] || "0", 10);
  const day = Number.parseInt(match[2] || "0", 10);
  const year = Number.parseInt(match[3] || "0", 10);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export interface FincenEnforcementEntry {
  title: string;
  entity: string;
  dateIssued: string;
  actionUrl: string;
  matterNumber: string;
  financialInstitutionType: string;
}

export function extractFincenEntity(title: string) {
  return normalizeWhitespace(title)
    .replace(/^In the Matter of\s+/i, "")
    .replace(/\s*\[UPDATED.*?\]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFincenAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "USD",
    symbols: ["$"],
    keywords: ["civil money penalty", "penalty", "assessment", "fine"],
  });
}

export function parseFincenEnforcementHtml(
  html: string,
  pageUrl = FINCEN_ENFORCEMENT_URL,
) {
  const $ = cheerio.load(html);
  const entries: FincenEnforcementEntry[] = [];

  $("table.usa-table tbody tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 4) {
      return;
    }

    const link = cells.eq(0).find("a[href]").first();
    const title = normalizeWhitespace(link.text());
    const actionUrl = makeAbsoluteUrl(pageUrl, link.attr("href") || "");
    const dateIssued =
      normalizeWhitespace(cells.eq(1).find("time").attr("datetime") || "").slice(0, 10)
      || parseUsSlashDate(cells.eq(1).text());
    const matterNumber = normalizeWhitespace(cells.eq(2).text());
    const financialInstitutionType = normalizeWhitespace(cells.eq(3).text());

    if (!title || !actionUrl || !dateIssued) {
      return;
    }

    entries.push({
      title,
      entity: extractFincenEntity(title),
      dateIssued,
      actionUrl,
      matterNumber,
      financialInstitutionType,
    });
  });

  return entries;
}

function buildFincenSummary(entry: FincenEnforcementEntry) {
  const segments = [entry.title];
  if (entry.matterNumber) {
    segments.push(`Matter ${entry.matterNumber}`);
  }
  if (entry.financialInstitutionType) {
    segments.push(entry.financialInstitutionType);
  }
  segments.push("Official FinCEN enforcement action.");
  return segments.join(". ");
}

function buildFincenRecords(entries: FincenEnforcementEntry[]) {
  return entries.map((entry) => {
    const summary = buildFincenSummary(entry);

    return buildEuFineRecord({
      regulator: "FINCEN",
      regulatorFullName: "Financial Crimes Enforcement Network",
      countryCode: "US",
      countryName: "United States",
      firmIndividual: entry.entity,
      firmCategory: null,
      amount: parseFincenAmount(summary),
      currency: "USD",
      dateIssued: entry.dateIssued,
      breachType: "BSA/AML enforcement action",
      breachCategories: ["AML"],
      summary,
      finalNoticeUrl: entry.actionUrl,
      sourceUrl: FINCEN_ENFORCEMENT_URL,
      rawPayload: entry,
    });
  });
}

export async function loadFincenLiveRecords() {
  const html = await fetchText(FINCEN_ENFORCEMENT_URL, {
    timeout: FINCEN_TIMEOUT_MS,
  });
  const entries = parseFincenEnforcementHtml(html);
  console.log(`📊 FinCEN extracted ${entries.length} enforcement actions`);
  return buildFincenRecords(entries);
}

export async function main() {
  await runScraper({
    name: "🇺🇸 FinCEN Enforcement Actions Scraper",
    region: "North America",
    liveLoader: loadFincenLiveRecords,
    testLoader: loadFincenLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FinCEN scraper failed:", error);
    process.exit(1);
  });
}
