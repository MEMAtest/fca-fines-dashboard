/**
 * CNV (Comisión Nacional de Valores — Argentina) Disciplinary Resolutions Scraper
 *
 * Strategy: Parse the "Resoluciones Disciplinarias" grid (columns:
 *   N° de Resolución / Fecha / Carátula / Sumariado). The table is fully
 *   server-rendered HTML: one disciplinary resolution spans several rows via
 *   rowspan — the first three cells (resolution number, date, case title) carry
 *   down over every "sumariado" (sanctioned party) beneath them. Each
 *   (resolution × party) becomes one record.
 * URL: https://www.cnv.gov.ar/SitioWeb/ResolucionesDisciplinarias
 *
 * Difficulty: 3/10 (Low) — static HTML, but rowspan grouping must be tracked.
 * Language: Spanish. The Spanish case title (carátula) is preserved verbatim;
 *   the sanctioned-party name is used as the firm/individual. The monetary
 *   figure lives inside the linked resolution PDF, not the grid, so the amount
 *   fails toward null rather than guessing (see the Ghana SEC precedent).
 *
 * Run: npx tsx scripts/scraper/scrapeCnv.ts --dry-run
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const CNV_URL = "https://www.cnv.gov.ar/SitioWeb/ResolucionesDisciplinarias";

export interface CnvRow {
  /** Resolution number, e.g. "RRFCO-2025-317-APN-DIR#CNV". */
  resolutionNumber: string;
  dateIssued: string;
  /** Case title (carátula), Spanish, preserved verbatim. */
  caratula: string;
  /** Sanctioned party (sumariado). */
  party: string;
  /** Resolution PDF/blob URL, when present. */
  resolutionUrl: string | null;
}

/** CNV dates are D/M/YYYY (single-digit day/month allowed). */
export function parseCnvDate(input: string): string | null {
  const match = normalizeWhitespace(input).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Parse the disciplinary-resolutions grid, tracking rowspan so each sanctioned
 * party inherits its resolution's number, date, title, and PDF link.
 */
export function parseCnvHtml(html: string, pageUrl = CNV_URL): CnvRow[] {
  const $ = cheerio.load(html);
  const rows: CnvRow[] = [];

  // The disciplinary grid is the table whose header ends with a "SUMARIADO"
  // column (distinguishes it from the appeals/other grids on the same page).
  const table = $("table")
    .filter((_, element) => {
      const headers = $(element)
        .find("thead th")
        .map((__, th) => normalizeWhitespace($(th).text()).toUpperCase())
        .get();
      return (
        headers.some((h) => h.includes("RESOLUCIÓN") || h.includes("RESOLUCION")) &&
        headers.some((h) => h.includes("CARÁTULA") || h.includes("CARATULA")) &&
        headers.some((h) => h.includes("SUMARIADO"))
      );
    })
    .first();

  if (table.length === 0) {
    return rows;
  }

  let current: {
    resolutionNumber: string;
    dateIssued: string | null;
    caratula: string;
    resolutionUrl: string | null;
  } | null = null;

  table.find("tbody tr").each((_, element) => {
    const cells = $(element).find("td");

    if (cells.length >= 4) {
      // A new resolution header row: number / date / carátula / first party.
      const linkHref = normalizeWhitespace(
        cells.eq(0).find("a[href]").first().attr("href") || "",
      );
      current = {
        resolutionNumber: normalizeWhitespace(cells.eq(0).text()),
        dateIssued: parseCnvDate(cells.eq(1).text()),
        caratula: normalizeWhitespace(cells.eq(2).text()),
        resolutionUrl: linkHref ? makeAbsoluteUrl(pageUrl, linkHref) : null,
      };
      pushParty(normalizeWhitespace(cells.eq(3).text()), current, rows);
      return;
    }

    if (cells.length === 1 && current) {
      // A continuation row: another sumariado under the current resolution.
      pushParty(normalizeWhitespace(cells.eq(0).text()), current, rows);
    }
  });

  return rows;
}

function pushParty(
  party: string,
  current: {
    resolutionNumber: string;
    dateIssued: string | null;
    caratula: string;
    resolutionUrl: string | null;
  },
  rows: CnvRow[],
) {
  if (!party || !current.dateIssued || !current.resolutionNumber) {
    return;
  }
  rows.push({
    resolutionNumber: current.resolutionNumber,
    dateIssued: current.dateIssued,
    caratula: current.caratula,
    party,
    resolutionUrl: current.resolutionUrl,
  });
}

export function categorizeCnvRow(row: CnvRow): string[] {
  const corpus = `${row.caratula}`.toLowerCase();
  const categories: string[] = [];

  if (/manipulaci[oó]n|abuso de mercado|informaci[oó]n privilegiada/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/lavado|encubrimiento/.test(corpus)) {
    categories.push("AML");
  }
  if (/no autorizad|sin autorizaci[oó]n|oferta p[uú]blica irregular/.test(corpus)) {
    categories.push("UNAUTHORISED_ACTIVITY");
  }
  if (/informaci[oó]n|incumplimiento|deber de informar/.test(corpus)) {
    categories.push("DISCLOSURE");
  }

  categories.push("DISCIPLINARY_SANCTION");
  return [...new Set(categories)];
}

export function buildCnvRecord(row: CnvRow): DbReadyRecord {
  return buildEuFineRecord({
    regulator: "CNV",
    regulatorFullName: "Comisión Nacional de Valores",
    countryCode: "AR",
    countryName: "Argentina",
    firmIndividual: row.party,
    firmCategory: "Sumariado",
    // Monetary figure lives in the resolution PDF, not the grid — fail to null.
    amount: null,
    currency: "ARS",
    dateIssued: row.dateIssued,
    breachType: `Resolución disciplinaria ${row.resolutionNumber}`,
    breachCategories: categorizeCnvRow(row),
    // Spanish source text preserved verbatim.
    summary: normalizeWhitespace(
      `${row.party}: resolución disciplinaria CNV ${row.resolutionNumber} del ${row.dateIssued}. ${row.caratula}`,
    ).slice(0, 500),
    finalNoticeUrl: row.resolutionUrl,
    sourceUrl: CNV_URL,
    // Resolution number + party gives a stable per-sanction key.
    dedupeKey: `${row.resolutionNumber}::${row.party}`,
    rawPayload: row,
  });
}

export function buildCnvRecords(rows: CnvRow[]): DbReadyRecord[] {
  const byHash = new Map<string, DbReadyRecord>();
  for (const row of rows) {
    const record = buildCnvRecord(row);
    byHash.set(record.contentHash, record);
  }

  return [...byHash.values()].sort(
    (left, right) =>
      right.dateIssued.localeCompare(left.dateIssued) ||
      left.firmIndividual.localeCompare(right.firmIndividual),
  );
}

export async function loadCnvLiveRecords(): Promise<DbReadyRecord[]> {
  const html = await fetchText(CNV_URL, { timeout: 60_000 });
  return buildCnvRecords(parseCnvHtml(html));
}

export async function main() {
  await runScraper({
    name: "🇦🇷 CNV Resoluciones Disciplinarias Scraper",
    region: "Latin America",
    regulatorCode: "CNV",
    liveLoader: loadCnvLiveRecords,
    testLoader: loadCnvLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CNV scraper failed:", error);
    process.exit(1);
  });
}
