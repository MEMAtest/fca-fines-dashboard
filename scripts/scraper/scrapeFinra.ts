import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  buildEuFineRecord,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseScaledAmount,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FINRA_ACTIONS_URL =
  "https://www.finra.org/rules-guidance/oversight-enforcement/finra-disciplinary-actions";
export const FINRA_EXPORT_URL =
  "https://data-portal.finra.org/exports/fda_export_all.xlsx";
const FINRA_START_YEAR = Number.parseInt(process.env.FINRA_START_YEAR || "2005", 10);
const FINRA_END_YEAR = Number.parseInt(
  process.env.FINRA_END_YEAR || String(new Date().getUTCFullYear()),
  10,
);

export interface FinraActionEntry {
  caseNumber: string;
  respondent: string;
  dateIssued: string;
  documentType: string;
  actionUrl: string;
  summary: string;
}

export const FINRA_EXPORT_HEADERS = [
  "Case ID",
  "Title",
  "Action Date",
  "Document Type",
  "Individual Name",
  "Individual CRD#",
  "Firm Name",
  "Firm CRD#",
  "Has Related Cases",
  "Document Link",
  "Summary",
] as const;

interface FinraArchivePage {
  entries: FinraActionEntry[];
  totalPages: number;
}

interface FinraMonthWindow {
  label: string;
  min: string;
  max: string;
  url: string;
}

function parseUsSlashDate(input: string) {
  const match = normalizeWhitespace(input).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1] || "0", 10);
  const day = Number.parseInt(match[2] || "0", 10);
  const year = Number.parseInt(match[3] || "0", 10);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseFinraExportDate(value: unknown) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || parsed.y < 1900 || parsed.m < 1 || parsed.m > 12 || parsed.d < 1 || parsed.d > 31) {
      return null;
    }
    return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  if (typeof value !== "string") return null;
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  const slashDate = parseUsSlashDate(normalized);
  if (slashDate) return slashDate;
  const shortSlashDate = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortSlashDate) {
    const month = Number.parseInt(shortSlashDate[1] || "0", 10);
    const day = Number.parseInt(shortSlashDate[2] || "0", 10);
    const year = 2000 + Number.parseInt(shortSlashDate[3] || "0", 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const isoDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!isoDate) return null;
  const year = Number.parseInt(isoDate[1] || "0", 10);
  const month = Number.parseInt(isoDate[2] || "0", 10);
  const day = Number.parseInt(isoDate[3] || "0", 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
}

function finraCellText(value: unknown) {
  if (value === null || value === undefined) return "";
  return normalizeWhitespace(String(value));
}

/** Parse FINRA's official full export without relying on the obsolete archive HTML table. */
export function parseFinraExportWorkbook(buffer: Buffer | Uint8Array): FinraActionEntry[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const sheet = workbook.Sheets.Export;
  if (!sheet) {
    throw new Error("FINRA official XLSX export is missing the required Export worksheet.");
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
  const header = (rows[0] || []).map(finraCellText);
  if (
    header.length !== FINRA_EXPORT_HEADERS.length ||
    FINRA_EXPORT_HEADERS.some((expected, index) => header[index] !== expected)
  ) {
    throw new Error(
      `FINRA official XLSX export headers changed; expected ${FINRA_EXPORT_HEADERS.join(", ")}.`,
    );
  }

  const entries: FinraActionEntry[] = [];
  for (const row of rows.slice(1)) {
    const caseNumber = finraCellText(row[0]);
    const title = finraCellText(row[1]);
    const dateIssued = parseFinraExportDate(row[2]);
    const documentType = finraCellText(row[3]);
    const individualName = finraCellText(row[4]);
    const firmName = finraCellText(row[6]);
    const actionUrl = finraCellText(row[9]);
    const respondents = [...new Set([individualName, firmName].filter(Boolean))];

    if (
      !caseNumber ||
      respondents.length === 0 ||
      !dateIssued ||
      !documentType ||
      !/^https?:\/\//i.test(actionUrl)
    ) {
      continue;
    }

    const suppliedSummary = finraCellText(row[10]) || title;
    respondents.forEach((respondent) => {
      entries.push({
        caseNumber,
        respondent,
        dateIssued,
        documentType,
        actionUrl,
        summary: suppliedSummary || `FINRA disciplinary action involving ${respondent}.`,
      });
    });
  }

  return entries;
}

function formatFinraDateQuery(value: Date) {
  return `${String(value.getUTCMonth() + 1).padStart(2, "0")}/${String(value.getUTCDate()).padStart(2, "0")}/${value.getUTCFullYear()}`;
}

export function buildFinraMonthWindows(startYear = FINRA_START_YEAR, endYear = FINRA_END_YEAR) {
  const windows: FinraMonthWindow[] = [];
  const now = new Date();
  const lastMonthIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();

  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const absoluteMonthIndex = year * 12 + month;
      if (absoluteMonthIndex > lastMonthIndex) {
        break;
      }

      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      const params = new URLSearchParams({
        "field_core_official_dt[min]": formatFinraDateQuery(monthStart),
        "field_core_official_dt[max]": formatFinraDateQuery(monthEnd),
        field_fda_case_id_txt: "",
        field_fda_document_type_tax: "All",
        firms: "",
        individuals: "",
        search: "",
      });

      windows.push({
        label: `${year}-${String(month + 1).padStart(2, "0")}`,
        min: formatFinraDateQuery(monthStart),
        max: formatFinraDateQuery(monthEnd),
        url: `${FINRA_ACTIONS_URL}?${params.toString()}`,
      });
    }
  }

  return windows.reverse();
}

export function parseFinraAmount(text: string) {
  const normalized = normalizeWhitespace(text);
  const explicitFinePatterns = [
    /\b(?:(?:is|are|was|were)\s+)?(?:censured\s+and\s+)?fined\s+(?:a\s+total\s+of\s+)?(?:USD\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|m|k)?/i,
    /\b(?:fine|penalty)\s+of\s+(?:USD\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|m|k)?/i,
    /\bordered\s+to\s+pay\s+(?:a\s+)?(?:USD\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|m|k)?\s+(?:fine|penalty)/i,
  ];

  for (const pattern of explicitFinePatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const amount = parseScaledAmount(match[1], match[2]);
      if (amount !== null) return amount;
    }
  }

  return null;
}

function extractFinraRespondents($cell: cheerio.Cheerio<any>) {
  const names = $cell
    .find("span.cell")
    .map((_, element) => normalizeWhitespace($cell.find(element).text()))
    .get()
    .filter(Boolean)
    .filter((value) => value.length > 1);

  if (names.length > 0) {
    return [...new Set(names)];
  }

  const fallback = normalizeWhitespace($cell.text());
  return fallback ? [fallback] : [];
}

function extractFinraTotalPages(html: string) {
  const matches = [...html.matchAll(/[?&]page=(\d+)/g)].map((match) =>
    Number.parseInt(match[1] || "0", 10),
  );
  const highestPageIndex = matches.reduce((max, value) => Math.max(max, value), 0);
  return highestPageIndex + 1;
}

export function parseFinraArchiveHtml(
  html: string,
  pageUrl = FINRA_ACTIONS_URL,
): FinraArchivePage {
  const $ = cheerio.load(html);
  const entries: FinraActionEntry[] = [];

  $("table.views-view-table tbody tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 5) {
      return;
    }

    const caseLink = cells.eq(0).find("a[href]").first();
    const caseNumber = normalizeWhitespace(caseLink.text());
    const actionUrl = makeAbsoluteUrl(pageUrl, caseLink.attr("href") || "");
    const summary = normalizeWhitespace(cells.eq(1).text());
    const documentType = normalizeWhitespace(cells.eq(2).text());
    const respondents = extractFinraRespondents(cells.eq(3));
    const dateIssued = parseUsSlashDate(cells.eq(4).text());

    if (!caseNumber || !actionUrl || !summary || !dateIssued || respondents.length === 0) {
      return;
    }

    respondents.forEach((respondent) => {
      entries.push({
        caseNumber,
        respondent,
        dateIssued,
        documentType: documentType || "FINRA disciplinary action",
        actionUrl,
        summary,
      });
    });
  });

  return {
    entries,
    totalPages: extractFinraTotalPages(html),
  };
}

function categorizeFinraRecord(documentType: string, summary: string) {
  const corpus = `${documentType} ${summary}`.toLowerCase();
  const categories: string[] = [];

  if (/fraud|misrepresentation|false statement|misleading|deceptive/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/disclosure|books and records|focus report|recordkeeping/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/market manipulation|insider trading|trading|churn/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/supervision|supervisory|oversight|written supervisory procedures/.test(corpus)) {
    categories.push("GOVERNANCE");
  }
  if (/aml|money laundering|customer due diligence|suspicious activity/.test(corpus)) {
    categories.push("AML");
  }
  if (/best interest|reg bi/.test(corpus)) {
    categories.push("CONDUCT");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

export function buildFinraRecords(entries: FinraActionEntry[]) {
  const dedupedEntries = [...new Map(
    entries.map((entry) => [
      `${entry.caseNumber}::${entry.respondent}::${entry.dateIssued}::${entry.actionUrl}`,
      entry,
    ]),
  ).values()];

  return dedupedEntries.map((entry) => {
    const summary = entry.summary;

    return buildEuFineRecord({
      regulator: "FINRA",
      regulatorFullName: "Financial Industry Regulatory Authority",
      countryCode: "US",
      countryName: "United States",
      firmIndividual: entry.respondent,
      firmCategory: null,
      amount: parseFinraAmount(summary),
      currency: "USD",
      dateIssued: entry.dateIssued,
      breachType: entry.documentType,
      breachCategories: categorizeFinraRecord(entry.documentType, summary),
      summary,
      finalNoticeUrl: entry.actionUrl,
      sourceUrl: FINRA_EXPORT_URL,
      rawPayload: entry,
    });
  });
}

export async function loadFinraLiveRecords() {
  const response = await fetch(FINRA_EXPORT_URL, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`FINRA official XLSX export failed with HTTP ${response.status}.`);
  }

  const entries = parseFinraExportWorkbook(Buffer.from(await response.arrayBuffer()));
  console.log(`📊 FINRA official XLSX export yielded ${entries.length} respondent-level rows`);
  return buildFinraRecords(entries);
}

export async function main() {
  await runScraper({
    name: "🇺🇸 FINRA Disciplinary Actions Scraper",
    region: "North America",
    liveLoader: loadFinraLiveRecords,
    testLoader: loadFinraLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FINRA scraper failed:", error);
    process.exit(1);
  });
}
