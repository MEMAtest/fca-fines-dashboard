/**
 * FRB (Federal Reserve Board — USA) Scraper
 *
 * Strategy: Official CSV export behind the enforcement-actions search tool.
 * URL: https://www.federalreserve.gov/supervisionreg/files/enforcementactions.csv
 * (linked from https://www.federalreserve.gov/supervisionreg/enforcementactions.htm).
 *
 * Difficulty: 3/10 (Low) — a single official CSV of every enforcement action.
 * Note: the FRB rarely publishes fine amounts in this export. Many actions are
 *   non-monetary (Written Agreements, Cease & Desist, Prohibitions), so most rows
 *   carry a null amount. Where the Action column embeds a penalty (e.g.
 *   "Civil Money Penalty $5,000") the amount is parsed out.
 * Language: English.
 *
 * Run: npx tsx scripts/scraper/scrapeFrb.ts --dry-run
 */

import "dotenv/config";
import { parse } from "csv-parse/sync";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  normalizeWhitespace,
  parsePlainAmount,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FRB_CSV_URL =
  "https://www.federalreserve.gov/supervisionreg/files/enforcementactions.csv";
const FRB_SOURCE_URL =
  "https://www.federalreserve.gov/supervisionreg/enforcementactions.htm";

export interface FrbCsvRow {
  effectiveDate: string;
  terminationDate: string;
  individual: string;
  individualAffiliation: string;
  bankingOrganization: string;
  action: string;
  url: string;
  name: string;
  note: string;
}

interface RawCsvRecord {
  "Effective Date"?: string;
  "Termination Date"?: string;
  Individual?: string;
  "Individual Affiliation"?: string;
  "Banking Organization"?: string;
  Action?: string;
  URL?: string;
  Name?: string;
  Note?: string;
}

function parseFrbDate(value: string): string | null {
  const match = normalizeWhitespace(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * The FRB Action column sometimes embeds the penalty, e.g.
 * "Civil Money Penalty $10,000" or "Cease and Desist Order, Civil Money Penalty $50,000".
 */
export function parseFrbAmount(action: string): number | null {
  const match = normalizeWhitespace(action).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  return parsePlainAmount(match[1]);
}

/**
 * FRB actions target either a named Individual or a Banking Organization
 * (occasionally both). Prefer the individual when named, else the organisation.
 */
export function extractFrbEntity(row: FrbCsvRow): string {
  const individual = normalizeWhitespace(row.individual);
  const org = normalizeWhitespace(row.bankingOrganization);

  if (individual && org) {
    return `${individual} (${org})`;
  }
  return individual || org;
}

export function categorizeFrbAction(action: string): string[] {
  const normalized = action.toLowerCase();
  const categories: string[] = [];

  if (/civil money penalty/.test(normalized)) {
    categories.push("MONETARY_SANCTION");
  }
  if (/prohibition|section 19|removal/.test(normalized)) {
    categories.push("PROHIBITION");
  }
  if (/cease and desist/.test(normalized)) {
    categories.push("CEASE_AND_DESIST");
  }
  if (/written agreement/.test(normalized)) {
    categories.push("WRITTEN_AGREEMENT");
  }
  if (/prompt corrective action|capital/.test(normalized)) {
    categories.push("CAPITAL_LIQUIDITY");
  }
  if (/bsa|aml|money laundering/.test(normalized)) {
    categories.push("AML");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["SUPERVISORY_SANCTION"];
}

export function parseFrbCsv(csv: string): FrbCsvRow[] {
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as RawCsvRecord[];

  return records.map((record) => ({
    effectiveDate: record["Effective Date"] || "",
    terminationDate: record["Termination Date"] || "",
    individual: record.Individual || "",
    individualAffiliation: record["Individual Affiliation"] || "",
    bankingOrganization: record["Banking Organization"] || "",
    action: record.Action || "",
    url: record.URL || "",
    name: record.Name || "",
    note: record.Note || "",
  }));
}

export function buildFrbRecord(row: FrbCsvRow): DbReadyRecord | null {
  const dateIssued = parseFrbDate(row.effectiveDate);
  const firm = extractFrbEntity(row);

  if (!dateIssued || !firm) {
    return null;
  }

  const action = normalizeWhitespace(row.action) || "Enforcement action";
  const amount = parseFrbAmount(row.action);
  const url = normalizeWhitespace(row.url) || null;

  return buildEuFineRecord({
    regulator: "FRB",
    regulatorFullName: "Federal Reserve Board",
    countryCode: "US",
    countryName: "United States",
    firmIndividual: firm,
    firmCategory: normalizeWhitespace(row.individual) ? "Individual" : "Banking Organization",
    amount,
    currency: "USD",
    dateIssued,
    breachType: action,
    breachCategories: categorizeFrbAction(action),
    summary: amount
      ? `${firm} — ${action} by the Federal Reserve Board.`
      : `${firm} subject to a Federal Reserve Board ${action.toLowerCase()}.`,
    finalNoticeUrl: url,
    sourceUrl: FRB_SOURCE_URL,
    // Effective date + entity + action + release URL is unique per FRB action.
    dedupeKey: `${dateIssued}::${firm}::${action}::${url ?? "no-url"}`,
    rawPayload: row,
  });
}

export function buildFrbRecords(rows: FrbCsvRow[]): DbReadyRecord[] {
  const seen = new Map<string, DbReadyRecord>();

  for (const row of rows) {
    const record = buildFrbRecord(row);
    if (record) {
      seen.set(record.contentHash, record);
    }
  }

  return [...seen.values()].sort((left, right) =>
    right.dateIssued.localeCompare(left.dateIssued),
  );
}

export async function loadFrbLiveRecords(): Promise<DbReadyRecord[]> {
  const flags = getCliFlags();
  const csv = await fetchText(FRB_CSV_URL, { timeout: 90000 });
  const records = buildFrbRecords(parseFrbCsv(csv));
  return flags.limit && flags.limit > 0 ? records.slice(0, flags.limit) : records;
}

export async function main() {
  await runScraper({
    name: "🇺🇸 FRB Enforcement Actions Scraper",
    region: "North America",
    regulatorCode: "FRB",
    liveLoader: loadFrbLiveRecords,
    testLoader: loadFrbLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FRB scraper failed:", error);
    process.exit(1);
  });
}
