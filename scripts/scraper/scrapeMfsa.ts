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

const MFSA_BASE_URL = "https://www.mfsa.mt";
const MFSA_LIST_URL = "https://www.mfsa.mt/news/administrative-measures-and-penalties/";
const MFSA_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

const execFileAsync = promisify(execFile);

const GENERIC_MFSA_ENTITIES = new Set([
  "collective investment scheme",
  "professional investor fund",
  "retail ucits scheme",
  "ucits scheme",
  "trustee",
  "company service provider",
  "insurance intermediary",
]);

export interface MfsaListEntry {
  title: string;
  detailUrl: string;
  publicationDate: string;
  excerpt: string;
}

interface MfsaListPage {
  entries: MfsaListEntry[];
  totalPages: number;
}

interface MfsaDetail {
  title: string;
  summary: string;
  body: string;
  dateIssued: string | null;
}

function parseMfsaDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

function cleanMfsaEntity(input: string) {
  return normalizeWhitespace(
    input
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'")
      .replace(/\s+\([^)]*\b(?:issuer|scheme|trustee|company|csp)\b[^)]*\)\s*$/i, "")
      .replace(/\s*(?:[–:]|-)?\s*Ref:\s*.+$/i, "")
      .replace(/^the\s+/i, "")
      .replace(/[.;,:]+$/g, ""),
  );
}

function isGenericMfsaEntity(input: string) {
  const normalized = normalizeWhitespace(input).toLowerCase();
  return GENERIC_MFSA_ENTITIES.has(normalized) || ["issuer", "scheme", "trustee"].includes(normalized);
}

export function extractMfsaFirm(title: string, body = "") {
  const titleCandidate = cleanMfsaEntity(title.replace(/\s+[–-]\s+Ref:.*$/i, ""));
  if (titleCandidate && !isGenericMfsaEntity(titleCandidate)) {
    return titleCandidate;
  }

  const corpus = normalizeWhitespace(body);
  const patterns = [
    /administrative penalty [^.]* on\s+(.+?)(?=\.|\s+BREACHES|\s+REGULATORY ACTION|$)/i,
    /impose an administrative penalty [^.]* on\s+(.+?)(?=\.|\s+BREACHES|\s+REGULATORY ACTION|$)/i,
    /penalty [^.]* on\s+(.+?)(?=\.|\s+BREACHES|\s+REGULATORY ACTION|$)/i,
    /against\s+(.+?)(?=\.|\s+BREACHES|\s+REGULATORY ACTION|$)/i,
  ];

  for (const pattern of patterns) {
    const match = corpus.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = cleanMfsaEntity(match[1]);
    if (candidate && !isGenericMfsaEntity(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function parseMfsaAmount(text: string) {
  return parseLargestAmountFromText(text, {
    currency: "EUR",
    symbols: ["€"],
    keywords: [
      "administrative penalty",
      "penalty",
      "fine",
      "sanction",
    ],
  });
}

function parseMfsaActionDate(text: string) {
  const normalized = normalizeWhitespace(text);
  for (const match of normalized.matchAll(
    /\bOn\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/g,
  )) {
    const parsed = parseMonthNameDate(match[1]);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function parseMfsaListingHtml(html: string, pageUrl: string): MfsaListPage {
  const $ = cheerio.load(html);
  const entries = new Map<string, MfsaListEntry>();

  $(".single-publication").each((_, element) => {
    const item = $(element);
    const link = item.find(".publication-title a.title-link[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const title = normalizeWhitespace(link.text());
    const excerpt = normalizeWhitespace(item.find(".publication-excerpt").first().text());
    const publicationDate = parseMfsaDate(item.find(".date-published").first().text());

    if (!href || !title || !publicationDate) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(pageUrl, href);
    entries.set(detailUrl, {
      title,
      detailUrl,
      publicationDate,
      excerpt,
    });
  });

  let totalPages = 1;
  $(".pagination .page-numbers").each((_, element) => {
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

export function parseMfsaDetailHtml(html: string): MfsaDetail {
  const $ = cheerio.load(html);
  const root = $(".single-publication-content").first();
  const paragraphs = root
    .find("p")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean);
  const body = normalizeWhitespace(paragraphs.join(" "));

  return {
    title:
      normalizeWhitespace($(".single-publication-title").first().text())
      || normalizeWhitespace($("h1").first().text()),
    summary: paragraphs[0] || body,
    body,
    dateIssued: parseMfsaActionDate(body),
  };
}

function categorizeMfsaRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (/anti-money laundering|money laundering|terrorist financing|aml/i.test(normalized)) {
    categories.push("AML");
  }
  if (/disclosure|financial information|report|submission|auditor/i.test(normalized)) {
    categories.push("DISCLOSURE");
  }
  if (/market abuse|market abuse regulation|insider|short selling/i.test(normalized)) {
    categories.push("MARKET_ABUSE");
  }
  if (/investment services|ucits|collective investment|fund|mifid|aifmd/i.test(normalized)) {
    categories.push("MARKETS_SUPERVISION");
  }
  if (/governance|controls|compliance|publication policy/i.test(normalized)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["MARKETS_SUPERVISION"];
}

async function requestMfsaHtml(url: string) {
  try {
    const direct = await fetchText(url, { timeout: 45000 });
    if (
      direct
      && !/just a moment|checking if the site connection is secure|access denied|sorry,\s+you have been blocked/i.test(direct)
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
        MFSA_BROWSER_USER_AGENT,
        url,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    if (
      stdout
      && !/just a moment|checking if the site connection is secure|access denied|sorry,\s+you have been blocked/i.test(stdout)
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
    await page.setUserAgent(MFSA_BROWSER_USER_AGENT);
    await page.setExtraHTTPHeaders({ "accept-language": "en-GB,en;q=0.9" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector(".single-publication, .single-publication-content", {
      timeout: 5000,
    }).catch(() => null);
    return await page.content();
  } finally {
    await browser.close();
  }
}

export async function loadMfsaEntries(limit: number | null) {
  const entries = new Map<string, MfsaListEntry>();
  const firstPage = parseMfsaListingHtml(
    await requestMfsaHtml(MFSA_LIST_URL),
    MFSA_LIST_URL,
  );

  for (const entry of firstPage.entries) {
    entries.set(entry.detailUrl, entry);
    if (limit && entries.size >= limit) {
      return [...entries.values()];
    }
  }

  for (let pageNumber = 2; pageNumber <= firstPage.totalPages; pageNumber += 1) {
    const pageUrl = `${MFSA_LIST_URL}page/${pageNumber}/`;
    const parsed = parseMfsaListingHtml(await requestMfsaHtml(pageUrl), pageUrl);

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

async function enrichMfsaEntry(entry: MfsaListEntry) {
  const textCorpus = `${entry.title} ${entry.excerpt}`;
  const firmIndividual = extractMfsaFirm(entry.title, textCorpus);

  if (!firmIndividual) {
    return null;
  }

  return buildEuFineRecord({
    regulator: "MFSA",
    regulatorFullName: "Malta Financial Services Authority",
    countryCode: "MT",
    countryName: "Malta",
    firmIndividual,
    firmCategory: "Financial Entity",
    amount: parseMfsaAmount(textCorpus),
    currency: "EUR",
    dateIssued: entry.publicationDate,
    breachType: entry.title,
    breachCategories: categorizeMfsaRecord(textCorpus),
    summary: entry.excerpt || entry.title,
    finalNoticeUrl: entry.detailUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
    },
  });
}

export async function loadMfsaLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadMfsaEntries(
    flags.limit && flags.limit > 0 ? flags.limit : null,
  );
  const records = await mapWithConcurrency(entries, 2, enrichMfsaEntry);
  return records.filter((record) => record !== null);
}

export async function main() {
  await runScraper({
    name: "🇲🇹 MFSA Administrative Penalties Scraper",
    liveLoader: loadMfsaLiveRecords,
    testLoader: loadMfsaLiveRecords,
    retryOnTransientFailure: true,
    maxRetries: 1,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ MFSA scraper failed:", error);
    process.exit(1);
  });
}
