/**
 * UAF (Unidad de Análisis Financiero - Chile's financial intelligence unit)
 * executed-sanctions scraper.
 *
 * Source: https://www.uaf.cl/es-cl/publicaciones-uaf/sanciones-ejecutoriadas -
 * one server-rendered table (~1,600 rows, 2011-2025):
 *   Nº de ROL | Persona natural o jurídica | Sector económico | Causal |
 *   Fecha de resolución | Resolución (PDF)
 *
 * What these are: administrative sanctions under Law 19.913 on "sujetos
 * obligados" (notaries, casinos, currency-exchange houses, real-estate
 * brokers, factoring firms, free-zone users ...) for AML/CFT reporting and
 * compliance failures. They are NOT market-conduct or prudential penalties,
 * so the sector is published as the obliged-entity category.
 *
 * Penalty amounts exist only inside the PDFs, and only some PDFs carry a text
 * layer (many are scanned images). We read the operative "RESUELVO" section
 * when text is present, convert UF/UTM to CLP at the unit value on the
 * resolution date, cross-check digits against any figure spelled in words,
 * and otherwise leave the amount null. Statutory maxima ("hasta UF 800") are
 * never read as the penalty. "Recurso de reposición" rows are follow-ups to an
 * earlier sanction and are attached to it, not counted as new penalties.
 *
 * PDF fetching: max 2 concurrent requests with a pause between requests; results
 * are cached in scripts/scraper/data/uafResolutions.json (decisions are
 * immutable) so scheduled runs fetch only new documents.
 *
 * Run: npm run scrape:uaf -- --dry-run
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";
import { convertUnitToClp, parseChileanAmount, type ChileanAmount } from "./lib/chileUnits.js";
import { fetchPdfText, isNotFound, politeMap } from "./lib/politePdf.js";

const UAF_CONFIG = {
  baseUrl: "https://www.uaf.cl",
  listingUrl: "https://www.uaf.cl/es-cl/publicaciones-uaf/sanciones-ejecutoriadas",
};

/**
 * Decision PDFs published for resolutions dated after this are scanned images
 * (verified by sampling every half-year 2012-2025: text layers exist for
 * 2011-mid-2015 and are essentially absent afterwards), and are 2-6 MB each.
 * Fetching them only to find no text is wasteful, so they are not read unless
 * UAF_READ_ALL_PDFS=1. Their records keep amount null and say why.
 */
export const UAF_TEXT_LAYER_CUTOFF = "2015-06-30";

export function shouldReadUafPdf(row: Pick<UafRow, "dateIssued">): boolean {
  return process.env.UAF_READ_ALL_PDFS === "1" || row.dateIssued <= UAF_TEXT_LAYER_CUTOFF;
}

const CACHE_PATH = join(dirname(fileURLToPath(import.meta.url)), "data", "uafResolutions.json");
const CACHE_VERSION = 1;

export type UafActionKind = "fine" | "warning";

export interface UafRow {
  rol: string;
  name: string;
  sectorRaw: string;
  causalRaw: string;
  dateIssued: string;
  pdfUrl: string;
  pdfPath: string;
  isReconsideration: boolean;
}

export interface UafDecision {
  /** Chars of text in the PDF; ~0 means a scanned image. */
  textChars: number;
  kinds: UafActionKind[];
  amount: ChileanAmount | null;
  /** The sanctioning clause (capped), kept so parser changes can re-read without re-downloading. */
  clause?: string;
}

/* ------------------------------------------------------------------ listing */

export function parseUafDate(input: string): string | null {
  const m = normalizeWhitespace(input).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function parseUafListing(html: string): UafRow[] {
  const $ = cheerio.load(html);
  const rows: UafRow[] = [];
  $("table.sanciones-tabla-plugin tbody tr").each((_, element) => {
    const cells = $(element).children("td");
    if (cells.length < 6) return;
    const rol = normalizeWhitespace(cells.eq(0).text());
    const dateIssued = parseUafDate(cells.eq(4).text());
    const href = cells.eq(5).find("a[href]").first().attr("href");
    if (!rol || !dateIssued || !href) return;
    const causalRaw = normalizeWhitespace(cells.eq(3).text());
    rows.push({
      rol,
      name: normalizeWhitespace(cells.eq(1).text()),
      sectorRaw: normalizeWhitespace(cells.eq(2).text()),
      causalRaw,
      dateIssued,
      pdfUrl: makeAbsoluteUrl(UAF_CONFIG.baseUrl, href.trim()),
      pdfPath: href.trim(),
      isReconsideration: /reposici/i.test(causalRaw),
    });
  });
  return rows;
}

/* ------------------------------------------------------------- normalisation */

const SECTOR_RULES: Array<[RegExp, string]> = [
  [/zona(s)? franca/, "Free trade zone users"],
  [/inmobiliari|corredor(es)? de propiedades|corredora de propiedades/, "Real estate brokers and developers"],
  [/casa(s)? de cambio|operador(es)? de divisas|moneda extranjera/, "Currency exchange houses"],
  [/fondos? de pensiones/, "Pension fund managers"],
  [/mutuos? hipotecarios/, "Mortgage lenders"],
  [/fondos? de inversion|administradora(s)? (general(es)? )?de fondos|\bagf\b/, "Investment fund managers"],
  [/factoraje|factoring/, "Factoring companies"],
  [/notari|conservador|archivero/, "Notaries and registrars"],
  [/corredor(es)? de bolsa|futuro y de opciones|agente(s)? de valores|securitizacion|bolsa de/, "Securities brokers and market operators"],
  [/transferencia de dinero|remesa/, "Money transfer companies"],
  [/leasing|arrendamiento financiero/, "Leasing companies"],
  [/aduana/, "Customs agents"],
  [/casino|juego|hipodromo/, "Casinos and gaming operators"],
  [/cooperativa/, "Credit cooperatives"],
  [/banco|institucion(es)? financiera/, "Banks and financial institutions"],
  [/remate|martillo/, "Auction houses"],
  [/transporte de valores/, "Cash-in-transit companies"],
  [/tarjeta/, "Payment card issuers"],
  [/seguro/, "Insurance companies"],
  [/deportiv|sociedad anonima deportiva/, "Professional sports organisations"],
];

export function normalizeUafSector(raw: string): string {
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!key) return "Obliged entity (sector not stated)";
  for (const [pattern, label] of SECTOR_RULES) if (pattern.test(key)) return label;
  return raw;
}

export function describeUafCausal(raw: string): string {
  const t = raw.replace(/\s+/g, " ");
  const circulars = [...t.matchAll(/(?:Circulares?|Circ\.?)?[^\d]{0,12}?\b(\d{2})\b/g)]
    .map((m) => m[1])
    .filter((n) => ["11", "34", "40", "49", "50", "54", "56", "57", "58", "59"].includes(n));
  if (/\bROE\b/i.test(t)) return "failure to file cash transaction reports (ROE) with the UAF";
  if (/incumplimiento|circular|art\.?\s*\d|ley\s*19\.?913/i.test(t)) {
    const unique = [...new Set(circulars)];
    return `non-compliance with Law 19.913 obligations and UAF circulars${unique.length ? ` (circular${unique.length > 1 ? "s" : ""} ${unique.join(", ")})` : ""}`;
  }
  if (/fiscalizaci/i.test(t)) return "breaches found in a UAF supervisory inspection";
  return "an AML/CFT compliance breach (basis as published by the UAF)";
}

/* ----------------------------------------------------------- PDF decision text */

/** Operative part of a UAF resolution: everything after the last "RESUELVO". */
export function extractUafOperativePart(text: string): string | null {
  const flat = text.replace(/\s+/g, " ");
  const idx = flat.search(/RESUELVO\s*:?(?![\s\S]*RESUELVO)/i);
  if (idx < 0) return null;
  return flat.slice(idx).trim();
}

export function parseUafDecisionText(text: string): UafDecision {
  const textChars = text.trim().length;
  if (textChars < 200) return { textChars, kinds: [], amount: null };
  const operative = extractUafOperativePart(text);
  if (!operative) return { textChars, kinds: [], amount: null };

  return { textChars, ...readSanctionClause(operative) };
}

/**
 * Only the clause that actually sanctions counts ("SANCIÓNESE con amonestación
 * escrita ... y una multa a beneficio fiscal de UF 30 (treinta ...)"); other
 * clauses may cite fines generically or as statutory ranges. OCR noise such as
 * "SANCIÓN ESE" is tolerated.
 */
export function readSanctionClause(operative: string): Pick<UafDecision, "kinds" | "amount" | "clause"> {
  const kinds: UafActionKind[] = [];
  let amount: ChileanAmount | null = null;
  const start = operative.search(/SANCI[OÓ]N\s?ESE\b|SANCIONESE\b/i);
  if (start < 0) return { kinds, amount };
  const rest = operative.slice(start);
  const stop = rest.search(/\bSE HACE PRESENTE\b/i);
  const clause = (stop > 0 ? rest.slice(0, stop) : rest).slice(0, 700);
  if (/amonestaci[oó]n/i.test(clause)) kinds.push("warning");
  const fine = clause.match(/\bmulta\b/i);
  if (fine && fine.index !== undefined) {
    kinds.push("fine");
    amount = parseChileanAmount(clause.slice(fine.index));
  }
  return { kinds, amount, clause };
}

/* ------------------------------------------------------------------ cache */

function loadCache(): Record<string, UafDecision> {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as { version: number; entries: Record<string, UafDecision> };
    return parsed.version === CACHE_VERSION ? parsed.entries : {};
  } catch {
    return {};
  }
}

function saveCache(entries: Record<string, UafDecision>) {
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(CACHE_PATH, `${JSON.stringify({ version: CACHE_VERSION, entries: sorted }).replace(/},"/g, '},\n"')}\n`);
}

/* ------------------------------------------------------------------ records */

function fmt(value: number) {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

export interface UafSummaryInput {
  row: UafRow;
  sector: string;
  decision: UafDecision | undefined;
  clp: number | null;
  unitValue: number | null;
  reconsideration: UafRow | null;
}

export function buildUafSummary(input: UafSummaryInput): string {
  const { row, sector, decision, clp, unitValue, reconsideration } = input;
  const basis = describeUafCausal(row.causalRaw);
  let outcome: string;
  if (!decision) {
    outcome = "The sanction type and any fine are not read from the decision PDF, which for resolutions after mid-2015 is a scanned image; see the linked resolution for the penalty.";
  } else if (decision.textChars < 200) {
    outcome = "The sanction type and any fine are not machine-readable because the published decision PDF is a scanned image.";
  } else if (decision.kinds.includes("fine") && decision.amount) {
    const a = decision.amount;
    outcome =
      a.unit === "CLP"
        ? `A fine of CLP ${fmt(a.value)} was imposed.`
        : `A fine of ${a.unit} ${fmt(a.value)} was imposed${clp !== null && unitValue !== null ? `, equivalent to CLP ${fmt(clp)} at the ${a.unit} value of CLP ${fmt(unitValue)} on the resolution date` : ""}.`;
  } else if (decision.kinds.includes("fine")) {
    outcome = "A fine was imposed but its amount could not be read reliably from the decision text.";
  } else if (decision.kinds.includes("warning")) {
    outcome = "A written warning (amonestación escrita) was imposed with no fine.";
  } else {
    outcome = "The sanction type could not be read reliably from the decision text.";
  }
  const reposicion = reconsideration
    ? ` A reconsideration (recurso de reposición) decision dated ${reconsideration.dateIssued} is also published; the outcome shown is from the original sanction resolution.`
    : "";
  return `${row.name} (${sector}) was sanctioned by Chile's Financial Analysis Unit (UAF), the anti-money-laundering authority, for ${basis} under ROL ${row.rol} (resolution dated ${row.dateIssued}). ${outcome}${reposicion}`;
}

async function toDbRecords(rows: UafRow[], cache: Record<string, UafDecision>): Promise<DbReadyRecord[]> {
  const mainRols = new Set(rows.filter((r) => !r.isReconsideration).map((r) => r.rol));
  const reconsiderationByRol = new Map<string, UafRow>();
  for (const row of rows) if (row.isReconsideration && mainRols.has(row.rol)) reconsiderationByRol.set(row.rol, row);
  // A reconsideration row with no original sanction listed is the only record we have: keep it.
  const isFollowUp = (row: UafRow) => row.isReconsideration && mainRols.has(row.rol);

  const records: DbReadyRecord[] = [];
  for (const row of rows) {
    if (isFollowUp(row) || !row.name) continue;
    const decision = cache[row.pdfPath];
    const sector = normalizeUafSector(row.sectorRaw);
    let clp: number | null = null;
    let unitValue: number | null = null;
    if (decision?.amount && decision.kinds.includes("fine")) {
      if (decision.amount.unit === "CLP") clp = Math.round(decision.amount.value);
      else {
        const c = await convertUnitToClp(decision.amount.value, decision.amount.unit, row.dateIssued);
        if (c) {
          clp = c.clp;
          unitValue = c.unitValue;
        }
      }
    }
    const kinds = decision?.kinds ?? [];
    const reconsideration = reconsiderationByRol.get(row.rol) ?? null;
    records.push(
      buildEuFineRecord({
        regulator: "UAF",
        regulatorFullName: "Unidad de Análisis Financiero",
        countryCode: "CL",
        countryName: "Chile",
        firmIndividual: row.name,
        firmCategory: sector,
        amount: clp,
        currency: "CLP",
        dateIssued: row.dateIssued,
        breachType: kinds.includes("fine")
          ? "AML/CFT administrative fine"
          : kinds.includes("warning")
            ? "AML/CFT written warning"
            : "AML/CFT administrative sanction",
        breachCategories: ["AML_CFT", "SUPERVISORY_SANCTION", ...(kinds.includes("fine") ? ["MONETARY_PENALTY"] : []), ...(kinds.includes("warning") ? ["WARNING"] : [])],
        summary: buildUafSummary({ row, sector, decision, clp, unitValue, reconsideration }),
        finalNoticeUrl: row.pdfUrl,
        sourceUrl: UAF_CONFIG.listingUrl,
        // ROL + decision document are part of the identity: the same entity can
        // carry several sanctions on one date, all sharing the listing URL.
        dedupeKey: `${row.rol}::${row.pdfPath}::${row.name.toLowerCase()}`,
        rawPayload: {
          rol: row.rol,
          sectorPublished: row.sectorRaw,
          causalPublished: row.causalRaw,
          decisionTextChars: decision?.textChars ?? null,
          amountOriginal: decision?.amount ?? null,
          unitValueClp: unitValue,
          reconsideration: reconsideration
            ? { date: reconsideration.dateIssued, url: reconsideration.pdfUrl }
            : null,
        },
      }),
    );
  }
  return records;
}

export async function loadUafLiveRecords(): Promise<DbReadyRecord[]> {
  console.log("📡 Fetching UAF executed-sanctions table...");
  const html = await fetchText(UAF_CONFIG.listingUrl);
  const rows = parseUafListing(html);
  if (rows.length < 100) throw new Error(`UAF table returned only ${rows.length} rows - layout may have changed.`);
  console.log(`   Listing rows: ${rows.length}`);

  const cache = loadCache();
  const mainRols = new Set(rows.filter((r) => !r.isReconsideration).map((r) => r.rol));
  const todo = rows.filter((r) => !(r.isReconsideration && mainRols.has(r.rol)) && r.name && shouldReadUafPdf(r) && !cache[r.pdfPath]);
  console.log(`   Decision PDFs to read: ${todo.length} (cached: ${Object.keys(cache).length})`);

  let failures = 0;
  await politeMap(
    todo,
    async (row) => {
      try {
        const text = await fetchPdfText(row.pdfUrl);
        cache[row.pdfPath] = parseUafDecisionText(text);
      } catch (error) {
        if (isNotFound(error)) {
          // Dead link on the regulator's site: remember it so every run does not re-request it.
          cache[row.pdfPath] = { textChars: 0, kinds: [], amount: null };
          return;
        }
        failures += 1;
        console.warn(`   PDF failed ${row.rol}: ${error instanceof Error ? error.message : error}`);
      }
    },
    { concurrency: 2, delayMs: 400 },
    (done, total) => {
      if (done % 50 === 0 || done === total) console.log(`   PDFs ${done}/${total}`);
      if (done % 100 === 0) saveCache(cache);
    },
  );
  if (todo.length > 0) saveCache(cache);
  if (failures > Math.max(5, todo.length * 0.05)) {
    throw new Error(`UAF: ${failures} of ${todo.length} decision PDFs failed; refusing to publish partial amounts.`);
  }

  const built = await toDbRecords(rows, cache);
  // The published table repeats a few rows verbatim (same ROL, entity, date and PDF); keep one.
  const records = [...new Map(built.map((record) => [record.contentHash, record])).values()];
  if (records.length < built.length) console.log(`   Collapsed ${built.length - records.length} verbatim duplicate table rows`);
  console.log(`📊 UAF prepared ${records.length} sanction records`);
  return records;
}

export async function main() {
  await runScraper({
    name: "🇨🇱 UAF Sanctions Scraper",
    regulatorCode: "UAF",
    region: "Latin America",
    liveLoader: loadUafLiveRecords,
    testLoader: loadUafLiveRecords,
    // No stale-row deletion: rows absent from a run (partial fetch, --limit) are never removed.
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ UAF scraper failed:", error);
    process.exit(1);
  });
}
