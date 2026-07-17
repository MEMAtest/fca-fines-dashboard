/**
 * IoM FSA (Isle of Man Financial Services Authority) Scraper
 *
 * Strategy: The enforcement-action page renders a single HTML table (Name /
 *   Gross penalty / Net penalty / Press release / Date / description / legislation).
 *   The site's WAF returns "Request Rejected" to plain HTTP (axios/curl), so a real
 *   browser is required — this scraper uses Playwright/Chromium.
 *
 * URL: https://www.iomfsa.im/enforcement/enforcement-action/
 *
 * Difficulty: 4/10 (Medium) — clean table, but Playwright-only due to the WAF.
 * Language: English. Amounts are in GBP (£). "Gross amount of penalty imposed" is
 *   used as the headline amount (the net figure reflects early-settlement discount).
 *
 * Run: npx tsx scripts/scraper/scrapeIomfsa.ts --dry-run
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parsePlainAmount,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { createPlaywrightHtmlClient } from "./lib/playwrightFetch.js";
import { runScraper } from "./lib/runScraper.js";

const IOMFSA_URL = "https://www.iomfsa.im/enforcement/enforcement-action/";

export interface IomfsaRow {
  name: string;
  grossPenalty: number | null;
  netPenalty: number | null;
  pressReleaseUrl: string | null;
  dateIssued: string;
  description: string;
  legislation: string;
  regulations: string;
}

/** IoM press-release dates are DD/MM/YYYY. */
export function parseIomfsaDate(input: string): string | null {
  const match = normalizeWhitespace(input).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseGbpCell(text: string): number | null {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned || !/£|\d/.test(cleaned)) {
    return null;
  }
  return parsePlainAmount(cleaned.replace(/£/g, ""));
}

export function parseIomfsaHtml(html: string, pageUrl = IOMFSA_URL): IomfsaRow[] {
  const $ = cheerio.load(html);
  const rows: IomfsaRow[] = [];

  $("table tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 5) {
      return;
    }

    const name = normalizeWhitespace(cells.eq(0).text());
    const dateIssued = parseIomfsaDate(cells.eq(4).text());

    // Skip the header row and any row without a usable name/date.
    if (!name || !dateIssued || /gross amount|^name$/i.test(name)) {
      return;
    }

    const pressReleaseHref = normalizeWhitespace(
      cells.eq(3).find("a[href]").first().attr("href") || "",
    );

    rows.push({
      name,
      grossPenalty: parseGbpCell(cells.eq(1).text()),
      netPenalty: parseGbpCell(cells.eq(2).text()),
      pressReleaseUrl: pressReleaseHref
        ? makeAbsoluteUrl(pageUrl, pressReleaseHref)
        : null,
      dateIssued,
      description: normalizeWhitespace(cells.eq(5)?.text() || ""),
      legislation: normalizeWhitespace(cells.eq(6)?.text() || ""),
      regulations: normalizeWhitespace(cells.eq(7)?.text() || ""),
    });
  });

  return rows;
}

export function categorizeIomfsaRow(row: IomfsaRow): string[] {
  const corpus = `${row.legislation} ${row.regulations} ${row.description}`.toLowerCase();
  const categories: string[] = [];

  if (/money laundering|financing of terrorism|aml|cft|proceeds of crime/.test(corpus)) {
    categories.push("AML");
  }
  if (/financial services act|civil penalt/.test(corpus)) {
    categories.push("CONDUCT");
  }

  categories.push("MONETARY_SANCTION");
  return [...new Set(categories)];
}

export function buildIomfsaRecord(row: IomfsaRow): DbReadyRecord {
  const legislation = row.legislation || "the Isle of Man civil-penalty regime";

  return buildEuFineRecord({
    regulator: "IOMFSA",
    regulatorFullName: "Isle of Man Financial Services Authority",
    countryCode: "IM",
    countryName: "Isle of Man",
    firmIndividual: row.name,
    firmCategory: "Regulated/Designated Entity or Individual",
    amount: row.grossPenalty,
    currency: "GBP",
    dateIssued: row.dateIssued,
    breachType: `Civil penalty under ${legislation}`,
    breachCategories: categorizeIomfsaRow(row),
    summary: `${row.name} received an IoM FSA civil penalty${
      row.grossPenalty ? ` of £${row.grossPenalty.toLocaleString("en-GB")}` : ""
    }${row.netPenalty ? ` (£${row.netPenalty.toLocaleString("en-GB")} net after discount)` : ""} under ${legislation}.`,
    finalNoticeUrl: row.pressReleaseUrl,
    sourceUrl: IOMFSA_URL,
    dedupeKey: `${row.name}::${row.dateIssued}`,
    rawPayload: row,
  });
}

export function buildIomfsaRecords(rows: IomfsaRow[]): DbReadyRecord[] {
  return rows
    .map(buildIomfsaRecord)
    .sort((left, right) => right.dateIssued.localeCompare(left.dateIssued));
}

export async function loadIomfsaLiveRecords(): Promise<DbReadyRecord[]> {
  const client = await createPlaywrightHtmlClient();
  try {
    const html = await client.get(IOMFSA_URL, {
      readySelector: "table",
      timeoutMs: 60_000,
    });
    return buildIomfsaRecords(parseIomfsaHtml(html));
  } finally {
    await client.close();
  }
}

export async function main() {
  await runScraper({
    name: "🇮🇲 IoM FSA Enforcement Action Scraper",
    region: "Offshore",
    regulatorCode: "IOMFSA",
    liveLoader: loadIomfsaLiveRecords,
    testLoader: loadIomfsaLiveRecords,
    retryOnTransientFailure: false,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ IoM FSA scraper failed:", error);
    process.exit(1);
  });
}
