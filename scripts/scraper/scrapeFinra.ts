import "dotenv/config";
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
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
const FINRA_START_YEAR = Number.parseInt(process.env.FINRA_START_YEAR || "2005", 10);
const FINRA_END_YEAR = Number.parseInt(
  process.env.FINRA_END_YEAR || String(new Date().getUTCFullYear()),
  10,
);

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

interface FinraMonthWindow {
  label: string;
  min: string;
  max: string;
  url: string;
}

const execFileAsync = promisify(execFile);

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

function formatFinraDateQuery(value: Date) {
  return `${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}/${value.getUTCFullYear()}`;
}

export function buildFinraMonthWindows(startYear = FINRA_START_YEAR, endYear = FINRA_END_YEAR) {
  const windows: FinraMonthWindow[] = [];
  const now = new Date();
  const lastMonthIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();

  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const absoluteMonthIndex = year * 12 + month;
      if (absoluteMonthIndex > lastMonthIndex) {
        break;
      }

      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      const params = new URLSearchParams({
        "field_core_official_dt[min]": formatFinraDateQuery(monthStart),
        "field_core_official_dt[max]": formatFinraDateQuery(monthEnd),
        field_fda_case_id_txt: "",
        field_fda_document_type_tax: "All",
        firms: "",
        individuals: "",
        search: "",
      });

      windows.push({
        label: `${year}-${String(month + 1).padStart(2, "0")}`,
        min: formatFinraDateQuery(monthStart),
        max: formatFinraDateQuery(monthEnd),
        url: `${FINRA_ACTIONS_URL}?${params.toString()}`,
      });
    }
  }

  return windows.reverse();
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

async function fetchFinraFilteredArchivePage(baseUrl: string, pageIndex: number) {
  const pageUrl = new URL(baseUrl);
  if (pageIndex > 0) {
    pageUrl.searchParams.set("page", String(pageIndex));
  } else {
    pageUrl.searchParams.delete("page");
  }

  const url = pageUrl.toString();
  const { stdout } = await execFileAsync("curl", [
    "-4",
    "-sSL",
    "--retry",
    "4",
    "--retry-all-errors",
    "--retry-delay",
    "2",
    "--max-time",
    String(Math.max(Math.ceil(FINRA_PAGE_TIMEOUT_MS / 1000), 30)),
    url,
  ]);
  return stdout;
}

export async function loadFinraLiveRecords() {
  const windows = buildFinraMonthWindows();
  const oldestWindow = windows[windows.length - 1];
  console.log(
    `📅 FINRA month windows: ${windows.length} (${oldestWindow?.label} → ${windows[0]?.label})`,
  );

  const entries: FinraActionEntry[] = [];
  let processedPages = 0;

  for (const window of windows) {
    const firstHtml = await fetchFinraFilteredArchivePage(window.url, 0);
    const firstPage = parseFinraArchiveHtml(firstHtml, window.url);
    const totalPages =
      FINRA_MAX_PAGES > 0
        ? Math.min(firstPage.totalPages, FINRA_MAX_PAGES)
        : firstPage.totalPages;

    entries.push(...firstPage.entries);
    processedPages += 1;

    if (firstPage.entries.length > 0) {
      console.log(
        `   ${window.label}: ${firstPage.entries.length} entries on page 1` +
          (totalPages > 1 ? `, ${totalPages} pages total` : ""),
      );
    }

    for (let start = 1; start < totalPages; start += FINRA_PAGE_BATCH_SIZE) {
      const pageIndices = Array.from(
        { length: Math.min(FINRA_PAGE_BATCH_SIZE, totalPages - start) },
        (_, offset) => start + offset,
      );

      const pages = await Promise.all(
        pageIndices.map(async (pageIndex) => {
          const html = await fetchFinraFilteredArchivePage(window.url, pageIndex);
          return parseFinraArchiveHtml(
            html,
            `${window.url}&page=${pageIndex}`,
          );
        }),
      );

      pages.forEach((page) => {
        entries.push(...page.entries);
      });
      processedPages += pageIndices.length;

      if (start + FINRA_PAGE_BATCH_SIZE < totalPages) {
        await sleep(FINRA_PAGE_DELAY_MS);
      }
    }

    await sleep(FINRA_PAGE_DELAY_MS);
  }

  const dedupedEntries = [...new Map(
    entries.map((entry) => [
      `${entry.caseNumber}::${entry.respondent}::${entry.dateIssued}::${entry.actionUrl}`,
      entry,
    ]),
  ).values()];

  console.log(`📄 FINRA filtered pages fetched: ${processedPages}`);
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
