import "dotenv/config";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  extractPdfTextFromUrl,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  legacyIdentity,
  parseSebiDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";
import { assessEntityName, cleanEntityName, unnamedParty, UNNAMED_PARTY_CATEGORY } from "./lib/entityName.js";

const SEBI_LIST_URL =
  "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=2&smid=133&ssid=9";
const SEBI_AJAX_URL =
  "https://www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp";
const SEBI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
};
const DEFAULT_SINCE_YEAR = Number.parseInt(
  process.env.SEBI_SINCE_YEAR || "1900",
  10,
);
const DEFAULT_ENRICH_LIMIT =
  process.env.SEBI_ENRICH_LIMIT?.trim() &&
  Number.isFinite(Number.parseInt(process.env.SEBI_ENRICH_LIMIT, 10))
    ? Number.parseInt(process.env.SEBI_ENRICH_LIMIT, 10)
    : Number.MAX_SAFE_INTEGER;
const SEBI_OPERATIVE_TEXT_WINDOW = 8000;

interface SebiRow {
  dateIssued: string;
  title: string;
  detailUrl: string;
}

interface SebiDetailDocument {
  documentUrl: string;
  text: string;
}

export function parseSebiListingHtml(html: string): SebiRow[] {
  const $ = cheerio.load(html);
  const rows: SebiRow[] = [];

  $("table#sample_1 tbody tr, table#sample_1 tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 2) {
      return;
    }

    const dateIssued = parseSebiDate($(cells[0]).text());
    const link = $(cells[1]).find("a").first();
    const title = normalizeWhitespace(link.text());
    const detailUrl = makeAbsoluteUrl(SEBI_LIST_URL, link.attr("href") || "");

    if (!dateIssued || !title || !detailUrl) {
      return;
    }

    rows.push({ dateIssued, title, detailUrl });
  });

  return rows;
}

async function fetchSebiAjaxPage(pageIndex: number) {
  const body = new URLSearchParams({
    nextValue: String(pageIndex),
    next: "n",
    search: "",
    fromDate: "",
    toDate: "",
    fromYear: "",
    toYear: "",
    deptId: "-1",
    sid: "2",
    ssid: "9",
    smid: "133",
    ssidhidden: "9",
    intmid: "-1",
    sText: "Enforcement",
    ssText: "Orders",
    smText: "Orders of ED / CGM (Quasi-Judicial Authorities)",
    doDirect: String(pageIndex),
  });

  try {
    const response = await fetchText(SEBI_AJAX_URL, {
      method: "POST",
      headers: {
        ...SEBI_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": SEBI_LIST_URL,
        "Origin": "https://www.sebi.gov.in",
      },
      data: body.toString(),
      timeout: 120000, // 2 minute timeout
    });

    return response.split("#@#")[0] || "";
  } catch (error) {
    console.warn(`⚠️ Failed to fetch SEBI AJAX page ${pageIndex}`);
    if (axios.isAxiosError(error)) {
      console.warn(`   HTTP ${error.response?.status || 'N/A'} - ${error.code || 'UNKNOWN'}: ${error.message}`);
      // HTTP 530 is often Cloudflare "origin unreachable" - wait longer before retry
      if (error.response?.status === 530) {
        console.warn(`   ⏳ HTTP 530 detected - server may be temporarily down. This error is automatically retried.`);
      }
    }
    throw error;
  }
}

async function fetchSebiDetailText(url: string) {
  try {
    if (/\.pdf(?:$|\?)/i.test(url)) {
      return extractPdfTextFromUrl(url);
    }

    const html = await fetchText(url, {
      headers: SEBI_HEADERS,
      timeout: 120000,
    });
    const text = cheerio.load(html)("body").text();
    return normalizeWhitespace(text);
  } catch (error) {
    console.warn(`⚠️ Failed to fetch SEBI detail: ${url}`);
    if (axios.isAxiosError(error)) {
      console.warn(`   HTTP ${error.response?.status || 'N/A'} - ${error.code || 'UNKNOWN'}`);
    }
    throw error;
  }
}

/** Extractor as stored rows were hashed; content-hash identity ONLY (identityFirm). */
export function legacyExtractSebiFirm(title: string) {
  const cleanFirm = (value: string) =>
    normalizeWhitespace(value)
      .replace(/^inspection of\s+/i, "")
      .replace(/^unregistered investment advisory by\s+/i, "")
      .replace(/[._-]+$/g, "");

  const patterns = [
    /front[- ]running trades of .*?-\s+(.+?)(?:\s+by|$|\.)/i,
    /inspection of\s+(.+?)(?:-|–|—|$|\.)/i,
    /unregistered investment advisory by\s+(.+?)(?:-|–|—|$|\.)/i,
    /matter of\s+(.+?)(?:-|–|—|$)/i,
    /respect of\s+(.+?)(?:-|–|—|$)/i,
    /against\s+(.+?)(?:-|–|—|$)/i,
    // Additional patterns for common SEBI title formats
    /order in respect of (.+?)(?:\s+in the matter|$)/i,
    /order against (.+?)(?:\s+in the matter|$)/i,
    /proceedings against (.+?)(?:\s+in|$)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return cleanFirm(match[1]);
    }
  }

  // Fallback: truncate to first 150 chars to avoid overly verbose firm names
  const fallback = cleanFirm(title);
  if (fallback.length > 150) {
    // Try to find a natural break point (comma, dash, or "in the matter")
    const breakMatch = fallback.match(
      /^(.{20,150}?)(?:\s*(?:,|-|in the matter|for|regarding))/i,
    );
    if (breakMatch?.[1]) {
      return breakMatch[1].trim();
    }
    return fallback.substring(0, 150) + "...";
  }

  return fallback;
}

const SEBI_SUBJECT_MATTER =
  /\b(?:front[- ]?running|insider trading|in the scrip|scrip of|trading activities|unregistered|misstatements|routing of funds|non-payment|illegal profiting|enquiry proceedings|investigation of|cancellation of|application submitted|pledge of|activities of certain)\b/i;

/**
 * Party named in a SEBI order title ("Order in respect of X in the matter of ...",
 * "... front running by X and Others"), or null when the title only states the
 * subject matter. The legacy extractor kept the subject ("front running of the
 * trades of Axis Mutual Fund"); it still feeds identity.
 */
export function extractSebiParty(title: string): string | null {
  const legacy = legacyExtractSebiFirm(title);
  if (assessEntityName(legacy).ok && !SEBI_SUBJECT_MATTER.test(legacy)) return legacy;

  const text = normalizeWhitespace(title);
  const candidates = [
    text.match(/\b(?:in respect of|against)\s+(.+?)\s+in (?:the )?matter of\b/i)?.[1],
    text.match(/\b(?:order|orders|proceedings)\s+against\s+(.+?)(?:\s+[-–—]\s+.*)?$/i)?.[1],
    text.match(/\b(?:in respect of)\s+(?!application)(.+?)(?:\s+[-–—]\s+.*)?$/i)?.[1],
    text.match(/\binspection of\s+((?:Mr|Ms|Mrs|M\/s)\.?\s*[^,]+?)(?:\s*[-–—]\s*.*|,.*)?$/i)?.[1],
    text.match(/\bby\s+((?:M\/s\.?\s+|Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+)?[A-Za-z0-9][^,]*?)(?:\s*[-–—]\s*.*|,.*)?$/i)?.[1],
    text.match(/\b(?:activities|services) of\s+((?:M\/s\.?\s+|Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+)?[A-Za-z0-9][^,]*?)(?:\s*[-–—]\s*.*|,.*)?$/i)?.[1],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const cleaned = cleanEntityName(candidate.replace(/^the\s+/i, (m) => (/^the\s+[A-Z]/.test(candidate) ? 'The ' : m)).replace(/\.+$/, (m) => m));
    const trimmed = cleaned.replace(/\s+and\s+(?:two|three|four|five|\d+)\s+others?$/i, '').replace(/\.$/, '');
    if (trimmed && assessEntityName(trimmed).ok && !SEBI_SUBJECT_MATTER.test(trimmed) && trimmed.split(/\s+/).length <= 14) return trimmed;
  }
  return null;
}

export function extractSebiFirm(title: string) {
  return extractSebiParty(title) ?? unnamedParty('SEBI').name;
}

function categorizeSebiTitle(title: string, hasMonetaryAmount: boolean) {
  const normalized = title.toLowerCase();
  const categories: string[] = [];

  if (normalized.includes("unregistered investment advisory")) {
    categories.push("UNREGISTERED_ADVISORY");
  }
  if (normalized.includes("front-running")) {
    categories.push("FRONT_RUNNING");
  }
  if (normalized.includes("research analyst")) {
    categories.push("RESEARCH_ANALYST");
  }
  if (
    normalized.includes("market gainer") ||
    normalized.includes("trade money")
  ) {
    categories.push("MISLEADING_CONDUCT");
  }
  if (normalized.includes("exchange") || normalized.includes("stockbrokers")) {
    categories.push("MARKET_INTERMEDIARY");
  }

  categories.push(hasMonetaryAmount ? "MONETARY_PENALTY" : "NON_MONETARY_ORDER");

  return categories.length > 0 ? categories : ["SEBI_ORDER"];
}

function extractSebiPdfUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const fileParam = parsedUrl.searchParams.get("file");
    if (fileParam) {
      const decoded = decodeURIComponent(fileParam);
      return makeAbsoluteUrl(url, decoded);
    }
  } catch {
    return /\.pdf(?:$|\?)/i.test(url) ? url : null;
  }

  return /\.pdf(?:$|\?)/i.test(url) ? url : null;
}

export function resolveSebiDocumentUrl(detailUrl: string, html: string) {
  const $ = cheerio.load(html);
  const candidates = [
    $("iframe[src]").first().attr("src"),
    $("embed[src]").first().attr("src"),
    $("object[data]").first().attr("data"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const absoluteUrl = makeAbsoluteUrl(detailUrl, candidate);
    const pdfUrl = extractSebiPdfUrl(absoluteUrl);
    if (pdfUrl) {
      return pdfUrl;
    }

    if (absoluteUrl) {
      return absoluteUrl;
    }
  }

  return detailUrl;
}

export function extractSebiPenaltyAmount(text: string) {
  const normalized = normalizeWhitespace(text);
  // SEBI PDFs often discuss prior proceedings and transaction values earlier in
  // the document, so bias extraction toward the operative tail section.
  const operativeText = normalized.slice(-SEBI_OPERATIVE_TEXT_WINDOW);

  if (
    /without issuance of any direction[^.]{0,240}(?:monetary penalty|penalty)/i.test(
      operativeText,
    ) ||
    /no monetary penalty/i.test(operativeText) ||
    /penalty is not imposed/i.test(operativeText)
  ) {
    return null;
  }

  const penaltySentences = operativeText
    .split(/(?<=[.;])\s+/)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length > 0 &&
        /(?:monetary penalty|penalty)/i.test(sentence) &&
        !/penalty be not imposed/i.test(sentence),
    );

  if (penaltySentences.length === 0) {
    return null;
  }

  const amountPattern =
    /(?:INR|Rs\.?|Rupees|₹)\s*([\d,]+(?:\.\d+)?)\s*(crores?|lakhs?|million|billion|thousand)?/gi;
  const amounts = new Map<string, number>();

  for (const sentence of penaltySentences) {
    for (const match of sentence.matchAll(amountPattern)) {
      const amount = parseLargestAmountFromText(match[0], {
        currency: "INR",
        symbols: ["Rs.", "Rs", "₹", "Rupees"],
        keywords: ["penalty", "monetary penalty"],
      });

      if (amount !== null) {
        amounts.set(`${match.index}-${match[0]}`, amount);
      }
    }
  }

  if (amounts.size === 0) {
    return null;
  }

  return Array.from(amounts.values()).reduce((sum, amount) => sum + amount, 0);
}

async function fetchSebiDetailDocument(url: string): Promise<SebiDetailDocument> {
  const directPdfUrl = extractSebiPdfUrl(url);
  if (directPdfUrl) {
    return {
      documentUrl: directPdfUrl,
      text: await extractPdfTextFromUrl(directPdfUrl),
    };
  }

  const html = await fetchText(url);
  const documentUrl = resolveSebiDocumentUrl(url, html);
  const pdfUrl = extractSebiPdfUrl(documentUrl);

  if (pdfUrl) {
    return {
      documentUrl: pdfUrl,
      text: await extractPdfTextFromUrl(pdfUrl),
    };
  }

  const text = cheerio.load(html)("body").text();
  return {
    documentUrl,
    text: normalizeWhitespace(text),
  };
}

async function enrichSebiRow(row: SebiRow, shouldEnrichAmount: boolean) {
  let amount: number | null = null;
  let legacyAmountIdentity: number | null = null;
  let finalNoticeUrl = row.detailUrl;

  if (shouldEnrichAmount) {
    try {
      const detailDocument = await fetchSebiDetailDocument(row.detailUrl);
      amount = extractSebiPenaltyAmount(detailDocument.text);
      legacyAmountIdentity = legacyIdentity(() => extractSebiPenaltyAmount(detailDocument.text));
      finalNoticeUrl = detailDocument.documentUrl;
    } catch {
      amount = null;
      legacyAmountIdentity = null;
    }
  }

  const sebiParty = extractSebiParty(row.title);
  const sebiName = sebiParty ?? unnamedParty("SEBI").name;
  return buildEuFineRecord({
    regulator: "SEBI",
    regulatorFullName: "Securities and Exchange Board of India",
    countryCode: "IN",
    countryName: "India",
    firmIndividual: sebiName,
    identityFirm: legacyExtractSebiFirm(row.title),
    firmCategory: sebiParty === null ? UNNAMED_PARTY_CATEGORY : "Firm or Individual",
    amount,
    legacyAmountIdentity,
    currency: "INR",
    dateIssued: row.dateIssued,
    breachType: row.title,
    breachCategories: categorizeSebiTitle(row.title, amount !== null),
    summary: row.title,
    finalNoticeUrl,
    sourceUrl: SEBI_LIST_URL,
    rawPayload: row,
  });
}

export async function loadSebiLiveRecords() {
  console.log('🇮🇳 SEBI Scraper starting...');
  console.log(`   List URL: ${SEBI_LIST_URL}`);
  console.log(`   Since year: ${DEFAULT_SINCE_YEAR}`);

  const firstPageHtml = await fetchText(SEBI_LIST_URL, {
    headers: SEBI_HEADERS,
    timeout: 120000,
  });
  const initialRows = parseSebiListingHtml(firstPageHtml);
  const rows: SebiRow[] = [...initialRows];

  const totalPagesMatch = firstPageHtml.match(/of\s+(\d+)\s+records/i);
  const maxPagesByCount = totalPagesMatch
    ? Math.ceil(Number.parseInt(totalPagesMatch[1], 10) / 25)
    : 1;

  for (let pageIndex = 1; pageIndex < maxPagesByCount; pageIndex += 1) {
    const pageHtml = await fetchSebiAjaxPage(pageIndex);
    const pageRows = parseSebiListingHtml(pageHtml);

    if (pageRows.length === 0) {
      break;
    }

    rows.push(...pageRows);
  }

  const filteredRows = rows.filter(
    (row) =>
      Number.parseInt(row.dateIssued.slice(0, 4), 10) >= DEFAULT_SINCE_YEAR,
  );
  const uniqueRows = Array.from(
    new Map(
      filteredRows.map((row) => [`${row.dateIssued}|${row.detailUrl}`, row]),
    ).values(),
  );
  const records = [];

  for (let index = 0; index < uniqueRows.length; index += 6) {
    const batch = uniqueRows.slice(index, index + 6);
    const settled = await Promise.allSettled(
      batch.map((row, batchIndex) =>
        enrichSebiRow(row, index + batchIndex < DEFAULT_ENRICH_LIMIT),
      ),
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        records.push(result.value);
      }
    }
  }

  return records;
}

export async function main() {
  await runScraper({
    name: "🇮🇳 SEBI Orders Scraper",
    liveLoader: loadSebiLiveRecords,
    testLoader: loadSebiLiveRecords,
    // Invalid rows are always excluded from promotion (runScraper keeps only the
    // rows that pass validateDiscoveryCandidate and parks the rest in the
    // discovery queue). The default hold trips at >5 invalid AND >1%; this source
    // has a steady ~1.5-2% tail of headline-as-entity rows (names workstream), so
    // it holds only above 2.5% -- still far below real parser drift.
    qualityContract: { maximumInvalidRecordFraction: 0.025 },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ SEBI scraper failed:", error);
    process.exit(1);
  });
}
