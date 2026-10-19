/**
 * Chilean indexed units (UF, UTM) -> CLP conversion.
 *
 * The UF (Unidad de Fomento) is an inflation-indexed unit whose CLP value is
 * published daily by the Banco Central de Chile / SII; the UTM (Unidad
 * Tributaria Mensual) is published monthly. The shared FX util only knows
 * spot currencies, so CMF fines expressed in UF are converted here, at the
 * unit value in force on the DECISION date, and then flow through the normal
 * CLP -> GBP/EUR conversion. The original unit amount is always preserved in
 * the record's rawPayload and summary.
 *
 * Source: mindicador.cl, a public JSON mirror of the Banco Central series. History
 * through 2025 is committed in scripts/scraper/data/chileUnits.json.
 */
import axios from "axios";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

export type ChileUnit = "UF" | "UTM";

export interface ChileUnitSeries {
  /** ISO date (YYYY-MM-DD) -> CLP value of one unit. */
  values: Map<string, number>;
}

const seriesCache = new Map<string, Promise<ChileUnitSeries>>();
const SII_REQUEST_ATTEMPTS = 3;
const SII_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)",
  "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export function isTransientSiiRequestError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return Boolean(status && (status >= 500 || status === 429)) || [
    "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "ETIMEDOUT", "ECONNABORTED", "ERR_BAD_RESPONSE",
  ].includes(error.code || "");
}

type SiiTextResponse = { data: string; retryAfter?: string };
type SiiTextRequest = (url: string, config: { headers: typeof SII_HEADERS; timeout: number; responseType: "text" }) => Promise<SiiTextResponse>;
type Wait = (ms: number) => Promise<void>;

const requestSiiText: SiiTextRequest = async (url, config) => {
  const response = await axios.get<string>(url, {
    ...config,
    transformResponse: [(body) => body],
  });
  return { data: response.data, retryAfter: String(response.headers["retry-after"] || "") };
};

export async function fetchSiiYearHtml(
  url: string,
  request: SiiTextRequest = requestSiiText,
  wait: Wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SII_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await request(url, {
        headers: SII_HEADERS,
        timeout: 30_000,
        responseType: "text",
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (!isTransientSiiRequestError(error) || attempt === SII_REQUEST_ATTEMPTS) throw error;
      const retryAfter = error && typeof error === "object" && "response" in error
        ? Number.parseInt(String((error as { response?: { headers?: Record<string, unknown> } }).response?.headers?.["retry-after"] || ""), 10)
        : NaN;
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 15_000)
        : 1_000 * 2 ** (attempt - 1);
      console.warn(`   Official SII unit table request failed transiently (${attempt}/${SII_REQUEST_ATTEMPTS}); retrying in ${delayMs}ms`);
      await wait(delayMs);
    }
  }
  throw lastError;
}

export function parseMindicadorSeries(json: string): ChileUnitSeries {
  const parsed = JSON.parse(json) as { serie?: Array<{ fecha: string; valor: number }> };
  const values = new Map<string, number>();
  for (const point of parsed.serie ?? []) {
    if (typeof point.valor !== "number" || !Number.isFinite(point.valor) || point.valor <= 0) continue;
    // fecha is "2025-12-31T03:00:00.000Z" (midnight Chile time) - the calendar date is the first 10 chars.
    values.set(point.fecha.slice(0, 10), point.valor);
  }
  return { values };
}

const SII_MONTHS: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};

/** Parse the SII's official daily UF / monthly UTM year tables. */
export function parseSiiChileUnitYear(html: string, year: number, unit: ChileUnit = "UF"): ChileUnitSeries {
  const $ = cheerio.load(html);
  const values = new Map<string, number>();
  if (unit === "UTM") {
    $("#table_export tbody tr").each((_, row) => {
      const cells = $(row).children("th, td");
      if (cells.length < 2) return;
      const month = SII_MONTHS[normalizeSiiMonth($(cells[0]).text().trim())];
      const value = parseChileanNumber($(cells[1]).text().trim());
      if (month && value !== null && value > 0) values.set(`${year}-${month}-01`, value);
    });
    return { values };
  }

  $("div.meses[id^='mes_']").each((_, monthElement) => {
    const monthName = normalizeSiiMonth($(monthElement).attr("id")?.replace(/^mes_/, "") || "");
    const month = SII_MONTHS[monthName];
    if (!month) return;
    $(monthElement).find("table tr").each((_, row) => {
      const cells = $(row).children("th, td");
      for (let index = 0; index + 1 < cells.length; index += 2) {
        const day = Number.parseInt($(cells[index]).text().trim(), 10);
        const value = parseChileanNumber($(cells[index + 1]).text().trim());
        if (Number.isInteger(day) && day >= 1 && day <= 31 && value !== null && value > 0) {
          values.set(`${year}-${month}-${String(day).padStart(2, "0")}`, value);
        }
      }
    });
  });
  return { values };
}

function normalizeSiiMonth(month: string): string {
  return month.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

interface CommittedUnits {
  through: string;
  uf: Record<string, number>;
  utm: Record<string, number>;
}

let committed: CommittedUnits | null | undefined;

/** Historical daily UF / monthly UTM table committed beside the caches; it never changes. */
function loadCommittedUnits(): CommittedUnits | null {
  if (committed !== undefined) return committed;
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "chileUnits.json");
    committed = JSON.parse(readFileSync(path, "utf8")) as CommittedUnits;
  } catch {
    committed = null;
  }
  return committed;
}

function committedSeries(unit: ChileUnit, year: number): ChileUnitSeries | null {
  const table = loadCommittedUnits();
  if (!table || year > Number(table.through.slice(0, 4))) return null;
  const values = new Map<string, number>();
  for (const [key, value] of Object.entries(unit === "UF" ? table.uf : table.utm)) {
    if (!key.startsWith(`${year}-`)) continue;
    values.set(unit === "UF" ? key : `${key}-01`, value);
  }
  return { values };
}

/**
 * Unit values for one year. Years covered by the committed table are never
 * fetched; later years (the current one) come from the official SII year table.
 * A failed fetch yields an empty series, so affected amounts stay null - it
 * never invents a conversion or fails a run.
 */
export function loadChileUnitSeries(unit: ChileUnit, year: number): Promise<ChileUnitSeries> {
  const local = committedSeries(unit, year);
  if (local) return Promise.resolve(local);
  const key = `${unit}:${year}`;
  let pending = seriesCache.get(key);
  if (!pending) {
    const unitSlug = unit.toLowerCase();
    const officialUrl = `https://www.sii.cl/valores_y_fechas/${unitSlug}/${unitSlug}${year}.htm`;
    pending = fetchSiiYearHtml(officialUrl)
      .then((body) => {
        const series = parseSiiChileUnitYear(body, year, unit);
        if (series.values.size === 0) throw new Error("official SII year table contained no parsed daily values");
        return series;
      })
      .catch((error) => {
        console.warn(`   ${unit} ${year} unavailable from official SII (${error instanceof Error ? error.message : error}); affected CLP amounts stay null`);
        return { values: new Map<string, number>() };
      });
    seriesCache.set(key, pending);
  }
  return pending;
}

/** CLP value of one unit on `isoDate` (UTM: value of that calendar month). */
export function lookupUnitValue(series: ChileUnitSeries, unit: ChileUnit, isoDate: string): number | null {
  if (unit === "UF") return series.values.get(isoDate) ?? null;
  return series.values.get(`${isoDate.slice(0, 7)}-01`) ?? null;
}

export interface ClpConversion {
  clp: number;
  unitValue: number;
  unit: ChileUnit;
  originalAmount: number;
}

export async function convertUnitToClp(
  amount: number,
  unit: ChileUnit,
  isoDate: string,
): Promise<ClpConversion | null> {
  const series = await loadChileUnitSeries(unit, Number(isoDate.slice(0, 4)));
  const unitValue = lookupUnitValue(series, unit, isoDate);
  if (unitValue === null) return null;
  return { clp: Math.round(amount * unitValue), unitValue, unit, originalAmount: amount };
}

/**
 * Parse a Spanish/Chilean formatted number: "." groups thousands and "," is the
 * decimal mark ("1.234.567,89", "60.000", "1.000", "2,5"). Returns null when the
 * token is not an unambiguous number.
 */
export function parseChileanNumber(raw: string): number | null {
  const token = raw.replace(/\s+/g, "").trim();
  if (!token || !/^\d[\d.,]*$/.test(token)) return null;
  const withoutTrailing = token.replace(/[.,]+$/, "");
  // "381.87" / "16.18": one or two digits after a single dot is a decimal fraction
  // (UF fines are quoted with up to two decimals); exactly three digits is a thousands group.
  if (/^\d{1,3}\.\d{1,2}$/.test(withoutTrailing)) return Number.parseFloat(withoutTrailing);
  const decimalComma = withoutTrailing.lastIndexOf(",");
  const intPart = decimalComma >= 0 ? withoutTrailing.slice(0, decimalComma) : withoutTrailing;
  const fracPart = decimalComma >= 0 ? withoutTrailing.slice(decimalComma + 1) : "";
  if (fracPart && !/^\d{1,4}$/.test(fracPart)) return null;
  if (intPart.includes(",")) return null;
  // Dots must be proper thousands groups: 1-3 leading digits then groups of exactly 3.
  if (intPart.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(intPart)) return null;
  const value = Number.parseFloat(`${intPart.replace(/\./g, "")}${fracPart ? `.${fracPart}` : ""}`);
  return Number.isFinite(value) ? value : null;
}

/* ------------------------------------------------------------------ words */

const WORD_VALUES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

/** "Mil Quinientas" -> 1500. Returns null when any token is not a number word. */
export function parseSpanishNumberWords(input: string): number | null {
  const tokens = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/unidades?\s+(?:de\s+fomento|tributarias?\s+\w+)|\bu\.?f\.?\b|\butm\b|pesos/g, " ")
    .split(/[\s,.-]+/)
    .filter((t) => t && t !== "y");
  if (tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (token === "mil") {
      current = (current || 1) * 1000;
      total += current;
      current = 0;
    } else if (token === "millon" || token === "millones") {
      return null;
    } else {
      const base = token.replace(/(?:es|s)$/, "");
      const value = WORD_VALUES[token] ?? (token.endsWith("as") ? WORD_VALUES[`${token.slice(0, -2)}os`] : undefined) ?? WORD_VALUES[base];
      if (value === undefined) return null;
      current += value;
    }
  }
  return total + current;
}

export interface ChileanAmount {
  value: number;
  unit: ChileUnit | "CLP";
}

/**
 * Imposed amount in a fragment of Spanish decision text. Statutory maxima
 * ("hasta UF 800") are blanked first. Where the text spells the figure in words
 * "(Mil Quinientas Unidades de Fomento)" it must agree with the digits, else null.
 */
export function parseChileanAmount(text: string): ChileanAmount | null {
  const t = text.replace(/\s+/g, " ").replace(/\bhasta\s+(?:una\s+multa\s+(?:total\s+)?de\s+)?(?:UF|U\.F\.|\$)?\s*[\d.,]+/gi, " ");
  const clean = (raw: string) => parseChileanNumber(raw.replace(/[.\-]+$/, ""));
  const num = "(\\d[\\d.,]*(?:\\.-)?)";

  const prefix = t.match(new RegExp(`\\b(?:UF|U\\.F\\.)\\s*${num}(?:\\s*\\(([^)]{3,100})\\))?`, "i"));
  if (prefix) {
    const v = clean(prefix[1]);
    if (v !== null && v > 0) {
      if (prefix[2]) {
        const words = parseSpanishNumberWords(prefix[2]);
        if (words !== null && words !== v) return null;
      }
      return { value: v, unit: "UF" };
    }
  }
  const suffix = (pattern: string, unit: ChileUnit): ChileanAmount | null => {
    const m = t.match(new RegExp(`${num}\\s*(?:${pattern})`, "i"));
    const v = m ? clean(m[1]) : null;
    return v !== null && v > 0 ? { value: v, unit } : null;
  };
  const uf = suffix("UF\\b|U\\.F\\.|Unidades\\s+de\\s+Fomento", "UF");
  if (uf) return uf;
  const utm = suffix("UTM\\b|Unidades\\s+Tributarias\\s+Mensuales", "UTM");
  if (utm) return utm;
  const clp = t.match(new RegExp(`\\$\\s*${num}`));
  const cv = clp ? clean(clp[1]) : null;
  return cv !== null && cv > 0 ? { value: cv, unit: "CLP" } : null;
}
