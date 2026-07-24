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
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  extractPdfLayoutTextFromUrl,
  fetchText,
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

export async function loadGhanaSecLiveRecords(): Promise<DbReadyRecord[]> {
  const [licenceHtml, newsHtml] = await Promise.all([
    fetchText(GHANA_SEC_URL, { timeout: 60_000 }),
    fetchText(GHANA_SEC_NEWS_URL, { timeout: 60_000 }),
  ]);
  const licenceRecords = buildGhanaSecRecords(parseGhanaSecHtml(licenceHtml));
  const newsletterUrl = parseLatestGhanaSecNewsletterUrl(newsHtml);
  if (!newsletterUrl) return licenceRecords;

  const newsletterHtml = await fetchText(newsletterUrl, { timeout: 60_000 });
  const pdfUrl = parseGhanaSecNewsletterPdfUrl(newsletterHtml, newsletterUrl);
  if (!pdfUrl) return licenceRecords;

  const penaltyText = await extractPdfLayoutTextFromUrl(pdfUrl);
  const penaltyRecords = parseGhanaSecPenaltyText(
    penaltyText,
    newsletterUrl,
    pdfUrl,
  ).map(buildGhanaSecPenaltyRecord);

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
