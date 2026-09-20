import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  normalizeWhitespace,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const execFileAsync = promisify(execFile);

export const CNBV_SEARCH_URL = "https://sanciones.cnbv.gob.mx/";
export const CNBV_API_URL = "https://publicacion-sanciones-service.cnbv.gob.mx/api/sanctions";
const CNBV_PAGE_SIZE = 1_000;
const CNBV_MAX_PAGES = 100;

export interface CnbvSanction {
  id: number;
  obligatedSubject: string;
  sector: string | null;
  subSector: string | null;
  type: string;
  amount: number | null;
  conduct: string;
  imposedOn: string | null;
  publishedOn: string | null;
  pagado?: boolean | null;
  officeNumber?: string | null;
}

function normalizeForMatch(input: string) {
  return normalizeWhitespace(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isIsoDate(input: string | null | undefined): input is string {
  return Boolean(input && /^\d{4}-\d{2}-\d{2}$/.test(input));
}

function parseCnbvPagePayload(json: string) {
  const payload = JSON.parse(json) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("CNBV sanctions API returned a non-array response");
  }

  const rows = payload.filter((row): row is CnbvSanction => {
    if (!row || typeof row !== "object") return false;
    const item = row as Partial<CnbvSanction>;
    return Number.isInteger(item.id)
      && Boolean(normalizeWhitespace(item.obligatedSubject || ""))
      && Boolean(normalizeWhitespace(item.type || ""))
      && (isIsoDate(item.imposedOn) || isIsoDate(item.publishedOn));
  });
  return { rows, rawCount: payload.length };
}

export function parseCnbvPage(json: string): CnbvSanction[] {
  return parseCnbvPagePayload(json).rows;
}

export function cnbvDetailUrl(id: number) {
  return `${CNBV_SEARCH_URL}Detail/${id}/0`;
}

export function cnbvBreachCategories(row: CnbvSanction) {
  const corpus = normalizeForMatch(`${row.type} ${row.conduct}`);
  const categories = ["SUPERVISORY_SANCTION"];
  if (/multa|pecuniaria/.test(corpus)) categories.push("MONETARY_PENALTY");
  if (/lavado|pld|financiamiento al terrorismo/.test(corpus)) categories.push("AML");
  if (/informacion|reporte|divulgacion/.test(corpus)) categories.push("DISCLOSURE");
  if (/capital|liquidez/.test(corpus)) categories.push("CAPITAL_LIQUIDITY");
  if (/control|riesgo|confidencialidad/.test(corpus)) categories.push("SYSTEMS_AND_CONTROLS");
  if (/suspension|inhabilitacion|revocacion/.test(corpus)) categories.push("LICENCE_OR_PROHIBITION");
  return [...new Set(categories)];
}

export function buildCnbvRecords(rows: CnbvSanction[]) {
  const unique = new Map<number, CnbvSanction>();
  for (const row of rows) unique.set(row.id, row);

  return [...unique.values()].map((row) => {
    const firm = normalizeWhitespace(row.obligatedSubject);
    const sanctionType = normalizeWhitespace(row.type);
    const conduct = normalizeWhitespace(row.conduct || sanctionType);
    const dateIssued = isIsoDate(row.imposedOn) ? row.imposedOn : row.publishedOn!;
    const monetary = /multa|pecuniaria/i.test(normalizeForMatch(sanctionType));
    const amount = monetary && typeof row.amount === "number" && row.amount > 0
      ? row.amount
      : null;
    const detailUrl = cnbvDetailUrl(row.id);
    const outcome = amount === null
      ? sanctionType
      : `${sanctionType} of MXN ${amount.toLocaleString("en-GB")}`;

    return buildEuFineRecord({
      regulator: "CNBV",
      regulatorFullName: "Comisión Nacional Bancaria y de Valores",
      countryCode: "MX",
      countryName: "Mexico",
      firmIndividual: firm,
      firmCategory: normalizeWhitespace(row.subSector || row.sector || "") || null,
      amount,
      currency: "MXN",
      dateIssued,
      breachType: conduct || sanctionType,
      breachCategories: cnbvBreachCategories(row),
      summary: `${firm}: ${outcome}. ${conduct}`,
      finalNoticeUrl: detailUrl,
      sourceUrl: CNBV_SEARCH_URL,
      dedupeKey: String(row.id),
      rawPayload: row,
    });
  });
}

async function fetchCnbvPage(page: number) {
  // The CNBV service currently serves a certificate chain that curl validates
  // through the runner's system trust store but Node's bundled CA set rejects.
  // Keep TLS verification enabled and use curl's system CA path; never fall
  // back to rejectUnauthorized=false for an official evidence feed.
  const { stdout } = await execFileAsync("curl", [
    "--fail",
    "--silent",
    "--show-error",
    "--location",
    "--max-time",
    "60",
    "--header",
    "Accept: application/json",
    "--header",
    `X-Page-Number: ${page}`,
    "--header",
    `X-Page-Size: ${CNBV_PAGE_SIZE}`,
    "--header",
    "X-Order-Type: DESC",
    "--header",
    "X-Order-Field: publishedOn",
    "--header",
    "X-Requested-With: XMLHttpRequest",
    CNBV_API_URL,
  ], { maxBuffer: 32 * 1024 * 1024 });
  return parseCnbvPagePayload(stdout);
}

export async function loadCnbvLiveRecords() {
  console.log(`📡 Loading the official CNBV sanctions API: ${CNBV_API_URL}`);
  const rows: CnbvSanction[] = [];

  for (let page = 0; page < CNBV_MAX_PAGES; page += 1) {
    const { rows: pageRows, rawCount } = await fetchCnbvPage(page);
    rows.push(...pageRows);
    console.log(`   page ${page + 1}: ${pageRows.length}/${rawCount} parseable sanctions (${rows.length} total)`);
    if (rawCount < CNBV_PAGE_SIZE) break;
  }

  if (rows.length === 0) {
    throw new Error("CNBV official sanctions API returned zero parseable records");
  }
  if (rows.length >= CNBV_MAX_PAGES * CNBV_PAGE_SIZE) {
    throw new Error(`CNBV pagination reached the ${CNBV_MAX_PAGES}-page safety cap`);
  }

  const records = buildCnbvRecords(rows);
  console.log(`📊 Prepared ${records.length} unique official CNBV sanctions`);
  return records;
}

export async function main() {
  await runScraper({
    name: "🇲🇽 CNBV Official Sanctions Scraper",
    regulatorCode: "CNBV",
    region: "Latin America",
    liveLoader: loadCnbvLiveRecords,
    testLoader: loadCnbvLiveRecords,
    qualityContract: {
      minimumPreparedRecords: 1_000,
    },
    afterUpsert: async (sql, records) => {
      const keepHashes = new Set(records.map((record) => record.contentHash));
      const existing = await sql<{ id: string; content_hash: string }[]>`
        select id, content_hash from eu_fines where upper(regulator) = 'CNBV'
      `;
      const staleIds = existing
        .filter((row) => !keepHashes.has(row.content_hash))
        .map((row) => row.id);
      if (staleIds.length > 0) {
        await sql`delete from eu_fines where id in ${sql(staleIds)}`;
        console.log(`🧹 Removed ${staleIds.length} stale or fixture CNBV rows`);
      }
    },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CNBV scraper failed:", error);
    process.exit(1);
  });
}
