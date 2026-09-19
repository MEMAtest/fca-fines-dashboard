/** Nigerian Securities and Exchange Commission official enforcement archive. */
import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

export const NGSEC_ENFORCEMENT_URL = "https://www.sec.gov.ng/enforcements/";
export const NGSEC_UPDATE_URL = "https://www.sec.gov.ng/enforcements/keep-track-of-enforcement-updates/";
const NGSEC_CATEGORIES = [
  NGSEC_UPDATE_URL,
  "https://www.sec.gov.ng/enforcements/referred-cases/",
  "https://www.sec.gov.ng/enforcements/companies-facing-enforcement-action/",
  "https://www.sec.gov.ng/enforcements/apc-matters/",
  "https://www.sec.gov.ng/enforcements/litigation/",
] as const;

export interface NgsecArchiveEntry {
  title: string;
  summary: string;
  dateIssued: string | null;
  detailUrl: string;
}

export interface NgsecDetail {
  title: string;
  dateIssued: string;
  summary: string;
  body: string;
}

function parseNgsecDate(input: string): string | null {
  const cleaned = normalizeWhitespace(input).replace(/^published:\s*/i, "").replace(/[.,]/g, "");
  return parseMonthNameDate(cleaned);
}

function parseNgsecDateFromText(input: string): string | null {
  const candidate = normalizeWhitespace(input).match(/\b(?:\d{1,2}\s+[A-Za-z]+\.?\s+\d{4}|[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})\b/);
  return candidate ? parseNgsecDate(candidate[0]) : null;
}

export function parseNgsecArchiveHtml(html: string, pageUrl: string): NgsecArchiveEntry[] {
  const $ = cheerio.load(html);
  const entries = new Map<string, NgsecArchiveEntry>();
  $("section .group a[href]").each((_, element) => {
    const link = $(element);
    const href = normalizeWhitespace(link.attr("href") || "");
    if (!href.startsWith("/enforcements/") || href.endsWith("/enforcements/")) return;
    const spanTexts = link.find("span").map((_, span) => normalizeWhitespace($(span).text())).get().filter(Boolean);
    // The category archive cards use a decorative first span and put the
    // human title in the final text span. Older update cards may also include
    // a date; category pages themselves are intentionally undated and the
    // linked official detail page is the date authority.
    const contentSpans = spanTexts.filter((value) => !parseNgsecDate(value));
    const title = contentSpans[0] || normalizeWhitespace(link.text());
    const summary = contentSpans.slice(1).join(" ");
    const dateIssued = parseNgsecDateFromText(`${link.text()} ${link.parent().text()}`);
    if (!title) return;
    const detailUrl = makeAbsoluteUrl(pageUrl, href);
    entries.set(detailUrl, { title, summary, dateIssued, detailUrl });
  });
  return [...entries.values()];
}

export function parseNgsecDetailHtml(html: string, detailUrl: string): NgsecDetail | null {
  const $ = cheerio.load(html);
  const heading = normalizeWhitespace($("main h1").first().text());
  const published = heading.match(/published:\s*(.+)$/i)?.[1] || "";
  const title = normalizeWhitespace(heading.replace(/published:\s*.+$/i, ""));
  const dateIssued = parseNgsecDate(published);
  const content = $("main").clone();
  content.find("h1, nav, script, style").remove();
  const body = normalizeWhitespace(content.text());
  const summary = normalizeWhitespace(content.find("p").first().text());
  if (!title || !dateIssued) return null;
  return { title, dateIssued, summary, body };
}

export function parseNgsecAmount(text: string): number | null {
  const normalized = text.replace(/\bN(?=\s*[\d,])/g, "₦");
  return parseLargestAmountFromText(normalized, { currency: "NGN", symbols: ["₦"], keywords: ["fine", "penalty", "sanction", "forfeiture"] });
}

function categorizeNgsec(text: string): string[] {
  const corpus = text.toLowerCase();
  const categories: string[] = [];
  if (/unregistered|illegal operator|unauthori[sz]ed/.test(corpus)) categories.push("UNREGISTERED_ACTIVITY");
  if (/fraud|ponzi|scam|misrepresent/.test(corpus)) categories.push("FRAUD");
  if (/fine|penalty|sanction|barred|suspend|revok/.test(corpus)) categories.push("SUPERVISORY_SANCTION");
  if (/crypto|digital asset|token/.test(corpus)) categories.push("CRYPTO");
  return categories.length ? [...new Set(categories)] : ["MARKETS_SUPERVISION"];
}

export function buildNgsecRecord(entry: NgsecArchiveEntry, detail: NgsecDetail): DbReadyRecord {
  const evidence = `${entry.title} ${entry.summary} ${detail.title} ${detail.summary} ${detail.body}`;
  return buildEuFineRecord({
    regulator: "NGSEC", regulatorFullName: "Securities and Exchange Commission, Nigeria",
    countryCode: "NG", countryName: "Nigeria", firmIndividual: detail.title || entry.title,
    firmCategory: "Capital Market Entity", amount: parseNgsecAmount(evidence), currency: "NGN",
    dateIssued: detail.dateIssued || entry.dateIssued || "", breachType: entry.title,
    breachCategories: categorizeNgsec(evidence), summary: (detail.summary || entry.summary || detail.body).slice(0, 500),
    finalNoticeUrl: entry.detailUrl, sourceUrl: entry.detailUrl,
    dedupeKey: entry.detailUrl, rawPayload: { entry, detail },
  });
}

export async function loadNgsecLiveRecords(): Promise<DbReadyRecord[]> {
  const archiveEntries = new Map<string, NgsecArchiveEntry>();
  for (const categoryUrl of NGSEC_CATEGORIES) {
    const html = await fetchText(categoryUrl, { timeout: 60_000 });
    for (const entry of parseNgsecArchiveHtml(html, categoryUrl)) archiveEntries.set(entry.detailUrl, entry);
  }
  const records: DbReadyRecord[] = [];
  for (const entry of archiveEntries.values()) {
    const html = await fetchText(entry.detailUrl, { timeout: 60_000 });
    const detail = parseNgsecDetailHtml(html, entry.detailUrl);
    if (detail) records.push(buildNgsecRecord(entry, detail));
  }
  if (!records.length) throw new Error("NGSEC official enforcement archive returned zero parseable records");
  return records.sort((left, right) => right.dateIssued.localeCompare(left.dateIssued));
}

export async function main() {
  await runScraper({ name: "🇳🇬 Nigerian SEC Enforcement Actions Scraper", region: "Africa", regulatorCode: "NGSEC", liveLoader: loadNgsecLiveRecords, testLoader: loadNgsecLiveRecords });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error("❌ NGSEC scraper failed:", error); process.exit(1); });
}
