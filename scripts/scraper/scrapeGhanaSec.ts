/**
 * Ghana SEC (Securities and Exchange Commission, Ghana) Scraper
 *
 * Strategy: Parse the official HTML tables of suspended / revoked / ceased licences.
 * URL: https://sec.gov.gh/suspension-revocation-cessation-of-licenses/
 *
 * Difficulty: 2/10 (Low) — static HTML tables (Company / Status / Effective Date).
 * Note: these are licence enforcement actions (suspension, revocation, cessation),
 *   not monetary penalties, so every record has a null amount. Dates use an English
 *   ordinal format, e.g. "8th November, 2019".
 * Language: English.
 *
 * Run: npx tsx scripts/scraper/scrapeGhanaSec.ts --dry-run
 */

import "dotenv/config";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  extractPdfLayoutTextFromUrl,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parsePlainAmount,
  parseMonthNameDate,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const GHANA_SEC_URL =
  "https://sec.gov.gh/suspension-revocation-cessation-of-licenses/";
const GHANA_SEC_NEWS_URL = "https://sec.gov.gh/category/sec-news/";
const GHANA_SEC_API_ROOT = "https://sec.gov.gh/wp-json/wp/v2/pages";
const GHANA_SEC_REQUEST_TIMEOUT_MS = 60_000;
const GHANA_SEC_REQUEST_ATTEMPTS = 3;
const GHANA_SEC_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)",
  "Accept-Language": "en-GB,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function isTransientGhanaSecRequestError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return Boolean(status && (status >= 500 || status === 429)) || [
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ETIMEDOUT",
    "ECONNABORTED",
    "ERR_BAD_RESPONSE",
  ].includes(error.code || "");
}

type GhanaSecTextResponse = { data: string; retryAfter?: string };
type GhanaSecTextRequest = (url: string, config: { headers: typeof GHANA_SEC_HEADERS; timeout: number; responseType: "text" }) => Promise<GhanaSecTextResponse>;
type Wait = (ms: number) => Promise<void>;

const requestGhanaSecText: GhanaSecTextRequest = async (url, config) => {
  const response = await axios.get<string>(url, {
    ...config,
    transformResponse: [(body) => body],
  });
  return { data: response.data, retryAfter: String(response.headers["retry-after"] || "") };
};

export async function fetchGhanaSecText(
  url: string,
  request: GhanaSecTextRequest = requestGhanaSecText,
  wait: Wait = sleep,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= GHANA_SEC_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await request(url, {
        headers: GHANA_SEC_HEADERS,
        timeout: GHANA_SEC_REQUEST_TIMEOUT_MS,
        responseType: "text",
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (!isTransientGhanaSecRequestError(error) || attempt === GHANA_SEC_REQUEST_ATTEMPTS) throw error;
      const retryAfter = error && typeof error === "object" && "response" in error
        ? Number.parseInt(String((error as { response?: { headers?: Record<string, unknown> } }).response?.headers?.["retry-after"] || ""), 10)
        : NaN;
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 15_000)
        : 1_000 * 2 ** (attempt - 1);
      console.warn(`⚠️ Ghana SEC request failed transiently (${attempt}/${GHANA_SEC_REQUEST_ATTEMPTS}); retrying in ${delayMs}ms`);
      await wait(delayMs);
    }
  }
  throw lastError;
}

/** Return the official WordPress page body for a slug, if its REST representation is valid. */
export function parseGhanaSecWordPressPage(html: string, expectedSlug: string): string | null {
  try {
    const pages = JSON.parse(html) as Array<{
      slug?: unknown;
      content?: { rendered?: unknown };
    }>;
    if (!Array.isArray(pages)) return null;
    const page = pages.find((candidate) => candidate.slug === expectedSlug);
    const rendered = page?.content?.rendered;
    return typeof rendered === "string" && rendered.trim() ? rendered : null;
  } catch {
    return null;
  }
}

/** Fetch an official SEC page; on route failure use that exact page's official WP REST body. */
export async function fetchGhanaSecPageHtml(
  url: string,
  slug: string,
  fetchText: (url: string) => Promise<string> = fetchGhanaSecText,
): Promise<string> {
  try {
    return await fetchText(url);
  } catch (pageError) {
    const apiUrl = `${GHANA_SEC_API_ROOT}?slug=${encodeURIComponent(slug)}`;
    try {
      const apiBody = await fetchText(apiUrl);
      const rendered = parseGhanaSecWordPressPage(apiBody, slug);
      if (!rendered) throw new Error(`WordPress API returned no page matching slug ${slug}`);
      console.warn(`⚠️ Ghana SEC HTML route unavailable; recovered the same official page via WordPress REST (${slug})`);
      return rendered;
    } catch (fallbackError) {
      const pageMessage = pageError instanceof Error ? pageError.message : String(pageError);
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`Ghana SEC page ${slug} failed via HTML and official REST routes (${pageMessage}; ${fallbackMessage})`);
    }
  }
}

export interface GhanaSecRow {
  company: string;
  status: string;
  dateIssued: string;
}

export interface GhanaSecPenaltyRow {
  company: string;
  infringement: string;
  amount: number;
  dateIssued: string;
  newsletterUrl: string;
  pdfUrl: string;
}

/** Ghana dates carry ordinal suffixes ("8th November, 2019"). Strip them, then parse. */
export function parseGhanaSecDate(input: string): string | null {
  const cleaned = normalizeWhitespace(input)
    .replace(/(\d{1,2})(st|nd|rd|th)\b/i, "$1")
    .replace(/,/g, "");
  return parseMonthNameDate(cleaned);
}

export function parseGhanaSecHtml(html: string): GhanaSecRow[] {
  const $ = cheerio.load(html);
  const rows = new Map<string, GhanaSecRow>();

  $("table tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 3) {
      return;
    }

    const company = normalizeWhitespace(cells.eq(0).text());
    const status = normalizeWhitespace(cells.eq(1).text());
    const dateIssued = parseGhanaSecDate(cells.eq(2).text());

    if (!company || !dateIssued || /^company$/i.test(company)) {
      return;
    }

    const dedupeKey = `${company}::${status}::${dateIssued}`;
    rows.set(dedupeKey, { company, status, dateIssued });
  });

  return [...rows.values()];
}

export function parseLatestGhanaSecNewsletterUrl(html: string) {
  const $ = cheerio.load(html);
  const href = $("a[href]")
    .map((_, link) => normalizeWhitespace($(link).attr("href") || ""))
    .get()
    .find((value) => /\/sec-newsletter-\d{4}-(?:first|second|third|fourth)-quarter-edition\/?$/i.test(value));
  return href ? makeAbsoluteUrl(GHANA_SEC_NEWS_URL, href) : null;
}

export function parseGhanaSecNewsletterPdfUrl(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const href = $("a[href$='.pdf'], a[href*='.pdf?']")
    .map((_, link) => normalizeWhitespace($(link).attr("href") || ""))
    .get()
    .find((value) => /SEC-Quarterly-Newsletters/i.test(value));
  return href ? makeAbsoluteUrl(pageUrl, href) : null;
}

export function quarterEndDateFromNewsletterUrl(url: string) {
  const match = url.match(/(First|Second|Third|Fourth)-Quarter-(\d{4})/i);
  if (!match) return null;
  const quarterEnd: Record<string, string> = {
    first: "03-31",
    second: "06-30",
    third: "09-30",
    fourth: "12-31",
  };
  return `${match[2]}-${quarterEnd[match[1].toLowerCase()]}`;
}

export function parseGhanaSecPenaltyText(
  text: string,
  newsletterUrl: string,
  pdfUrl: string,
): GhanaSecPenaltyRow[] {
  const dateIssued = quarterEndDateFromNewsletterUrl(pdfUrl);
  if (!dateIssued) return [];

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let sectionStart = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/INFRACT(?:ION|ON)S?\s+AND\s+PENALTIES/i.test(lines[index])) {
      sectionStart = index;
      break;
    }
  }
  const sectionEnd = lines.findIndex(
    (line, index) => index > sectionStart && /^\s*2\.\s+COMPLAINTS/i.test(line),
  );
  if (sectionStart < 0 || sectionEnd < 0) return [];

  const rows: GhanaSecPenaltyRow[] = [];
  let current: GhanaSecPenaltyRow | null = null;

  for (const line of lines.slice(sectionStart + 1, sectionEnd)) {
    if (/COMPANY\s+INFRINGEMENT\s+PENALTY/i.test(line)) continue;
    const companyPart = line.slice(0, 44).trim();
    const infringementPart = line.slice(44, 98).trim();
    const penaltyPart = line.slice(98).trim();
    const amount = parsePlainAmount(penaltyPart.replace(/[^\d.,]/g, ""));

    if (amount !== null && companyPart && infringementPart) {
      current = {
        company: companyPart,
        infringement: infringementPart,
        amount,
        dateIssued,
        newsletterUrl,
        pdfUrl,
      };
      rows.push(current);
      continue;
    }

    if (!current) continue;
    if (companyPart) current.company = normalizeWhitespace(`${current.company} ${companyPart}`);
    if (infringementPart) {
      current.infringement = normalizeWhitespace(
        `${current.infringement} ${infringementPart}`,
      );
    }
  }

  return rows;
}

export function categorizeGhanaSecStatus(status: string): string[] {
  const normalized = status.toLowerCase();
  const categories = ["LICENSING"];

  if (/revok/.test(normalized)) {
    categories.push("LICENCE_REVOCATION");
  }
  if (/suspend/.test(normalized)) {
    categories.push("LICENCE_SUSPENSION");
  }
  if (/cessation|ceased|voluntary/.test(normalized)) {
    categories.push("LICENCE_CESSATION");
  }

  return [...new Set(categories)];
}

export function buildGhanaSecRecord(row: GhanaSecRow): DbReadyRecord {
  const status = row.status || "Licence action";

  return buildEuFineRecord({
    regulator: "GHSEC",
    regulatorFullName: "Securities and Exchange Commission, Ghana",
    countryCode: "GH",
    countryName: "Ghana",
    // Some table rows carry a leading footnote marker (e.g. "*Gold Rock…").
    firmIndividual: row.company.replace(/^[*†‡\s]+/, ""),
    firmCategory: "Licensed Entity",
    amount: null,
    currency: "GHS",
    dateIssued: row.dateIssued,
    breachType: `Licence ${status.toLowerCase()}`,
    breachCategories: categorizeGhanaSecStatus(status),
    summary: `${row.company}: SEC Ghana licence ${status.toLowerCase()} effective ${row.dateIssued}.`,
    finalNoticeUrl: GHANA_SEC_URL,
    sourceUrl: GHANA_SEC_URL,
    dedupeKey: `${row.company}::${status}::${row.dateIssued}`,
    rawPayload: row,
  });
}

export function buildGhanaSecRecords(rows: GhanaSecRow[]): DbReadyRecord[] {
  return rows
    .map(buildGhanaSecRecord)
    .sort(
      (left, right) =>
        right.dateIssued.localeCompare(left.dateIssued) ||
        left.firmIndividual.localeCompare(right.firmIndividual),
    );
}

export function buildGhanaSecPenaltyRecord(row: GhanaSecPenaltyRow): DbReadyRecord {
  return buildEuFineRecord({
    regulator: "GHSEC",
    regulatorFullName: "Securities and Exchange Commission, Ghana",
    countryCode: "GH",
    countryName: "Ghana",
    firmIndividual: row.company,
    firmCategory: "Capital Market Operator",
    amount: row.amount,
    currency: "GHS",
    dateIssued: row.dateIssued,
    breachType: row.infringement,
    breachCategories: ["MONETARY_SANCTION", "REPORTING"],
    summary: `${row.company} received a GH¢${row.amount.toLocaleString("en-GB")} penalty for ${row.infringement.toLowerCase()}.`,
    finalNoticeUrl: row.pdfUrl,
    sourceUrl: row.newsletterUrl,
    dedupeKey: `${row.pdfUrl}::${row.company}::${row.infringement}::${row.amount}`,
    rawPayload: row,
  });
}

const GHANA_SEC_NEWSLETTER_INDEX_URL = "https://sec.gov.gh/sec-quarterly-newsletter/";
const GHANA_SEC_NEWSLETTER_QUARTERS = Number.parseInt(
  process.env.GHANA_SEC_NEWSLETTER_QUARTERS || "1",
  10,
);

/**
 * The quarterly-newsletter index page links every PDF directly
 * (`.../SEC-Quarterly-Newsletters/Fourth-Quarter-2025.pdf`). The old route via
 * /category/sec-news/ no longer exposes the newsletter post, which silently
 * dropped every penalty row and made the latest prepared date regress.
 * Returns PDF URLs newest quarter first.
 */
export function parseGhanaSecNewsletterIndex(html: string, pageUrl = GHANA_SEC_NEWSLETTER_INDEX_URL) {
  const $ = cheerio.load(html);
  const quarterOrder: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
  const found = new Map<string, number>();
  $("a[href]").each((_, link) => {
    const href = normalizeWhitespace($(link).attr("href") || "");
    const match = href.match(/SEC-Quarterly-Newsletters\/(First|Second|Third|Fourth)-Quarter-(\d{4})\.pdf/i);
    if (!match) return;
    found.set(
      makeAbsoluteUrl(pageUrl, href),
      Number(match[2]) * 10 + quarterOrder[match[1].toLowerCase()],
    );
  });
  return [...found.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

async function loadGhanaSecPenaltyRecords(): Promise<DbReadyRecord[]> {
  const records: DbReadyRecord[] = [];
  let pdfUrls: string[] = [];
  let newsletterUrl = GHANA_SEC_NEWSLETTER_INDEX_URL;

  try {
    const indexHtml = await fetchGhanaSecPageHtml(GHANA_SEC_NEWSLETTER_INDEX_URL, "sec-quarterly-newsletter");
    pdfUrls = parseGhanaSecNewsletterIndex(indexHtml).slice(0, GHANA_SEC_NEWSLETTER_QUARTERS);
  } catch (error) {
    console.warn(`⚠️ Ghana SEC newsletter index unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (pdfUrls.length === 0) {
    // Legacy route: latest newsletter post under /category/sec-news/.
    const newsHtml = await fetchGhanaSecText(GHANA_SEC_NEWS_URL);
    const legacyUrl = parseLatestGhanaSecNewsletterUrl(newsHtml);
    if (!legacyUrl) return records;
    const pathParts = new URL(legacyUrl).pathname.split("/").filter(Boolean);
    const slug = pathParts[pathParts.length - 1] || "";
    const newsletterHtml = slug ? await fetchGhanaSecPageHtml(legacyUrl, slug) : await fetchGhanaSecText(legacyUrl);
    const pdfUrl = parseGhanaSecNewsletterPdfUrl(newsletterHtml, legacyUrl);
    if (!pdfUrl) return records;
    newsletterUrl = legacyUrl;
    pdfUrls = [pdfUrl];
  }

  for (const pdfUrl of pdfUrls) {
    try {
      const penaltyText = await extractPdfLayoutTextFromUrl(pdfUrl);
      records.push(
        ...parseGhanaSecPenaltyText(penaltyText, newsletterUrl, pdfUrl).map(buildGhanaSecPenaltyRecord),
      );
    } catch (error) {
      console.warn(`⚠️ Skipping Ghana SEC newsletter ${pdfUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return records;
}

export async function loadGhanaSecLiveRecords(): Promise<DbReadyRecord[]> {
  const licenceHtml = await fetchGhanaSecPageHtml(GHANA_SEC_URL, "suspension-revocation-cessation-of-licenses");
  const licenceRecords = buildGhanaSecRecords(parseGhanaSecHtml(licenceHtml));
  const penaltyRecords = await loadGhanaSecPenaltyRecords();

  return [...licenceRecords, ...penaltyRecords].sort(
    (left, right) =>
      right.dateIssued.localeCompare(left.dateIssued) ||
      left.firmIndividual.localeCompare(right.firmIndividual),
  );
}

export async function main() {
  await runScraper({
    name: "🇬🇭 Ghana SEC Licence Actions Scraper",
    region: "Africa",
    regulatorCode: "GHSEC",
    liveLoader: loadGhanaSecLiveRecords,
    testLoader: loadGhanaSecLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ Ghana SEC scraper failed:", error);
    process.exit(1);
  });
}
