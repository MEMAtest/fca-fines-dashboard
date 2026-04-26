import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const SFC_CONTENT_URL = "https://apps.sfc.hk/edistributionWeb/api/news/list-content";
const SFC_DOC_URL = "https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/doc";
const SFC_DEFAULT_START_YEAR = Number.parseInt(
  process.env.SFC_START_YEAR || "2020",
  10,
);
const SFC_DEFAULT_END_YEAR = Number.parseInt(
  process.env.SFC_END_YEAR || String(new Date().getUTCFullYear()),
  10,
);
const SFC_MAX_REF_PER_YEAR = Number.parseInt(
  process.env.SFC_MAX_REF_PER_YEAR || "220",
  10,
);
const SFC_CONCURRENCY = Number.parseInt(process.env.SFC_CONCURRENCY || "8", 10);

export interface SfcPressRelease {
  refNo: string;
  title: string;
  dateIssued: string;
  body: string;
  sourceUrl: string;
}

const SFC_ENFORCEMENT_TITLE_REGEX =
  /\b(fines?|fined|reprimands?|bans?|banned|suspends?|suspended|sanctions?|disciplinary|prohibits?|prohibited|penalt(?:y|ies)|prosecut(?:es|ed|ion))\b/i;

const SFC_EXCLUDED_TITLE_REGEX =
  /\b(appoints?|welcomes?|consults?|publishes?|launches?|seminar|conference|speech|survey|circular|statement on|annual report|hearing fixed)\b/i;

function buildSfcContentUrl(refNo: string) {
  return `${SFC_CONTENT_URL}?lang=EN&refNo=${encodeURIComponent(refNo)}`;
}

function buildSfcDocUrl(refNo: string) {
  return `${SFC_DOC_URL}?refNo=${encodeURIComponent(refNo)}`;
}

function isLikelySfcEnforcementTitle(title: string) {
  return SFC_ENFORCEMENT_TITLE_REGEX.test(title) && !SFC_EXCLUDED_TITLE_REGEX.test(title);
}

export function parseSfcPressReleaseHtml(
  html: string,
  refNo: string,
): SfcPressRelease | null {
  const $ = cheerio.load(html);
  const title = normalizeWhitespace(
    $("h1").first().text() || $("title").first().text(),
  );
  const metaDate = normalizeWhitespace($("meta[name='date']").attr("content") || "");
  const visibleDate = normalizeWhitespace($("small").first().text());
  const dateIssued =
    parseSfcDate(metaDate) || parseSfcDate(visibleDate) || null;
  const body = normalizeWhitespace(
    $(".newsc").text() || $("#content").text() || $("body").text(),
  );

  if (!title || !dateIssued || !body || !isLikelySfcEnforcementTitle(title)) {
    return null;
  }

  return {
    refNo,
    title,
    dateIssued,
    body,
    sourceUrl: buildSfcContentUrl(refNo),
  };
}

function parseSfcDate(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return parseMonthNameDate(normalized);
}

export function parseSfcAmount(title: string, body: string) {
  return (
    parseLargestAmountFromText(title, {
      currency: "HKD",
      symbols: ["HK$", "$"],
      keywords: ["fine", "fines", "fined", "penalty", "penalties"],
    }) ??
    parseLargestAmountFromText(body.slice(0, 800), {
      currency: "HKD",
      symbols: ["HK$", "$"],
      keywords: ["fine", "fines", "fined", "penalty", "penalties"],
    })
  );
}

export function extractSfcFirm(title: string) {
  const cleaned = normalizeWhitespace(
    title
      .replace(/^SFC\s+/i, "")
      .replace(/\s+(?:HK|US)?\$[\d,.]+\s*(?:million|billion|thousand|m|bn|k)?/gi, "")
      .replace(/\s+for\s+.*$/i, "")
      .replace(/\s+over\s+.*$/i, "")
      .replace(/\s+after\s+.*$/i, "")
      .replace(/\s+and\s+suspends?.*$/i, "")
      .replace(/\s+and\s+bans?.*$/i, ""),
  );

  const patterns = [
    /^(?:reprimands?\s+and\s+fines?|fines?|reprimands?|bans?|suspends?|prohibits?|sanctions?)\s+(.+)$/i,
    /^SFAT\s+(?:affirms?|upholds?|dismisses?)\s+.+?\s+(?:against|of|on)\s+(.+)$/i,
    /^(.+?)\s+(?:fined|banned|reprimanded|suspended|prohibited)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = normalizeWhitespace(match[1])
      .replace(/\s+\([^)]*\)\s*$/g, "")
      .replace(/[.;,:]+$/g, "");
    if (candidate && candidate.length <= 180) {
      return candidate;
    }
  }

  return cleaned.length <= 180 ? cleaned : "Unknown";
}

function categorizeSfcRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (/anti-money laundering|money laundering|aml|terrorist financing/.test(normalized)) {
    categories.push("AML");
  }
  if (/market misconduct|market manipulation|insider|inside information/.test(normalized)) {
    categories.push("MARKET_ABUSE");
  }
  if (/disclosure|research report|reporting/.test(normalized)) {
    categories.push("DISCLOSURE");
  }
  if (/client asset|suitability|selling practice|fund management|asset management|margin lending/.test(normalized)) {
    categories.push("CONDUCT");
  }
  if (/licen[cs]e|registration|suspend|ban|prohibit/.test(normalized)) {
    categories.push("LICENSING");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["SUPERVISORY_SANCTION"];
}

function buildSfcRecord(release: SfcPressRelease) {
  const textCorpus = `${release.title} ${release.body}`;

  return buildEuFineRecord({
    regulator: "SFC",
    regulatorFullName: "Securities and Futures Commission",
    countryCode: "HK",
    countryName: "Hong Kong",
    firmIndividual: extractSfcFirm(release.title),
    firmCategory: "Financial Entity",
    amount: parseSfcAmount(release.title, release.body),
    currency: "HKD",
    dateIssued: release.dateIssued,
    breachType: release.title,
    breachCategories: categorizeSfcRecord(textCorpus),
    summary: release.body.slice(0, 500) || release.title,
    finalNoticeUrl: buildSfcDocUrl(release.refNo),
    sourceUrl: release.sourceUrl,
    dedupeKey: release.refNo,
    rawPayload: release,
  });
}

async function fetchSfcRelease(refNo: string) {
  try {
    const html = await fetchText(buildSfcContentUrl(refNo), {
      timeout: 45000,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    return parseSfcPressReleaseHtml(html, refNo);
  } catch {
    return null;
  }
}

function buildSfcRefNos(startYear: number, endYear: number, maxRefPerYear: number) {
  const refNos: string[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const yearShort = String(year).slice(-2);
    for (let refIndex = 1; refIndex <= maxRefPerYear; refIndex += 1) {
      refNos.push(`${yearShort}PR${refIndex}`);
    }
  }

  return refNos;
}

export async function loadSfcLiveRecords(): Promise<DbReadyRecord[]> {
  const flags = getCliFlags();
  const refNos = buildSfcRefNos(
    SFC_DEFAULT_START_YEAR,
    SFC_DEFAULT_END_YEAR,
    SFC_MAX_REF_PER_YEAR,
  );
  const releases = await mapWithConcurrency(
    refNos,
    Math.max(1, SFC_CONCURRENCY),
    fetchSfcRelease,
  );
  const records = releases
    .filter((release): release is SfcPressRelease => release !== null)
    .map(buildSfcRecord)
    .sort(
      (left, right) =>
        right.dateIssued.localeCompare(left.dateIssued) ||
        left.firmIndividual.localeCompare(right.firmIndividual),
    );

  return flags.limit && flags.limit > 0 ? records.slice(0, flags.limit) : records;
}

export async function main() {
  await runScraper({
    name: "🇭🇰 SFC Enforcement Actions Scraper",
    region: "APAC",
    regulatorCode: "SFC",
    liveLoader: loadSfcLiveRecords,
    testLoader: loadSfcLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ SFC scraper failed:", error);
    process.exit(1);
  });
}
