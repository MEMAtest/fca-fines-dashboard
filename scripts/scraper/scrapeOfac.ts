import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
} from "./lib/euFineHelpers.js";
import { unnamedParty } from "./lib/entityName.js";
import { runScraper } from "./lib/runScraper.js";

const OFAC_BASE_URL = "https://ofac.treasury.gov";
const OFAC_CURRENT_URL = `${OFAC_BASE_URL}/civil-penalties-and-enforcement-information`;
const OFAC_TIMEOUT_MS = Number.parseInt(process.env.OFAC_TIMEOUT_MS || "120000", 10);

export interface OfacPenaltyEntry {
  entity: string;
  firmCategory: string | null;
  dateIssued: string;
  amount: number;
  aggregateCount: number;
  noticeUrl: string;
  sourceUrl: string;
}

function parseUsSlashDate(input: string) {
  const match = normalizeWhitespace(input).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number.parseInt(match[1] || "0", 10);
  const day = Number.parseInt(match[2] || "0", 10);
  const year = Number.parseInt(match[3] || "0", 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 || month > 12 || day < 1 || day > 31
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parsePositiveNumber(input: string) {
  const value = Number.parseFloat(input.replace(/[^\d.]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function ofacYearUrl(year: number, currentYear = new Date().getUTCFullYear()) {
  return year === currentYear
    ? OFAC_CURRENT_URL
    : `${OFAC_CURRENT_URL}/${year}-enforcement-information`;
}

export function parseOfacPenaltyHtml(
  html: string,
  year: number,
  pageUrl = ofacYearUrl(year),
) {
  const $ = cheerio.load(html);
  const entries: OfacPenaltyEntry[] = [];
  const expectedHeading = `${year} Civil Penalties Information Chart`;
  const table = $("h3")
    .filter((_, element) => normalizeWhitespace($(element).text()).includes(expectedHeading))
    .first()
    .nextAll("table")
    .first();

  table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;
    const dateIssued = parseUsSlashDate(cells.eq(0).text());
    const amount = parsePositiveNumber(cells.eq(3).text());
    const publishedEntity = normalizeWhitespace(cells.eq(1).text());
    if (!dateIssued || !amount || !publishedEntity) return;

    const anonymous = /^(?:an?|the) individual$/i.test(publishedEntity);
    const party = anonymous ? unnamedParty("OFAC", "individual") : null;
    const noticeHref = cells.eq(0).find("a[href]").first().attr("href") || "";
    entries.push({
      entity: party?.name ?? publishedEntity,
      firmCategory: party?.category ?? null,
      dateIssued,
      amount,
      aggregateCount: Math.max(1, Number.parseInt(cells.eq(2).text().replace(/\D/g, ""), 10) || 1),
      noticeUrl: makeAbsoluteUrl(pageUrl, noticeHref),
      sourceUrl: pageUrl,
    });
  });

  return entries;
}

export function buildOfacRecords(entries: OfacPenaltyEntry[]) {
  return entries.map((entry) => buildEuFineRecord({
    regulator: "OFAC",
    regulatorFullName: "Office of Foreign Assets Control",
    countryCode: "US",
    countryName: "United States",
    firmIndividual: entry.entity,
    firmCategory: entry.firmCategory,
    amount: entry.amount,
    currency: "USD",
    dateIssued: entry.dateIssued,
    breachType: "Economic sanctions enforcement",
    breachCategories: ["SANCTIONS"],
    summary: `${entry.entity} was subject to ${entry.aggregateCount} OFAC civil penalty, settlement, or finding of violation totalling USD ${entry.amount.toLocaleString("en-US")}.`,
    finalNoticeUrl: entry.noticeUrl,
    sourceUrl: entry.sourceUrl,
    dedupeKey: `${entry.dateIssued}|${entry.noticeUrl}`,
    rawPayload: entry,
  }));
}

export async function loadOfacLiveRecords() {
  const currentYear = new Date().getUTCFullYear();
  const years = (process.env.OFAC_YEARS || String(currentYear))
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value >= 2003 && value <= currentYear);
  const uniqueYears = [...new Set(years.length ? years : [currentYear])];
  const records: ReturnType<typeof buildOfacRecords> = [];
  for (const year of uniqueYears) {
    const url = ofacYearUrl(year, currentYear);
    const html = await fetchText(url, { timeout: OFAC_TIMEOUT_MS });
    const entries = parseOfacPenaltyHtml(html, year, url);
    console.log(`📊 OFAC ${year}: extracted ${entries.length} civil penalties and settlements`);
    records.push(...buildOfacRecords(entries));
  }
  return records;
}

export async function main() {
  await runScraper({
    name: "🇺🇸 OFAC Civil Penalties Scraper",
    regulatorCode: "OFAC",
    region: "North America",
    liveLoader: loadOfacLiveRecords,
    testLoader: loadOfacLiveRecords,
    qualityContract: {
      minimumPreparedRecords: 1,
      preparedBatchScope: "incremental",
      maximumPreparedCountDropFraction: 0.6,
    },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ OFAC scraper failed:", error);
    process.exit(1);
  });
}
