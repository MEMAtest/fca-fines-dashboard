/**
 * Taiwan FSC Scraper — Securities and Futures Bureau "Administrative Sanction" feed
 *
 * Strategy: The FSC's English enforcement (administrative sanctions / fines) are
 *   published by its Securities and Futures Bureau. The listing is server-paginated
 *   via GET query params (no JavaScript required), and each row links to a detail
 *   ("view") page that carries the NT$ fine amount.
 *
 * List: https://www.sfb.gov.tw/en/home.jsp?id=100&parentpath=0,4&mcustomize=lawnew_list.jsp&page=N&pagesize=15
 * View: https://www.sfb.gov.tw/en/home.jsp?id=100&parentpath=0,4&mcustomize=lawnew_view.jsp&dataserno=NNN
 *
 * Difficulty: 5/10 (Medium) — list + detail enrichment, windowed pager with no total.
 * Language: English (official EN site).
 *
 * Run: npx tsx scripts/scraper/scrapeTwfsc.ts --dry-run
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseScaledAmount,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const TWFSC_BASE_URL = "https://www.sfb.gov.tw/en/";
const TWFSC_LIST_BASE =
  "https://www.sfb.gov.tw/en/home.jsp?id=100&parentpath=0,4&mcustomize=lawnew_list.jsp";
const TWFSC_PAGE_SIZE = 15;
const TWFSC_MAX_PAGES = Number.parseInt(process.env.TWFSC_MAX_PAGES || "70", 10);
const TWFSC_ENRICH_LIMIT = Number.parseInt(
  process.env.TWFSC_ENRICH_LIMIT || "0",
  10,
); // 0 = enrich all listed rows
const TWFSC_CONCURRENCY = Number.parseInt(process.env.TWFSC_CONCURRENCY || "6", 10);

export interface TwfscListingRow {
  dataserno: string;
  title: string;
  dateIssued: string;
  detailUrl: string;
}

function buildTwfscListUrl(page: number) {
  return `${TWFSC_LIST_BASE}&page=${page}&pagesize=${TWFSC_PAGE_SIZE}`;
}

export function parseTwfscDate(value: string): string | null {
  const match = normalizeWhitespace(value).match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function parseTwfscListingHtml(
  html: string,
  pageUrl = TWFSC_BASE_URL,
): TwfscListingRow[] {
  const $ = cheerio.load(html);
  const rows: TwfscListingRow[] = [];

  $("div.whitebackground").each((_, element) => {
    const link = $(element).find("a[href*='lawnew_view']").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    if (!href) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(pageUrl, href);
    const dataserno = new URL(detailUrl).searchParams.get("dataserno") || "";
    // The full untruncated title lives in the anchor's title attribute.
    const title = normalizeWhitespace(link.attr("title") || link.text());
    const dateIssued = parseTwfscDate(
      $(element).find(".pdate1").first().text(),
    );

    if (!dataserno || !title || !dateIssued) {
      return;
    }

    rows.push({ dataserno, title, dateIssued, detailUrl });
  });

  return rows;
}

/**
 * Extract the NT$ penalty amount from a detail ("view") page.
 *
 * TWFSC detail pages frequently quote *other* NT$ figures far larger than the
 * penalty itself — e.g. "The mediation amount reached NT$20,699,582 thousand"
 * on the Shinfox Energy notice, whose actual fine is only NT$240,000. Taking the
 * largest currency figure on the page (the generic helper's behaviour) produces
 * a bogus multi-billion "fine". So this extractor is strictly keyword-anchored:
 * only NT$ amounts that directly follow a fine/penalty keyword are considered,
 * and figures introduced by disqualifying words (mediation, compensation,
 * capital, revenue, damages) are ignored even if a keyword appears elsewhere.
 */
const TWFSC_FINE_KEYWORDS = "fine|fined|penalty|penalties";
const TWFSC_DISQUALIFYING_CONTEXT =
  /mediation|compensation|damages|capital|paid-?in|revenue|turnover|market value|net worth/i;

export function parseTwfscAmountFromDetail(html: string): number | null {
  const $ = cheerio.load(html);
  const text = normalizeWhitespace($("body").text());

  // Require the amount to be introduced by a fine keyword within a short window
  // (no intervening sentence break), so unrelated NT$ figures are excluded.
  const pattern = new RegExp(
    `(?:${TWFSC_FINE_KEYWORDS})[^.]{0,40}?(?:NT\\$|NTD|\\$)\\s*([\\d,]+(?:\\.\\d+)?)\\s*(thousand|million|billion)?`,
    "gi",
  );

  const amounts: number[] = [];
  for (const match of text.matchAll(pattern)) {
    // Guard against a fine keyword that sits in the same clause as a
    // disqualifying figure (e.g. a "mediation" amount described just before).
    const window = text.slice(Math.max(0, match.index - 60), match.index);
    if (TWFSC_DISQUALIFYING_CONTEXT.test(window)) {
      continue;
    }

    const amount = parseScaledAmount(match[1], match[2]);
    if (amount !== null && amount > 0) {
      amounts.push(amount);
    }
  }

  return amounts.length > 0 ? Math.max(...amounts) : null;
}

export function extractTwfscFirm(title: string): string {
  const cleaned = normalizeWhitespace(title)
    .replace(/[（(]\s*(?:listed company|otc company)[^)）]*[)）]/gi, "")
    .trim();

  const patterns = [
    /^Administrative Fine Imposed on (?:the )?(?:Responsible Person of )?(.+?)(?:\s+for\b.*)?$/i,
    /^Punishment(?: Imposed)? (?:of|on) (.+?)(?:\s+(?:for|and)\b.*)?$/i,
    /^Imposing Fines on (?:the )?(?:Person Responsible for the Behavior of )?(.+?)(?:\s+for\b.*)?$/i,
    /^(.+?)\s+for (?:the )?Violation of\b.*$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeWhitespace(match[1]).replace(/[.,;:]+$/g, "");
      if (candidate && candidate.length <= 180) {
        return candidate;
      }
    }
  }

  return cleaned.length <= 180 ? cleaned : cleaned.slice(0, 180);
}

export function categorizeTwfscTitle(title: string): string[] {
  const normalized = title.toLowerCase();
  const categories: string[] = [];

  if (/accountant|auditor|certified public|financial statement|disclosure|report/.test(normalized)) {
    categories.push("DISCLOSURE");
  }
  if (/manipulat|insider|market/.test(normalized)) {
    categories.push("MARKET_ABUSE");
  }
  if (/securities|futures|investment trust|portfolio|business/.test(normalized)) {
    categories.push("CONDUCT");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["SUPERVISORY_SANCTION"];
}

export function buildTwfscRecord(
  row: TwfscListingRow,
  amount: number | null,
): DbReadyRecord {
  return buildEuFineRecord({
    regulator: "TWFSC",
    regulatorFullName: "Financial Supervisory Commission",
    countryCode: "TW",
    countryName: "Taiwan",
    firmIndividual: extractTwfscFirm(row.title),
    firmCategory: "Financial Entity",
    amount,
    currency: "TWD",
    dateIssued: row.dateIssued,
    breachType: row.title,
    breachCategories: categorizeTwfscTitle(row.title),
    summary: row.title,
    finalNoticeUrl: row.detailUrl,
    sourceUrl: row.detailUrl,
    dedupeKey: row.dataserno,
    rawPayload: row,
  });
}

async function fetchTwfscListingPage(page: number): Promise<TwfscListingRow[]> {
  try {
    const html = await fetchText(buildTwfscListUrl(page), { timeout: 45000 });
    return parseTwfscListingHtml(html);
  } catch {
    return [];
  }
}

async function enrichTwfscAmount(row: TwfscListingRow): Promise<number | null> {
  try {
    const html = await fetchText(row.detailUrl, { timeout: 45000 });
    return parseTwfscAmountFromDetail(html);
  } catch {
    return null;
  }
}

export async function loadTwfscLiveRecords(): Promise<DbReadyRecord[]> {
  const flags = getCliFlags();
  const rowsByKey = new Map<string, TwfscListingRow>();

  for (let page = 1; page <= TWFSC_MAX_PAGES; page += 1) {
    const rows = await fetchTwfscListingPage(page);
    if (rows.length === 0) {
      break; // windowed pager returns an empty list block past the end
    }

    let newRows = 0;
    for (const row of rows) {
      if (!rowsByKey.has(row.dataserno)) {
        rowsByKey.set(row.dataserno, row);
        newRows += 1;
      }
    }

    if (newRows === 0) {
      break; // guard against a pager that clamps to the last page
    }
  }

  let listingRows = [...rowsByKey.values()];
  if (flags.limit && flags.limit > 0) {
    listingRows = listingRows.slice(0, flags.limit);
  }

  const enrichBudget =
    TWFSC_ENRICH_LIMIT > 0
      ? Math.min(TWFSC_ENRICH_LIMIT, listingRows.length)
      : listingRows.length;

  const amounts = await mapWithConcurrency(
    listingRows,
    Math.max(1, TWFSC_CONCURRENCY),
    async (row, index) =>
      index < enrichBudget ? enrichTwfscAmount(row) : null,
  );

  return listingRows
    .map((row, index) => buildTwfscRecord(row, amounts[index]))
    .sort((left, right) => right.dateIssued.localeCompare(left.dateIssued));
}

export async function main() {
  await runScraper({
    name: "🇹🇼 TWFSC Administrative Sanction Scraper",
    region: "APAC",
    regulatorCode: "TWFSC",
    liveLoader: loadTwfscLiveRecords,
    testLoader: loadTwfscLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ TWFSC scraper failed:", error);
    process.exit(1);
  });
}
