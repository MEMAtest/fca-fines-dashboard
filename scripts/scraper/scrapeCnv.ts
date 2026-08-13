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
  /** Whether CNV published this row as an opening or a concluded outcome. */
  proceedingStage: "opening" | "conclusion";
  /** CNV's published decision for conclusions (for example Multa). */
  decision: string | null;
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
    } else if (cells.length > 1 && cells.length < 4) {
      // Neither a header row (>=4 cells) nor a clean continuation (1 cell):
      // a party silently vanishing here is the worst failure mode for a
      // compliance dataset, so make the anomaly loud instead of dropping it.
      // eslint-disable-next-line no-console
      console.warn(
        `CNV: unexpected ${cells.length}-cell row skipped: "${normalizeWhitespace(cells.text()).slice(0, 80)}"`,
      );
    }
  });

  const conclusionsTable = $("table")
    .filter((_, element) => {
      const headers = $(element)
        .find("thead th")
        .map((__, th) => normalizeWhitespace($(th).text()).toUpperCase())
        .get();
      return (
        headers.some((header) => header.includes("RESOLUCIÓN") || header.includes("RESOLUCION")) &&
        headers.some((header) => header.includes("SUMARIADO")) &&
        headers.some((header) => header.includes("DECISIÓN") || header.includes("DECISION"))
      );
    })
    .first();

  let currentConclusion: {
    resolutionNumber: string;
    dateIssued: string | null;
    resolutionUrl: string | null;
  } | null = null;

  conclusionsTable.find("tbody tr").each((_, element) => {
    const cells = $(element).children("td");
    if (cells.length >= 4) {
      const linkHref = normalizeWhitespace(
        cells.eq(0).find("a[href]").first().attr("href") || "",
      );
      currentConclusion = {
        resolutionNumber: normalizeWhitespace(cells.eq(0).text()),
        dateIssued: parseCnvDate(cells.eq(1).text()),
        resolutionUrl: linkHref ? makeAbsoluteUrl(pageUrl, linkHref) : null,
      };
      pushConclusion(
        normalizeWhitespace(cells.eq(2).text()),
        normalizeWhitespace(cells.eq(3).text()),
        currentConclusion,
        rows,
      );
      return;
    }

    if (cells.length === 2 && currentConclusion) {
      pushConclusion(
        normalizeWhitespace(cells.eq(0).text()),
        normalizeWhitespace(cells.eq(1).text()),
        currentConclusion,
        rows,
      );
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
    proceedingStage: "opening",
    decision: null,
  });
}

function pushConclusion(
  party: string,
  decision: string,
  current: {
    resolutionNumber: string;
    dateIssued: string | null;
    resolutionUrl: string | null;
  },
  rows: CnvRow[],
) {
  if (!party || !decision || !current.dateIssued || !current.resolutionNumber) return;
  rows.push({
    resolutionNumber: current.resolutionNumber,
    dateIssued: current.dateIssued,
    caratula: `Conclusión disciplinaria: ${decision}`,
    party,
    resolutionUrl: current.resolutionUrl,
    proceedingStage: "conclusion",
    decision,
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

  const decision = row.decision?.toLowerCase() ?? "";
  if (/exclusi[oó]n|inhabilitaci[oó]n|suspensi[oó]n/.test(decision)) {
    categories.push("PROHIBITION");
  }
  categories.push(row.proceedingStage === "conclusion" ? "DISCIPLINARY_OUTCOME" : "DISCIPLINARY_SANCTION");
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
    breachType: row.decision
      ? `Conclusión disciplinaria: ${row.decision}`
      : `Resolución disciplinaria ${row.resolutionNumber}`,
    breachCategories: categorizeCnvRow(row),
    // Spanish source text preserved verbatim.
    summary: normalizeWhitespace(
      row.decision
        ? `${row.party}: CNV publicó la conclusión ${row.resolutionNumber} del ${row.dateIssued}. Decisión: ${row.decision}.`
        : `${row.party}: resolución disciplinaria CNV ${row.resolutionNumber} del ${row.dateIssued}. ${row.caratula}`,
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
    // An explicit acquittal is a useful source-health signal but is not an
    // enforcement action. Parse it to prove the table is complete, then keep
    // it out of the public action dataset and its aggregate counts.
    if (row.proceedingStage === "conclusion" && /^absoluci[oó]n$/i.test(row.decision ?? "")) {
      continue;
    }
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
