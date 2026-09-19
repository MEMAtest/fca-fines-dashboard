/** Nigerian Securities and Exchange Commission official enforcement archive. */
import "dotenv/config";
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
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
import {
  persistBlockedSourceDiscoveries,
  type BlockedSourceDiscovery,
} from "./lib/coverageDiscoveryCandidates.js";

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
  affectedEntities: string[];
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
  // Numbered lists on decisions often contain remedies, penalties or product
  // options rather than respondent names. Split only pages whose title says
  // the list itself is the set of affected operators.
  const listNamesAffectedOperators = /blacklisting|activities of some unregistered|scammer alert/i.test(title);
  const affectedEntities = listNamesAffectedOperators
    ? content.find(".block-paragraph_block ol > li, ol > li")
      .map((_, item) => normalizeNgsecEntity($(item).text()))
      .get()
      .filter((entity) => isSpecificNgsecEntity(entity))
    : [];
  if (!title || !dateIssued) return null;
  return { title, dateIssued, summary, body, affectedEntities: [...new Set(affectedEntities)] };
}

export function normalizeNgsecEntity(input: string) {
  return normalizeWhitespace(input)
    .replace(/^(?:illegal\s+operator(?:\s+alert)?|public\s+notice|notice\s+of\s+cancellation\s+of\s+registration\s+of|disclaimer\s+(?:on|of)\s+(?:the\s+)?activit(?:y|ies)\s+of|activit(?:y|ies)\s+of)\s*[-–—:]?\s*/i, "")
    .replace(/^[\dA-Z]+[.)]\s*/, "")
    .trim();
}

function isSpecificNgsecEntity(entity: string) {
  return entity.length >= 3
    && !/^(?:scammer alert|management|signed|members? of the public)$/i.test(entity)
    && !/^(?:cases?|recent|legacy|c\.?f\.?e\.?a\.?|c\.?r\.?e\.?a\.?)\b/i.test(entity)
    && !/\b(?:to present day|to september|to march|to may|to january)\b/i.test(entity);
}

export function isNgsecCompendium(entry: NgsecArchiveEntry, detail: NgsecDetail) {
  const title = `${entry.title} ${detail.title}`;
  return /^(?:cases? before|recent (?:litigation )?cases?|legacy litigation cases?|c\.?f\.?e\.?a\.?|c\.?r\.?e\.?a\.?)\b/i.test(normalizeWhitespace(title));
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

export function buildNgsecRecord(entry: NgsecArchiveEntry, detail: NgsecDetail, entityOverride?: string): DbReadyRecord {
  const evidence = `${entry.title} ${entry.summary} ${detail.title} ${detail.summary} ${detail.body}`;
  const entity = normalizeNgsecEntity(entityOverride || detail.title || entry.title);
  return buildEuFineRecord({
    regulator: "NGSEC", regulatorFullName: "Securities and Exchange Commission, Nigeria",
    countryCode: "NG", countryName: "Nigeria", firmIndividual: entity,
    firmCategory: "Capital Market Entity", amount: parseNgsecAmount(evidence), currency: "NGN",
    dateIssued: detail.dateIssued || entry.dateIssued || "", breachType: entry.title,
    breachCategories: categorizeNgsec(evidence), summary: (detail.summary || entry.summary || detail.body).slice(0, 500),
    finalNoticeUrl: entry.detailUrl, sourceUrl: entry.detailUrl,
    dedupeKey: `${entry.detailUrl}::${entity.toLowerCase()}`, rawPayload: { entry, detail, entity },
  });
}

export async function loadNgsecLiveRecords(): Promise<DbReadyRecord[]> {
  ngsecBlockedDiscoveries = [];
  const archiveEntries = new Map<string, NgsecArchiveEntry>();
  for (const categoryUrl of NGSEC_CATEGORIES) {
    const html = await fetchText(categoryUrl, { timeout: 60_000 });
    for (const entry of parseNgsecArchiveHtml(html, categoryUrl)) archiveEntries.set(entry.detailUrl, entry);
  }
  const records: DbReadyRecord[] = [];
  for (const entry of archiveEntries.values()) {
    const html = await fetchText(entry.detailUrl, { timeout: 60_000 });
    const detail = parseNgsecDetailHtml(html, entry.detailUrl);
    if (!detail) continue;
    if (isNgsecCompendium(entry, detail)) {
      ngsecBlockedDiscoveries.push({
        regulator: "NGSEC",
        sourceUrl: entry.detailUrl,
        fingerprint: createHash("sha256").update(`NGSEC|compendium|${entry.detailUrl}`).digest("hex"),
        reasonCode: "case_level_date_required",
        reason: "The official page is a multi-case compendium and cannot be represented as one firm without row-level action dates.",
        payload: { entry, detail: { ...detail, body: detail.body.slice(0, 4000) } },
      });
      continue;
    }
    const entities = detail.affectedEntities.length > 0
      ? detail.affectedEntities
      : [normalizeNgsecEntity(detail.title || entry.title)].filter(isSpecificNgsecEntity);
    if (entities.length === 0) {
      ngsecBlockedDiscoveries.push({
        regulator: "NGSEC",
        sourceUrl: entry.detailUrl,
        fingerprint: createHash("sha256").update(`NGSEC|entity-missing|${entry.detailUrl}`).digest("hex"),
        reasonCode: "affected_entity_evidence_missing",
        reason: "The official enforcement page did not identify a specific affected entity.",
        payload: { entry, detail: { ...detail, body: detail.body.slice(0, 4000) } },
      });
      continue;
    }
    records.push(...entities.map((entity) => buildNgsecRecord(entry, detail, entity)));
  }
  if (!records.length) throw new Error("NGSEC official enforcement archive returned zero parseable records");
  return records.sort((left, right) => right.dateIssued.localeCompare(left.dateIssued));
}

export async function main() {
  await runScraper({
    name: "🇳🇬 Nigerian SEC Enforcement Actions Scraper",
    region: "Africa",
    regulatorCode: "NGSEC",
    liveLoader: loadNgsecLiveRecords,
    testLoader: loadNgsecLiveRecords,
    afterUpsert: async (sql, _records, scraperRunId) => {
      await persistBlockedSourceDiscoveries(sql, ngsecBlockedDiscoveries, scraperRunId);
    },
  });
}

let ngsecBlockedDiscoveries: BlockedSourceDiscovery[] = [];

export function getNgsecBlockedDiscoveries() {
  return [...ngsecBlockedDiscoveries];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error("❌ NGSEC scraper failed:", error); process.exit(1); });
}
