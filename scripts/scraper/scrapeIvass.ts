import "dotenv/config";
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

function toNumericCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return parsePlainAmount(value);
  }

  return null;
}

function cleanIvassInsurerName(value: string) {
  return normalizeWhitespace(value.replace(/\r?\n/g, " "));
}

export function parseIvassWorkbookRows(
  rows: unknown[][],
  context: IvassWorkbookContext,
) {
  const parsed: IvassAggregateRow[] = [];

  for (const row of rows.slice(3)) {
    const insurerType = normalizeWhitespace(String(row[0] ?? ""));
    const insurerName = cleanIvassInsurerName(String(row[1] ?? ""));
    const sanctionCount = toNumericCell(row[2]);
    const amount = toNumericCell(row[4]);

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
      year: context.year,
      workbookUrl: context.workbookUrl,
    });
  }

  return parsed;
}

function buildIvassSummary(record: IvassAggregateRow) {
  const sanctionLabel = record.sanctionCount === 1 ? "sanction" : "sanctions";
  return `${record.insurerName} recorded ${record.sanctionCount} IVASS administrative pecuniary ${sanctionLabel} in ${record.year}, totalling EUR ${record.amount.toLocaleString("en-GB")}. Source data is the official annual insurer-level IVASS sanctions workbook.`;
}

async function loadIvassLiveRecords() {
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

runScraper({
  name: "🇮🇹 IVASS Sanctions Scraper",
  region: "Europe",
  liveLoader: loadIvassLiveRecords,
});
