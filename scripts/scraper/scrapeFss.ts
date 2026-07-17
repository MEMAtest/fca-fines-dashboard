/**
 * FSS (Financial Supervisory Service — South Korea) Scraper
 *
 * Strategy: Parse the FSS English press-release board (B0000211), filtered to the
 *   "Supervision-Examination" category (selectCate2=1007) — the supervisory /
 *   enforcement subset (examination notices, sanction announcements, supervisory
 *   guidance). Each row carries a stable nttId, a category pair, a titled detail
 *   link, and an ISO date. Pagination is followed to the end of the category.
 * URL: https://www.fss.or.kr/eng/bbs/B0000211/list.do (menuNo=300147, selectCate2=1007)
 *
 * Difficulty: 4/10 (Medium) — static HTML board, but the enforcement subset is a
 *   category filter and English enforcement content is sparse.
 * Language: English (FSS publishes these press releases in English). The English
 *   press-release title/text is preserved verbatim. FSS press releases seldom
 *   state a monetary figure, so the amount fails toward null rather than guessing.
 *
 * Note: this is distinct from the FSC Korea (fsc.go.kr) scaffold — FSS is the
 *   Financial Supervisory Service (fss.or.kr), the examination/enforcement body.
 *
 * Run: npx tsx scripts/scraper/scrapeFss.ts --dry-run
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  makeAbsoluteUrl,
  normalizeWhitespace,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FSS_BASE_URL = "https://www.fss.or.kr";
const FSS_LIST_PATH = "/eng/bbs/B0000211/list.do";
const FSS_MENU_NO = "300147";
/** selectCate2=1007 = "Supervision-Examination" (the enforcement/supervisory subset). */
const FSS_SUPERVISION_CATE2 = "1007";
const FSS_MAX_PAGES = 20;

export interface FssRow {
  nttId: string;
  title: string;
  categories: string[];
  dateIssued: string;
  detailUrl: string;
}

function buildListUrl(pageIndex: number): string {
  const params = new URLSearchParams({
    menuNo: FSS_MENU_NO,
    selectCate2: FSS_SUPERVISION_CATE2,
    pageIndex: String(pageIndex),
  });
  return `${FSS_BASE_URL}${FSS_LIST_PATH}?${params.toString()}`;
}

/** FSS board dates are already ISO (YYYY-MM-DD). */
export function parseFssDate(input: string): string | null {
  const match = normalizeWhitespace(input).match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function parseFssListHtml(html: string, pageUrl = buildListUrl(1)): FssRow[] {
  const $ = cheerio.load(html);
  const rows: FssRow[] = [];

  $("tbody tr").each((_, element) => {
    const $tr = $(element);
    const $link = $tr.find("td.title a[href], a[href*='view.do']").first();
    const href = normalizeWhitespace($link.attr("href") || "");
    const nttMatch = href.match(/nttId=(\d+)/);
    if (!nttMatch) {
      return;
    }

    const title = normalizeWhitespace($link.text());
    const dateIssued = parseFssDate(
      $tr
        .find("td")
        .filter((__, td) => /^\d{4}-\d{2}-\d{2}$/.test(normalizeWhitespace($(td).text())))
        .first()
        .text(),
    );

    if (!title || !dateIssued) {
      return;
    }

    const categories = $tr
      .find("span.cate")
      .map((__, span) => normalizeWhitespace($(span).text()))
      .get()
      .filter(Boolean);

    rows.push({
      nttId: nttMatch[1],
      title,
      categories,
      dateIssued,
      detailUrl: makeAbsoluteUrl(pageUrl, href),
    });
  });

  return rows;
}

export function categorizeFssRow(row: FssRow): string[] {
  const corpus = `${row.title} ${row.categories.join(" ")}`.toLowerCase();
  const categories: string[] = [];

  if (/sanction|penalt|disciplinary|enforcement/.test(corpus)) {
    categories.push("SUPERVISORY_SANCTION");
  }
  if (/short-selling|market manipulation|insider|unfair trading/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/money laundering|aml/.test(corpus)) {
    categories.push("AML");
  }
  if (/internal control|governance|compliance/.test(corpus)) {
    categories.push("GOVERNANCE");
  }
  if (/disclosure|reporting|transparen/.test(corpus)) {
    categories.push("DISCLOSURE");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["SUPERVISION_EXAMINATION"];
}

export function buildFssRecord(row: FssRow): DbReadyRecord {
  return buildEuFineRecord({
    regulator: "FSS",
    regulatorFullName: "Financial Supervisory Service",
    countryCode: "KR",
    countryName: "South Korea",
    // FSS press releases name the FSS as the actor; the announcement title is
    // the sanctioned subject. Preserve the English title verbatim as the entity
    // label (individual firms are named inside the linked press release).
    firmIndividual: row.title,
    firmCategory: row.categories[0] ?? "Supervision-Examination",
    // FSS press releases seldom carry a parseable figure — fail toward null.
    amount: null,
    currency: "KRW",
    dateIssued: row.dateIssued,
    breachType: row.categories.join(" / ") || "Supervision-Examination",
    breachCategories: categorizeFssRow(row),
    summary: `${row.title} — FSS supervision/examination press release, ${row.dateIssued}.`.slice(0, 500),
    finalNoticeUrl: row.detailUrl,
    sourceUrl: buildListUrl(1),
    // nttId is a stable per-press-release identifier.
    dedupeKey: `FSS::${row.nttId}`,
    rawPayload: row,
  });
}

export function buildFssRecords(rows: FssRow[]): DbReadyRecord[] {
  const byId = new Map<string, FssRow>();
  for (const row of rows) {
    byId.set(row.nttId, row);
  }

  return [...byId.values()]
    .map(buildFssRecord)
    .sort((left, right) => right.dateIssued.localeCompare(left.dateIssued));
}

export async function loadFssLiveRecords(): Promise<DbReadyRecord[]> {
  const flags = getCliFlags();
  const collected: FssRow[] = [];
  const seenIds = new Set<string>();
  const maxPages = flags.limit && flags.limit > 0 ? Math.min(FSS_MAX_PAGES, flags.limit) : FSS_MAX_PAGES;

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    const url = buildListUrl(pageIndex);
    const html = await fetchText(url, { timeout: 60_000 });
    const rows = parseFssListHtml(html, url);
    if (rows.length === 0) {
      break;
    }

    let addedThisPage = 0;
    for (const row of rows) {
      if (!seenIds.has(row.nttId)) {
        seenIds.add(row.nttId);
        collected.push(row);
        addedThisPage += 1;
      }
    }

    // The board repeats the last page when paging past the end — stop if a page
    // adds nothing new.
    if (addedThisPage === 0) {
      break;
    }
  }

  return buildFssRecords(collected);
}

export async function main() {
  await runScraper({
    name: "🇰🇷 FSS Supervision-Examination Scraper",
    region: "APAC",
    regulatorCode: "FSS",
    liveLoader: loadFssLiveRecords,
    testLoader: loadFssLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FSS scraper failed:", error);
    process.exit(1);
  });
}
