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
  toIsoDateFromParts,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FSMA_BASE_URL = "https://www.fsma.be";
const FSMA_ARCHIVE_URL = "https://www.fsma.be/fr/reglements-transactionnels";

export interface FsmaRow {
  dateIssued: string;
  title: string;
  firmIndividual: string;
  noticeUrl: string;
  sourceUrl: string;
}

export function parseFsmaDate(input: string) {
  const match = normalizeWhitespace(input).match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[3], 10);
  return toIsoDateFromParts(2000 + year, Number.parseInt(match[2], 10), Number.parseInt(match[1], 10));
}

export function parseFsmaHtml(html: string, sourceUrl: string): FsmaRow[] {
  const $ = cheerio.load(html);
  const rows: FsmaRow[] = [];

  $(".text-content--ct-body table tbody tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 2) {
      return;
    }

    const dateIssued = parseFsmaDate($(cells[0]).text());
    const link = $(cells[1]).find("a").first();
    const title = normalizeWhitespace($(cells[1]).text());
    const href = normalizeWhitespace(link.attr("href") || "");

    if (!dateIssued || !title || !href) {
      return;
    }

    const firmIndividual = extractFsmaFirm(title);
    if (!firmIndividual || isPlaceholderEntity(firmIndividual) || isNonNominativeFsmaTitle(title)) {
      return;
    }

    rows.push({
      dateIssued,
      title,
      firmIndividual,
      noticeUrl: makeAbsoluteUrl(FSMA_BASE_URL, href),
      sourceUrl,
    });
  });

  return rows;
}

export function extractFsmaFirm(title: string) {
  const normalized = normalizeWhitespace(title);
  const patterns = [
    /ayant re[çc]u l'accord de\s+(.+?)(?:\(|$)/i,
    /prononc[ée]e?s?\s+à l[’']encontre de\s+(.+?)(?:\s+pour|\(|$)/i,
    /à l[’']égard de\s+(.+?)(?:\s+pour|\(|$)/i,
    /à\s+([^,]+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1])
        .replace(/^de\s+/i, "")
        .replace(/^d['’]/i, "");
    }
  }

  return null;
}

function isNonNominativeFsmaTitle(title: string) {
  return /non nominatif|résumé collectif/i.test(title);
}

function isPlaceholderEntity(name: string) {
  const normalized = normalizeWhitespace(name);
  return /^(?:X|Y|Z|A|B|monsieur X|madame X)$/i.test(normalized);
}

function categorizeFsmaRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (normalized.includes("blanchiment") || normalized.includes("aml")) {
    categories.push("AML");
  }
  if (normalized.includes("délit d'initié") || normalized.includes("initié")) {
    categories.push("INSIDER_DEALING");
  }
  if (normalized.includes("manipulation de marché")) {
    categories.push("MARKET_MANIPULATION");
  }
  if (normalized.includes("assurance")) {
    categories.push("INSURANCE");
  }

  return categories.length > 0 ? categories : ["MARKETS_SUPERVISION"];
}

async function enrichFsmaRow(row: FsmaRow) {
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
        "amende administrative",
        "amende",
        "règlement transactionnel",
        "reglement transactionnel",
        "sanction",
      ],
    })
    : null;

  return buildEuFineRecord({
    regulator: "FSMA",
    regulatorFullName: "Financial Services and Markets Authority",
    countryCode: "BE",
    countryName: "Belgium",
    firmIndividual: row.firmIndividual,
    firmCategory: "Firm or Individual",
    amount,
    currency: "EUR",
    dateIssued: row.dateIssued,
    breachType: row.title,
    breachCategories: categorizeFsmaRecord(`${row.title} ${pdfText}`),
    summary: row.title,
    finalNoticeUrl: row.noticeUrl,
    sourceUrl: row.sourceUrl,
    rawPayload: {
      ...row,
      pdfTextPreview: pdfText.slice(0, 500),
    },
  });
}

export async function loadFsmaLiveRecords() {
  const flags = getCliFlags();
  const html = await fetchText(FSMA_ARCHIVE_URL);
  const rows = parseFsmaHtml(html, FSMA_ARCHIVE_URL)
    .slice(0, flags.limit && flags.limit > 0 ? flags.limit : undefined);
  return mapWithConcurrency(rows, 2, enrichFsmaRow);
}

export async function main() {
  await runScraper({
    name: "🇧🇪 FSMA Administrative Sanctions Scraper",
    liveLoader: loadFsmaLiveRecords,
    testLoader: loadFsmaLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FSMA scraper failed:", error);
    process.exit(1);
  });
}
