import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FINMA_BASE_URL = "https://www.finma.ch";
const FINMA_LIST_URL =
  "https://www.finma.ch/en/enforcement/enforcement-tools/publication-of-final-rulings/";
const FINMA_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export interface FinmaListEntry {
  name: string;
  detailUrl: string;
  dateIssued: string;
}

export interface FinmaDetail {
  rulingType: string;
  firmIndividual: string | null;
  dateIssued: string | null;
  body: string;
  summary: string;
}

function parseFinmaDate(input: string) {
  const cleaned = normalizeWhitespace(input);
  const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    return null;
  }

  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function summarizeFinmaBody(body: string) {
  const firstSentence = normalizeWhitespace(body).match(/^(.{40,320}?[.!?])(?:\s|$)/);
  return firstSentence?.[1] || normalizeWhitespace(body).slice(0, 320);
}

function categorizeFinmaRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (
    /without the necessary authorisation|without authorisation|without authorization|sans l'autorisation|autorisation nécessaire|cease and desist|unterlassungsanweisung|unauthorised|unauthorized/.test(
      normalized,
    )
  ) {
    categories.push("LICENSING");
  }
  if (/insider|market abuse|market manipulation|ad hoc|disclosure/.test(normalized)) {
    categories.push("MARKET_ABUSE");
  }
  if (/money laundering|aml|anti-money laundering/.test(normalized)) {
    categories.push("AML");
  }
  if (/governance|organisational|organizational|risk management|internal control/.test(normalized)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["ENFORCEMENT_ORDER"];
}

function inferFinmaBreachType(rulingType: string, body: string) {
  const normalized = `${rulingType} ${body}`.toLowerCase();

  if (
    /unterlassungsanweisung|cease and desist|without the necessary authorisation|sans l'autorisation|without authorization/.test(
      normalized,
    )
  ) {
    return "Cease and desist order";
  }
  if (/industry ban|berufsverbot|ban on acting/.test(normalized)) {
    return "Industry ban";
  }
  if (/market abuse|insider|market manipulation/.test(normalized)) {
    return "Market abuse ruling";
  }

  return rulingType || "Final ruling published under Article 34 FINMASA";
}

export function parseFinmaListingHtml(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const entries = new Map<string, FinmaListEntry>();

  $(".mod-filter-result .js-results tbody tr").each((_, element) => {
    const row = $(element);
    const link = row.find("td[data-title='Name'] a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const name = normalizeWhitespace(link.text());
    const dateIssued = parseFinmaDate(
      row.find("td[data-title='Ruling dated']").first().text(),
    );

    if (!href || !name || !dateIssued) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(pageUrl, href);
    entries.set(detailUrl, {
      name,
      detailUrl,
      dateIssued,
    });
  });

  return [...entries.values()];
}

export function parseFinmaDetailHtml(html: string): FinmaDetail {
  const $ = cheerio.load(html);
  const table = $("table.e-table.vertical").first();
  const fieldMap = new Map<string, string>();

  table.find("tr").each((_, element) => {
    const row = $(element);
    const key = normalizeWhitespace(row.find("th").first().text()).toLowerCase();
    const value = normalizeWhitespace(row.find("td").first().text());

    if (key && value) {
      fieldMap.set(key, value);
    }
  });

  const body = fieldMap.get("details") || "";
  return {
    rulingType:
      normalizeWhitespace($("h1").first().text())
      || normalizeWhitespace($("title").first().text().replace(/\|\s*FINMA$/i, "")),
    firmIndividual: fieldMap.get("name") || null,
    dateIssued: parseFinmaDate(fieldMap.get("ruling dated") || ""),
    body,
    summary: summarizeFinmaBody(body),
  };
}

async function requestFinmaListingHtml() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(FINMA_BROWSER_USER_AGENT);
    await page.setExtraHTTPHeaders({ "accept-language": "en-GB,en;q=0.9" });
    await page.goto(FINMA_LIST_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(
      () => document.querySelectorAll(".mod-filter-result .js-results tbody tr").length > 0,
      { timeout: 45000 },
    );
    return await page.content();
  } finally {
    await browser.close();
  }
}

async function requestFinmaDetailHtml(url: string) {
  return fetchText(url, { timeout: 60000 });
}

export async function loadFinmaEntries(limit: number | null) {
  const entries = parseFinmaListingHtml(await requestFinmaListingHtml(), FINMA_LIST_URL);
  return limit && limit > 0 ? entries.slice(0, limit) : entries;
}

async function enrichFinmaEntry(entry: FinmaListEntry) {
  const detail = parseFinmaDetailHtml(await requestFinmaDetailHtml(entry.detailUrl));
  const firmIndividual = detail.firmIndividual || entry.name;
  const textCorpus = `${detail.rulingType} ${detail.body}`;

  return buildEuFineRecord({
    regulator: "FINMA",
    regulatorFullName: "Swiss Financial Market Supervisory Authority",
    countryCode: "CH",
    countryName: "Switzerland",
    firmIndividual,
    firmCategory: "Firm or Individual",
    amount: null,
    currency: "CHF",
    dateIssued: detail.dateIssued || entry.dateIssued,
    breachType: inferFinmaBreachType(detail.rulingType, detail.body),
    breachCategories: categorizeFinmaRecord(textCorpus),
    summary: detail.summary || entry.name,
    finalNoticeUrl: entry.detailUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
    },
  });
}

export async function loadFinmaLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadFinmaEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  return mapWithConcurrency(entries, 4, enrichFinmaEntry);
}

export async function main() {
  await runScraper({
    name: "🇨🇭 FINMA Final Rulings Scraper",
    region: "Europe",
    liveLoader: loadFinmaLiveRecords,
    testLoader: loadFinmaLiveRecords,
    retryOnTransientFailure: true,
    maxRetries: 1,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FINMA scraper failed:", error);
    process.exit(1);
  });
}
