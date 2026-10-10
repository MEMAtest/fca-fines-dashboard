import "dotenv/config";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import * as XLSX from "xlsx";
import {
  buildEuFineRecord,
  fetchBinary,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parsePlainAmount,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const IVASS_BASE_URL = "https://www.ivass.it";
const IVASS_SANCTIONS_URL = "https://www.ivass.it/consumatori/sanzioni/index.html";

export interface IvassAnnualWorkbookLink {
  year: number;
  title: string;
  workbookUrl: string;
}

interface IvassWorkbookContext {
  year: number;
  workbookUrl: string;
}

interface IvassAggregateRow {
  insurerType: string;
  insurerName: string;
  sanctionCount: number;
  amount: number;
  /** What the pre-fix parser read (column 4); content-hash identity only. */
  legacyAmount: number | null;
  year: number;
  workbookUrl: string;
}

function isAnnualWorkbookLink(href: string, title: string) {
  const normalizedHref = href.toLowerCase();
  const normalizedTitle = title.toLowerCase();

  if (!/tav(?:ola)?[._]?1|tav1|sanzioni_anno_.*tav1/.test(normalizedHref)) {
    return false;
  }

  if (/semestre|1-sem|i-sem|i_sem/.test(normalizedHref) || /sem\./.test(normalizedTitle)) {
    return false;
  }

  return /provvedimenti di ingiunzione totali/i.test(title);
}

export function parseIvassLandingHtml(html: string) {
  const $ = cheerio.load(html);
  const workbooks = new Map<number, IvassAnnualWorkbookLink>();

  $("li a[href]").each((_, element) => {
    const href = normalizeWhitespace($(element).attr("href") || "");
    const title = normalizeWhitespace($(element).find(".link-title").text() || $(element).text());
    const yearMatch = href.match(/\/consumatori\/sanzioni\/(\d{4})\//);

    if (!href || !title || !yearMatch || !isAnnualWorkbookLink(href, title)) {
      return;
    }

    const year = Number.parseInt(yearMatch[1], 10);
    workbooks.set(year, {
      year,
      title,
      workbookUrl: makeAbsoluteUrl(IVASS_BASE_URL, href),
    });
  });

  return [...workbooks.values()].sort((left, right) => left.year - right.year);
}

/** Italian number text: "1.234.567,89", "137.028", "11,95". */
export function parseItalianNumber(value: string) {
  const cleaned = value.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    const parsed = Number.parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    return Number.parseFloat(cleaned.replace(/\./g, ""));
  }
  return parsePlainAmount(cleaned);
}

function toNumericCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return parseItalianNumber(value);
  }

  return null;
}

/**
 * The column layout differs by year: 2020 carries extra ratio columns before
 * "Importo", 2025 puts "Importo provvedimenti per milione di premi" straight
 * after the amount. Reading a fixed column index took that ratio (EUR 11.95
 * per million of premiums) as the fine. Locate the plain "Importo" and
 * "Numero" header cells instead.
 */
export function locateIvassColumns(rows: unknown[][]) {
  let countColumn = 2;
  let amountColumn: number | null = null;
  for (const row of rows.slice(0, 4)) {
    row.forEach((cell, index) => {
      const label = normalizeWhitespace(String(cell ?? "")).toLowerCase();
      if (label === "numero" && countColumn === 2) countColumn = index;
      if (label === "importo" && amountColumn === null) amountColumn = index;
    });
  }
  return { countColumn, amountColumn };
}

function cleanIvassInsurerName(value: string) {
  return normalizeWhitespace(value.replace(/\r?\n/g, " "));
}

export function parseIvassWorkbookRows(
  rows: unknown[][],
  context: IvassWorkbookContext,
) {
  const parsed: IvassAggregateRow[] = [];
  const { countColumn, amountColumn } = locateIvassColumns(rows);
  if (amountColumn === null) {
    throw new Error(`IVASS ${context.year} workbook has no plain "Importo" column; refusing to guess the amount column.`);
  }

  for (const row of rows.slice(3)) {
    const insurerType = normalizeWhitespace(String(row[0] ?? ""));
    const insurerName = cleanIvassInsurerName(String(row[1] ?? ""));
    const sanctionCount = toNumericCell(row[countColumn]);
    const amount = toNumericCell(row[amountColumn]);
    const legacyAmount = typeof row[4] === "number" && Number.isFinite(row[4])
      ? row[4]
      : typeof row[4] === "string" ? parsePlainAmount(row[4]) : null;

    if (!insurerName || /^totale\b/i.test(insurerName) || /^\(\*\)/.test(insurerType)) {
      continue;
    }

    if (sanctionCount === null || amount === null) {
      continue;
    }

    parsed.push({
      insurerType: insurerType || "Impresa di assicurazione",
      insurerName,
      sanctionCount,
      amount,
      legacyAmount,
      year: context.year,
      workbookUrl: context.workbookUrl,
    });
  }

  return parsed;
}

function buildIvassSummary(record: IvassAggregateRow) {
  const sanctionLabel = record.sanctionCount === 1 ? "sanction" : "sanctions";
  return `${record.insurerName} recorded ${record.sanctionCount} IVASS administrative pecuniary ${sanctionLabel} in ${record.year}, totalling EUR ${record.amount.toLocaleString("en-GB")}. Source data is the official annual insurer-level IVASS sanctions workbook (Tavola 1). This is a calendar-year aggregate: IVASS does not publish individual decision dates there, so the record is dated 31 December ${record.year} and the amount is the year's total for the insurer, not a single fine.`;
}

export async function loadIvassLiveRecords() {
  const landingHtml = await fetchText(IVASS_SANCTIONS_URL);
  const annualWorkbooks = parseIvassLandingHtml(landingHtml);

  const aggregates = (
    await Promise.all(
      annualWorkbooks.map(async (workbook) => {
        const buffer = await fetchBinary(workbook.workbookUrl, { maxRedirects: 5 });
        const workbookData = XLSX.read(buffer, { type: "buffer" });
        const firstSheet = workbookData.Sheets[workbookData.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, {
          header: 1,
          blankrows: false,
          defval: "",
        }) as unknown[][];

        return parseIvassWorkbookRows(rows, workbook);
      }),
    )
  ).flat();

  return aggregates
    .map((record) =>
      buildEuFineRecord({
        regulator: "IVASS",
        regulatorFullName: "Institute for the Supervision of Insurance",
        countryCode: "IT",
        countryName: "Italy",
        firmIndividual: record.insurerName,
        firmCategory: record.insurerType,
        amount: record.amount,
        legacyAmountIdentity: record.legacyAmount,
        currency: "EUR",
        dateIssued: `${record.year}-12-31`,
        breachType: "Administrative pecuniary sanctions against insurance undertakings (annual aggregate)",
        breachCategories: ["INSURANCE"],
        summary: buildIvassSummary(record),
        finalNoticeUrl: record.workbookUrl,
        sourceUrl: IVASS_SANCTIONS_URL,
        rawPayload: record,
      }),
    )
    .sort((left, right) => right.dateIssued.localeCompare(left.dateIssued) || left.firmIndividual.localeCompare(right.firmIndividual));
}

export async function main() {
  await runScraper({
    name: "🇮🇹 IVASS Sanctions Scraper",
    region: "Europe",
    liveLoader: loadIvassLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("IVASS scraper failed:", error);
    process.exit(1);
  });
}
