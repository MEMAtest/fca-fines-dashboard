import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  extractPdfTextFromUrl,
  fetchText,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const CSSF_BASE_URL = "https://www.cssf.lu";
const CSSF_SEARCH_URL = "https://www.cssf.lu/en/search/sanction";

export interface CssfSearchEntry {
  title: string;
  detailUrl: string;
}

interface CssfSearchPage {
  entries: CssfSearchEntry[];
  nextPageUrl: string | null;
}

export interface CssfDetail {
  title: string;
  subtitle: string;
  pdfUrl: string | null;
}

export function parseCssfSearchPage(
  html: string,
  pageUrl: string,
): CssfSearchPage {
  const $ = cheerio.load(html);
  const entries = new Map<string, CssfSearchEntry>();

  $("h3.library-element__title a[href*='/en/Document/']").each((_, element) => {
    const title = normalizeWhitespace($(element).text());
    const href = normalizeWhitespace($(element).attr("href") || "");
    if (!title || !href || !/^Administrative sanction/i.test(title)) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(CSSF_BASE_URL, href);
    entries.set(detailUrl, { title, detailUrl });
  });

  const nextHref = normalizeWhitespace(
    $("nav[aria-label='Pagination'] a[title='Next page']").first().attr("href")
      || "",
  );

  return {
    entries: [...entries.values()],
    nextPageUrl: nextHref ? makeAbsoluteUrl(pageUrl, nextHref) : null,
  };
}

export function parseCssfDetailHtml(html: string, detailUrl: string): CssfDetail {
  const $ = cheerio.load(html);
  const pdfLinks = $("a.doc-link-title[href$='.pdf']");

  let englishPdfUrl: string | null = null;
  let fallbackPdfUrl: string | null = null;
  pdfLinks.each((_, element) => {
    const href = normalizeWhitespace($(element).attr("href") || "");
    if (!href) {
      return;
    }

    const absolute = makeAbsoluteUrl(CSSF_BASE_URL, href);
    fallbackPdfUrl ||= absolute;

    const text = normalizeWhitespace($(element).text()).toLowerCase();
    if (text.includes("english") || href.toLowerCase().includes("_en.")) {
      englishPdfUrl = absolute;
    }
  });

  return {
    title: normalizeWhitespace($("h1.single-news__title").text()),
    subtitle: normalizeWhitespace($(".single-news__subtitle p").first().text()),
    pdfUrl: englishPdfUrl || fallbackPdfUrl,
  };
}

export function extractCssfDate(title: string) {
  return parseMonthNameDate(
    normalizeWhitespace(title).replace(/^Administrative sanction of\s+/i, ""),
  );
}

export function extractCssfFirm(subtitle: string) {
  const normalized = normalizeWhitespace(subtitle);
  const match = normalized.match(/imposed on (.+)$/i);
  return match ? normalizeWhitespace(match[1]) : null;
}

function categorizeCssfRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (normalized.includes("transaction reporting")) {
    categories.push("REPORTING");
  }
  if (normalized.includes("market abuse")) {
    categories.push("MARKET_ABUSE");
  }
  if (normalized.includes("aml") || normalized.includes("anti-money laundering")) {
    categories.push("AML");
  }
  if (normalized.includes("governance")) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

async function loadCssfEntries(limit: number | null) {
  const entries = new Map<string, CssfSearchEntry>();
  let nextPageUrl: string | null = CSSF_SEARCH_URL;

  while (nextPageUrl) {
    const html = await fetchText(nextPageUrl);
    const page = parseCssfSearchPage(html, nextPageUrl);

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

async function enrichCssfEntry(entry: CssfSearchEntry) {
  const detailHtml = await fetchText(entry.detailUrl);
  const detail = parseCssfDetailHtml(detailHtml, entry.detailUrl);
  const dateIssued = extractCssfDate(detail.title || entry.title);
  const firmIndividual = extractCssfFirm(detail.subtitle);

  if (!dateIssued || !firmIndividual) {
    throw new Error(`Unable to parse CSSF detail entry: ${entry.detailUrl}`);
  }

  let pdfText = "";
  if (detail.pdfUrl) {
    try {
      pdfText = await extractPdfTextFromUrl(detail.pdfUrl);
    } catch {
      pdfText = "";
    }
  }

  const textCorpus = `${detail.title} ${detail.subtitle} ${pdfText}`;
  const extractedAmount = parseLargestAmountFromText(textCorpus, {
    currency: "EUR",
    symbols: ["€"],
    keywords: ["administrative sanction", "sanction", "fine", "penalty"],
  });
  const amount =
    extractedAmount !== null && extractedAmount >= 1_000
      ? extractedAmount
      : null;

  return buildEuFineRecord({
    regulator: "CSSF",
    regulatorFullName: "Commission de Surveillance du Secteur Financier",
    countryCode: "LU",
    countryName: "Luxembourg",
    firmIndividual,
    firmCategory: "Financial Institution",
    amount,
    currency: "EUR",
    dateIssued,
    breachType: detail.subtitle || detail.title,
    breachCategories: categorizeCssfRecord(textCorpus),
    summary: `${detail.title}. ${detail.subtitle}`.trim(),
    finalNoticeUrl: detail.pdfUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
      pdfTextPreview: pdfText.slice(0, 500),
    },
  });
}

export async function loadCssfLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadCssfEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  return mapWithConcurrency(entries, 2, enrichCssfEntry);
}

export async function main() {
  await runScraper({
    name: "🇱🇺 CSSF Administrative Sanctions Scraper",
    liveLoader: loadCssfLiveRecords,
    testLoader: loadCssfLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CSSF scraper failed:", error);
    process.exit(1);
  });
}
