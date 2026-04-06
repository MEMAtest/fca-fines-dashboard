import "dotenv/config";
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const ASIC_BASE_URL = "https://www.asic.gov.au";
const ASIC_REGISTER_URL =
  "https://www.asic.gov.au/online-services/search-asic-registers/infringement-notices-register/";
const execFileAsync = promisify(execFile);

export interface AsicRegisterRow {
  firmIndividual: string;
  licenceReference: string | null;
  dateIssued: string;
  noticeUrls: string[];
  mediaReleaseCode: string | null;
  mediaReleaseUrl: string | null;
  mediaReleaseTitle: string | null;
  legislation: string;
}

function parseAsicDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

function extractAsicMediaReleaseCode(text: string) {
  return normalizeWhitespace(text).match(/\b\d{2}-\d+[A-Z]*MR\b/i)?.[0] ?? null;
}

function cleanAsicMediaReleaseTitle(title: string, mediaReleaseCode: string | null) {
  return normalizeWhitespace(
    title.replace(
      new RegExp(`^${(mediaReleaseCode || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"),
      "",
    ),
  );
}

export function parseAsicAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "AUD",
    symbols: ["$"],
    keywords: ["penalty", "infringement notice", "fine", "civil penalty"],
  });
}

export function parseAsicRegisterHtml(html: string, pageUrl = ASIC_REGISTER_URL) {
  const $ = cheerio.load(html);
  const rows = new Map<string, AsicRegisterRow>();

  $("table.asic-table tr, table tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 6) {
      return;
    }

    const firmIndividual = normalizeWhitespace(cells.eq(0).text());
    const licenceReference = normalizeWhitespace(cells.eq(1).text()) || null;
    const dateIssued = parseAsicDate(cells.eq(2).text());
    const legislation = normalizeWhitespace(cells.eq(5).text());
    const mediaReleaseCell = cells.eq(4);
    const mediaReleaseLink = mediaReleaseCell.find("a[href]").first();
    const mediaReleaseHref = normalizeWhitespace(mediaReleaseLink.attr("href") || "");
    const mediaReleaseUrl = mediaReleaseHref
      ? makeAbsoluteUrl(pageUrl, mediaReleaseHref)
      : null;
    const mediaReleaseCode = extractAsicMediaReleaseCode(mediaReleaseCell.text());
    const mediaReleaseTitle = normalizeWhitespace(
      mediaReleaseLink.attr("title") || "",
    ) || null;
    const noticeUrls = [
      ...new Set(
        cells
          .eq(3)
          .find("a[href]")
          .map((__, link) =>
            makeAbsoluteUrl(pageUrl, normalizeWhitespace($(link).attr("href") || "")),
          )
          .get()
          .filter(Boolean),
      ),
    ];

    if (!firmIndividual || !dateIssued) {
      return;
    }

    const dedupeKey = [
      firmIndividual,
      dateIssued,
      mediaReleaseCode || mediaReleaseUrl || legislation || noticeUrls[0] || "row",
    ].join("::");

    rows.set(dedupeKey, {
      firmIndividual,
      licenceReference,
      dateIssued,
      noticeUrls,
      mediaReleaseCode,
      mediaReleaseUrl,
      mediaReleaseTitle,
      legislation,
    });
  });

  return [...rows.values()];
}

function categorizeAsicRecord(title: string, legislation: string) {
  const corpus = `${title} ${legislation}`.toLowerCase();
  const categories: string[] = [];

  if (/misleading|deceptive|false representation|false statement/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/disclosure|financial report|lodg|pds|statement|advertisement/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/credit|lending|loan|mortgage/.test(corpus)) {
    categories.push("LENDING");
  }
  if (/market|trading|financial product|derivative|licence/.test(corpus)) {
    categories.push("MARKETS_SUPERVISION");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

function buildAsicSummary(row: AsicRegisterRow) {
  if (row.mediaReleaseTitle) {
    return cleanAsicMediaReleaseTitle(row.mediaReleaseTitle, row.mediaReleaseCode);
  }

  if (row.legislation) {
    return `${row.firmIndividual} paid an ASIC infringement notice under ${row.legislation}.`;
  }

  return `${row.firmIndividual} paid an ASIC infringement notice.`;
}

function buildAsicBreachType(row: AsicRegisterRow) {
  const cleanTitle = row.mediaReleaseTitle
    ? cleanAsicMediaReleaseTitle(row.mediaReleaseTitle, row.mediaReleaseCode)
    : "";

  return cleanTitle || row.legislation || "ASIC infringement notice";
}

function buildAsicRecords(rows: AsicRegisterRow[]) {
  return rows.map((row) => {
    const title = row.mediaReleaseTitle || row.legislation;
    const summary = buildAsicSummary(row);

    return buildEuFineRecord({
      regulator: "ASIC",
      regulatorFullName: "Australian Securities and Investments Commission",
      countryCode: "AU",
      countryName: "Australia",
      firmIndividual: row.firmIndividual,
      firmCategory: row.licenceReference ? "Licensed Entity" : "Financial Entity",
      amount: parseAsicAmount(title),
      currency: "AUD",
      dateIssued: row.dateIssued,
      breachType: buildAsicBreachType(row),
      breachCategories: categorizeAsicRecord(title, row.legislation),
      summary,
      finalNoticeUrl: row.mediaReleaseUrl || row.noticeUrls[0] || null,
      sourceUrl: ASIC_REGISTER_URL,
      rawPayload: row,
    });
  });
}

export async function loadAsicLiveRecords() {
  const html = await requestAsicHtml(ASIC_REGISTER_URL);
  return buildAsicRecords(parseAsicRegisterHtml(html));
}

async function requestAsicHtml(url: string) {
  try {
    return await fetchText(url);
  } catch {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sSL",
        "--retry",
        "3",
        "--retry-all-errors",
        "--connect-timeout",
        "30",
        "--max-time",
        "120",
        url,
      ],
      {
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return stdout;
  }
}

export async function main() {
  await runScraper({
    name: "🇦🇺 ASIC Infringement Notice Register Scraper",
    liveLoader: loadAsicLiveRecords,
    testLoader: loadAsicLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ ASIC scraper failed:", error);
    process.exit(1);
  });
}
