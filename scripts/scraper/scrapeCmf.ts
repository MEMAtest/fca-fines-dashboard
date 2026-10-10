/**
 * CMF (Comisión para el Mercado Financiero - Chile) sanctions scraper.
 *
 * Source: the CMF "Buscador de sanciones" (sanciones_mercados.php). The form is
 * a plain GET to sanciones_portada.php; with entidad=ALL and no date range it
 * returns the complete register (securities, insurance, banking and other
 * supervised markets, 2002 onwards) as one server-rendered table:
 *   Nº (Resolución Exenta) | FECHA | MATERIA | ARCHIVO (decision PDF)
 * The per-market views (mercado=V/S/B/O) are strict subsets of the ALL view
 * (verified), so one request covers every CMF sanction listing.
 *
 * Each row is a resolution. Only sanction decisions ("Aplica sanción ...") are
 * kept; appeal outcomes (reposición), registry removals and the like are not new
 * sanctions and would double-count the penalty they relate to.
 *
 * Names, action types and amounts:
 *   - Modern resolutions (text-layer PDFs) list each sanctioned party in the
 *     operative "RESUELVE" section: "Aplicar a <party> la sanción de multa ...
 *     ascendente a 250 Unidades de Fomento". One record per party.
 *   - Older resolutions are scanned images; there the register title is the only
 *     machine-readable text ("APLICA SANCION DE MULTA DE UF 100 A <party>").
 *     Amounts and names are taken from the title when unambiguous, else null/skipped.
 *   - Fines are mostly in UF. The shared FX util has no UF, so UF (and UTM) are
 *     converted to CLP with the unit value on the DECISION date (mindicador.cl,
 *     Banco Central series); the original UF amount stays in the summary/rawPayload.
 *
 * PDFs are fetched politely (2 concurrent, pause between requests) and results
 * are cached in scripts/scraper/data/cmfResolutions.json (decisions are
 * immutable), so scheduled runs only fetch resolutions they have not seen.
 *
 * Run: npm run scrape:cmf -- --dry-run
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
import { withStableIdentity } from "./lib/stableIdentity.js";
import { convertUnitToClp, parseChileanAmount, type ChileUnit } from "./lib/chileUnits.js";
import { fetchPdfText, isNotFound, politeMap } from "./lib/politePdf.js";

const CMF_CONFIG = {
  baseUrl: "https://www.cmfchile.cl",
  searchFormUrl: "https://www.cmfchile.cl/institucional/sanciones/sanciones_mercados.php",
  registerUrl:
    "https://www.cmfchile.cl/institucional/sanciones/sanciones_portada.php?mercado=&entidad=ALL&nom_entidad=&desde=&hasta=",
};

const CACHE_PATH = join(dirname(fileURLToPath(import.meta.url)), "data", "cmfResolutions.json");
const CACHE_VERSION = 1;

export type CmfActionKind = "fine" | "censure" | "warning" | "suspension" | "revocation" | "disqualification";

export interface CmfListingRow {
  resolutionNumber: string;
  dateIssued: string;
  title: string;
  /** Stable decision-PDF URL (the volatile `t=` cache-buster is stripped). */
  pdfUrl: string | null;
}

export interface CmfAmount {
  value: number;
  unit: ChileUnit | "CLP";
}

export interface CmfParty {
  name: string;
  kinds: CmfActionKind[];
  amount: CmfAmount | null;
}

interface CmfCacheEntry {
  textChars: number;
  parties: CmfParty[];
}

/* ------------------------------------------------------------------ listing */

export function parseCmfDate(input: string): string | null {
  const match = normalizeWhitespace(input).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function normalizeCmfPdfUrl(href: string): string {
  const absolute = makeAbsoluteUrl(CMF_CONFIG.baseUrl, href.trim());
  const url = new URL(absolute);
  url.searchParams.delete("t");
  return url.toString();
}

export function parseCmfListing(html: string): CmfListingRow[] {
  const $ = cheerio.load(html);
  const rows: CmfListingRow[] = [];
  $("table tr").each((_, element) => {
    const cells = $(element).children("td");
    if (cells.length < 4) return;
    const resolutionNumber = normalizeWhitespace(cells.eq(0).text());
    const dateIssued = parseCmfDate(cells.eq(1).text());
    const title = normalizeWhitespace(cells.eq(2).text());
    const href = cells.eq(3).find("a[href]").first().attr("href");
    if (!/^\d+$/.test(resolutionNumber) || !dateIssued || !title) return;
    rows.push({ resolutionNumber, dateIssued, title, pdfUrl: href ? normalizeCmfPdfUrl(href) : null });
  });
  return rows;
}

/* ------------------------------------------------------------ classification */

const SANCTION_TITLE = /^\W*(?:\d+\s*\.-?\s*)?(?:APLICA|APL[IÍ]CASE|APL[IÍ]QUESE)\b/i;
const NOT_SANCTION_TITLE = /REPOSICI|RECURSO|DEJA SIN EFECTO|REBAJ|ELIMIN|RECHAZ/i;

export function isCmfSanctionTitle(title: string): boolean {
  const t = normalizeWhitespace(title);
  return SANCTION_TITLE.test(t) && !NOT_SANCTION_TITLE.test(t);
}

export function detectKinds(text: string): CmfActionKind[] {
  const kinds: CmfActionKind[] = [];
  if (/\bmultas?\b/i.test(text)) kinds.push("fine");
  if (/\bcensura\b/i.test(text)) kinds.push("censure");
  if (/amonestaci[oó]n/i.test(text)) kinds.push("warning");
  if (/suspensi[oó]n|suspender/i.test(text)) kinds.push("suspension");
  if (/revocaci[oó]n|cancelaci[oó]n|eliminaci[oó]n/i.test(text)) kinds.push("revocation");
  if (/inhabilidad|inhabilitaci[oó]n|inhabilitar/i.test(text)) kinds.push("disqualification");
  return kinds;
}

/** Imposed amount in a fragment of Spanish text (see parseChileanAmount). */
export function parseCmfAmount(text: string): CmfAmount | null {
  return parseChileanAmount(normalizeWhitespace(text));
}

/* ------------------------------------------------------------------ parties */

const UNNAMED = /\bQUE\s+(?:SE\s+)?(?:INDICA|INDICAN|INDIVIDUALIZA|INDIVIDUALIZAN|SE[ÑN]ALA)\w*\b|\bINDICAD[OA]S?\b|^(?:SOCIEDADES?|ENTIDADES?|EMPRESAS?|PERSONAS?|(?:LIQUIDADORES?|CORREDORES?)\s+DE\s+SEGUROS)$/i;
const CORP_SUFFIX = /(?:S\.A\.|S\.A|LTDA\.?|LIMITADA|SPA|S\.P\.A\.|E\.I\.R\.L\.|S\.A\.D\.P\.|SOCIEDAD ANONIMA|SOCIEDAD ANÓNIMA)$/i;

const HONORIFIC_PREFIX =
  /^(?:(?:A|AL|A LA|A LOS|A LAS|LOS|LAS|LA|EL)\s+)*(?:(?:SE[ÑN]ORES|SE[ÑN]ORAS?|SE[ÑN]OR|SRES?\.?|SRAS?\.?|DON|DO[ÑN]A)\s+)?/i;

function stripHonorifics(name: string): string {
  let n = name.trim();
  for (let i = 0; i < 2; i += 1) n = n.replace(HONORIFIC_PREFIX, "");
  return n
    .replace(/\s+RUT\b.*$/i, "")
    .replace(/^(?:ENTIDAD|SOCIEDAD)\s+DENOMINADA\s+/i, "")
    .replace(/^[A-Z]{1,3}\s+\d[\d.,]*\s+A\s+/, "")
    .replace(/[,;\s]+$/, "");
}

/** Normalise trailing punctuation: "S.A" -> "S.A.", "LIMITADA." -> "LIMITADA". */
export function tidyName(name: string): string {
  let n = normalizeWhitespace(name).replace(/[,;\s]+$/, "");
  if (/(?:\bS\.A|\bS\.A\.D\.P|\bS\.P\.A|\bE\.I\.R\.L)$/i.test(n)) return `${n}.`;
  if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}\.$/.test(n) && !/\bS\.A\.D\.P\.$/.test(n)) n = n.slice(0, -1);
  return n.trim();
}

const BAD_PARTY =
  /\b(?:A CONTAR|CONTAR DE|FECHA|PAGO EFECTIVO|CANCELACI[OÓ]N|DENOMINAD[AO]|LA QUE|APLICA|INSCRIPCI[OÓ]N|DIRECTORES|GERENTES?|ADMINISTRADORES|EJECUTIVOS)\b|^(?:SUS|LOS|LAS|ESTA|ESTE)\b/i;

function cleanParty(part: string): string | null {
  const name = tidyName(stripHonorifics(part));
  if (name.length < 5 || BAD_PARTY.test(name) || /^\d/.test(name)) return null;
  return name;
}

export function splitCmfParties(raw: string): string[] {
  const text = raw.split(/\s*;?\s*Y\s+CIERRA\s+SIN\b/i)[0];
  const out: string[] = [];
  const add = (part: string) => {
    const name = cleanParty(part);
    if (name) out.push(name);
  };
  // "<entity> Y A LOS SEÑORES <p1>, <p2> Y <p3>": the persons are comma/Y separated.
  const persons = text.match(/^(.*?)\b(?:Y\s+)?(?:A\s+)?LOS\s+SE[ÑN]ORES\s+(.+)$/i);
  const body = persons ? persons[1] : text;
  if (persons) for (const person of persons[2].split(/\s*,\s*(?:Y\s+)?|\s+Y\s+/i)) add(person);
  for (const chunk of body.split(/,\s+(?=(?:A|AL|DON|DO[ÑN]A|SE[ÑN]OR\w*|SR\.?)\s)|(?<=(?:S\.A\.?|LTDA\.?|LIMITADA|SPA|S\.A\.D\.P\.?)),\s+(?=[^,]*?(?:S\.A\.?|LTDA\.?|LIMITADA|SPA|S\.A\.D\.P\.?)(?:,|\s+Y\s|$))/i)) {
    if (/^RUT\b/i.test(chunk.trim())) continue;
    // " Y " joins parties only when followed by a person/entity marker or after a corporate suffix.
    const pieces = chunk.split(/\s+Y\s+(?=(?:A|AL)\s|DON\s|DO[ÑN]A\s|(?:EL|LA)\s+SE[ÑN]OR)/i);
    for (const piece of pieces) {
      const parts = CORP_SUFFIX.test(piece.split(/\s+Y\s+/i)[0] ?? "") && /\s+Y\s+/i.test(piece)
        ? piece.split(/\s+Y\s+/i)
        : [piece];
      for (const part of parts) add(part);
    }
  }
  return [...new Set(out)];
}

export interface CmfTitleInfo {
  kinds: CmfActionKind[];
  amount: CmfAmount | null;
  parties: string[];
  unnamed: boolean;
}

export function parseCmfTitle(title: string): CmfTitleInfo {
  let t = normalizeWhitespace(title).replace(/^"|"$/g, "").replace(/^\d+\s*\.-?\s*/, "").replace(/[.\s]+$/, "");
  const kinds = detectKinds(t);
  const amount = kinds.includes("fine") ? parseCmfAmount(t) : null;

  let party: string | null = null;
  // "APLICASE A <party> [RUT ...], LA SANCION DE MULTA DE UF 50"
  const lead = t.match(/^APL[IÍ]CASE\s+(?:A|AL)\s+(.+?),?\s+(?:LA\s+)?SANCI[OÓ]N\b/i);
  // "APLIQUESE A <party> SANCION DE MULTA ... ASCENDENTE A UF 1.000 POR LA INFRACCION"
  const lead2 = t.match(/^APL[IÍ]QUESE\s+(?:A|AL)\s+(.+?),?\s+(?:LA\s+)?SANCI[OÓ]N\b/i);
  if (lead || lead2) {
    party = (lead ?? lead2)![1];
  } else {
    let c = t
      .replace(/EQUIVALENTE EN PESOS A LA FECHA DE SU PAGO EFECTIVO/gi, " ")
      .replace(/ASCENDENTE A/gi, " ")
      .replace(/A BENEFICIO FISCAL,?/gi, " ")
      .replace(/\b(?:UF|U\.F\.)\s*\d[\d.,]*,?/gi, " ")
      .replace(/\d[\d.,]*\s*(?:UF\b|U\.F\.|UTM\b),?/gi, " ")
      .replace(/\bEQUIVALENTES?(?:\s+EN\s+PESOS)?(?:\s+A\s+LA\s+FECHA\s+DE\s+SU\s+PAGO\s+EFECTIVO|\s+AL\s+MOMENTO\s+DE\s+SU\s+CANCELACION\s+EFECTIVA)?,?/gi, " ")
      .replace(/\bMULTA\s+(?:DE\s+)?(?=A\s)/gi, "MULTA ")
      .replace(/\s+/g, " ")
      .trim();
    const head = c.match(/^APL\w*\s+(?:LA\s+|UNA\s+)?(?:SANC\S{2,3}N(?:ES)?|MEDIDA)(?![A-ZÁÉÍÓÚ])/i);
    if (head) {
      const rest = c.slice(head[0].length);
      const m = rest.match(/\s(?:A|AL)\s+(?=\S)/);
      if (m && m.index !== undefined) party = rest.slice(m.index + m[0].length);
    }
  }
  if (party) {
    party = party.split(/\s+(?:A CONTAR|Y HASTA|POR\s+(?:LA\s+)?INFRACCI)/i)[0];
  }
  // Titles that bundle several decisions ("1.- APLICA ... 2.- APLICA ...") cannot be attributed reliably.
  const bundled = (t.match(/APL[IÍ]CA/gi) ?? []).length > 1;
  const unnamed = bundled || !party || UNNAMED.test(party);
  const parties = party && !unnamed ? splitCmfParties(party) : [];
  return { kinds, amount, parties, unnamed: unnamed || parties.length === 0 };
}

/* ------------------------------------------------------- resolution (PDF) text */

/** Operative part of a modern CMF resolution: everything after the last "RESUELVE:". */
export function extractResolveSection(text: string): string | null {
  const flat = text.replace(/\s+/g, " ");
  const idx = flat.search(/RESUELVE:(?![\s\S]*RESUELVE:)/);
  if (idx < 0) return null;
  let section = flat.slice(idx + "RESUELVE:".length);
  const end = section.search(/\s\d{1,2}[.)]-?\s+(?:Rem[ií]tase|Notif[ií]quese|El pago de la multa|Contra la presente|An[oó]tese|Publ[ií]quese)/i);
  if (end >= 0) section = section.slice(0, end);
  return section.trim();
}

export function parseCmfResolutionText(text: string): CmfParty[] {
  const section = extractResolveSection(text);
  if (!section) return [];
  // Split into numbered items "1. Aplicar a ..." keeping only the ones that apply a sanction.
  const items = section.split(/(?:^|\s)(?=\d{1,2}[.)]-?\s+(?:Aplicar|Sancionar|Imponer|Cerrar|Aplíquese))/);
  const parties: CmfParty[] = [];
  for (const raw of items) {
    const item = raw.replace(/^\s*\d{1,2}[.)]-?\s+/, "").trim();
    const m = item.match(
      /^(?:Aplicar|Sancionar|Imponer|Aplíquese)\s+(?:a\s+|al\s+|a la\s+|a los\s+|a las\s+)?(.+?)(?:,?\s+(?:RUT|RUN)\b|,?\s+(?:la|las|una)\s+(?:sanci[oó]n|sanciones|multa|medida)\b)/i,
    );
    if (!m) continue;
    const name = tidyName(stripHonorifics(m[1].replace(/^(?:Sr\.|Sra\.|Srta\.)\s*/i, "")));
    if (name.length < 5 || name.length > 200 || BAD_PARTY.test(name) || UNNAMED.test(name)) continue;
    const clause = item.split(/\bpor\s+(?:la\s+|haber\s+)?(?:infracci[oó]n|infringir|incurrir|haber)/i)[0];
    const kinds = detectKinds(item);
    const amount = kinds.includes("fine") ? parseCmfAmount(clause) : null;
    parties.push({ name, kinds, amount });
  }
  return mergeSameParty(parties);
}

/** One party can be sanctioned in several numbered items of one resolution; fold them into one record. */
export function mergeSameParty(parties: CmfParty[]): CmfParty[] {
  const merged = new Map<string, CmfParty>();
  for (const party of parties) {
    const key = party.name.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...party, kinds: [...party.kinds] });
      continue;
    }
    for (const kind of party.kinds) if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
    if (existing.amount && party.amount && existing.amount.unit === party.amount.unit) {
      existing.amount = { unit: existing.amount.unit, value: Math.round((existing.amount.value + party.amount.value) * 100) / 100 };
    } else if (party.amount) {
      existing.amount = null; // mixed units: not confident
    }
  }
  return [...merged.values()];
}

/* --------------------------------------------------------------- cache + build */

function loadCache(): Record<string, CmfCacheEntry> {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as { version: number; entries: Record<string, CmfCacheEntry> };
    return parsed.version === CACHE_VERSION ? parsed.entries : {};
  } catch {
    return {};
  }
}

function saveCache(entries: Record<string, CmfCacheEntry>) {
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(CACHE_PATH, `${JSON.stringify({ version: CACHE_VERSION, entries: sorted }, null, 0).replace(/},"/g, '},\n"')}\n`);
}

export function cmfRowKey(row: Pick<CmfListingRow, "dateIssued" | "resolutionNumber">) {
  return `${row.dateIssued}|${row.resolutionNumber}`;
}

export function rowNeedsPdf(row: CmfListingRow): boolean {
  if (!row.pdfUrl || !isCmfSanctionTitle(row.title)) return false;
  const info = parseCmfTitle(row.title);
  if (info.unnamed || info.parties.length !== 1) return true;
  if (info.kinds.length === 0) return true;
  if (info.kinds.includes("fine") && !info.amount) return true;
  return false;
}

const KIND_LABEL: Record<CmfActionKind, string> = {
  fine: "Administrative fine",
  censure: "Censure",
  warning: "Written warning",
  suspension: "Suspension",
  revocation: "Registration cancelled or revoked",
  disqualification: "Temporary disqualification",
};

const KIND_CATEGORY: Record<CmfActionKind, string> = {
  fine: "MONETARY_PENALTY",
  censure: "CENSURE",
  warning: "WARNING",
  suspension: "SUSPENSION",
  revocation: "LICENCE_REVOCATION",
  disqualification: "DISQUALIFICATION",
};

export interface CmfResolvedParty extends CmfParty {
  source: "resolution_pdf" | "register_title";
}

export function resolveRowParties(row: CmfListingRow, cached: CmfCacheEntry | undefined): CmfResolvedParty[] {
  const info = parseCmfTitle(row.title);
  if (cached && cached.parties.length > 0) {
    return cached.parties.map((p) => ({ ...p, source: "resolution_pdf" as const }));
  }
  if (info.unnamed) return [];
  const multi = info.parties.length > 1;
  return info.parties.map((name) => ({
    name,
    kinds: info.kinds,
    // A single figure in a multi-party title cannot be attributed to one party.
    amount: multi ? null : info.amount,
    source: "register_title" as const,
  }));
}

function formatNumber(value: number) {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

export function buildCmfSummary(
  party: CmfResolvedParty,
  row: CmfListingRow,
  conversion: { clp: number; unitValue: number } | null,
): string {
  const ref = `Resolución Exenta N° ${row.resolutionNumber} of ${row.dateIssued}`;
  const kinds = party.kinds;
  let action: string;
  if (kinds.length === 0) action = "was sanctioned (the sanction type is not stated in the register entry)";
  else {
    const labels = kinds.map((k) => ({
      fine: "a fine",
      censure: "a censure",
      warning: "a written warning",
      suspension: "a suspension",
      revocation: "a registration cancellation or revocation",
      disqualification: "a temporary disqualification",
    })[k]);
    action = `was sanctioned with ${labels.join(" and ")}`;
  }
  let amountText = "";
  if (party.amount) {
    const original = party.amount.unit === "CLP" ? `CLP ${formatNumber(party.amount.value)}` : `${party.amount.unit} ${formatNumber(party.amount.value)}`;
    amountText =
      party.amount.unit !== "CLP" && conversion
        ? ` The fine was ${original}, equivalent to CLP ${formatNumber(conversion.clp)} at the ${party.amount.unit} value of CLP ${formatNumber(conversion.unitValue)} on the decision date.`
        : ` The fine was ${original}.`;
  } else if (kinds.includes("fine")) {
    amountText = " The fine amount could not be read reliably from the register entry or decision text.";
  }
  return `${party.name} ${action} by Chile's Comisión para el Mercado Financiero (CMF) in ${ref}.${amountText}`;
}

export async function toDbRecords(rows: CmfListingRow[], cache: Record<string, CmfCacheEntry>): Promise<DbReadyRecord[]> {
  const records: DbReadyRecord[] = [];
  let skippedUnnamed = 0;
  for (const row of rows) {
    if (!isCmfSanctionTitle(row.title)) continue;
    const parties = resolveRowParties(row, cache[cmfRowKey(row)]);
    if (parties.length === 0) {
      skippedUnnamed += 1;
      continue;
    }
    for (const party of parties) {
      let amountClp: number | null = null;
      let conversion: { clp: number; unitValue: number } | null = null;
      if (party.amount) {
        if (party.amount.unit === "CLP") amountClp = Math.round(party.amount.value);
        else {
          const c = await convertUnitToClp(party.amount.value, party.amount.unit, row.dateIssued);
          if (c) {
            conversion = c;
            amountClp = c.clp;
          }
        }
      }
      const kinds = party.kinds;
      records.push(
        withStableIdentity(buildEuFineRecord({
          regulator: "CMF",
          regulatorFullName: "Comisión para el Mercado Financiero",
          countryCode: "CL",
          countryName: "Chile",
          firmIndividual: party.name,
          firmCategory: null,
          amount: amountClp,
          currency: "CLP",
          dateIssued: row.dateIssued,
          breachType: kinds.length ? kinds.map((k) => KIND_LABEL[k]).join(" + ") : "Sanction (type not stated)",
          breachCategories: ["SUPERVISORY_SANCTION", ...kinds.map((k) => KIND_CATEGORY[k])],
          summary: buildCmfSummary(party, row, conversion),
          finalNoticeUrl: row.pdfUrl,
          sourceUrl: CMF_CONFIG.searchFormUrl,
          // contentHash is overridden by withStableIdentity: resolution + party, never the amount.
          dedupeKey: `${row.dateIssued}::${row.resolutionNumber}::${party.name.toLowerCase()}`,
          rawPayload: {
            resolutionNumber: row.resolutionNumber,
            registerTitle: row.title,
            amountOriginal: party.amount,
            unitValueClp: conversion?.unitValue ?? null,
            partySource: party.source,
          },
        }), `${row.dateIssued}::${row.resolutionNumber}::${party.name.toLowerCase()}`),
      );
    }
  }
  if (skippedUnnamed > 0) {
    console.log(`   Skipped ${skippedUnnamed} sanction resolutions where no sanctioned party could be read (title says "que indica" and PDF is a scan)`);
  }
  return records;
}

export async function loadCmfLiveRecords(): Promise<DbReadyRecord[]> {
  console.log("📡 Fetching CMF sanctions register (all markets)...");
  const html = await fetchText(CMF_CONFIG.registerUrl);
  const rows = parseCmfListing(html);
  if (rows.length === 0) throw new Error("CMF register returned no parseable rows - layout may have changed.");
  console.log(`   Register rows: ${rows.length}`);

  const cache = loadCache();
  const todo = rows.filter((row) => rowNeedsPdf(row) && !cache[cmfRowKey(row)]);
  console.log(`   Resolutions needing PDF text: ${todo.length} (cached: ${Object.keys(cache).length})`);

  let failures = 0;
  await politeMap(
    todo,
    async (row) => {
      try {
        const text = await fetchPdfText(row.pdfUrl!);
        cache[cmfRowKey(row)] = { textChars: text.trim().length, parties: parseCmfResolutionText(text) };
      } catch (error) {
        if (isNotFound(error)) {
          cache[cmfRowKey(row)] = { textChars: 0, parties: [] };
          return;
        }
        failures += 1;
        console.warn(`   PDF failed ${row.resolutionNumber} ${row.dateIssued}: ${error instanceof Error ? error.message : error}`);
      }
    },
    { concurrency: 2, delayMs: 400 },
    (done, total) => {
      if (done % 50 === 0 || done === total) console.log(`   PDFs ${done}/${total}`);
    },
  );
  if (todo.length > 0) saveCache(cache);
  if (failures > Math.max(5, todo.length * 0.05)) {
    throw new Error(`CMF: ${failures} of ${todo.length} resolution PDFs failed; refusing to publish partial amounts.`);
  }

  const records = await toDbRecords(rows, cache);
  console.log(`📊 CMF prepared ${records.length} sanction records`);
  return records;
}

export async function main() {
  await runScraper({
    name: "🇨🇱 CMF Sanctions Scraper",
    region: "Latin America",
    liveLoader: loadCmfLiveRecords,
    testLoader: loadCmfLiveRecords,
    // No stale-row deletion: rows absent from a run (partial fetch, --limit) are never removed.
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CMF scraper failed:", error);
    process.exit(1);
  });
}
