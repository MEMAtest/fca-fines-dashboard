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
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FISE_BASE_URL = "https://www.fi.se";
const FISE_LIST_URL = "https://www.fi.se/en/published/sanctions/financial-firms/";

export interface FiseEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  intro: string;
}

interface FiseListPage {
  entries: FiseEntry[];
  nextPageUrl: string | null;
}

interface FiseDetail {
  title: string;
  dateIssued: string | null;
  summary: string;
  categories: string[];
  pdfUrl: string | null;
}

export function parseFiseListPage(html: string, pageUrl: string): FiseListPage {
  const $ = cheerio.load(html);
  const entries = new Map<string, FiseEntry>();

  $(".list-item.extended-click-area").each((_, element) => {
    const item = $(element);
    const href = normalizeWhitespace(item.find("h2 a").attr("href") || "");
    const title = normalizeWhitespace(item.find("h2 a").text());
    const dateIssued = parseFiseDate(item.find(".date").text());
    const intro = normalizeWhitespace(item.find(".introduction").text());

    if (!href || !title || !dateIssued) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(FISE_BASE_URL, href);
    entries.set(detailUrl, {
      title,
      detailUrl,
      dateIssued,
      intro,
    });
  });

  const nextHref = normalizeWhitespace(
    $("#paging a[href]").first().attr("href") || "",
  );

  return {
    entries: [...entries.values()],
    nextPageUrl: nextHref ? makeAbsoluteUrl(pageUrl, nextHref) : null,
  };
}

export function parseFiseDate(input: string) {
  const cleaned = normalizeWhitespace(input);
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function extractFiseFirm(title: string, text = "") {
  const normalizedTitle = normalizeWhitespace(title);
  const normalizedText = normalizeWhitespace(text);
  const titlePatterns = [
    /^FI withdraws(?: the)? authorisation (?:of|for) (.+)$/i,
    /^(.+?) receives\b/i,
    /^(.+?) is issued\b/i,
    /^(.+?) gets\b/i,
    /^Warning issued to (.+)$/i,
  ];

  for (const pattern of titlePatterns) {
    const match = normalizedTitle.match(pattern);
    if (match?.[1]) {
      const titleCandidate = normalizeWhitespace(match[1]);

      // Some FI titles truncate the legal suffix, but the summary repeats the
      // full company name. Prefer that fuller name when the title ends with a
      // lowercase token and the text includes a legal-suffix variant.
      if (/\b[a-zåäö]{2,}\b/.test(titleCandidate) && normalizedText) {
        const escapedTitleCandidate = titleCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const expandedMatch = normalizedText.match(
          new RegExp(
            `\\b(${escapedTitleCandidate}\\s+(?:AB|publ|Bank\\s+AB|S\\.A\\.|Ltd|Limited|LLC|GmbH))\\b`,
            "i",
          ),
        );
        if (expandedMatch?.[1]) {
          return normalizeWhitespace(expandedMatch[1]);
        }
      }

      return titleCandidate;
    }
  }

  const textPatterns = [
    /^([A-ZÅÄÖ][^.(]{2,}?)\s+\([^)]+\)\s+is\b/,
    /^([A-ZÅÄÖ][^,.]{2,}?)\s+is\b/,
    /^Finansinspektionen has investigated ([A-ZÅÄÖ][^,.]{2,}?)(?:\s|,)/i,
  ];

  for (const pattern of textPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  return null;
}

export function parseFiseDetailHtml(html: string, detailUrl: string): FiseDetail {
  const $ = cheerio.load(html);
  const dateBlock = normalizeWhitespace($(".date-and-category").first().text());
  const summary = normalizeWhitespace($(".editor-content").text());
  const pdfHref = normalizeWhitespace($('a[href$=".pdf"]').first().attr("href") || "");
  const categories = dateBlock
    .split("|")
    .slice(1)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  return {
    title: normalizeWhitespace($("h1").first().text()),
    dateIssued: parseFiseDate(dateBlock.split("|")[0] || ""),
    summary,
    categories,
    pdfUrl: pdfHref ? makeAbsoluteUrl(FISE_BASE_URL, pdfHref) : null,
  };
}

function categorizeFiseRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (
    normalized.includes("anti-money laundering")
    || normalized.includes("money laundering")
    || normalized.includes("aml")
  ) {
    categories.push("AML");
  }
  if (normalized.includes("consumer credit")) {
    categories.push("CONSUMER_CREDIT");
  }
  if (
    normalized.includes("internal governance")
    || normalized.includes("governance")
    || normalized.includes("internal control")
  ) {
    categories.push("GOVERNANCE");
  }
  if (normalized.includes("insurance distribution") || normalized.includes("insurance")) {
    categories.push("INSURANCE");
  }
  if (
    normalized.includes("securities")
    || normalized.includes("market abuse")
    || normalized.includes("securities market")
  ) {
    categories.push("MARKETS_SUPERVISION");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

export async function loadFiseEntries(limit: number | null) {
  const entries = new Map<string, FiseEntry>();
  let nextPageUrl: string | null = FISE_LIST_URL;
  const visitedPages = new Set<string>();

  while (nextPageUrl) {
    if (visitedPages.has(nextPageUrl)) {
      break;
    }
    visitedPages.add(nextPageUrl);

    const html = await fetchText(nextPageUrl);
    const page = parseFiseListPage(html, nextPageUrl);

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

async function enrichFiseEntry(entry: FiseEntry) {
  const detailHtml = await fetchText(entry.detailUrl);
  const detail = parseFiseDetailHtml(detailHtml, entry.detailUrl);

  let pdfText = "";
  if (detail.pdfUrl) {
    try {
      pdfText = await extractPdfTextFromUrl(detail.pdfUrl);
    } catch {
      pdfText = "";
    }
  }

  const textCorpus = `${entry.title} ${entry.intro} ${detail.summary} ${pdfText}`;
  const firmIndividual = extractFiseFirm(entry.title, `${entry.intro} ${detail.summary} ${pdfText}`);

  if (!firmIndividual) {
    return null;
  }

  const amount = parseLargestAmountFromText(textCorpus, {
    currency: "SEK",
    keywords: [
      "administrative fine",
      "fine",
      "sanction",
      "remark",
      "warning",
    ],
  });

  return buildEuFineRecord({
    regulator: "FISE",
    regulatorFullName: "Finansinspektionen",
    countryCode: "SE",
    countryName: "Sweden",
    firmIndividual,
    firmCategory: "Financial Institution",
    amount,
    currency: "SEK",
    dateIssued: detail.dateIssued || entry.dateIssued,
    breachType: detail.title || entry.title,
    breachCategories: categorizeFiseRecord(textCorpus),
    summary: entry.intro || detail.summary || entry.title,
    finalNoticeUrl: detail.pdfUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
      pdfTextPreview: pdfText.slice(0, 500),
    },
  });
}

export async function loadFiseLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadFiseEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  const records = await mapWithConcurrency(entries, 2, enrichFiseEntry);
  return records.filter((record) => record !== null);
}

export async function main() {
  await runScraper({
    name: "🇸🇪 Finansinspektionen Sanctions Scraper",
    liveLoader: loadFiseLiveRecords,
    testLoader: loadFiseLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FISE scraper failed:", error);
    process.exit(1);
  });
}
