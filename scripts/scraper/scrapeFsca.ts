/** Official FSCA (South Africa) enforcement archive loader. */
import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
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
  if (!match || Number(match[3]) < 1900) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

type FscaExportRow = {
  Date?: unknown;
  Contravention?: unknown;
  "Respondents/Defendants"?: unknown;
  Outcome?: unknown;
  "Copy of Order"?: unknown;
  "Press Release"?: unknown;
};

/** Parse the archive's official full-workbook export (currently 600+ actions). */
export function parseFscaWorkbook(input: Buffer | Uint8Array, archiveUrl = FSCA_ARCHIVE_URL): FscaActionRow[] {
  const workbook = XLSX.read(input, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<FscaExportRow>(sheet, { defval: "" });
  const parsed = new Map<string, FscaActionRow>();
  for (const row of rows) {
    const rawDate = String(row.Date || "");
    // The official export currently carries a bounded set of rows with its
    // .NET minimum-date sentinel. Retain them in the prepared batch so the
    // shared discovery validator records them as quarantined evidence rather
    // than silently dropping official source rows.
    const dateIssued = parseFscaDate(rawDate) || (/\b0*1\/0*1\/0*001\b/.test(rawDate) ? "0001-01-01" : null);
    const contravention = normalizeWhitespace(String(row.Contravention || ""));
    const respondent = normalizeWhitespace(String(row["Respondents/Defendants"] || ""));
    const outcome = normalizeWhitespace(String(row.Outcome || ""));
    if (!dateIssued || !respondent || !outcome) continue;
    const orderHref = normalizeWhitespace(String(row["Copy of Order"] || ""));
    const pressHref = normalizeWhitespace(String(row["Press Release"] || ""));
    const key = `${dateIssued}::${respondent}::${outcome}::${contravention}`;
    parsed.set(key, {
      dateIssued,
      contravention,
      respondent,
      outcome,
      orderUrl: orderHref ? makeAbsoluteUrl(archiveUrl, orderHref) : null,
      pressReleaseUrl: pressHref ? makeAbsoluteUrl(archiveUrl, pressHref) : null,
      archiveUrl,
    });
  }
  return [...parsed.values()];
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
  // Query-string pagination on this Blazor grid returns page one repeatedly.
  // Its official Download control exposes the complete reconciled archive and
  // direct order URLs, so use that first-class export instead of partial HTML.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const reconciledRows = new Map<string, FscaActionRow>();
  try {
    // The source is served by several application instances whose export
    // caches can briefly differ during publication. Reconcile three official
    // exports and take their union; stable canonical keys keep this idempotent.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const page = await browser.newPage({ acceptDownloads: true });
      try {
        await page.goto(FSCA_ARCHIVE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector("table tbody tr", { timeout: 120_000 });
        await page.waitForTimeout(1_500);
        const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
        await page.getByRole("button", { name: "Download", exact: true }).click({ timeout: 60_000 });
        const download = await downloadPromise;
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        for (const row of parseFscaWorkbook(Buffer.concat(chunks))) {
          reconciledRows.set(`${row.dateIssued}::${row.respondent}::${row.outcome}::${row.contravention}`, row);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  const rows = [...reconciledRows.values()];
  if (!rows.length) throw new Error("FSCA official enforcement archive returned zero parseable rows");
  return buildFscaRecords(rows);
}

export async function main() {
  await runScraper({
    name: "🇿🇦 FSCA Enforcement Actions Scraper",
    region: "Africa",
    regulatorCode: "FSCA",
    liveLoader: loadFscaLiveRecords,
    testLoader: loadFscaLiveRecords,
    // A complete archive should remain comfortably above this floor. The
    // export's rare .NET minimum-date sentinels still flow through the shared
    // validator and remain reviewable quarantines.
    qualityContract: { minimumPreparedRecords: 500 },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error("❌ FSCA scraper failed:", error); process.exit(1); });
}
