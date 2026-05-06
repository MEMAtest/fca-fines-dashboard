import "dotenv/config";
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const OSC_BASE_URL = "https://www.osc.ca";
const OSC_UNPAID_SANCTIONS_URL =
  `${OSC_BASE_URL}/en/enforcement/osc-sanctions/` +
  "individuals-or-companies-unpaid-osc-sanctions";
const OSC_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.OSC_FETCH_TIMEOUT_MS || "120000",
  10,
);
const OSC_PROCEEDING_DELAY_MS = Number.parseInt(
  process.env.OSC_PROCEEDING_DELAY_MS || "500",
  10,
);
const OSC_USER_AGENT =
  "Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)";

const execFileAsync = promisify(execFile);

export interface OscListingRow {
  respondent: string;
  proceedingName: string;
  proceedingUrl: string;
  amountOwingIndividually: number | null;
  amountOwingJointly: number | null;
  amountOutstandingStatus: string;
}

export interface OscProceedingMeta {
  proceedingName: string;
  noticeDate: string | null;
  sanctionDate: string | null;
  sanctionUrl: string | null;
  sanctionDocumentType: string | null;
}

interface OscListingPage {
  rows: OscListingRow[];
  totalPages: number;
}

interface OscDocumentMeta {
  issueDate: string | null;
  documentType: string;
  documentTitle: string;
  webUrl: string | null;
}

function parseIsoDate(input: string | null | undefined) {
  const raw = normalizeWhitespace(input || "");
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function parseOscAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "CAD",
    symbols: ["$"],
    keywords: ["administrative penalty", "disgorgement", "costs", "amount"],
  });
}

function parseOscTotalPages($: cheerio.CheerioAPI) {
  const pageIndexes = $("nav.pager a[href*='?page=']")
    .map((_, element) => {
      const href = $(element).attr("href") || "";
      const match = href.match(/[?&]page=(\d+)/);
      return match ? Number.parseInt(match[1] || "0", 10) : 0;
    })
    .get()
    .filter((value) => Number.isFinite(value));

  const highestPageIndex = pageIndexes.reduce((max, value) => Math.max(max, value), 0);
  return highestPageIndex + 1;
}

export function parseOscListingHtml(html: string, pageUrl = OSC_UNPAID_SANCTIONS_URL): OscListingPage {
  const $ = cheerio.load(html);
  const rows: OscListingRow[] = [];

  $(".table-listings__content .table-row").each((_, element) => {
    const columns = $(element).find(".table-row__content > div[class^='column-']");
    if (columns.length !== 5) {
      return;
    }

    const respondent = normalizeWhitespace(columns.eq(0).text());
    if (!respondent || respondent === "Respondent") {
      return;
    }

    const proceedingLink = columns.eq(1).find("a[href]").first();
    const proceedingName = normalizeWhitespace(proceedingLink.text());
    const proceedingUrl = makeAbsoluteUrl(pageUrl, proceedingLink.attr("href") || "");

    if (!proceedingName || !proceedingUrl) {
      return;
    }

    rows.push({
      respondent,
      proceedingName,
      proceedingUrl,
      amountOwingIndividually: parseOscAmount(columns.eq(2).text()),
      amountOwingJointly: parseOscAmount(columns.eq(3).text()),
      amountOutstandingStatus: normalizeWhitespace(columns.eq(4).text()),
    });
  });

  return {
    rows,
    totalPages: parseOscTotalPages($),
  };
}

function parseProceedingDocumentRows(
  $: cheerio.CheerioAPI,
  proceedingUrl: string,
): OscDocumentMeta[] {
  const documents: OscDocumentMeta[] = [];

  $(".table-listings__content[aria-label='List of Documents'] .table-row").each(
    (_, element) => {
      const columns = $(element).find(".table-row__content > div[class^='column-']");
      if (columns.length < 5) {
        return;
      }

      const issueDate = parseIsoDate(columns.eq(0).find("time[datetime]").first().attr("datetime"));
      const documentType = normalizeWhitespace(columns.eq(1).text());
      const documentTitle = normalizeWhitespace(columns.eq(2).text());
      const webHref =
        $(element)
          .find("a[href]")
          .map((__, anchor) => $(anchor).attr("href") || "")
          .get()
          .find((href) => href && !href.toLowerCase().endsWith(".pdf")) || null;

      if (!documentType && !documentTitle) {
        return;
      }

      documents.push({
        issueDate,
        documentType,
        documentTitle,
        webUrl: webHref ? makeAbsoluteUrl(proceedingUrl, webHref) : null,
      });
    },
  );

  return documents;
}

function chooseOscSanctionDocument(documents: OscDocumentMeta[]) {
  const candidates = documents.filter((document) =>
    /(order|settlement)/i.test(`${document.documentType} ${document.documentTitle}`),
  );
  const source = candidates.length > 0 ? candidates : documents;

  return (
    source
      .filter((document) => document.issueDate)
      .sort((left, right) => (left.issueDate! < right.issueDate! ? 1 : -1))[0] || null
  );
}

export function parseOscProceedingHtml(
  html: string,
  proceedingUrl: string,
): OscProceedingMeta {
  const $ = cheerio.load(html);
  const proceedingName = normalizeWhitespace($("h1.title").first().text());
  const directDocumentDate = parseIsoDate(
    $(".proceeding-document-full__date time[datetime]").first().attr("datetime"),
  );
  const directDocumentType = normalizeWhitespace(
    $(".proceeding-document-full__date .tag").first().text(),
  );
  const directDocumentTitle = proceedingName;
  let noticeDate: string | null = null;

  $(".info-card__table__row").each((_, element) => {
    const label = normalizeWhitespace(
      $(element).find(".info-card__table__row__label").text(),
    );
    if (label !== "Notice of Hearing:") {
      return;
    }

    noticeDate = parseIsoDate(
      $(element).find(".info-card__table__row__value time[datetime]").attr("datetime"),
    );
  });

  const selectedDocument = chooseOscSanctionDocument(
    parseProceedingDocumentRows($, proceedingUrl),
  );
  const fallbackDocument =
    directDocumentDate && /(order|settlement)/i.test(`${directDocumentType} ${directDocumentTitle}`)
      ? {
          issueDate: directDocumentDate,
          documentType: directDocumentType || "Order",
          documentTitle: directDocumentTitle,
          webUrl: proceedingUrl,
        }
      : null;
  const resolvedDocument = selectedDocument || fallbackDocument;

  return {
    proceedingName,
    noticeDate,
    sanctionDate: resolvedDocument?.issueDate || noticeDate,
    sanctionUrl: resolvedDocument?.webUrl || proceedingUrl,
    sanctionDocumentType: resolvedDocument?.documentType || null,
  };
}

function buildOscSummary(row: OscListingRow, meta: OscProceedingMeta | undefined) {
  const parts = [
    `OSC delinquent respondent list entry for ${row.respondent}.`,
    `Related order ${meta?.proceedingName || row.proceedingName}.`,
  ];

  if (row.amountOwingIndividually) {
    parts.push(
      `Amount owing individually CAD ${row.amountOwingIndividually.toLocaleString("en-CA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`,
    );
  }

  if (row.amountOwingJointly) {
    parts.push(
      `Amount owing jointly CAD ${row.amountOwingJointly.toLocaleString("en-CA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`,
    );
  }

  if (row.amountOutstandingStatus) {
    parts.push(`Amount outstanding status ${row.amountOutstandingStatus}.`);
  }

  if (meta?.sanctionDocumentType) {
    parts.push(`Latest sanction document type ${meta.sanctionDocumentType}.`);
  }

  return parts.join(" ");
}

function buildOscAmount(row: OscListingRow) {
  const total =
    (row.amountOwingIndividually || 0) + (row.amountOwingJointly || 0);
  return total > 0 ? total : null;
}

function buildOscRecords(
  rows: OscListingRow[],
  proceedingMetaByUrl: Map<string, OscProceedingMeta>,
) {
  return rows.map((row) => {
    const meta = proceedingMetaByUrl.get(row.proceedingUrl);
    const dateIssued = meta?.sanctionDate || meta?.noticeDate || "1900-01-01";

    return buildEuFineRecord({
      regulator: "OSC",
      regulatorFullName: "Ontario Securities Commission",
      countryCode: "CA",
      countryName: "Canada",
      firmIndividual: row.respondent,
      firmCategory: null,
      amount: buildOscAmount(row),
      currency: "CAD",
      dateIssued,
      breachType: "Unpaid OSC sanctions",
      breachCategories: ["SUPERVISORY_SANCTION"],
      summary: buildOscSummary(row, meta),
      finalNoticeUrl: meta?.sanctionUrl || row.proceedingUrl,
      sourceUrl: OSC_UNPAID_SANCTIONS_URL,
      rawPayload: {
        ...row,
        proceedingMeta: meta || null,
      },
    });
  });
}

async function loadOscListingPage(pageIndex: number) {
  const url = `${OSC_UNPAID_SANCTIONS_URL}?page=${pageIndex}`;
  const html = await fetchText(url, { timeout: OSC_FETCH_TIMEOUT_MS });
  return parseOscListingHtml(html, url);
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>,
) {
  const results = new Array<U>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isChallengeHtml(html: string) {
  return /just a moment|enable javascript and cookies to continue|cf-chl|cf-mitigated/i.test(
    html,
  );
}

async function fetchProceedingHtml(url: string) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const { stdout } = await execFileAsync("curl", [
      "-4",
      "-sSL",
      "--max-time",
      String(Math.ceil(OSC_FETCH_TIMEOUT_MS / 1000)),
      "-A",
      OSC_USER_AGENT,
      "-H",
      "Accept-Language: en-GB,en;q=0.9",
      url,
    ]);

    if (!isChallengeHtml(stdout) && /<h1 class="title"/i.test(stdout)) {
      return stdout;
    }

    await sleep(1_500 * attempt);
  }

  throw new Error(`OSC tribunal page challenge did not clear for ${url}`);
}

async function loadProceedingMeta(url: string) {
  const html = await fetchProceedingHtml(url);
  return parseOscProceedingHtml(html, url);
}

export async function loadOscLiveRecords() {
  const firstPage = await loadOscListingPage(0);
  const otherPageIndexes = Array.from(
    { length: Math.max(firstPage.totalPages - 1, 0) },
    (_, index) => index + 1,
  );

  const otherPages = await mapWithConcurrency(otherPageIndexes, 4, async (pageIndex) => {
    const page = await loadOscListingPage(pageIndex);
    console.log(`   Page ${pageIndex + 1}/${firstPage.totalPages}: ${page.rows.length} rows`);
    return page;
  });

  const rows = [firstPage, ...otherPages].flatMap((page) => page.rows);
  const uniqueProceedingUrls = [...new Set(rows.map((row) => row.proceedingUrl))];

  console.log(`📊 OSC extracted ${rows.length} delinquent respondent rows`);
  console.log(`🔎 Fetching ${uniqueProceedingUrls.length} unique tribunal proceedings`);

  const proceedingEntries: Array<readonly [string, OscProceedingMeta]> = [];

  for (let index = 0; index < uniqueProceedingUrls.length; index += 1) {
    const url = uniqueProceedingUrls[index]!;
    try {
      const meta = await loadProceedingMeta(url);
      proceedingEntries.push([url, meta] as const);
    } catch (error) {
      console.warn(
        `   ⚠️ Proceeding metadata unavailable for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      proceedingEntries.push([
        url,
        {
          proceedingName: "",
          noticeDate: null,
          sanctionDate: null,
          sanctionUrl: url,
          sanctionDocumentType: null,
        },
      ] as const);
    }

    if ((index + 1) % 25 === 0 || index === uniqueProceedingUrls.length - 1) {
      console.log(
        `   Proceedings ${index + 1}/${uniqueProceedingUrls.length} processed`,
      );
    }

    await sleep(OSC_PROCEEDING_DELAY_MS);
  }

  return buildOscRecords(rows, new Map<string, OscProceedingMeta>(proceedingEntries));
}

export async function main() {
  await runScraper({
    name: "🇨🇦 OSC Unpaid Sanctions Scraper",
    region: "North America",
    liveLoader: loadOscLiveRecords,
    testLoader: loadOscLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ OSC scraper failed:", error);
    process.exit(1);
  });
}
