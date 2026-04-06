import "dotenv/config";
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FMANZ_BASE_URL = "https://www.fma.govt.nz";
const FMANZ_LIST_URL = "https://www.fma.govt.nz/about-us/enforcement/cases/0/";
const execFileAsync = promisify(execFile);

export interface FmanzListEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  intro: string;
}

interface FmanzListPage {
  entries: FmanzListEntry[];
  nextPageUrl: string | null;
}

interface FmanzDetail {
  title: string;
  dateIssued: string | null;
  summary: string;
  body: string;
  pdfUrl: string | null;
}

function parseFmanzDate(input: string) {
  const cleaned = normalizeWhitespace(input)
    .replace(/^published\s+/i, "")
    .replace(/^updated\s+/i, "");
  return parseMonthNameDate(cleaned);
}

export function parseFmanzAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "NZD",
    symbols: ["$"],
    keywords: [
      "pecuniary penalty",
      "civil penalty",
      "penalty",
      "settlement",
      "agreed to pay",
      "ordered to pay",
      "pay a total of",
      "payment",
    ],
  });
}

export function parseFmanzListingHtml(html: string, pageUrl: string): FmanzListPage {
  const $ = cheerio.load(html);
  const entries = new Map<string, FmanzListEntry>();

  $("li.search-results-semantic__result-item").each((_, element) => {
    const item = $(element);
    const link = item.find("h3 a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const title = normalizeWhitespace(link.text());
    const intro = normalizeWhitespace(item.find("section p").first().text());
    const dateIssued = parseFmanzDate(
      item.find(".search-results-semantic__date").first().text(),
    );

    if (!href || !title || !dateIssued) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(pageUrl, href);
    entries.set(detailUrl, {
      title,
      detailUrl,
      dateIssued,
      intro,
    });
  });

  const nextHref = normalizeWhitespace(
    $("a.next.page-link[href]").first().attr("href") || "",
  );

  return {
    entries: [...entries.values()],
    nextPageUrl: nextHref ? makeAbsoluteUrl(pageUrl, nextHref) : null,
  };
}

export function parseFmanzDetailHtml(html: string, detailUrl: string): FmanzDetail {
  const $ = cheerio.load(html);
  const contentRoot = $(".registry-item-page__body-wrap-main--elemental").first();
  const summary =
    normalizeWhitespace(contentRoot.children("div, p").first().text()) ||
    normalizeWhitespace(contentRoot.find("p").first().text());
  const narrativeSegments = contentRoot
    .find("p, li")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean);
  const pdfHref = normalizeWhitespace(
    contentRoot.find('a[href$=".pdf"]').first().attr("href") || "",
  );

  return {
    title:
      normalizeWhitespace(
        $(".registry-item-page__heading-wrap--title-item").first().text(),
      ) || normalizeWhitespace($("h1").first().text()),
    dateIssued: parseFmanzDate(
      $(".registry-item-page__heading-wrap--date-published").first().text(),
    ),
    summary,
    body: normalizeWhitespace([summary, ...narrativeSegments].join(" ")),
    pdfUrl: pdfHref ? makeAbsoluteUrl(detailUrl, pdfHref) : null,
  };
}

function categorizeFmanzRecord(text: string) {
  const corpus = text.toLowerCase();
  const categories: string[] = [];

  if (/fair dealing|misleading|deceptive|representation/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/disclosure|offer document|prospectus|continuous disclosure/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/licence|licensing|fap licence|authorisation|registration/.test(corpus)) {
    categories.push("LICENSING");
  }
  if (/market manipulation|insider|market abuse|trading/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/anti-money laundering|aml|terrorism financing|ctf/.test(corpus)) {
    categories.push("AML");
  }
  if (/governance|systems and processes|controls/.test(corpus)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

export async function loadFmanzEntries(limit: number | null) {
  const entries = new Map<string, FmanzListEntry>();
  const visited = new Set<string>();
  let nextPageUrl: string | null = FMANZ_LIST_URL;

  while (nextPageUrl) {
    if (visited.has(nextPageUrl)) {
      break;
    }
    visited.add(nextPageUrl);

    const html = await requestFmanzHtml(nextPageUrl);
    const page = parseFmanzListingHtml(html, nextPageUrl);

    for (const entry of page.entries) {
      entries.set(entry.detailUrl, entry);
      if (limit && entries.size >= limit) {
        return [...entries.values()];
      }
    }

    nextPageUrl = page.nextPageUrl;
  }

  return [...entries.values()];
}

async function enrichFmanzEntry(entry: FmanzListEntry) {
  const detailHtml = await requestFmanzHtml(entry.detailUrl);
  const detail = parseFmanzDetailHtml(detailHtml, entry.detailUrl);
  const textCorpus = `${entry.title} ${entry.intro} ${detail.summary} ${detail.body}`;

  return buildEuFineRecord({
    regulator: "FMANZ",
    regulatorFullName: "Financial Markets Authority",
    countryCode: "NZ",
    countryName: "New Zealand",
    firmIndividual: detail.title || entry.title,
    firmCategory: "Financial Entity",
    amount: parseFmanzAmount(textCorpus),
    currency: "NZD",
    dateIssued: detail.dateIssued || entry.dateIssued,
    breachType: entry.intro || detail.summary || detail.title,
    breachCategories: categorizeFmanzRecord(textCorpus),
    summary: detail.summary || entry.intro || detail.title,
    finalNoticeUrl: detail.pdfUrl || entry.detailUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
    },
  });
}

export async function loadFmanzLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadFmanzEntries(
    flags.limit && flags.limit > 0 ? flags.limit : null,
  );
  const records = await mapWithConcurrency(entries, 4, enrichFmanzEntry);
  return records.filter((record) => record !== null);
}

async function requestFmanzHtml(url: string) {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sSL",
      "--retry",
      "3",
      "--retry-all-errors",
      "--connect-timeout",
      "30",
      "--max-time",
      "120",
      url,
    ],
    {
    maxBuffer: 10 * 1024 * 1024,
    },
  );
  return stdout;
}

export async function main() {
  await runScraper({
    name: "🇳🇿 FMA New Zealand Enforcement Cases Scraper",
    liveLoader: loadFmanzLiveRecords,
    testLoader: loadFmanzLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FMANZ scraper failed:", error);
    process.exit(1);
  });
}
