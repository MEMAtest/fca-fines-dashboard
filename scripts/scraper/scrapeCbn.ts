import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  extractPdfLayoutTextFromUrl,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const CBN_BASE_URL = "https://www.cbn.gov.ng";
const CBN_PRESS_RELEASES_URL = `${CBN_BASE_URL}/Out/PressRelease/PressRelease.asp`;
export const CBN_NOTICES_URL = `${CBN_BASE_URL}/Documents/Notices.html`;
const CBN_NOTICES_API_URL = `${CBN_BASE_URL}/api/GetAllNotices?format=json`;

export interface CbnActionRow {
  date: string;
  entity: string;
  title: string;
  actionUrl: string;
  description: string;
  actionType: "license_revocation" | "sanction" | "penalty";
  evidenceText?: string;
}

export interface CbnNotice {
  id: number;
  refNo: string;
  title: string;
  description: string;
  keywords: string;
  link: string;
  documentDate: string;
}

function parseCbnDate(input: string) {
  const cleaned = normalizeWhitespace(input);
  const numeric = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numeric) return `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  return parseMonthNameDate(cleaned);
}

export function isCbnEnforcementNotice(notice: Pick<CbnNotice, "title" | "description" | "keywords">) {
  const title = normalizeWhitespace(notice.title).toLowerCase();
  const corpus = `${title} ${notice.description} ${notice.keywords}`;
  // Routine licence, conversion, renewal, and brand-display notices are not
  // enforcement actions. Require an explicit adverse action after exclusions.
  if (/renewal|conversion|converted|brand\s+name|display\s+of\s+licen[cs]e|deadline|meeting|workshop|invitation|modalit(?:y|ies)/i.test(title)) {
    return false;
  }
  return /revoc|revok|sanction|penalt|fine|suspend|closed\s+shop|failed\s+to\s+render|non[-\s]?rendition|unlicensed|delist/i.test(corpus);
}

function classifyCbnNotice(notice: CbnNotice): CbnActionRow["actionType"] {
  const titleLower = notice.title.toLowerCase();
  return /revoc|revok|closed\s+shop|delist/.test(titleLower)
    ? "license_revocation"
    : /penalt|fine/.test(titleLower) ? "penalty" : "sanction";
}

export function parseCbnNoticeCandidates(json: string): CbnNotice[] {
  const notices = JSON.parse(json) as CbnNotice[];
  return notices.filter((notice) => isCbnEnforcementNotice(notice) && notice.title && notice.documentDate);
}

/** Extract named affected institutions from official notice/PDF evidence. */
export function extractCbnEntities(text: string): string[] {
  // Only accept names introduced by a numbered/lettered list marker. This
  // deliberately excludes prose such as "the CBN ... Corporation" and
  // aggregate labels such as "14 Banks".
  const candidates = text.match(/(?:^|[\n;])\s*(?:\d+\)|[A-Z]\.)\s*([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){1,8}?\s+(?:(?:Bank|BANK|Banks|BANKS)(?:\s+(?:Limited|LIMITED|Ltd|LTD|Plc|PLC))?|Limited|LIMITED|Ltd|LTD|Plc|PLC|Society|SOCIETY|Company|COMPANY|Corporation|CORPORATION|Holdings|HOLDINGS))\b/gm) || [];
  const generic = /(?:notice|public|central|operating|revocation|licen[cs]e|payment|private|sector|depositors?|microfinance|community|failed|minimum|conversion|managing|directors?|ceos?|institutions?|debtors?)/i;
  return [...new Set(candidates.map((candidate) => {
    const marker = candidate.match(/(?:\d+\)|[A-Z]\.)\s*/);
    return normalizeWhitespace(marker ? candidate.slice((marker.index || 0) + marker[0].length) : candidate);
  }).filter((candidate) => !/\bBanks\b$/i.test(candidate) && !generic.test(candidate)))];
}

export function parseCbnNoticesJson(json: string, pageUrl = CBN_NOTICES_URL): CbnActionRow[] {
  const rows = new Map<string, CbnActionRow>();
  for (const notice of parseCbnNoticeCandidates(json)) {
    const date = parseCbnDate(notice.documentDate);
    if (!date) continue;
    const actionType = classifyCbnNotice(notice);
    const actionUrl = notice.link ? makeAbsoluteUrl(pageUrl, notice.link) : pageUrl;
    const entities = extractCbnEntities(`${notice.title} ${notice.description} ${notice.keywords}`);
    for (const entity of entities) {
      const row = { date, entity, title: notice.title, actionUrl, description: normalizeWhitespace(notice.description.replace(/<[^>]+>/g, " ")), actionType };
      rows.set(`${notice.id}::${entity}`, row);
    }
  }
  return [...rows.values()];
}

export function parseCbnAmount(text: string) {
  // The helper's symbol matcher is intentionally permissive; a bare `N`
  // would also match the first letter of words such as "Notice". Normalize
  // only a word-boundary Naira marker before delegating to it.
  const normalized = text.replace(/\bN(?=\s*[\d,])/g, "₦");
  return parseLargestAmountFromText(normalized, {
    currency: "NGN",
    symbols: ["₦"],
    keywords: ["fine", "penalty", "sanction"],
  });
}

export function parseCbnPressReleasesHtml(html: string, pageUrl = CBN_PRESS_RELEASES_URL) {
  const $ = cheerio.load(html);
  const rows: CbnActionRow[] = [];

  // CBN enforcement actions are typically published as press releases
  // Look for press releases mentioning license revocation, sanctions, or penalties
  $(".press-release, .news-item, article, tr").each((_, element) => {
    const $el = $(element);

    // Try article/press release format
    let dateText = $el.find(".date, .published-date, time").text();
    let title = normalizeWhitespace($el.find("h2, h3, .title").first().text());
    let description = normalizeWhitespace($el.find(".description, .summary, p").first().text());

    // Try table row format
    if (!title) {
      const cells = $el.find("td");
      if (cells.length >= 2) {
        dateText = cells.eq(0).text();
        title = normalizeWhitespace(cells.eq(1).text());
      }
    }

    const date = parseCbnDate(dateText);

    const link = $el.find("a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const actionUrl = href ? makeAbsoluteUrl(pageUrl, href) : "";

    // Filter for enforcement-related press releases
    const titleLower = title.toLowerCase();
    const isEnforcement =
      titleLower.includes("revok") ||
      titleLower.includes("licence") ||
      titleLower.includes("license") ||
      titleLower.includes("sanction") ||
      titleLower.includes("penalty") ||
      titleLower.includes("fine") ||
      titleLower.includes("suspend");

    if (!isEnforcement || !date) {
      return;
    }

    // Determine action type
    let actionType: "license_revocation" | "sanction" | "penalty" = "sanction";
    if (titleLower.includes("revok")) {
      actionType = "license_revocation";
    } else if (titleLower.includes("penalty") || titleLower.includes("fine")) {
      actionType = "penalty";
    }

    // Extract entity names from title
    const entities = extractCbnEntities(title);

    for (const entity of entities) {
      rows.push({
        date,
        entity,
        title,
        actionUrl,
        description,
        actionType,
      });
    }
  });

  return rows;
}

function categorizeCbnRecord(title: string, actionType: string) {
  const corpus = `${title}`.toLowerCase();
  const categories: string[] = [];

  if (actionType === "license_revocation") {
    categories.push("MARKETS_SUPERVISION");
  }
  if (/aml|anti-money laundering/.test(corpus)) {
    categories.push("AML");
  }
  if (/capital|adequacy|undercapitalized/.test(corpus)) {
    categories.push("PRUDENTIAL");
  }
  if (/governance|director/.test(corpus)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

export function buildCbnRecords(rows: CbnActionRow[]) {
  return rows.map((row) => {
    const summary = row.description || row.title;
    const breachType = row.title || "CBN Enforcement Action";

    return buildEuFineRecord({
      regulator: "CBN",
      regulatorFullName: "Central Bank of Nigeria",
      countryCode: "NG",
      countryName: "Nigeria",
      firmIndividual: row.entity,
      firmCategory: "Financial Entity",
      amount: row.actionType === "license_revocation" ? null : parseCbnAmount(`${row.title} ${row.description}`),
      currency: "NGN",
      dateIssued: row.date,
      breachType,
      breachCategories: categorizeCbnRecord(row.title, row.actionType),
      summary,
      finalNoticeUrl: row.actionUrl || null,
      sourceUrl: CBN_NOTICES_URL,
      rawPayload: row,
    });
  });
}

export async function loadCbnLiveRecords() {
  const json = await fetchText(CBN_NOTICES_API_URL, { timeout: 60_000, headers: { Accept: "application/json" } });
  const rows: CbnActionRow[] = [];
  for (const notice of parseCbnNoticeCandidates(json)) {
    const date = parseCbnDate(notice.documentDate);
    if (!date) continue;
    const actionUrl = notice.link ? makeAbsoluteUrl(CBN_NOTICES_URL, notice.link) : CBN_NOTICES_URL;
    let evidenceText = "";
    if (/\.pdf(?:$|[?#])/i.test(actionUrl)) {
      try {
        evidenceText = await extractPdfLayoutTextFromUrl(actionUrl);
      } catch (error) {
        console.warn(`CBN: unable to extract affected-entity evidence from ${actionUrl}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const entities = extractCbnEntities(`${notice.title} ${notice.description} ${notice.keywords} ${evidenceText}`);
    for (const entity of entities) {
      rows.push({
        date,
        entity,
        title: notice.title,
        actionUrl,
        description: normalizeWhitespace(`${notice.description} ${evidenceText}`).slice(0, 4000),
        actionType: classifyCbnNotice(notice),
        evidenceText: evidenceText.slice(0, 12000),
      });
    }
  }
  if (!rows.length) throw new Error("CBN official notices API returned no enforcement-related notices");
  return buildCbnRecords(rows);
}

export async function main() {
  await runScraper({
    name: "🇳🇬 CBN Enforcement Actions Scraper",
    region: "Africa",
    regulatorCode: "CBN",
    liveLoader: loadCbnLiveRecords,
    testLoader: loadCbnLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CBN scraper failed:", error);
    process.exit(1);
  });
}
