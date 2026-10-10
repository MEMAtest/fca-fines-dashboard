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
  toIsoDateFromParts,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";
import { assessEntityName, cleanEntityName, unnamedParty, UNNAMED_PARTY_CATEGORY } from "./lib/entityName.js";

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

const FSMA_ANONYMISED = /^(?:(?:monsieur|madame|mme|mr|m\.)\s*)?[A-Z](?:\s*,\s*[A-Z])*(?:\s+(?:et|and|en)\s+(?:de\s+)?(?:(?:monsieur|madame|mme|mr|m\.)\s*)?[A-Z])*$/i;

/**
 * Display name for an FSMA settlement. The register publishes anonymised versions
 * ("M. X", "X, Y et Z", "SA A et de M. Y") and some rows capture the legal basis
 * instead of the party ("la loi du 11 janvier 1993"). Those become honest unnamed
 * labels; identity keeps the legacy string.
 */
export function finalizeFsmaName(raw: string): { name: string; named: boolean } {
  let name = cleanEntityName(raw)
    .replace(/\s*[-–—]\s*Version (?:anglaise|française|néerlandaise)\s*$/i, '')
    .replace(/\s*\((?:Seulement disponible en [^)]*)\)\s*$/i, '');
  const anonymisedWhole = FSMA_ANONYMISED.test(name);
  name = name.replace(/\s+(?:et|and)\s+(?:de\s+)?(?:(?:monsieur|madame|mme|mr|m\.)\s+)?[A-Z]$/i, (m) => (/^\s+(?:et|and)\s+de\s/i.test(m) || /\b(?:monsieur|madame|mme|m\.)\b/i.test(m) ? '' : m));
  const firmThenLetter = name.match(/^(?:SA|SRL|NV|BV|SPRL)\s+[A-Z]$/);
  if (anonymisedWhole || FSMA_ANONYMISED.test(name) || firmThenLetter || /^(?:SA|SRL|NV|BV|SPRL)\s+[A-Z]\b.*\b(?:monsieur|madame|M\.|Mme)\s+[A-Z]$/.test(name)) {
    const person = /^(?:monsieur|madame|mme|mr|m\.)\b/i.test(name) || /^[A-Z](?:\s*,\s*[A-Z])+/.test(name);
    return { name: unnamedParty('FSMA', person ? 'individual' : 'party').name, named: false };
  }
  if (!assessEntityName(name).ok) return { name: unnamedParty('FSMA', 'party').name, named: false };
  return { name, named: true };
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

/**
 * The settlement sum is stated once, in the auditor's proposal ("le paiement
 * d'une somme de 250.000 €", "de betaling van een som van € 75.000"). Other
 * euro figures in the decision (option volumes, investor totals) are not the
 * fine, and Belgian "250.000" uses a dot as thousands separator.
 */
export function extractFsmaSettlementAmount(text: string) {
  const normalized = normalizeWhitespace(text);
  const proposal = normalized.match(
    /(?:paiement\s+d['’]une\s+somme\s+de|betaling\s+van\s+een\s+som\s+van|payment\s+of\s+(?:a\s+)?(?:sum|amount)\s+of|zahlung\s+(?:einer\s+summe\s+)?von)\s*((?:€|EUR)?\s*\d[\d.,\s]{0,18}\d\s*(?:€|EUR)?)/i,
  );
  if (!proposal) {
    return null;
  }
  return parseLargestAmountFromText(proposal[1], { currency: "EUR", symbols: ["€"], keywords: [] });
}

async function enrichFsmaRow(row: FsmaRow) {
  let pdfText = "";
  try {
    pdfText = await extractPdfTextFromUrl(row.noticeUrl);
  } catch {
    pdfText = "";
  }

  const amount = pdfText ? extractFsmaSettlementAmount(pdfText) : null;
  const legacyAmountIdentity = pdfText
    ? legacyIdentity(() => parseLargestAmountFromText(pdfText, {
      currency: "EUR",
      symbols: ["€"],
      keywords: [
        "amende administrative",
        "amende",
        "règlement transactionnel",
        "reglement transactionnel",
        "sanction",
      ],
    }))
    : null;

  const fsmaParty = finalizeFsmaName(row.firmIndividual);

  return buildEuFineRecord({
    regulator: "FSMA",
    regulatorFullName: "Financial Services and Markets Authority",
    countryCode: "BE",
    countryName: "Belgium",
    firmIndividual: fsmaParty.name,
    identityFirm: row.firmIndividual,
    firmCategory: fsmaParty.named ? "Firm or Individual" : UNNAMED_PARTY_CATEGORY,
    amount,
    legacyAmountIdentity,
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
