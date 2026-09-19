/** Official FSCA (South Africa) enforcement archive loader. */
import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

export const FSCA_PAGE_URL = "https://www.fsca.co.za/Enforcement-Actions";
export const FSCA_ARCHIVE_URL = "https://prod-entitysearchwebapplication.azurewebsites.net/enforcement-actions";

export interface FscaActionRow {
  dateIssued: string;
  contravention: string;
  respondent: string;
  outcome: string;
  orderUrl: string | null;
  pressReleaseUrl: string | null;
  archiveUrl: string;
}

export function parseFscaDate(input: string): string | null {
  const match = normalizeWhitespace(input).match(/(?:^|\D)(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : null;
}

/** Parses a server-rendered archive page and removes repeated Blazor SSR rows. */
export function parseFscaArchiveHtml(html: string, archiveUrl = FSCA_ARCHIVE_URL): FscaActionRow[] {
  const $ = cheerio.load(html);
  const rows = new Map<string, FscaActionRow>();
  $("table tbody tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 4) return;
    const dateIssued = parseFscaDate(cells.eq(0).text());
    const contravention = normalizeWhitespace(cells.eq(1).text());
    const respondent = normalizeWhitespace(cells.eq(2).text());
    const outcome = normalizeWhitespace(cells.eq(3).text());
    if (!dateIssued || !respondent || !outcome) return;
    const orderHref = normalizeWhitespace(cells.eq(4).find("a[href]").first().attr("href") || "");
    const pressHref = normalizeWhitespace(cells.eq(5).find("a[href]").first().attr("href") || "");
    const key = `${dateIssued}::${respondent}::${outcome}::${contravention}`;
    rows.set(key, {
      dateIssued, contravention, respondent, outcome,
      orderUrl: orderHref ? makeAbsoluteUrl(archiveUrl, orderHref) : null,
      pressReleaseUrl: pressHref ? makeAbsoluteUrl(archiveUrl, pressHref) : null,
      archiveUrl,
    });
  });
  return [...rows.values()];
}

export function parseFscaArchivePageCount(html: string): number {
  const total = Number.parseInt(normalizeWhitespace(html).match(/of\s+(\d+)\s+items/i)?.[1] || "0", 10);
  return total > 0 ? Math.ceil(total / 10) : 1;
}

export function parseFscaAmount(text: string): number | null {
  return parseLargestAmountFromText(text, { currency: "ZAR", symbols: ["R", "ZAR"], keywords: ["penalty", "fine", "administrative penalty", "amount"] });
}

function categorizeFscaAction(text: string): string[] {
  const corpus = text.toLowerCase();
  const categories: string[] = [];
  if (/debar|fit and proper|section 153/.test(corpus)) categories.push("LICENSING");
  if (/fica|money laundering|terrorist financing|aml|cft/.test(corpus)) categories.push("AML");
  if (/market abuse|insider|manipulat|disclosure|listing/.test(corpus)) categories.push("MARKET_CONDUCT");
  if (/penalty|fine|administrative/.test(corpus)) categories.push("MONETARY_SANCTION");
  return categories.length ? [...new Set(categories)] : ["SUPERVISORY_SANCTION"];
}

export function buildFscaRecord(row: FscaActionRow): DbReadyRecord {
  const evidence = `${row.contravention} ${row.outcome}`;
  return buildEuFineRecord({
    regulator: "FSCA", regulatorFullName: "Financial Sector Conduct Authority",
    countryCode: "ZA", countryName: "South Africa", firmIndividual: row.respondent,
    firmCategory: "Regulated Entity or Individual", amount: parseFscaAmount(evidence), currency: "ZAR",
    dateIssued: row.dateIssued, breachType: row.contravention || row.outcome,
    breachCategories: categorizeFscaAction(evidence),
    summary: `${row.respondent}: ${row.outcome}. ${row.contravention}`.slice(0, 500),
    finalNoticeUrl: row.orderUrl || row.pressReleaseUrl || row.archiveUrl, sourceUrl: row.archiveUrl,
    dedupeKey: `${row.dateIssued}::${row.respondent}::${row.outcome}::${row.contravention}`, rawPayload: row,
  });
}

export function buildFscaRecords(rows: FscaActionRow[]): DbReadyRecord[] {
  return rows.map(buildFscaRecord).sort((left, right) => right.dateIssued.localeCompare(left.dateIssued));
}

type HtmlLoader = (url: string) => Promise<string>;

/** Fetch archive pages; injected loaders make pagination and dedupe testable. */
export async function loadFscaPages(loadHtml: HtmlLoader = (url) => fetchText(url, { timeout: 60_000 }), maxPages = 100) {
  const rows = new Map<string, FscaActionRow>();
  let pageCount = 1;
  for (let page = 1; page <= Math.min(pageCount, maxPages); page += 1) {
    const url = page === 1 ? FSCA_ARCHIVE_URL : `${FSCA_ARCHIVE_URL}?page=${page}`;
    const html = await loadHtml(url);
    const pageRows = parseFscaArchiveHtml(html, url);
    pageCount = Math.max(pageCount, parseFscaArchivePageCount(html));
    if (page > 1 && pageRows.length === 0) break;
    const keys = pageRows.map((row) => `${row.dateIssued}::${row.respondent}::${row.outcome}::${row.contravention}`);
    const allRepeated = page > 1 && keys.length > 0 && keys.every((key) => rows.has(key));
    for (const row of pageRows) rows.set(`${row.dateIssued}::${row.respondent}::${row.outcome}::${row.contravention}`, row);
    if (allRepeated) break;
  }
  return [...rows.values()];
}

export async function loadFscaLiveRecords(): Promise<DbReadyRecord[]> {
  const rows = await loadFscaPages();
  if (!rows.length) throw new Error("FSCA official enforcement archive returned zero parseable rows");
  return buildFscaRecords(rows);
}

export async function main() {
  await runScraper({ name: "🇿🇦 FSCA Enforcement Actions Scraper", region: "Africa", regulatorCode: "FSCA", liveLoader: loadFscaLiveRecords, testLoader: loadFscaLiveRecords });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error("❌ FSCA scraper failed:", error); process.exit(1); });
}
