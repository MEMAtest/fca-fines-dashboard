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

const ACPR_BASE_URL = "https://acpr.banque-france.fr";
const ACPR_ARCHIVE_URL =
  "https://acpr.banque-france.fr/fr/reglementation/recueil-des-sanctions";
const FRENCH_MONTHS = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12,
} as const satisfies Record<string, number>;

export interface AcprArchiveEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  firmIndividual: string;
}

interface AcprDetail {
  title: string;
  pdfUrl: string | null;
  summary: string;
}

export function parseAcprArchiveHtml(html: string) {
  const $ = cheerio.load(html);
  const entries = new Map<string, AcprArchiveEntry>();

  $('a[href*="/fr/publications-et-statistiques/publications/"]').each(
    (_, element) => {
      const title = normalizeWhitespace($(element).text());
      const href = normalizeWhitespace($(element).attr("href") || "");
      if (!title || !href || !/d[ée]cision/i.test(title)) {
        return;
      }

      const dateIssued = extractAcprDate(title);
      const firmIndividual = extractAcprFirm(title);
      if (!dateIssued || !firmIndividual || isPlaceholderEntity(firmIndividual)) {
        return;
      }

      const detailUrl = makeAbsoluteUrl(ACPR_BASE_URL, href);
      entries.set(detailUrl, {
        title,
        detailUrl,
        dateIssued,
        firmIndividual,
      });
    },
  );

  return [...entries.values()];
}

export function parseAcprDetailHtml(html: string, detailUrl: string): AcprDetail {
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($("h1").first().text());
  const pdfHref = normalizeWhitespace(
    $('a.card-download[href^="/system/files/"]').first().attr("href") || "",
  );

  return {
    title,
    pdfUrl: pdfHref ? makeAbsoluteUrl(ACPR_BASE_URL, pdfHref) : null,
    summary: normalizeWhitespace($("main").text()).slice(0, 1200),
  };
}

export function extractAcprDate(title: string) {
  const normalized = normalizeWhitespace(title);
  const match = normalized.match(/\bdu\s+(\d{1,2}(?:er)?)\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/i);
  if (!match) {
    return null;
  }

  return parseLocalizedDayMonthYear(`${match[1]} ${match[2]} ${match[3]}`, FRENCH_MONTHS);
}

export function extractAcprFirm(title: string) {
  const normalized = normalizeWhitespace(title);
  const match = normalized.match(/à l[’']égard de (.+?)(?:\(|$)/i);
  if (!match) {
    return null;
  }

  return normalizeWhitespace(match[1])
    .replace(/^la\s+/i, "")
    .replace(/\s+[;,:-]\s*$/g, "")
    .replace(/^la société\s+/i, "")
    .replace(/^l['’]établissement de crédit\s+/i, "")
    .replace(/^l['’]établissement de paiement\s+/i, "");
}

function categorizeAcprRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (
    normalized.includes("blanchiment")
    || normalized.includes("aml")
    || normalized.includes("terrorisme")
  ) {
    categories.push("AML");
  }
  if (normalized.includes("contrôle interne") || normalized.includes("controle interne")) {
    categories.push("CONTROLS");
  }
  if (normalized.includes("gouvernance")) {
    categories.push("GOVERNANCE");
  }
  if (normalized.includes("assurance")) {
    categories.push("INSURANCE");
  }

  return categories.length > 0 ? categories : ["PRUDENTIAL_SUPERVISION"];
}

function isPlaceholderEntity(name: string) {
  const normalized = normalizeWhitespace(name)
    .replace(/[\[\]]/g, "")
    .replace(/^d['’]/i, "")
    .trim();

  return /^(?:[A-Z]|M(?:onsieur)?\.?\s+[A-Z]|Mme\.?\s+[A-Z]|Madame\s+[A-Z]|société\s+[A-Z]|établissement(?: de (?:crédit|paiement))?\s+[A-Z]|X(?:,\s*Y(?:\s*et\s*Z)?)?)$/i
    .test(normalized);
}

async function enrichAcprEntry(entry: AcprArchiveEntry) {
  const detailHtml = await fetchText(entry.detailUrl);
  const detail = parseAcprDetailHtml(detailHtml, entry.detailUrl);

  let pdfText = "";
  if (detail.pdfUrl) {
    try {
      pdfText = await extractPdfTextFromUrl(detail.pdfUrl);
    } catch {
      pdfText = "";
    }
  }

  const textCorpus = `${detail.title} ${detail.summary} ${pdfText}`;
  const amount = parseLargestAmountFromText(textCorpus, {
    currency: "EUR",
    symbols: ["€"],
    keywords: [
      "sanction pécuniaire",
      "amende",
      "sanction",
      "pénalité",
      "penalty",
    ],
  });

  return buildEuFineRecord({
    regulator: "ACPR",
    regulatorFullName: "Autorité de contrôle prudentiel et de résolution",
    countryCode: "FR",
    countryName: "France",
    firmIndividual: entry.firmIndividual,
    firmCategory: "Bank or Financial Institution",
    amount,
    currency: "EUR",
    dateIssued: entry.dateIssued,
    breachType: detail.title,
    breachCategories: categorizeAcprRecord(textCorpus),
    summary: detail.title,
    finalNoticeUrl: detail.pdfUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      ...entry,
      detail,
      pdfTextPreview: pdfText.slice(0, 500),
    },
  });
}

export async function loadAcprLiveRecords() {
  const flags = getCliFlags();
  const archiveHtml = await fetchText(ACPR_ARCHIVE_URL);
  const entries = parseAcprArchiveHtml(archiveHtml)
    .sort((left, right) => right.dateIssued.localeCompare(left.dateIssued))
    .slice(0, flags.limit && flags.limit > 0 ? flags.limit : undefined);

  return mapWithConcurrency(entries, 2, enrichAcprEntry);
}

export async function main() {
  await runScraper({
    name: "🇫🇷 ACPR Sanctions Compendium Scraper",
    liveLoader: loadAcprLiveRecords,
    testLoader: loadAcprLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ ACPR scraper failed:", error);
    process.exit(1);
  });
}
