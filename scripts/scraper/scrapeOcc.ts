import "dotenv/config";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  normalizeWhitespace,
  parseLargestAmountFromText,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const OCC_SEARCH_URL = "https://apps.occ.gov/EASearch";
const OCC_EXPORT_URL = `${OCC_SEARCH_URL}/Search/ExportToJSON?q=&cat=&srt=&pgsz=100`;
const OCC_TIMEOUT_MS = Number.parseInt(process.env.OCC_TIMEOUT_MS || "120000", 10);

export interface OccExportRow {
  Institution: string;
  CharterNumber: string;
  Company: string;
  Individual: string;
  Location: string;
  TypeCode: string;
  TypeDescription: string;
  Amount: string;
  StartDate: string;
  StartDocuments: string[];
  TerminationDate: string;
  TerminationDocuments: string[];
  DocketNumber: string;
  SubjectMatters: string[];
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

function parseOccAmount(input: string) {
  const amount = Number.parseFloat(String(input || "0").replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function buildOccEntity(row: OccExportRow) {
  return (
    normalizeWhitespace(row.Institution) ||
    normalizeWhitespace(row.Company) ||
    normalizeWhitespace(row.Individual)
  );
}

function buildOccSourceUrl(row: OccExportRow) {
  const query = encodeURIComponent(
    buildOccEntity(row) || normalizeWhitespace(row.DocketNumber) || "",
  );
  return query ? `${OCC_SEARCH_URL}?q=${query}&cat=&srt=&pgsz=100` : OCC_SEARCH_URL;
}

function buildOccFinalNoticeUrl(row: OccExportRow) {
  const code = normalizeWhitespace(row.StartDocuments?.[0] || "");

  if (/^\d{4}-\d{3}$/.test(code)) {
    return `https://occ.gov/static/enforcement-actions/ea${code}.pdf`;
  }

  return null;
}

export function parseOccExportJson(json: string) {
  const rows = JSON.parse(json) as OccExportRow[];
  return rows.filter((row) => {
    const entity = buildOccEntity(row);
    const dateIssued = parseUsSlashDate(row.StartDate);
    return Boolean(entity && dateIssued && normalizeWhitespace(row.TypeDescription));
  });
}

function categorizeOccRecord(row: OccExportRow) {
  const corpus = `${row.TypeDescription} ${row.SubjectMatters.join(" ")}`.toLowerCase();
  const categories: string[] = [];

  if (/bsa|aml|sar|ctr|due diligence/.test(corpus)) {
    categories.push("AML");
  }
  if (/consumer|fair lending|flood insurance|truth in lending/.test(corpus)) {
    categories.push("CONSUMER_PROTECTION");
  }
  if (/board|management|governance|strategic planning/.test(corpus)) {
    categories.push("GOVERNANCE");
  }
  if (/capital|liquidity|earnings|asset quality|camels/.test(corpus)) {
    categories.push("PRUDENTIAL");
  }
  if (/books and records|false statements|obstruction/.test(corpus)) {
    categories.push("DISCLOSURE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildOccSummary(row: OccExportRow, entity: string) {
  const parts = [
    `${entity} subject to OCC ${normalizeWhitespace(row.TypeDescription)}`,
  ];

  const amount = parseOccAmount(row.Amount);
  if (amount && amount > 0) {
    parts.push(`Amount $${amount.toLocaleString("en-US")}`);
  }

  if (row.SubjectMatters?.length) {
    parts.push(`Subject matters: ${row.SubjectMatters.join("; ")}`);
  }

  if (normalizeWhitespace(row.DocketNumber)) {
    parts.push(`Docket ${normalizeWhitespace(row.DocketNumber)}`);
  }

  return parts.join(". ");
}

function buildOccRecords(rows: OccExportRow[]) {
  return rows.map((row) => {
    const entity = buildOccEntity(row);
    const dateIssued = parseUsSlashDate(row.StartDate) || "1900-01-01";
    const summary = buildOccSummary(row, entity);

    return buildEuFineRecord({
      regulator: "OCC",
      regulatorFullName: "Office of the Comptroller of the Currency",
      countryCode: "US",
      countryName: "United States",
      firmIndividual: entity,
      firmCategory: normalizeWhitespace(row.Institution) ? "Bank" : "Financial Entity",
      amount: parseOccAmount(row.Amount),
      currency: "USD",
      dateIssued,
      breachType: normalizeWhitespace(row.TypeDescription) || "OCC enforcement action",
      breachCategories: categorizeOccRecord(row),
      summary,
      finalNoticeUrl: buildOccFinalNoticeUrl(row),
      sourceUrl: buildOccSourceUrl(row),
      rawPayload: row,
    });
  });
}

export async function loadOccLiveRecords() {
  const json = await fetchText(OCC_EXPORT_URL, {
    timeout: OCC_TIMEOUT_MS,
    headers: {
      Accept: "application/json,text/plain,*/*",
    },
  });

  const rows = parseOccExportJson(json);
  console.log(`📊 OCC extracted ${rows.length} enforcement actions`);
  return buildOccRecords(rows);
}

export async function main() {
  await runScraper({
    name: "🇺🇸 OCC Enforcement Actions Scraper",
    region: "North America",
    liveLoader: loadOccLiveRecords,
    testLoader: loadOccLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ OCC scraper failed:", error);
    process.exit(1);
  });
}
