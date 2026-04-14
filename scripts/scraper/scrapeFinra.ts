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

const FINRA_ACTIONS_URL =
  "https://www.finra.org/rules-guidance/oversight-enforcement/finra-disciplinary-actions";
const FINRA_PAGE_BATCH_SIZE = Number.parseInt(
  process.env.FINRA_PAGE_BATCH_SIZE || "4",
  10,
);
const FINRA_PAGE_DELAY_MS = Number.parseInt(
  process.env.FINRA_PAGE_DELAY_MS || "150",
  10,
);
const FINRA_PAGE_TIMEOUT_MS = Number.parseInt(
  process.env.FINRA_PAGE_TIMEOUT_MS || "120000",
  10,
);
const FINRA_MAX_PAGES = Number.parseInt(process.env.FINRA_MAX_PAGES || "0", 10);

export interface FinraActionEntry {
  caseNumber: string;
  respondent: string;
  dateIssued: string;
  documentType: string;
  actionUrl: string;
  summary: string;
}

interface FinraArchivePage {
  entries: FinraActionEntry[];
  totalPages: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export function parseFinraAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "USD",
    symbols: ["$"],
    keywords: [
      "fine",
      "fined",
      "penalty",
      "penalties",
      "restitution",
      "disgorgement",
      "ordered to pay",
      "pay",
    ],
  });
}

function extractFinraRespondents($cell: cheerio.Cheerio<any>) {
  const names = $cell
    .find("span.cell")
    .map((_, element) => normalizeWhitespace($cell.find(element).text()))
    .get()
    .filter(Boolean)
    .filter((value) => value.length > 1);

  if (names.length > 0) {
    return [...new Set(names)];
  }

  const fallback = normalizeWhitespace($cell.text());
  return fallback ? [fallback] : [];
}

function extractFinraTotalPages(html: string) {
  const matches = [...html.matchAll(/[?&]page=(\d+)/g)].map((match) =>
    Number.parseInt(match[1] || "0", 10),
  );
  const highestPageIndex = matches.reduce((max, value) => Math.max(max, value), 0);
  return highestPageIndex + 1;
}

export function parseFinraArchiveHtml(
  html: string,
  pageUrl = FINRA_ACTIONS_URL,
): FinraArchivePage {
  const $ = cheerio.load(html);
  const entries: FinraActionEntry[] = [];

  $("table.views-view-table tbody tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 5) {
      return;
    }

    const caseLink = cells.eq(0).find("a[href]").first();
    const caseNumber = normalizeWhitespace(caseLink.text());
    const actionUrl = makeAbsoluteUrl(pageUrl, caseLink.attr("href") || "");
    const summary = normalizeWhitespace(cells.eq(1).text());
    const documentType = normalizeWhitespace(cells.eq(2).text());
    const respondents = extractFinraRespondents(cells.eq(3));
    const dateIssued = parseUsSlashDate(cells.eq(4).text());

    if (!caseNumber || !actionUrl || !summary || !dateIssued || respondents.length === 0) {
      return;
    }

    respondents.forEach((respondent) => {
      entries.push({
        caseNumber,
        respondent,
        dateIssued,
        documentType: documentType || "FINRA disciplinary action",
        actionUrl,
        summary,
      });
    });
  });

  return {
    entries,
    totalPages: extractFinraTotalPages(html),
  };
}

function categorizeFinraRecord(documentType: string, summary: string) {
  const corpus = `${documentType} ${summary}`.toLowerCase();
  const categories: string[] = [];

  if (/fraud|misrepresentation|false statement|misleading|deceptive/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/disclosure|books and records|focus report|recordkeeping/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/market manipulation|insider trading|trading|churn/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/supervision|supervisory|oversight|written supervisory procedures/.test(corpus)) {
    categories.push("GOVERNANCE");
  }
  if (/aml|money laundering|customer due diligence|suspicious activity/.test(corpus)) {
    categories.push("AML");
  }
  if (/best interest|reg bi/.test(corpus)) {
    categories.push("CONDUCT");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildFinraRecords(entries: FinraActionEntry[]) {
  return entries.map((entry) => {
    const summary = entry.summary;

    return buildEuFineRecord({
      regulator: "FINRA",
      regulatorFullName: "Financial Industry Regulatory Authority",
      countryCode: "US",
      countryName: "United States",
      firmIndividual: entry.respondent,
      firmCategory: null,
      amount: parseFinraAmount(summary),
      currency: "USD",
      dateIssued: entry.dateIssued,
      breachType: entry.documentType,
      breachCategories: categorizeFinraRecord(entry.documentType, summary),
      summary,
      finalNoticeUrl: entry.actionUrl,
      sourceUrl: FINRA_ACTIONS_URL,
      rawPayload: entry,
    });
  });
}

async function fetchFinraArchivePage(pageIndex: number) {
  const url = pageIndex === 0 ? FINRA_ACTIONS_URL : `${FINRA_ACTIONS_URL}?page=${pageIndex}`;
  return fetchText(url, {
    timeout: FINRA_PAGE_TIMEOUT_MS,
  });
}

export async function loadFinraLiveRecords() {
  const firstHtml = await fetchFinraArchivePage(0);
  const firstPage = parseFinraArchiveHtml(firstHtml);
  const totalPages =
    FINRA_MAX_PAGES > 0
      ? Math.min(firstPage.totalPages, FINRA_MAX_PAGES)
      : firstPage.totalPages;

  console.log(`📄 FINRA archive pages detected: ${firstPage.totalPages}`);
  if (FINRA_MAX_PAGES > 0 && totalPages < firstPage.totalPages) {
    console.log(`⚠️ Limiting FINRA scrape to ${totalPages} pages via FINRA_MAX_PAGES`);
  }

  const entries = [...firstPage.entries];

  for (let start = 1; start < totalPages; start += FINRA_PAGE_BATCH_SIZE) {
    const pageIndices = Array.from(
      { length: Math.min(FINRA_PAGE_BATCH_SIZE, totalPages - start) },
      (_, offset) => start + offset,
    );

    const pages = await Promise.all(
      pageIndices.map(async (pageIndex) => {
        const html = await fetchFinraArchivePage(pageIndex);
        return parseFinraArchiveHtml(
          html,
          `${FINRA_ACTIONS_URL}?page=${pageIndex}`,
        );
      }),
    );

    pages.forEach((page) => {
      entries.push(...page.entries);
    });

    if (start + FINRA_PAGE_BATCH_SIZE < totalPages) {
      await sleep(FINRA_PAGE_DELAY_MS);
    }
  }

  const dedupedEntries = [...new Map(
    entries.map((entry) => [
      `${entry.caseNumber}::${entry.respondent}::${entry.dateIssued}::${entry.actionUrl}`,
      entry,
    ]),
  ).values()];

  console.log(`📊 FINRA extracted ${dedupedEntries.length} respondent-level actions`);
  return buildFinraRecords(dedupedEntries);
}

export async function main() {
  await runScraper({
    name: "🇺🇸 FINRA Disciplinary Actions Scraper",
    region: "North America",
    liveLoader: loadFinraLiveRecords,
    testLoader: loadFinraLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FINRA scraper failed:", error);
    process.exit(1);
  });
}
