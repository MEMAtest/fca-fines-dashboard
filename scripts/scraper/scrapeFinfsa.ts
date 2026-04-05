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
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FINFSA_BASE_URL = "https://www.finanssivalvonta.fi";
const FINFSA_PRESS_RELEASES_URL =
  "https://www.finanssivalvonta.fi/en/publications-and-press-releases/Press-release/";
const FINFSA_START_YEAR = 2013;

export interface FinfsaArchiveEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  keywords: string[];
}

interface FinfsaDetail {
  title: string;
  dateIssued: string | null;
  lead: string;
  body: string;
  pdfUrl: string | null;
  keywords: string[];
}

function stripFinfsaDecisionAppendixPrefix(title: string) {
  return normalizeWhitespace(
    title.replace(/^A Decision Appendix has been added:\s*/i, ""),
  );
}

function parseFinfsaDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

function isFinfsaSanctionLike(title: string, keywords: string[]) {
  const corpus = `${title} ${keywords.join(" ")}`.toLowerCase();
  return /penalty payment|public warning|conditional fine|administrative fine|administrative sanction|sanction/.test(
    corpus,
  );
}

function isNonNominativeFinfsaEntity(entity: string) {
  const normalized = normalizeWhitespace(entity).toLowerCase();
  return /^(?:three natural persons|natural person|natural persons|unnamed persons?|persons?)$/.test(
    normalized,
  );
}

export function extractFinfsaFirm(title: string, body = "") {
  const normalizedTitle = stripFinfsaDecisionAppendixPrefix(title);
  const titlePatterns = [
    /supplementary amounts of conditional fine imposed on (.+?) payable/i,
    /conditional fine imposed on (.+?) payable/i,
    /penalty payment imposed on (.+?)(?: due to| for |$)/i,
    /public warning imposed on (.+?)(?: due to| for |$)/i,
    /public warning for (.+?)(?: due to| for |$)/i,
    /penalty payment(?:s)?(?: imposed)? of .*?\bto\s+(.+?)(?: due to| for |$)/i,
    /penalty payment(?:s)?(?: imposed)? of .*?\bfor\s+(.+?)(?: due to|$)/i,
    /administrative fine(?:s)? of .*?\bto\s+(.+?)(?: due to| for |$)/i,
    /administrative fine(?:s)? of .*?\bfor\s+(.+?)(?: due to|$)/i,
    /administrative fine\s+for\s+(.+?)(?: due to| for |$)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = normalizedTitle.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeWhitespace(match[1])
        .replace(/\s+for\s+omissions.*$/i, "")
        .replace(/\s+due to.*$/i, "")
        .replace(/[.;,:-]+$/g, "");
      if (candidate && !isNonNominativeFinfsaEntity(candidate)) {
        return candidate;
      }
    }
  }

  const normalizedBody = normalizeWhitespace(body);
  const bodyPatterns = [
    /(?:imposed a penalty payment|issued a public warning).*?\bto\s+(.+?)(?:,| because|\.)/i,
    /(?:penalty payment|public warning).*?\bfor\s+(.+?)(?:,| because|\.)/i,
  ];

  for (const pattern of bodyPatterns) {
    const match = normalizedBody.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeWhitespace(match[1])
        .replace(/\s+for\s+omissions.*$/i, "")
        .replace(/\s+due to.*$/i, "")
        .replace(/[.;,:-]+$/g, "");
      if (candidate && !isNonNominativeFinfsaEntity(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export function parseFinfsaArchiveHtml(html: string) {
  const $ = cheerio.load(html);
  const entries = new Map<string, FinfsaArchiveEntry>();

  $("li").each((_, element) => {
    const item = $(element);
    const link = item
      .find('a[href*="/en/publications-and-press-releases/Press-release/"]')
      .first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const title = stripFinfsaDecisionAppendixPrefix(link.text());
    const dateIssued = parseFinfsaDate(item.find("time.meta").first().text());
    const keywords = item
      .find(".page-list-block-time span")
      .map((__, keywordElement) => normalizeWhitespace($(keywordElement).text()))
      .get()
      .filter(Boolean);

    if (!href || !title || !dateIssued || !isFinfsaSanctionLike(title, keywords)) {
      return;
    }

    if (/decision appendix has been added/i.test(link.text())) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(FINFSA_BASE_URL, href);
    entries.set(detailUrl, {
      title,
      detailUrl,
      dateIssued,
      keywords,
    });
  });

  return [...entries.values()];
}

export function parseFinfsaDetailHtml(html: string, detailUrl: string): FinfsaDetail {
  const $ = cheerio.load(html);
  const article = $("article.col-sm-12").first();
  const articleText = normalizeWhitespace(article.text());
  const dateMatch = articleText.match(/Press release\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  const pdfHref = normalizeWhitespace(article.find('a[href$=".pdf"]').first().attr("href") || "");
  const paragraphs = article
    .find("p")
    .map((_, paragraph) => normalizeWhitespace($(paragraph).text()))
    .get()
    .filter(Boolean);
  const keywords = article
    .find('footer a.tag')
    .map((_, keyword) => normalizeWhitespace($(keyword).text()))
    .get()
    .filter(Boolean);

  return {
    title: stripFinfsaDecisionAppendixPrefix(article.find("h1").first().text()),
    dateIssued: dateMatch ? parseFinfsaDate(dateMatch[1]) : null,
    lead: normalizeWhitespace(article.find("span.lead-text").first().text()),
    body: normalizeWhitespace(paragraphs.join(" ")),
    pdfUrl: pdfHref ? makeAbsoluteUrl(FINFSA_BASE_URL, pdfHref) : null,
    keywords,
  };
}

function categorizeFinfsaRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (
    normalized.includes("anti-money laundering")
    || normalized.includes("money laundering")
    || normalized.includes("terrorist financing")
    || normalized.includes("customer due diligence")
  ) {
    categories.push("AML");
  }
  if (
    normalized.includes("managers’ transactions")
    || normalized.includes("managers' transactions")
    || normalized.includes("notification obligation")
    || normalized.includes("reporting")
  ) {
    categories.push("DISCLOSURE");
  }
  if (normalized.includes("conditional fine")) {
    categories.push("ENFORCEMENT");
  }
  if (normalized.includes("public warning")) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["MARKETS_SUPERVISION"];
}

async function enrichFinfsaEntry(entry: FinfsaArchiveEntry) {
  const detailHtml = await fetchText(entry.detailUrl);
  const detail = parseFinfsaDetailHtml(detailHtml, entry.detailUrl);
  const textCorpus = `${entry.title} ${detail.lead} ${detail.body} ${detail.keywords.join(" ")}`;
  const firmIndividual = extractFinfsaFirm(entry.title, `${detail.lead} ${detail.body}`);

  if (!firmIndividual) {
    return null;
  }

  const amount = parseLargestAmountFromText(textCorpus, {
    currency: "EUR",
    symbols: ["€"],
    keywords: [
      "penalty payment",
      "public warning",
      "conditional fine",
      "administrative fine",
      "sanction",
    ],
  });

  return buildEuFineRecord({
    regulator: "FINFSA",
    regulatorFullName: "Finnish Financial Supervisory Authority",
    countryCode: "FI",
    countryName: "Finland",
    firmIndividual,
    firmCategory: "Firm or Individual",
    amount,
    currency: "EUR",
    dateIssued: detail.dateIssued || entry.dateIssued,
    breachType: detail.title || entry.title,
    breachCategories: categorizeFinfsaRecord(textCorpus),
    summary: detail.lead || detail.body || entry.title,
    finalNoticeUrl: detail.pdfUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      ...entry,
      detail,
    },
  });
}

export async function loadFinfsaLiveRecords() {
  const flags = getCliFlags();
  const currentYear = new Date().getUTCFullYear();
  const archiveEntries = new Map<string, FinfsaArchiveEntry>();

  for (let year = currentYear; year >= FINFSA_START_YEAR; year -= 1) {
    const yearUrl = `${FINFSA_PRESS_RELEASES_URL}${year}/`;
    const html = await fetchText(yearUrl);
    const entries = parseFinfsaArchiveHtml(html).sort((left, right) =>
      right.dateIssued.localeCompare(left.dateIssued),
    );

    for (const entry of entries) {
      archiveEntries.set(entry.detailUrl, entry);
      if (flags.limit && flags.limit > 0 && archiveEntries.size >= flags.limit) {
        break;
      }
    }

    if (flags.limit && flags.limit > 0 && archiveEntries.size >= flags.limit) {
      break;
    }
  }

  const records = await mapWithConcurrency(
    [...archiveEntries.values()],
    3,
    enrichFinfsaEntry,
  );

  return records.filter(
    (record): record is NonNullable<(typeof records)[number]> => record !== null,
  );
}

export async function main() {
  await runScraper({
    name: "🇫🇮 FIN-FSA Sanctions Press Release Scraper",
    liveLoader: loadFinfsaLiveRecords,
    testLoader: loadFinfsaLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FIN-FSA scraper failed:", error);
    process.exit(1);
  });
}
