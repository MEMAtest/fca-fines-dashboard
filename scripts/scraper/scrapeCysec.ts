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

const CYSEC_BASE_URL = "https://www.cysec.gov.cy";
const CYSEC_LIST_URL = "https://www.cysec.gov.cy/en-GB/public-info/decisions/";
const DEFAULT_CYSEC_PDF_ENRICH_LIMIT = 150;

export interface CysecEntry {
  title: string;
  firmIndividual: string;
  announcementDate: string | null;
  dateIssued: string;
  legislation: string;
  subject: string;
  pdfUrl: string;
  sourceUrl: string;
}

interface CysecPage {
  entries: CysecEntry[];
  totalPages: number;
}

function parseCysecDate(input: string) {
  const normalized = normalizeWhitespace(input).replace(/\./g, "");
  return parseMonthNameDate(normalized);
}

function normalizeCysecLabel(input: string) {
  return normalizeWhitespace(input)
    .replace(/[:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasGreekCharacters(input: string) {
  return /[\u0370-\u03ff]/u.test(input);
}

async function requestCysecText(url: string) {
  return fetchText(url, { insecureHTTPParser: true });
}

function getCysecPdfEnrichLimit() {
  const raw = Number.parseInt(process.env.CYSEC_PDF_ENRICH_LIMIT || "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CYSEC_PDF_ENRICH_LIMIT;
}

export function extractCysecFirm(title: string, regarding = "") {
  const titleCandidate = normalizeWhitespace(title);
  const regardingCandidate = normalizeWhitespace(regarding);

  if (regardingCandidate && !hasGreekCharacters(regardingCandidate)) {
    return regardingCandidate;
  }

  return titleCandidate;
}

export type CysecActionType =
  | "fine"
  | "settlement"
  | "annulled"
  | "trading_suspension"
  | "authorisation_withdrawal"
  | "licence_suspension"
  | "takeover_exemption"
  | "procedural"
  | "other";

/**
 * Classify a CySEC board decision by its stated subject. Trading suspensions,
 * authorisation withdrawals / suspensions / recalls, takeover-bid exemptions
 * and extensions, re-examinations, compensation-process notices and ANNULLED
 * decisions are supervisory or procedural measures, not monetary penalties:
 * they carry no amount and are tagged NON_MONETARY_ACTION so they are never
 * presented as fines.
 */
export function classifyCysecAction(subject: string): CysecActionType {
  const text = normalizeWhitespace(subject).toLowerCase();
  if (/\bannul+ed\b|^revocation of .*\b(?:fine|penalty|sanction)/.test(text)) return "annulled";
  if (/^revocation\b/.test(text)) return "authorisation_withdrawal";
  if (/suspension of trading|trading suspension/.test(text)) return "trading_suspension";
  if (/^(?:extension|recall|partial|withdrawal|suspension)\b.*\b(?:suspension|authori[sz]ation|licen[cs]e|operation)\b/.test(text)
    && !/\bfine\b/.test(text)) {
    return /suspension/.test(text) ? "licence_suspension" : "authorisation_withdrawal";
  }
  if (/^withdrawal\b/.test(text)) return "authorisation_withdrawal";
  if (/^(?:partial\s+)?suspension\b/.test(text)) return "licence_suspension";
  if (/exception from a mandatory obligation|^extension (?:for|to) the (?:acquisition|disposal)|exemption from .*takeover/.test(text)) return "takeover_exemption";
  if (/^re-?examination|initiation of the compensation/.test(text)) return "procedural";
  if (/\b(?:fines?|penalty|penalties)\b/.test(text)) return "fine";
  if (/\bsettlement\b/.test(text)) return "settlement";
  return "other";
}

export function isCysecNonMonetaryAction(type: CysecActionType) {
  return type !== "fine" && type !== "settlement" && type !== "other";
}

export function parseCysecAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "EUR",
    symbols: ["€"],
    keywords: [
      "fine",
      "total fine",
      "settlement",
      "total settlement",
      "administrative sanctions",
      "administrative sanction",
    ],
  });
}

export function parseCysecPageHtml(html: string, pageUrl: string): CysecPage {
  const $ = cheerio.load(html);
  const entries = new Map<string, CysecEntry>();

  $(".card.card-custom").each((_, element) => {
    const card = $(element);
    const title = normalizeWhitespace(card.find(".card-header").first().text());
    if (!title || hasGreekCharacters(title)) {
      return;
    }

    const fields = new Map<string, string>();
    card.find(".card-body .col-12").each((__, fieldElement) => {
      const field = $(fieldElement);
      const label = normalizeCysecLabel(field.find("strong").first().text());
      if (!label) {
        return;
      }

      const value = normalizeWhitespace(field.text().replace(field.find("strong").first().text(), ""));
      if (value) {
        fields.set(label, value);
      }
    });

    const pdfHref = normalizeWhitespace(
      card.find('.card-body a[href*="GetFile.aspx"]').first().attr("href") || "",
    );
    const announcementText = normalizeWhitespace(
      card.find('.card-body a[href*="GetFile.aspx"]').first().text(),
    );
    const boardDecisionDate = parseCysecDate(fields.get("board decision date") || "");
    const announcementDate = parseCysecDate(announcementText);
    const pdfUrl = pdfHref ? makeAbsoluteUrl(CYSEC_BASE_URL, pdfHref) : "";

    if (!pdfUrl || !(boardDecisionDate || announcementDate)) {
      return;
    }

    const regarding = fields.get("regarding") || "";
    const firmIndividual = extractCysecFirm(title, regarding);
    if (!firmIndividual) {
      return;
    }

    entries.set(pdfUrl, {
      title,
      firmIndividual,
      announcementDate,
      dateIssued: boardDecisionDate || announcementDate || "",
      legislation: fields.get("legislation") || "",
      subject: fields.get("subject") || "",
      pdfUrl,
      sourceUrl: pageUrl,
    });
  });

  let totalPages = 1;
  $(".PagerControl a[href*='?page=']").each((_, element) => {
    const href = normalizeWhitespace($(element).attr("href") || "");
    const match = href.match(/[?&]page=(\d+)/i);
    if (!match) {
      return;
    }

    totalPages = Math.max(totalPages, Number.parseInt(match[1] || "1", 10));
  });

  return {
    entries: [...entries.values()],
    totalPages,
  };
}

function categorizeCysecRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (
    normalized.includes("anti-money laundering")
    || normalized.includes("money laundering")
    || normalized.includes("terrorist financing")
  ) {
    categories.push("AML");
  }
  if (
    normalized.includes("transparency requirements")
    || normalized.includes("notification obligation")
    || normalized.includes("managers’ transactions")
    || normalized.includes("managers' transactions")
  ) {
    categories.push("DISCLOSURE");
  }
  if (
    normalized.includes("sound and prudent management")
    || normalized.includes("board of directors")
    || normalized.includes("board decision")
  ) {
    categories.push("GOVERNANCE");
  }
  if (
    normalized.includes("withdrawal of cif authorisation")
    || normalized.includes("withdrawal of aifm authorization")
    || normalized.includes("suspension of trading")
    || normalized.includes("termination of measures")
  ) {
    categories.push("AUTHORIZATION");
  }
  if (
    normalized.includes("investment services")
    || normalized.includes("regulated markets")
    || normalized.includes("cyprus securities and exchange commission law")
  ) {
    categories.push("MARKETS_SUPERVISION");
  }

  return categories.length > 0 ? categories : ["MARKETS_SUPERVISION"];
}

export async function loadCysecLiveRecords() {
  const flags = getCliFlags();
  const entries = new Map<string, CysecEntry>();

  const firstPageHtml = await requestCysecText(CYSEC_LIST_URL);
  const firstPage = parseCysecPageHtml(firstPageHtml, CYSEC_LIST_URL);

  const pages: Array<{ url: string; parsed?: CysecPage }> = [
    { url: CYSEC_LIST_URL, parsed: firstPage },
  ];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    pages.push({ url: `${CYSEC_LIST_URL}?page=${page}` });
  }

  for (const page of pages) {
    const parsed = page.parsed ?? parseCysecPageHtml(await requestCysecText(page.url), page.url);

    for (const entry of parsed.entries) {
      if (!entry.dateIssued) {
        continue;
      }

      entries.set(entry.pdfUrl, entry);

      if (flags.limit && flags.limit > 0 && entries.size >= flags.limit) {
        break;
      }
    }

    if (flags.limit && flags.limit > 0 && entries.size >= flags.limit) {
      break;
    }
  }

  const pdfEnrichLimit = getCysecPdfEnrichLimit();
  const records = await mapWithConcurrency(
    [...entries.values()],
    3,
    async (entry, index) => {
      let pdfText = "";
      const actionType = classifyCysecAction(entry.subject || entry.title);
      const nonMonetary = isCysecNonMonetaryAction(actionType);
      let amount = nonMonetary ? null : parseCysecAmount(`${entry.title} ${entry.subject}`);
      // Hash identity replays the pre-fix chain, including its PDF fetch, so
      // non-monetary rows (whose displayed amount is now null) keep their hash.
      let legacyAmountIdentity = legacyIdentity(() => parseCysecAmount(`${entry.title} ${entry.subject}`));

      if (legacyAmountIdentity === null && index < pdfEnrichLimit) {
        try {
          pdfText = await extractPdfTextFromUrl(entry.pdfUrl);
        } catch {
          pdfText = "";
        }

        if (!nonMonetary && amount === null) {
          amount = parseCysecAmount(`${entry.title} ${entry.subject} ${pdfText}`);
        }
        legacyAmountIdentity = legacyIdentity(() => parseCysecAmount(`${entry.title} ${entry.subject} ${pdfText}`));
      }

      const textCorpus = `${entry.title} ${entry.legislation} ${entry.subject} ${pdfText}`;
      const summary = [...new Set([entry.subject, entry.legislation, entry.title]
        .map(normalizeWhitespace)
        .filter(Boolean))].join(" — ");

      return buildEuFineRecord({
        regulator: "CYSEC",
        regulatorFullName: "Cyprus Securities and Exchange Commission",
        countryCode: "CY",
        countryName: "Cyprus",
        firmIndividual: entry.firmIndividual,
        firmCategory: "Investment Firm or Listed Issuer",
        amount,
        legacyAmountIdentity,
        currency: "EUR",
        dateIssued: entry.dateIssued,
        breachType: entry.subject || entry.title,
        breachCategories: nonMonetary
          ? [...new Set(["NON_MONETARY_ACTION", ...categorizeCysecRecord(textCorpus)])]
          : categorizeCysecRecord(textCorpus),
        summary,
        finalNoticeUrl: entry.pdfUrl,
        sourceUrl: entry.sourceUrl,
        rawPayload: {
          ...entry,
          actionType,
          pdfTextPreview: pdfText.slice(0, 500),
        },
      });
    },
  );

  return records;
}

export async function main() {
  await runScraper({
    name: "🇨🇾 CySEC Board Decisions Scraper",
    liveLoader: loadCysecLiveRecords,
    testLoader: loadCysecLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CySEC scraper failed:", error);
    process.exit(1);
  });
}
