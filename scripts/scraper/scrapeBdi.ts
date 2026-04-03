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
  parseLocalizedDayMonthYear,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const BDI_BASE_URL = "https://www.bancaditalia.it";
const BDI_INDEX_URL =
  "https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/index.html";
const BDI_SEARCH_URL =
  "https://www.bancaditalia.it/compiti/vigilanza/provvedimenti-sanzionatori/ricerca/ricerca.html";
const BDI_FALLBACK_YEARS = [2026, 2025, 2024, 2023, 2022, 2021];
const BDI_REQUEST_DELAY_MS = 600;
const ITALIAN_MONTHS = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
} as const satisfies Record<string, number>;

interface BdiYearEntry {
  year: number;
  url: string;
}

export interface BdiRow {
  title: string;
  firmIndividual: string;
  dateIssued: string;
  publicationDate: string;
  noticeUrl: string;
  sourceUrl: string;
  breachHint: string | null;
}

export function parseBdiYearEntries(html: string) {
  const $ = cheerio.load(html);
  const entries = new Map<number, string>();

  $('a[href*="min_anno_pubblicazione="]').each((_, element) => {
    const href = normalizeWhitespace($(element).attr("href") || "");
    const yearText = normalizeWhitespace($(element).text());
    const year = Number.parseInt(yearText, 10);

    if (!href || !Number.isFinite(year)) {
      return;
    }

    entries.set(year, makeAbsoluteUrl(BDI_BASE_URL, href));
  });

  return [...entries.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([year, url]) => ({ year, url }));
}

export function parseBdiSearchHtml(html: string, sourceUrl: string): BdiRow[] {
  const $ = cheerio.load(html);
  const rows: BdiRow[] = [];

  $(".bdi-search-results li").each((_, element) => {
    const item = $(element);
    const title = normalizeWhitespace(item.find("a.bdi-result-title").text());
    const noticeHref = normalizeWhitespace(
      item.find("a.bdi-result-title").attr("href") || "",
    );
    const publicationRaw = normalizeWhitespace(item.find(".bdi-result-date").text())
      .replace(/^Data Pubblicazione:/i, "")
      .trim();

    if (!title || !noticeHref) {
      return;
    }

    const firmIndividual = extractBdiFirm(title);
    const dateIssued = extractBdiDecisionDate(title);
    const publicationDate = parseBdiDate(publicationRaw);

    if (!firmIndividual || !dateIssued || !publicationDate) {
      return;
    }

    rows.push({
      title,
      firmIndividual,
      dateIssued,
      publicationDate,
      noticeUrl: makeAbsoluteUrl(BDI_BASE_URL, noticeHref),
      sourceUrl,
      breachHint: extractBdiBreachHint(title),
    });
  });

  return rows;
}

function parseBdiDate(input: string) {
  return parseLocalizedDayMonthYear(input, ITALIAN_MONTHS);
}

export function extractBdiDecisionDate(title: string) {
  const normalized = normalizeWhitespace(title);
  const match = normalized.match(
    /\bdel(?:l)?[’']?\s*(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/i,
  );
  if (!match) {
    return null;
  }

  return parseBdiDate(`${match[1]} ${match[2]} ${match[3]}`);
}

export function extractBdiFirm(title: string) {
  return normalizeWhitespace(
    title.split(/\s+[–-]\s+Provvedimento\s+/i)[0] || "",
  );
}

function extractBdiBreachHint(title: string) {
  const match = title.match(/\(([^)]+)\)\s*$/);
  return match ? normalizeWhitespace(match[1]) : null;
}

function categorizeBdiRow(row: BdiRow, pdfText: string) {
  const corpus = `${row.title} ${pdfText}`.toLowerCase();
  const categories: string[] = [];

  if (corpus.includes("aml") || corpus.includes("antiriciclaggio")) {
    categories.push("AML");
  }
  if (corpus.includes("trasparenza")) {
    categories.push("DISCLOSURE");
  }
  if (corpus.includes("esponenti")) {
    categories.push("GOVERNANCE");
  }
  if (corpus.includes("controlli interni")) {
    categories.push("CONTROLS");
  }

  return categories.length > 0 ? categories : ["BANKING_SUPERVISION"];
}

async function enrichBdiRow(row: BdiRow) {
  let pdfText = "";

  try {
    pdfText = await extractPdfTextFromUrl(row.noticeUrl);
  } catch {
    pdfText = "";
  }

  const amount = pdfText
    ? parseLargestAmountFromText(pdfText, {
      currency: "EUR",
      symbols: ["€"],
      keywords: [
        "sanzione",
        "sanzione pecuniaria",
        "sanzione amministrativa pecuniaria",
        "ammenda",
      ],
    })
    : null;

  return buildEuFineRecord({
    regulator: "BDI",
    regulatorFullName: "Banca d'Italia",
    countryCode: "IT",
    countryName: "Italy",
    firmIndividual: row.firmIndividual,
    firmCategory: "Credit Institution",
    amount,
    currency: "EUR",
    dateIssued: row.dateIssued,
    breachType: row.breachHint || "Banca d'Italia administrative sanction",
    breachCategories: categorizeBdiRow(row, pdfText),
    summary: `${row.firmIndividual} was sanctioned by Banca d'Italia. ${row.title}`,
    finalNoticeUrl: row.noticeUrl,
    sourceUrl: row.sourceUrl,
    rawPayload: {
      ...row,
      publicationDate: row.publicationDate,
      pdfTextPreview: pdfText.slice(0, 500),
    },
  });
}

async function loadBdiYearRows(entry: BdiYearEntry, maxRows: number | null) {
  const firstPageHtml = await fetchText(entry.url);
  const firstRows = parseBdiSearchHtml(firstPageHtml, entry.url);
  const $ = cheerio.load(firstPageHtml);
  const pageUrls = new Set<string>();

  $('nav#bdi_form_pagination a[href*="page="]').each((_, element) => {
    const href = normalizeWhitespace($(element).attr("href") || "");
    if (!href) {
      return;
    }

    pageUrls.add(makeAbsoluteUrl(BDI_BASE_URL, href));
  });

  const rows = [...firstRows];
  if (maxRows && rows.length >= maxRows) {
    return rows.slice(0, maxRows);
  }

  for (const pageUrl of [...pageUrls].sort()) {
    await delay(BDI_REQUEST_DELAY_MS);
    const html = await fetchText(pageUrl);
    rows.push(...parseBdiSearchHtml(html, pageUrl));

    if (maxRows && rows.length >= maxRows) {
      return rows.slice(0, maxRows);
    }
  }

  return rows;
}

export async function loadBdiLiveRecords() {
  const flags = getCliFlags();
  const indexHtml = await fetchText(BDI_INDEX_URL);
  const years = parseBdiYearEntries(indexHtml);
  const targetYears = years.length > 0
    ? years
    : BDI_FALLBACK_YEARS.map((year) => ({
      year,
      url: `${BDI_SEARCH_URL}?min_anno_pubblicazione=${year}&max_anno_pubblicazione=${year}`,
    }));

  const rowMap = new Map<string, BdiRow>();
  for (const entry of targetYears) {
    const remainingLimit =
      flags.limit && flags.limit > 0 ? Math.max(flags.limit - rowMap.size, 0) : null;
    if (remainingLimit === 0) {
      break;
    }

    const rows = await loadBdiYearRows(entry, remainingLimit);
    for (const row of rows) {
      rowMap.set(`${row.firmIndividual}|${row.dateIssued}|${row.noticeUrl}`, row);
      if (flags.limit && flags.limit > 0 && rowMap.size >= flags.limit) {
        break;
      }
    }

    if (flags.limit && flags.limit > 0 && rowMap.size >= flags.limit) {
      break;
    }
  }

  return mapWithConcurrency(
    [...rowMap.values()].sort((left, right) =>
      right.dateIssued.localeCompare(left.dateIssued)
    ),
    1,
    enrichBdiRow,
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function main() {
  await runScraper({
    name: "🇮🇹 Banca d'Italia Sanctions Scraper",
    liveLoader: loadBdiLiveRecords,
    testLoader: loadBdiLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ BDI scraper failed:", error);
    process.exit(1);
  });
}
