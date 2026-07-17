/**
 * FDIC (Federal Deposit Insurance Corporation — USA) Enforcement Decisions & Orders
 *
 * Strategy: The FDIC's public "Enforcement Decisions and Orders" register
 *   (https://orders.fdic.gov/s/searchform) is a Salesforce Lightning (Aura)
 *   community app — its search grid cannot be scraped from static HTML. However,
 *   the register exposes a "Download All" button that streams the entire order
 *   set as a single CSV (EDOOrders.csv). This loader renders the page with a
 *   headless browser (Playwright/Chromium), clicks "Download All", and parses
 *   the CSV. No Aura reverse-engineering is required.
 *
 * URL: https://orders.fdic.gov/s/searchform
 *
 * Difficulty: 6/10 (Medium-High) — Salesforce Aura shell, but the official CSV
 *   export sidesteps the JS grid entirely.
 * Language: English. Amounts are civil money penalties (CMP) in USD. The CSV
 *   aligns one Respondent to one CMP Amount via parallel semicolon-delimited
 *   lists, so each (order × respondent) becomes one record carrying that
 *   respondent's own penalty. A zero or blank CMP fails toward a null amount
 *   (many orders are prohibition / cease-and-desist actions with no penalty).
 *
 * Run: npx tsx scripts/scraper/scrapeFdic.ts --dry-run
 */

import "dotenv/config";
import { parse } from "csv-parse/sync";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  normalizeWhitespace,
  parsePlainAmount,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FDIC_EDOS_URL = "https://orders.fdic.gov/s/searchform";

/** One respondent under one FDIC enforcement order. */
export interface FdicOrderRow {
  orderTitle: string;
  dateIssued: string;
  respondent: string;
  cmpAmount: number | null;
  bankName: string;
  bankCity: string;
  bankState: string;
  category: string;
  actionType: string;
  docketNumber: string;
  fileUrl: string | null;
}

/** FDIC CSV dates are ISO (YYYY-MM-DD). */
export function parseFdicDate(input: string): string | null {
  const match = normalizeWhitespace(input).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** A respondent value carries no publishable identity when it is masked or redacted. */
export function isUnpublishableRespondent(value: string): boolean {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) {
    return true;
  }
  // "**********" masks, literal "Redacted", and "N/A" placeholders are anonymised
  // source rows with no real entity name — they cannot be published as a fine.
  return (
    /^\*+$/.test(cleaned) || /^(redacted|n\/a)$/i.test(cleaned)
  );
}

/**
 * The CSV joins per-respondent values with ";". Split preserves list alignment
 * for pairing against the parallel CMP Amount list; caller filters unpublishable
 * names afterwards so alignment is not broken here.
 */
function splitList(value: string): string[] {
  return value
    .split(";")
    .map((entry) => normalizeWhitespace(entry));
}

/** A CMP cell fails toward null unless it is a positive, finite figure. */
function parseCmpAmount(value: string): number | null {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned || /^(n\/a|redacted)$/i.test(cleaned)) {
    return null;
  }
  const amount = parsePlainAmount(cleaned);
  return amount !== null && amount > 0 ? amount : null;
}

function cleanCell(value: string | undefined): string {
  const cleaned = normalizeWhitespace(value ?? "").replace(/;$/, "");
  return /^n\/a$/i.test(cleaned) ? "" : cleaned;
}

/**
 * Parse the EDOOrders.csv export into one row per (order × respondent).
 * Respondent[i] is paired with CMP Amount[i]; when the CMP list is shorter
 * (or absent) the amount is null.
 */
export function parseFdicCsv(csv: string): FdicOrderRow[] {
  const records = parse(csv, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const rows: FdicOrderRow[] = [];
  let droppedRespondents = 0;
  let droppedDates = 0;

  for (const record of records) {
    const dateIssued = parseFdicDate(record["Issued Date"] ?? "");
    if (!dateIssued) {
      // A row with no issue date cannot be published; skip it (counted so a
      // future source date-format change cannot silently drop rows).
      droppedDates += 1;
      continue;
    }

    const respondents = splitList(record["Respondent"] ?? "");
    if (respondents.every((entry) => entry.length === 0)) {
      continue;
    }

    const cmpCells = (record["CMP Amount"] ?? "").split(";");
    const fileUrlRaw = cleanCell(record["File URL"]);
    const fileUrl = /^https?:\/\//i.test(fileUrlRaw) ? fileUrlRaw : null;

    respondents.forEach((respondent, index) => {
      // Skip masked/redacted respondents but keep the CMP index alignment intact.
      if (isUnpublishableRespondent(respondent)) {
        if (respondent.length > 0) {
          droppedRespondents += 1;
        }
        return;
      }

      rows.push({
        orderTitle: cleanCell(record["Order Title"]),
        dateIssued,
        respondent,
        cmpAmount: parseCmpAmount(cmpCells[index] ?? ""),
        bankName: cleanCell(record["Bank Name"]),
        bankCity: cleanCell(record["Bank City"]),
        bankState: cleanCell(record["Bank State"]),
        category: cleanCell(record["Category"]),
        actionType: cleanCell(record["Action Type"]),
        docketNumber: cleanCell(record["Docket Number"]),
        fileUrl,
      });
    });
  }

  if (droppedRespondents > 0) {
    // Anonymised rows cannot be published; log for auditability.
    console.warn(
      `FDIC: dropped ${droppedRespondents} masked/redacted respondent name(s) with no publishable identity`,
    );
  }
  if (droppedDates > 0) {
    // eslint-disable-next-line no-console
    console.warn(`FDIC: dropped ${droppedDates} row(s) with non-ISO issued dates`);
  }

  return rows;
}

export function categorizeFdicRow(row: FdicOrderRow): string[] {
  const corpus =
    `${row.actionType} ${row.orderTitle} ${row.category}`.toLowerCase();
  const categories: string[] = [];

  if (/civil money penalty|\bcmp\b|order to pay/.test(corpus)) {
    categories.push("MONETARY_SANCTION");
  }
  if (/removal|prohibition/.test(corpus)) {
    categories.push("PROHIBITION");
  }
  if (/cease and desist|c&d|pc&d/.test(corpus)) {
    categories.push("CEASE_AND_DESIST");
  }
  if (/restitution/.test(corpus)) {
    categories.push("RESTITUTION");
  }
  if (/deposit insurance|termination/.test(corpus)) {
    categories.push("DEPOSIT_INSURANCE");
  }
  if (/misrep|section 18/.test(corpus)) {
    categories.push("DISCLOSURE");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["SUPERVISORY_ACTION"];
}

function buildFdicBreachType(row: FdicOrderRow): string {
  return row.actionType || row.orderTitle || "FDIC enforcement action";
}

function buildFdicSummary(row: FdicOrderRow): string {
  const bank = row.bankName && row.bankName !== row.respondent ? row.bankName : "";
  const location = [row.bankCity, row.bankState].filter(Boolean).join(", ");
  const penalty =
    row.cmpAmount !== null
      ? ` with a civil money penalty of USD ${row.cmpAmount.toLocaleString("en-US")}`
      : "";
  const context = bank
    ? ` in connection with ${bank}${location ? ` (${location})` : ""}`
    : location
      ? ` (${location})`
      : "";
  const action = (row.actionType || row.orderTitle || "enforcement action").toLowerCase();

  return normalizeWhitespace(
    `${row.respondent}: FDIC ${action}${context}${penalty}, issued ${row.dateIssued}${
      row.docketNumber ? ` (docket ${row.docketNumber})` : ""
    }.`,
  ).slice(0, 500);
}

export function buildFdicRecord(row: FdicOrderRow): DbReadyRecord {
  return buildEuFineRecord({
    regulator: "FDIC",
    regulatorFullName: "Federal Deposit Insurance Corporation",
    countryCode: "US",
    countryName: "United States",
    firmIndividual: row.respondent,
    firmCategory: row.bankName && row.bankName === row.respondent ? "Bank" : "Institution-Affiliated Party",
    amount: row.cmpAmount,
    currency: "USD",
    dateIssued: row.dateIssued,
    breachType: buildFdicBreachType(row),
    breachCategories: categorizeFdicRow(row),
    summary: buildFdicSummary(row),
    finalNoticeUrl: row.fileUrl,
    sourceUrl: FDIC_EDOS_URL,
    // Docket + respondent gives a stable per-party key; some old orders share
    // a docket across respondents, so the respondent name disambiguates.
    dedupeKey: `${row.docketNumber || row.orderTitle}::${row.respondent}::${row.dateIssued}`,
    rawPayload: row,
  });
}

export function buildFdicRecords(rows: FdicOrderRow[]): DbReadyRecord[] {
  // Two orders can legitimately share (docket, respondent, date) after cleaning
  // (e.g. re-issued corrections); the content hash dedupes those to one row.
  const byHash = new Map<string, DbReadyRecord>();
  for (const row of rows) {
    const record = buildFdicRecord(row);
    byHash.set(record.contentHash, record);
  }

  return [...byHash.values()].sort(
    (left, right) =>
      right.dateIssued.localeCompare(left.dateIssued) ||
      left.firmIndividual.localeCompare(right.firmIndividual),
  );
}

/**
 * Render the EDOS register, click "Download All", and return the CSV text.
 * Kept in the browser context so the Salesforce guest session/token that
 * authorises the export is the one that requests it.
 */
async function downloadEdosCsv(): Promise<string> {
  const { chromium } = await import("playwright");
  const headless = process.env.SCRAPER_BROWSER_HEADLESS !== "false";
  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "en-US",
      acceptDownloads: true,
    });
    const page = await context.newPage();
    await page.goto(FDIC_EDOS_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
    // The "Download All" button is rendered by the Aura component after boot.
    await page.waitForSelector("button", { timeout: 60_000 });
    await page.waitForTimeout(6_000);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((element) =>
          /download all/i.test(element.textContent || ""),
        );
        if (!button) {
          throw new Error("FDIC EDOS 'Download All' button not found on the page.");
        }
        (button as HTMLButtonElement).click();
      }),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function loadFdicLiveRecords(): Promise<DbReadyRecord[]> {
  const csv = await downloadEdosCsv();
  if (!csv.includes("Issued Date")) {
    throw new Error("FDIC EDOS export did not contain the expected CSV header.");
  }
  const rows = parseFdicCsv(csv);
  // Completeness floor: the register holds ~11k respondent rows; a truncated
  // or throttled export must be rejected, not silently published as partial.
  if (rows.length < 5000) {
    throw new Error(
      `FDIC: Download All export looks truncated (${rows.length} rows; expected several thousand)`,
    );
  }
  return buildFdicRecords(rows);
}

export async function main() {
  await runScraper({
    name: "🇺🇸 FDIC Enforcement Decisions & Orders Scraper",
    region: "North America",
    regulatorCode: "FDIC",
    liveLoader: loadFdicLiveRecords,
    testLoader: loadFdicLiveRecords,
    // Salesforce boot can flake; a single retry is cheap versus a browser launch.
    retryOnTransientFailure: true,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FDIC scraper failed:", error);
    process.exit(1);
  });
}
