/**
 * Ghana SEC (Securities and Exchange Commission, Ghana) Scraper
 *
 * Strategy: Parse the official HTML tables of suspended / revoked / ceased licences.
 * URL: https://sec.gov.gh/suspension-revocation-cessation-of-licenses/
 *
 * Difficulty: 2/10 (Low) — static HTML tables (Company / Status / Effective Date).
 * Note: these are licence enforcement actions (suspension, revocation, cessation),
 *   not monetary penalties, so every record has a null amount. Dates use an English
 *   ordinal format, e.g. "8th November, 2019".
 * Language: English.
 *
 * Run: npx tsx scripts/scraper/scrapeGhanaSec.ts --dry-run
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  normalizeWhitespace,
  parseMonthNameDate,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const GHANA_SEC_URL =
  "https://sec.gov.gh/suspension-revocation-cessation-of-licenses/";

export interface GhanaSecRow {
  company: string;
  status: string;
  dateIssued: string;
}

/** Ghana dates carry ordinal suffixes ("8th November, 2019"). Strip them, then parse. */
export function parseGhanaSecDate(input: string): string | null {
  const cleaned = normalizeWhitespace(input)
    .replace(/(\d{1,2})(st|nd|rd|th)\b/i, "$1")
    .replace(/,/g, "");
  return parseMonthNameDate(cleaned);
}

export function parseGhanaSecHtml(html: string): GhanaSecRow[] {
  const $ = cheerio.load(html);
  const rows = new Map<string, GhanaSecRow>();

  $("table tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 3) {
      return;
    }

    const company = normalizeWhitespace(cells.eq(0).text());
    const status = normalizeWhitespace(cells.eq(1).text());
    const dateIssued = parseGhanaSecDate(cells.eq(2).text());

    if (!company || !dateIssued || /^company$/i.test(company)) {
      return;
    }

    const dedupeKey = `${company}::${status}::${dateIssued}`;
    rows.set(dedupeKey, { company, status, dateIssued });
  });

  return [...rows.values()];
}

export function categorizeGhanaSecStatus(status: string): string[] {
  const normalized = status.toLowerCase();
  const categories = ["LICENSING"];

  if (/revok/.test(normalized)) {
    categories.push("LICENCE_REVOCATION");
  }
  if (/suspend/.test(normalized)) {
    categories.push("LICENCE_SUSPENSION");
  }
  if (/cessation|ceased|voluntary/.test(normalized)) {
    categories.push("LICENCE_CESSATION");
  }

  return [...new Set(categories)];
}

export function buildGhanaSecRecord(row: GhanaSecRow): DbReadyRecord {
  const status = row.status || "Licence action";

  return buildEuFineRecord({
    regulator: "GHSEC",
    regulatorFullName: "Securities and Exchange Commission, Ghana",
    countryCode: "GH",
    countryName: "Ghana",
    firmIndividual: row.company,
    firmCategory: "Licensed Entity",
    amount: null,
    currency: "GHS",
    dateIssued: row.dateIssued,
    breachType: `Licence ${status.toLowerCase()}`,
    breachCategories: categorizeGhanaSecStatus(status),
    summary: `${row.company}: SEC Ghana licence ${status.toLowerCase()} effective ${row.dateIssued}.`,
    finalNoticeUrl: GHANA_SEC_URL,
    sourceUrl: GHANA_SEC_URL,
    dedupeKey: `${row.company}::${status}::${row.dateIssued}`,
    rawPayload: row,
  });
}

export function buildGhanaSecRecords(rows: GhanaSecRow[]): DbReadyRecord[] {
  return rows
    .map(buildGhanaSecRecord)
    .sort(
      (left, right) =>
        right.dateIssued.localeCompare(left.dateIssued) ||
        left.firmIndividual.localeCompare(right.firmIndividual),
    );
}

export async function loadGhanaSecLiveRecords(): Promise<DbReadyRecord[]> {
  const html = await fetchText(GHANA_SEC_URL, { timeout: 60000 });
  return buildGhanaSecRecords(parseGhanaSecHtml(html));
}

export async function main() {
  await runScraper({
    name: "🇬🇭 Ghana SEC Licence Actions Scraper",
    region: "Africa",
    regulatorCode: "GHSEC",
    liveLoader: loadGhanaSecLiveRecords,
    testLoader: loadGhanaSecLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ Ghana SEC scraper failed:", error);
    process.exit(1);
  });
}
