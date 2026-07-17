/**
 * SPK (Sermaye Piyasası Kurulu — Turkey Capital Markets Board) Scraper
 *
 * Strategy: Official open-data JSON web service (documented at https://ws.spk.gov.tr/help).
 * Endpoint: GET /IdariYaptirimlar/api/TumIdariParaCezalari
 *   ("Tüm İdari Para Cezası listesi" = full list of administrative monetary penalties).
 *
 * Difficulty: 2/10 (Low) — clean JSON API, every record carries an amount.
 * Language: Turkish. Original Turkish fields (title/description/violated rule) are
 *   preserved verbatim in the summary and raw payload; an English breach category is
 *   derived heuristically from the Turkish rule text without discarding the source.
 *
 * Run: npx tsx scripts/scraper/scrapeSpk.ts --dry-run
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  normalizeWhitespace,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const SPK_ALL_FINES_URL =
  "https://ws.spk.gov.tr/IdariYaptirimlar/api/TumIdariParaCezalari";
const SPK_SOURCE_URL = "https://ws.spk.gov.tr/help";

/** Raw record shape returned by the SPK open-data endpoint. */
export interface SpkFineRecord {
  id: number;
  mkkSicilNo: string | null;
  /** Unvan = entity / person title (firm name). */
  unvan: string | null;
  /** Kurul Karar Tarihi = board decision date (ISO datetime). */
  kurulKararTarihi: string | null;
  /** Kurul Karar No = board decision number. */
  kurulKararNo: string | null;
  /** Açıklama = description of the breach (Turkish). */
  aciklama: string | null;
  yasa: string | null;
  /** Tebliğ = the communiqué / regulation breached (Turkish). */
  teblig: string | null;
  madde: string | null;
  /** Tutar = penalty amount in Turkish lira (TRY). */
  tutar: number | null;
  davaBilgisi: string | null;
  yargilamaAsamasi: string | null;
  kurulKarari: string | null;
  /** İhlal = the violated rule (Turkish). */
  ihlal: string | null;
}

export function parseSpkDate(input: string | null): string | null {
  if (!input) {
    return null;
  }

  const match = normalizeWhitespace(input).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Derive an English breach category from the Turkish violated-rule / description
 * text. The Turkish source text is always preserved; this only classifies it.
 */
export function categorizeSpkRecord(record: SpkFineRecord): string[] {
  const corpus = [record.ihlal, record.teblig, record.aciklama, record.yasa]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  const categories: string[] = [];

  // izahname/ihraç = prospectus/issuance disclosure; özel durum = material disclosure.
  if (/izahname|ihra[çc]|özel durum|kamuyu ayd[ıi]nlatma|finansal rapor|bildirim/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  // piyasa dolandırıcılığı / manipülasyon = market manipulation; içeriden = insider.
  if (/manip[üu]lasyon|piyasa doland[ıi]r[ıi]c[ıi]l[ıi][ğg][ıi]|i[çc]eriden [öo][ğg]renen|bilgi suistimali/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  // aklama = money laundering.
  if (/aklama|terör[üu]n finansman[ıi]|mas[ae]k/.test(corpus)) {
    categories.push("AML");
  }
  // yetkisiz / izinsiz = unauthorised activity; portföy = portfolio management conduct.
  if (/yetkisiz|izinsiz|portf[öo]y|yat[ıi]r[ıi]m dan[ıi][şs]manl[ıi][ğg][ıi]|faaliyet/.test(corpus)) {
    categories.push("CONDUCT");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["SUPERVISORY_SANCTION"];
}

function buildSpkBreachType(record: SpkFineRecord): string {
  const rule = normalizeWhitespace(record.ihlal || record.teblig || "");
  return rule || "İdari para cezası (administrative monetary penalty)";
}

function buildSpkSummary(record: SpkFineRecord): string {
  const description = normalizeWhitespace(record.aciklama || "");
  const rule = normalizeWhitespace(record.ihlal || record.teblig || "");
  const parts = [description];
  if (rule && !description.includes(rule)) {
    parts.push(`İhlal: ${rule}`);
  }
  const combined = parts.filter(Boolean).join(" — ");
  return combined.slice(0, 500) || `SPK idari para cezası: ${record.unvan ?? "bilinmiyor"}.`;
}

export function buildSpkRecord(record: SpkFineRecord): DbReadyRecord | null {
  const firm = normalizeWhitespace(record.unvan || "");
  const dateIssued = parseSpkDate(record.kurulKararTarihi);

  if (!firm || !dateIssued) {
    return null;
  }

  const amount =
    typeof record.tutar === "number" && Number.isFinite(record.tutar) && record.tutar > 0
      ? record.tutar
      : null;

  return buildEuFineRecord({
    regulator: "SPK",
    regulatorFullName: "Sermaye Piyasası Kurulu",
    countryCode: "TR",
    countryName: "Turkey",
    firmIndividual: firm,
    firmCategory: record.mkkSicilNo ? "Registered Entity" : null,
    amount,
    currency: "TRY",
    dateIssued,
    breachType: buildSpkBreachType(record),
    breachCategories: categorizeSpkRecord(record),
    summary: buildSpkSummary(record),
    finalNoticeUrl: null,
    sourceUrl: SPK_SOURCE_URL,
    // Board decision number + record id gives a stable per-penalty dedupe key
    // (multiple firms can share one kurulKararNo, so id disambiguates).
    dedupeKey: `${record.kurulKararNo ?? "na"}::${record.id}`,
    rawPayload: record,
  });
}

export function buildSpkRecords(records: SpkFineRecord[]): DbReadyRecord[] {
  const built = records.map(buildSpkRecord);
  const kept = built.filter((record): record is DbReadyRecord => record !== null);
  const dropped = built.length - kept.length;
  if (dropped > 0) {
    // Rows with no entity name or unparseable date cannot be published; log for auditability.
    console.warn(`SPK: dropped ${dropped}/${built.length} records (missing entity name or date)`);
  }
  return kept.sort((left, right) => right.dateIssued.localeCompare(left.dateIssued));
}

export async function loadSpkLiveRecords(): Promise<DbReadyRecord[]> {
  const flags = getCliFlags();
  const json = await fetchText(SPK_ALL_FINES_URL, {
    timeout: 90000,
    headers: { Accept: "application/json" },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `SPK response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("SPK response was not a JSON array of penalties.");
  }

  const records = buildSpkRecords(parsed as SpkFineRecord[]);
  return flags.limit && flags.limit > 0 ? records.slice(0, flags.limit) : records;
}

export async function main() {
  await runScraper({
    name: "🇹🇷 SPK Administrative Monetary Penalties Scraper",
    region: "Europe",
    regulatorCode: "SPK",
    liveLoader: loadSpkLiveRecords,
    testLoader: loadSpkLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ SPK scraper failed:", error);
    process.exit(1);
  });
}
