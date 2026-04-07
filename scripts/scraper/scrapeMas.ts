import "dotenv/config";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  extractPdfTextFromUrl,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const SGPC_BASE_URL = "https://www.sgpc.gov.sg";
const MAS_LIST_API_URL = `${SGPC_BASE_URL}/api/ApiMainListing/SubmitData`;
const MAS_DETAIL_API_URL = `${SGPC_BASE_URL}/api/ApiMainListing/Detail`;

interface MasListingItemApi {
  DateTime?: string;
  Title?: string;
  Url?: string;
}

interface MasListApiResponse {
  result?: {
    items?: MasListingItemApi[];
    totalPagesCount?: number;
  };
}

interface MasDetailDocument {
  FileName?: string;
  Path?: string;
}

interface MasDetailApiResponse {
  result?: {
    Title?: string;
    DateTime?: string;
    Url?: string;
    DocumentContent?: string;
    RelatedDocuments?: MasDetailDocument[];
  };
}

export interface MasEntry {
  title: string;
  detailPath: string;
  detailUrl: string;
  dateIssued: string;
}

interface MasDetail {
  title: string;
  dateIssued: string | null;
  detailUrl: string;
  summary: string;
  body: string;
  pdfUrl: string | null;
}

const MAS_ENFORCEMENT_TITLE_PATTERNS = [
  /\bprohibition order\b/i,
  /\bprohibition orders\b/i,
  /\bcivil penalt(?:y|ies)\b/i,
  /\bcomposition penalt(?:y|ies)\b/i,
  /\bcomposition fine\b/i,
  /\breprimand(?:s)?\b/i,
  /\bwithdraws?\b/i,
  /\brevokes?\b/i,
  /\bbans?\b/i,
  /\bcensures?\b/i,
  /\bmarket manipulation\b/i,
  /\binsider trading\b/i,
  /\bmisconduct\b/i,
];

const MAS_ENFORCEMENT_TITLE_EXCLUSIONS = [
  /^Key Enforcement Actions Taken by MAS in Q\d/i,
];

function parseMasDate(input: string | null | undefined) {
  const cleaned = normalizeWhitespace(input || "");
  if (!cleaned) {
    return null;
  }

  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return parseMonthNameDate(cleaned);
}

function firstSentence(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return "";
  }

  return normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
}

function stripHtmlToText(html: string) {
  const $ = cheerio.load(`<div>${html}</div>`);
  return normalizeWhitespace($.text());
}

export function isMasEnforcementTitle(title: string) {
  const normalized = normalizeWhitespace(title);
  if (!normalized) {
    return false;
  }

  if (MAS_ENFORCEMENT_TITLE_EXCLUSIONS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return MAS_ENFORCEMENT_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function parseMasAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "SGD",
    symbols: ["S$", "$"],
    keywords: [
      "penalty",
      "civil penalty",
      "composition penalty",
      "composition fine",
      "financial penalty",
      "fine",
      "pay",
      "payment",
    ],
  });
}

export function parseMasListingPayload(payload: MasListApiResponse) {
  const entries = new Map<string, MasEntry>();

  for (const item of payload.result?.items || []) {
    const title = normalizeWhitespace(item.Title || "");
    const detailPath = normalizeWhitespace(item.Url || "");
    const dateIssued = parseMasDate(item.DateTime);

    if (!title || !detailPath || !dateIssued || !isMasEnforcementTitle(title)) {
      continue;
    }

    const detailUrl = `${SGPC_BASE_URL}/detail?HomePage=home&page=%2Fdetail&url=${encodeURIComponent(detailPath)}`;
    entries.set(detailPath, {
      title,
      detailPath,
      detailUrl,
      dateIssued,
    });
  }

  return {
    entries: [...entries.values()],
    totalPages: payload.result?.totalPagesCount || 1,
  };
}

function buildMasPdfUrl(document: MasDetailDocument | null | undefined) {
  const fileName = normalizeWhitespace(document?.FileName || "");
  const path = normalizeWhitespace(document?.Path || "");

  if (!fileName || !path) {
    return null;
  }

  const params = new URLSearchParams({ path });
  return `${SGPC_BASE_URL}/api/file/getfile/${encodeURIComponent(fileName)}?${params.toString()}`;
}

export function parseMasDetailPayload(payload: MasDetailApiResponse, detailPath: string): MasDetail {
  const result = payload.result || {};
  const body = stripHtmlToText(result.DocumentContent || "");
  const detailUrl = `${SGPC_BASE_URL}/detail?HomePage=home&page=%2Fdetail&url=${encodeURIComponent(detailPath)}`;
  const pdfUrl = buildMasPdfUrl(result.RelatedDocuments?.[0]);

  return {
    title: normalizeWhitespace(result.Title || ""),
    dateIssued: parseMasDate(result.DateTime),
    detailUrl,
    summary: firstSentence(body),
    body,
    pdfUrl,
  };
}

function extractMasFirm(title: string, text = "") {
  const normalizedTitle = normalizeWhitespace(title);
  const normalizedText = normalizeWhitespace(text);
  const titlePatterns = [
    /^MAS Issues Prohibition Orders? against (.+?)(?: for |$)/i,
    /^MAS Issues? a Prohibition Order against (.+?)(?: for |$)/i,
    /^MAS reprimands (.+)$/i,
    /^MAS bans (.+)$/i,
    /^MAS withdraws .*? of (.+)$/i,
    /^MAS revokes .*? of (.+)$/i,
    /^MAS issues? directions to (.+)$/i,
    /^Civil penalty against (.+?)(?: for |$)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = normalizedTitle.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1].replace(/^former [^,]+,\s*/i, ""));
    }
  }

  const textPatterns = [
    /against (.+?)(?: for | after | relating to |$)/i,
    /issued to (.+?)(?: for | after |$)/i,
    /against former [^,]+,\s*(.+?)(?: for | after |$)/i,
  ];

  for (const pattern of textPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  return null;
}

function categorizeMasRecord(text: string) {
  const corpus = text.toLowerCase();
  const categories: string[] = [];

  if (/anti-money laundering|aml|counter-terrorism financing|cft/.test(corpus)) {
    categories.push("AML");
  }
  if (/market manipulation|insider trading|false trading|securities/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/misconduct|fair dealing|misleading|conduct/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/licen[cs]e|registration|prohibition order|fit and proper/.test(corpus)) {
    categories.push("LICENSING");
  }
  if (/disclosure|reporting|prospectus/.test(corpus)) {
    categories.push("DISCLOSURE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

async function loadMasDetail(detailPath: string) {
  const response = await axios.get<MasDetailApiResponse>(MAS_DETAIL_API_URL, {
    params: { url: detailPath },
    timeout: 120000,
  });

  return parseMasDetailPayload(response.data, detailPath);
}

export async function loadMasEntries(limit: number | null) {
  const entries = new Map<string, MasEntry>();
  let page = 1;
  let totalPages = 1;

  do {
    let response;
    try {
      response = await axios.get<MasListApiResponse>(MAS_LIST_API_URL, {
        params: {
          Agency: "MAS",
          Type: "Press Release",
          page,
        },
        timeout: 120000,
      });
    } catch (error) {
      if (
        axios.isAxiosError(error)
        && entries.size > 0
        && [404, 500].includes(error.response?.status || 0)
      ) {
        break;
      }

      throw error;
    }

    const parsed = parseMasListingPayload(response.data);
    totalPages = parsed.totalPages;

    for (const entry of parsed.entries) {
      entries.set(entry.detailPath, entry);
      if (limit && entries.size >= limit) {
        return [...entries.values()];
      }
    }

    page += 1;
  } while (page <= totalPages);

  return [...entries.values()];
}

async function enrichMasEntry(entry: MasEntry) {
  let detail;
  try {
    detail = await loadMasDetail(entry.detailPath);
  } catch {
    return null;
  }

  let pdfText = "";
  if (detail.pdfUrl) {
    try {
      pdfText = await extractPdfTextFromUrl(detail.pdfUrl);
    } catch {
      pdfText = "";
    }
  }

  const textCorpus = normalizeWhitespace(
    [entry.title, detail.summary, detail.body, pdfText].filter(Boolean).join(" "),
  );
  const firmIndividual = extractMasFirm(entry.title, textCorpus);

  if (!firmIndividual) {
    return null;
  }

  const summary =
    detail.summary
    || firstSentence(pdfText)
    || entry.title;

  return buildEuFineRecord({
    regulator: "MAS",
    regulatorFullName: "Monetary Authority of Singapore",
    countryCode: "SG",
    countryName: "Singapore",
    firmIndividual,
    firmCategory: "Financial Institution",
    amount: parseMasAmount(textCorpus),
    currency: "SGD",
    dateIssued: detail.dateIssued || entry.dateIssued,
    breachType: detail.title || entry.title,
    breachCategories: categorizeMasRecord(textCorpus),
    summary,
    finalNoticeUrl: detail.pdfUrl || detail.detailUrl,
    sourceUrl: detail.detailUrl,
    rawPayload: {
      entry,
      detail,
      pdfTextPreview: pdfText.slice(0, 500),
    },
  });
}

export async function loadMasLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadMasEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  const records = await mapWithConcurrency(entries, 2, enrichMasEntry);
  return records.filter((record) => record !== null);
}

export async function main() {
  await runScraper({
    name: "🇸🇬 MAS Enforcement Actions Scraper",
    liveLoader: loadMasLiveRecords,
    testLoader: loadMasLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ MAS scraper failed:", error);
    process.exit(1);
  });
}
