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
  legacyIdentity,
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
  const normalized = normalizeWhitespace(title)
    .replace(/^Administrative sanctions?\s+of\s+/i, "");
  const singleDate = parseMonthNameDate(normalized);
  if (singleDate) {
    return singleDate;
  }

  const multiDateMatch = normalized.match(
    /^(\d{1,2}(?:\s*,\s*\d{1,2})*(?:\s+and\s+\d{1,2})?)\s+([A-Za-z]+)\s+(\d{4})$/i,
  );
  if (!multiDateMatch) {
    return null;
  }

  const days = multiDateMatch[1]
    .split(/(?:,|\band\b)/i)
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((day) => Number.isFinite(day));
  if (days.length === 0) {
    return null;
  }

  return parseMonthNameDate(
    `${Math.max(...days)} ${multiDateMatch[2]} ${multiDateMatch[3]}`,
  );
}

export function extractCssfFirm(subtitle: string) {
  const normalized = normalizeWhitespace(subtitle);
  const match = normalized.match(/imposed on (.+)$/i);
  if (match) return normalizeWhitespace(match[1]);

  // Anonymised decisions name a class, not a firm: "Administrative sanction on
  // a réviseur d'entreprises agréé ("approved statutory auditor")". Keep the
  // class so the row is promoted as an unnamed subject rather than aborting.
  const anonymised = normalized.match(/\bsanctions?\s+(?:on|against)\s+(?:an?|the)?\s*(.+)$/i);
  if (anonymised) {
    const descriptor = normalizeWhitespace(
      anonymised[1].replace(/[“”"]/g, "").replace(/\s*\(\s*/g, " (").replace(/\.$/, ""),
    );
    if (descriptor.length >= 3) return `Unnamed ${descriptor}`;
  }
  return null;
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
    const html = await fetchText(nextPageUrl, { timeout: 120_000 });
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
  const detailHtml = await fetchText(entry.detailUrl, { timeout: 120_000 });
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
  const legacyExtracted = legacyIdentity(() =>
    parseLargestAmountFromText(textCorpus, {
      currency: "EUR",
      symbols: ["€"],
      keywords: ["administrative sanction", "sanction", "fine", "penalty"],
    }),
  );
  const legacyAmountIdentity =
    legacyExtracted !== null && legacyExtracted >= 1_000 ? legacyExtracted : null;

  return buildEuFineRecord({
    regulator: "CSSF",
    regulatorFullName: "Commission de Surveillance du Secteur Financier",
    countryCode: "LU",
    countryName: "Luxembourg",
    firmIndividual,
    firmCategory: "Financial Institution",
    amount,
    legacyAmountIdentity,
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
  // One unparseable detail page must not discard the whole run: log and skip.
  const results = await mapWithConcurrency(entries, 4, async (entry) => {
    try {
      return await enrichCssfEntry(entry);
    } catch (error) {
      console.warn(
        `⚠️ Skipping CSSF entry ${entry.detailUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  });
  return results.filter((record): record is NonNullable<typeof record> => record !== null);
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
