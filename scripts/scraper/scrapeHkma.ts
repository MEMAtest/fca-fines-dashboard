import "dotenv/config";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  type DbReadyRecord,
  getCliFlags,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const HKMA_API_URL = "https://api.hkma.gov.hk/public/press-releases";
const HKMA_LIST_PAGE_SIZE = 500;

interface HkmaApiRecord {
  title?: string;
  link?: string;
  date?: string;
}

interface HkmaApiResponse {
  result?: {
    records?: HkmaApiRecord[];
  };
}

export interface HkmaEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
}

interface HkmaDetail {
  title: string;
  dateIssued: string | null;
  summary: string;
  body: string;
}

const HKMA_TITLE_POSITIVE_PATTERNS = [
  /takes disciplinary action/i,
  /takes disciplinary actions/i,
  /reprimands and fines/i,
  /suspends registration/i,
  /\bbans?\b/i,
  /orders a fine/i,
];

const HKMA_TITLE_NEGATIVE_PATTERNS = [
  /finetech/i,
  /regtech lab/i,
  /launches/i,
  /seminar/i,
  /forum/i,
  /joint sfc\/hkma enforcement action/i,
  /enforcement collaboration between hkma and sfc/i,
  /enforcement collaboration between ia and hkma/i,
];

function firstSentence(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return "";
  }

  return normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
}

function parseHkmaDate(input: string | null | undefined) {
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

export function isHkmaEnforcementTitle(title: string) {
  const normalized = normalizeWhitespace(title);
  if (!normalized) {
    return false;
  }

  if (HKMA_TITLE_NEGATIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return HKMA_TITLE_POSITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function parseHkmaAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "HKD",
    symbols: ["HK$"],
    keywords: [
      "fine",
      "fines",
      "fined",
      "penalty",
      "disciplinary action",
      "orders a fine",
    ],
  });
}

function buildHkmaRecord(
  entry: HkmaEntry,
  detail: HkmaDetail,
  textCorpus: string,
  firmIndividual: string,
  amountOverride: number | null = parseHkmaAmount(textCorpus),
  summaryOverride: string | null = null,
) {
  return buildEuFineRecord({
    regulator: "HKMA",
    regulatorFullName: "Hong Kong Monetary Authority",
    countryCode: "HK",
    countryName: "Hong Kong",
    firmIndividual,
    firmCategory: "Financial Institution",
    amount: amountOverride,
    currency: "HKD",
    dateIssued: detail.dateIssued || entry.dateIssued,
    breachType: detail.title || entry.title,
    breachCategories: categorizeHkmaRecord(textCorpus),
    summary: summaryOverride || detail.summary || firstSentence(textCorpus) || entry.title,
    finalNoticeUrl: entry.detailUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
    },
  });
}

function extractHkmaSentence(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return normalizeWhitespace(match?.[0] || "");
}

function parseHkmaPenaltySnippet(snippet: string) {
  return parseHkmaAmount(snippet);
}

export function extractHkmaActionFragments(body: string) {
  const normalizedBody = normalizeWhitespace(body);

  const threeBankSentence =
    extractHkmaSentence(
      normalizedBody,
      /The Hong Kong Monetary Authority \(HKMA\) announced today .*? BCOM Hong Kong Branch\./i,
    ) || normalizedBody;
  const threeBankPenaltySentence = extractHkmaSentence(
    normalizedBody,
    /Separately, the MA has imposed pecuniary penalties of HK\$[\d,]+\s+on BCOM\(HK\)\s+and HK\$[\d,]+\s+on BCOM Hong Kong Branch\./i,
  );
  const threeBankPrimarySentence = extractHkmaSentence(
    normalizedBody,
    /The Monetary Authority \(MA\) has: \(i\) reprimanded IOBHK;.*?HK\$[\d,]+\s+on IOBHK\./i,
  );
  const threeBankMatch = threeBankSentence.match(
    /in relation to three banks:\s*(.+?)\s+\(IOBHK\),\s*(.+?)\s+\(BCOM\(HK\)\)\s+and\s+(.+?)\s+\(BCOM Hong Kong Branch\)\./i,
  );
  if (threeBankMatch) {
    return [
      {
        firmIndividual: normalizeWhitespace(threeBankMatch[1]),
        amount: parseHkmaPenaltySnippet(threeBankPrimarySentence),
        summary: threeBankPrimarySentence,
      },
      {
        firmIndividual: normalizeWhitespace(threeBankMatch[2]),
        amount: parseHkmaPenaltySnippet(threeBankPenaltySentence),
        summary: threeBankPenaltySentence,
      },
      {
        firmIndividual: normalizeWhitespace(threeBankMatch[3]),
        amount: parseHkmaPenaltySnippet(
          extractHkmaSentence(threeBankPenaltySentence, /and HK\$[\d,]+\s+on BCOM Hong Kong Branch\./i),
        ),
        summary: threeBankPenaltySentence,
      },
    ];
  }

  const fourBankStartMarker =
    "The Monetary Authority (MA) has imposed pecuniary penalties of a total of HK$";
  const fourBankSnippet = normalizedBody.includes(fourBankStartMarker)
    ? normalizedBody.slice(normalizedBody.indexOf(fourBankStartMarker))
    : normalizedBody;
  const fourBankMatch = fourBankSnippet.match(
    /The Monetary Authority \(MA\) has imposed pecuniary penalties of a total of HK\$[\d,]+\s+against\s+(.+?)\s+\(CCBA\),\s+(.+?)\s+\(CTBCHK\),\s+(.+?)\s+\(ICBCA\)\s+and\s+(.+?)\s+\(UBSHK\),\s+as well as issued orders/i,
  );
  if (fourBankMatch) {
    return fourBankMatch.slice(1, 5).map((firmIndividual) => ({
      firmIndividual: normalizeWhitespace(firmIndividual),
      amount: null,
      summary: firstSentence(fourBankSnippet),
    }));
  }

  return null;
}

export function parseHkmaApiPayload(payload: HkmaApiResponse) {
  const entries = new Map<string, HkmaEntry>();

  for (const item of payload.result?.records || []) {
    const title = normalizeWhitespace(item.title || "");
    const detailUrl = normalizeWhitespace(item.link || "");
    const dateIssued = parseHkmaDate(item.date);

    if (!title || !detailUrl || !dateIssued || !isHkmaEnforcementTitle(title)) {
      continue;
    }

    entries.set(detailUrl, {
      title,
      detailUrl,
      dateIssued,
    });
  }

  return [...entries.values()];
}

export function parseHkmaDetailHtml(html: string) {
  const $ = cheerio.load(html);
  const title =
    normalizeWhitespace($("h1").first().text())
    || normalizeWhitespace($(".sub-page-heading").first().text());
  const container = $(".content-area").first();
  const paragraphs = container
    .find("p, li")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean);
  const dateIssued =
    parseHkmaDate(
      $(".post-meta .date, .entry-date, time, .date").first().text(),
    );
  const body = normalizeWhitespace([title, ...paragraphs].join(" "));

  return {
    title,
    dateIssued,
    summary: paragraphs[0] || firstSentence(body),
    body,
  } satisfies HkmaDetail;
}

function extractHkmaFirm(title: string, body = "") {
  const normalizedTitle = normalizeWhitespace(title);
  const normalizedBody = normalizeWhitespace(body);
  const cleanCandidate = (value: string) =>
    normalizeWhitespace(
      value
        .replace(/\.\s+Monetary Authority takes disciplinary actions?.*$/i, "")
        .replace(/\.\s+The Hong Kong Monetary Authority .*$/i, ""),
    );
  const titlePatterns = [
    /fines?\s+(.+?)\s+HK\$/i,
    /against\s+(.+?)(?:\s+for|\s+under|\s+after|\s+in relation|\s+relating to|$)/i,
    /suspends registration of\s+(.+?)(?:\s+for|$)/i,
    /bans?\s+(.+?)(?:\s+for|$)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = normalizedTitle.match(pattern);
    if (match?.[1]) {
      const candidate = cleanCandidate(match[1]);
      if (!/^(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+\w+/i.test(candidate)) {
        return candidate;
      }
    }
  }

  const bodyPatterns = [
    /in relation to three banks:\s+(.+?)\s+The Monetary Authority \(MA\) has:/i,
    /disciplinary actions? against\s+(.+?)(?:\s+for|\s+under|$)/i,
    /reprimanded and fined\s+(.+?)(?:\s+HK\$| for |$)/i,
    /suspended registration of\s+(.+?)(?:\s+for|$)/i,
    /orders? a fine of .*? against\s+(.+?)(?:\s+for|$)/i,
  ];

  for (const pattern of bodyPatterns) {
    const match = normalizedBody.match(pattern);
    if (match?.[1]) {
      return cleanCandidate(match[1]);
    }
  }

  return null;
}

function categorizeHkmaRecord(text: string) {
  const corpus = text.toLowerCase();
  const categories: string[] = [];

  if (/anti-money laundering|counter-terrorist financing|aml/.test(corpus)) {
    categories.push("AML");
  }
  if (/payment systems|stored value facilities/.test(corpus)) {
    categories.push("PAYMENTS");
  }
  if (/internal control|controls|record-keeping/.test(corpus)) {
    categories.push("CONTROLS");
  }
  if (/selling practices|disclosure|research reports/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/registration|licen[cs]e|prohibition/.test(corpus)) {
    categories.push("LICENSING");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

async function loadHkmaEntries(limit: number | null) {
  const entries = new Map<string, HkmaEntry>();

  for (let offset = 0; ; offset += HKMA_LIST_PAGE_SIZE) {
    console.log(`📡 Fetching HKMA API page (offset: ${offset})...`);
    const response = await axios.get<HkmaApiResponse>(HKMA_API_URL, {
      params: {
        lang: "en",
        offset,
        pagesize: HKMA_LIST_PAGE_SIZE,
        sortby: "date",
        sortorder: "desc",
      },
      timeout: 180000, // Increased from 120s to 180s (3 minutes)
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const records = response.data.result?.records || [];
    for (const entry of parseHkmaApiPayload(response.data)) {
      entries.set(entry.detailUrl, entry);
      if (limit && entries.size >= limit) {
        return [...entries.values()];
      }
    }

    if (records.length < HKMA_LIST_PAGE_SIZE) {
      break;
    }
  }

  return [...entries.values()];
}

async function enrichHkmaEntry(entry: HkmaEntry): Promise<DbReadyRecord[]> {
  try {
    const html = (
      await axios.get<string>(entry.detailUrl, {
        responseType: "text",
        timeout: 180000, // Increased from 120s to 180s (3 minutes)
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
    ).data;
  const detail = parseHkmaDetailHtml(html);
  const textCorpus = normalizeWhitespace(
    [entry.title, detail.summary, detail.body].filter(Boolean).join(" "),
  );
  const actionFragments = extractHkmaActionFragments(detail.body);

  if (actionFragments?.length) {
    return actionFragments.map((fragment) =>
      buildHkmaRecord(
        entry,
        detail,
        textCorpus,
        fragment.firmIndividual,
        fragment.amount,
        fragment.summary || null,
      ),
    );
  }

  const firmIndividual = extractHkmaFirm(entry.title, textCorpus);

  if (!firmIndividual) {
    return [];
  }

  return [buildHkmaRecord(entry, detail, textCorpus, firmIndividual)];
  } catch (error) {
    console.warn(`⚠️ Failed to enrich HKMA entry: ${entry.title} (${entry.detailUrl})`);
    if (axios.isAxiosError(error)) {
      console.warn(`   Error: ${error.code || 'UNKNOWN'} - ${error.message}`);
    } else {
      console.warn(`   Error:`, error);
    }
    return [];
  }
}

export async function loadHkmaLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadHkmaEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  const recordGroups = await mapWithConcurrency(entries, 4, enrichHkmaEntry);
  return recordGroups.flatMap((group) => group);
}

export async function main() {
  await runScraper({
    name: "🇭🇰 HKMA Enforcement Actions Scraper",
    liveLoader: loadHkmaLiveRecords,
    testLoader: loadHkmaLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ HKMA scraper failed:", error);
    process.exit(1);
  });
}
