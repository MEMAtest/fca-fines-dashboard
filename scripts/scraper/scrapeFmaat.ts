import "dotenv/config";
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import puppeteer from "puppeteer";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FMAAT_BASE_URL = "https://www.fma.gv.at";
const FMAAT_LIST_URL = "https://www.fma.gv.at/en/category/news-en/sanction/";
const FMAAT_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const MAX_FMAAT_ARCHIVE_PAGES = 25;

const execFileAsync = promisify(execFile);

export interface FmaatListEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  excerpt: string;
}

interface FmaatListPage {
  entries: FmaatListEntry[];
  totalPages: number;
}

interface FmaatDetail {
  title: string;
  dateIssued: string | null;
  body: string;
  summary: string;
}

function parseFmaatDate(input: string) {
  const normalized = normalizeWhitespace(input).replace(/\./g, "");
  return parseMonthNameDate(normalized);
}

function cleanFmaatEntity(input: string) {
  return normalizeWhitespace(
    input
      .replace(/^the\s+/i, "")
      .replace(/[“”]/g, "\"")
      .replace(/\s+\([^)]*\)$/g, "")
      .replace(/[.;,:]+$/g, ""),
  );
}

function isGenericFmaatEntity(input: string) {
  return /^(?:a|an|the)?\s*(?:private person|natural person|individual|private investor|retail investor|persons responsible(?:\s+of.*)?|responsible persons(?:\s+of.*)?|business partner(?:\s+of.*)?|executive director(?:\s+of.*)?|managing director(?:\s+of.*)?|member of the management board(?:\s+of.*)?)$/i
    .test(normalizeWhitespace(input));
}

export function extractFmaatFirm(title: string, body = "") {
  const corpus = [title, body].map((value) => normalizeWhitespace(value)).join(" ");
  const patterns = [
    /sanction(?:s)? against\s+(.+?)(?=\s+for|\s+because|\.\s|$)/i,
    /sanction(?:s)? upon\s+(.+?)(?=\s+for|\s+because|\.\s|$)/i,
    /fine of [^.]* against\s+(.+?)(?=\s+for|\.\s|$)/i,
    /imposed a fine of [^.]* against\s+(.+?)(?=\s+for|\.\s|$)/i,
  ];

  for (const pattern of patterns) {
    const match = corpus.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = cleanFmaatEntity(match[1]);
    if (candidate && !isGenericFmaatEntity(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function parseFmaatAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "EUR",
    symbols: ["€"],
    keywords: [
      "fine",
      "sanction",
      "penal order",
      "administrative penalty",
    ],
  });
}

export function parseFmaatListingHtml(html: string, pageUrl: string): FmaatListPage {
  const $ = cheerio.load(html);
  const entries = new Map<string, FmaatListEntry>();

  $(".entry .inner").each((_, element) => {
    const item = $(element);
    const title = normalizeWhitespace(item.find("h3.h2").first().text());
    const href = normalizeWhitespace(
      item.find(".morelink a[href]").first().attr("href") || "",
    );
    const excerpt = normalizeWhitespace(item.find(".excerpt-wrap").first().text());
    const dateIssued = parseFmaatDate(item.find("time.release-date").first().text());

    if (!title || !href || !dateIssued) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(pageUrl, href);
    entries.set(detailUrl, {
      title,
      detailUrl,
      dateIssued,
      excerpt,
    });
  });

  let totalPages = 1;
  $(".page-numbers").each((_, element) => {
    const value = Number.parseInt(normalizeWhitespace($(element).text()), 10);
    if (Number.isFinite(value)) {
      totalPages = Math.max(totalPages, value);
    }
  });

  return {
    entries: [...entries.values()],
    totalPages,
  };
}

export function parseFmaatDetailHtml(html: string): FmaatDetail {
  const $ = cheerio.load(html);
  const contentRoot = $("article.dmbs-post").first();
  const paragraphs = contentRoot
    .find(".content-wrap p")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean);
  const body = normalizeWhitespace(paragraphs.join(" "));

  return {
    title:
      normalizeWhitespace(contentRoot.find("h1.page-header").first().text())
      || normalizeWhitespace($("h1").first().text()),
    dateIssued: parseFmaatDate(contentRoot.find("time.release-date").first().text()),
    body,
    summary: paragraphs[0] || body,
  };
}

function categorizeFmaatRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (/money laundering|aml|terrorist financing|hvidvask/i.test(normalized)) {
    categories.push("AML");
  }
  if (/disclosure|publication|directors[’'] dealings|notification/i.test(normalized)) {
    categories.push("DISCLOSURE");
  }
  if (/unauthorised|unauthorized|licen[cs]e|lending business|banking business/i.test(normalized)) {
    categories.push("LICENSING");
  }
  if (/market abuse|market manipulation|insider/i.test(normalized)) {
    categories.push("MARKET_ABUSE");
  }
  if (/governance|fit and proper|organisational/i.test(normalized)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["MARKETS_SUPERVISION"];
}

async function requestFmaatHtml(url: string) {
  try {
    const direct = await fetchText(url, { timeout: 45000 });
    if (
      direct
      && !/just a moment|checking if the site connection is secure|access denied/i.test(direct)
    ) {
      return direct;
    }
  } catch {
    // Browser fallback below
  }

  try {
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
        "-A",
        FMAAT_BROWSER_USER_AGENT,
        url,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    if (
      stdout
      && !/just a moment|checking if the site connection is secure|access denied/i.test(stdout)
    ) {
      return stdout;
    }
  } catch {
    // Browser fallback below
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(FMAAT_BROWSER_USER_AGENT);
    await page.setExtraHTTPHeaders({ "accept-language": "en-GB,en;q=0.9" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("main .entry, article.dmbs-post", { timeout: 30000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

async function requestFmaatListingHtml(url: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(FMAAT_BROWSER_USER_AGENT);
    await page.setExtraHTTPHeaders({ "accept-language": "en-GB,en;q=0.9" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("main .entry", { timeout: 5000 }).catch(() => null);
    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function loadFmaatEntries(limit: number | null) {
  const entries = new Map<string, FmaatListEntry>();
  const firstPage = parseFmaatListingHtml(
    await requestFmaatListingHtml(FMAAT_LIST_URL),
    FMAAT_LIST_URL,
  );

  for (const entry of firstPage.entries) {
    entries.set(entry.detailUrl, entry);
    if (limit && entries.size >= limit) {
      return [...entries.values()];
    }
  }

  for (let pageNumber = 2; pageNumber <= MAX_FMAAT_ARCHIVE_PAGES; pageNumber += 1) {
    const pageUrl = `${FMAAT_LIST_URL}page/${pageNumber}/`;
    const parsed = parseFmaatListingHtml(await requestFmaatListingHtml(pageUrl), pageUrl);

    if (parsed.entries.length === 0) {
      break;
    }

    for (const entry of parsed.entries) {
      entries.set(entry.detailUrl, entry);
      if (limit && entries.size >= limit) {
        return [...entries.values()];
      }
    }
  }

  return [...entries.values()];
}

async function enrichFmaatEntry(entry: FmaatListEntry) {
  const detail = parseFmaatDetailHtml(await requestFmaatHtml(entry.detailUrl));
  const textCorpus = `${entry.title} ${entry.excerpt} ${detail.body}`;
  const firmIndividual = extractFmaatFirm(detail.title || entry.title, detail.body || entry.excerpt);

  if (!firmIndividual) {
    return null;
  }

  return buildEuFineRecord({
    regulator: "FMAAT",
    regulatorFullName: "Financial Market Authority Austria",
    countryCode: "AT",
    countryName: "Austria",
    firmIndividual,
    firmCategory: "Firm or Individual",
    amount: parseFmaatAmount(textCorpus),
    currency: "EUR",
    dateIssued: detail.dateIssued || entry.dateIssued,
    breachType: detail.title || entry.title,
    breachCategories: categorizeFmaatRecord(textCorpus),
    summary: detail.summary || entry.excerpt || entry.title,
    finalNoticeUrl: entry.detailUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
    },
  });
}

export async function loadFmaatLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadFmaatEntries(
    flags.limit && flags.limit > 0 ? flags.limit : null,
  );
  const records = await mapWithConcurrency(entries, 2, enrichFmaatEntry);
  return records.filter((record) => record !== null);
}

export async function main() {
  await runScraper({
    name: "🇦🇹 FMA Austria Sanctions Scraper",
    liveLoader: loadFmaatLiveRecords,
    testLoader: loadFmaatLiveRecords,
    retryOnTransientFailure: true,
    maxRetries: 1,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FMA Austria scraper failed:", error);
    process.exit(1);
  });
}
