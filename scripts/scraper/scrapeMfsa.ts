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
const MFSA_HEADLESS = process.env.SCRAPER_BROWSER_HEADLESS !== "false";

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

interface MfsaArchiveEntry {
  publicationDate: string;
  title: string;
  body: string;
  detailUrl: string | null;
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

function parseMfsaSlashDate(input: string) {
  const match = normalizeWhitespace(input).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
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

export function buildMfsaArchiveEntriesFromRows(
  rows: Array<{
    cells: string[];
    link?: string | null;
  }>,
) {
  const entries: MfsaArchiveEntry[] = [];

  for (const row of rows) {
    const [rawDate, rawTitle, rawBody] = row.cells;
    const publicationDate = parseMfsaSlashDate(rawDate || "");
    const title = cleanMfsaEntity(rawTitle || "");
    const body = normalizeWhitespace((rawBody || "").replace(/<br\s*\/?>/gi, " "));

    if (!publicationDate || !title || !body) {
      continue;
    }

    entries.push({
      publicationDate,
      title,
      body,
      detailUrl: row.link ? makeAbsoluteUrl(MFSA_BASE_URL, row.link) : null,
    });
  }

  return entries;
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
    headless: MFSA_HEADLESS,
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
      timeout: 60000,
    }).catch(() => null);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".single-publication, .single-publication-content").length > 0,
      { timeout: 15000 },
    ).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const html = await page.content();
    if (/attention required|sorry,\s+you have been blocked/i.test(html)) {
      throw new Error(`MFSA browser fetch remained blocked for ${url}`);
    }
    return html;
  } finally {
    await browser.close();
  }
}

async function loadMfsaArchiveEntries() {
  const browser = await puppeteer.launch({
    headless: MFSA_HEADLESS,
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
    await page.goto(`${MFSA_LIST_URL}administrative-measures-and-penalties-archive/`, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });

    const rows = await page.evaluate(() => {
      const dtFactory = (window as typeof window & { jQuery?: any }).jQuery;
      const dt = dtFactory?.("#tablepress-17").DataTable?.();

      if (!dt) {
        return [];
      }

      const data = dt.rows().data().toArray();
      const nodes = dt.rows().nodes().toArray();
      return data.map((cells, index) => {
        const anchor = nodes[index]?.querySelector?.("a[href]") as HTMLAnchorElement | null;
        return {
          cells: Array.from(cells),
          link: anchor?.getAttribute("href") || null,
        };
      });
    });

    return buildMfsaArchiveEntriesFromRows(rows);
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

async function loadMfsaCurrentEntries(limit: number | null) {
  const browser = await puppeteer.launch({
    headless: MFSA_HEADLESS,
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
    await page.goto(MFSA_LIST_URL, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForSelector(".single-publication, .pagination", {
      timeout: 60000,
    });

    const entries = new Map<string, MfsaListEntry>();

    while (true) {
      const snapshot = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll(".single-publication")];
        const extracted = nodes.map((node) => {
          const link = node.querySelector<HTMLAnchorElement>(".publication-title a.title-link[href]");
          const href = link?.getAttribute("href") || "";
          const title = (link?.textContent || "").trim();
          const excerpt =
            (node.querySelector<HTMLElement>(".publication-excerpt")?.textContent || "").trim();
          const publicationDate =
            (node.querySelector<HTMLElement>(".date-published")?.textContent || "").trim();

          return { href, title, excerpt, publicationDate };
        });

        const totalPages = Math.max(
          1,
          ...[...document.querySelectorAll(".pagination .page-numbers")]
            .map((node) => Number.parseInt((node.textContent || "").trim(), 10))
            .filter((value) => Number.isFinite(value)),
        );

        const nextHref =
          document
            .querySelector<HTMLAnchorElement>(".pagination a.next.page-numbers[href]")
            ?.getAttribute("href")
          || null;

        return {
          extracted,
          totalPages,
          nextHref,
        };
      });

      for (const item of snapshot.extracted) {
        const publicationDate = parseMfsaDate(item.publicationDate);
        const title = normalizeWhitespace(item.title);
        const href = normalizeWhitespace(item.href);
        if (!publicationDate || !title || !href) {
          continue;
        }

        const detailUrl = makeAbsoluteUrl(page.url(), href);
        entries.set(detailUrl, {
          title,
          detailUrl,
          publicationDate,
          excerpt: normalizeWhitespace(item.excerpt),
        });

        if (limit && entries.size >= limit) {
          return [...entries.values()];
        }
      }

      if (!snapshot.nextHref || entries.size >= snapshot.totalPages * 10) {
        break;
      }

      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }),
        page.click(".pagination a.next.page-numbers[href]"),
      ]);
      await page.waitForSelector(".single-publication", { timeout: 60000 });
    }

    return [...entries.values()];
  } finally {
    await browser.close();
  }
}

async function enrichMfsaEntry(entry: MfsaListEntry) {
  const detail = parseMfsaDetailHtml(await requestMfsaHtml(entry.detailUrl));
  const textCorpus = `${entry.title} ${entry.excerpt} ${detail.body}`;
  const firmIndividual = extractMfsaFirm(
    detail.title || entry.title,
    detail.body || textCorpus,
  );

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
    dateIssued: detail.dateIssued || entry.publicationDate,
    breachType: detail.title || entry.title,
    breachCategories: categorizeMfsaRecord(textCorpus),
    summary: detail.summary || entry.excerpt || entry.title,
    finalNoticeUrl: entry.detailUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
    },
  });
}

function buildMfsaArchiveRecord(entry: MfsaArchiveEntry) {
  const firmIndividual = extractMfsaFirm(entry.title, entry.body);
  if (!firmIndividual) {
    return null;
  }

  const textCorpus = `${entry.title} ${entry.body}`;

  return buildEuFineRecord({
    regulator: "MFSA",
    regulatorFullName: "Malta Financial Services Authority",
    countryCode: "MT",
    countryName: "Malta",
    firmIndividual,
    firmCategory: "Financial Entity",
    amount: parseMfsaAmount(textCorpus),
    currency: "EUR",
    dateIssued: parseMfsaActionDate(entry.body) || entry.publicationDate,
    breachType: entry.title,
    breachCategories: categorizeMfsaRecord(textCorpus),
    summary: normalizeWhitespace(entry.body).slice(0, 400),
    finalNoticeUrl: entry.detailUrl || MFSA_LIST_URL,
    sourceUrl: entry.detailUrl || MFSA_LIST_URL,
    rawPayload: entry,
  });
}

export async function loadMfsaLiveRecords() {
  const flags = getCliFlags();
  const currentEntries = await loadMfsaCurrentEntries(
    flags.limit && flags.limit > 0 ? flags.limit : null,
  );
  const currentRecords = await mapWithConcurrency(currentEntries, 2, enrichMfsaEntry);

  if (flags.limit && flags.limit > 0) {
    return currentRecords.filter((record) => record !== null);
  }

  const archiveEntries = await loadMfsaArchiveEntries();
  const archiveRecords = archiveEntries
    .map(buildMfsaArchiveRecord)
    .filter((record) => record !== null);

  const deduped = new Map<string, NonNullable<(typeof archiveRecords)[number]>>();
  for (const record of [...currentRecords, ...archiveRecords]) {
    if (!record) {
      continue;
    }

    const key = `${record.firm_individual}|${record.date_issued}|${record.breach_type}`;
    deduped.set(key, record);
  }

  return [...deduped.values()];
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
