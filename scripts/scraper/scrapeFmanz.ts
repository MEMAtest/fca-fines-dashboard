import "dotenv/config";
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  getCliFlags,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseMonthNameDate,
  parseScaledAmount,
} from "./lib/euFineHelpers.js";
import {
  createFlareSolverrClient,
  flareSolverrEnabled,
  type FlareSolverrClient,
} from "./lib/flaresolverr.js";
import { runScraper } from "./lib/runScraper.js";

const FMANZ_BASE_URL = "https://www.fma.govt.nz";
// The final path segment is the official archive page-size selector. The
// legacy `/0/` route can return a partial/stale slice; requesting the bounded
// full archive prevents the latest-date regression seen in scheduled runs.
export const FMANZ_LIST_URL = "https://www.fma.govt.nz/about-us/enforcement/cases/0/299/";
const execFileAsync = promisify(execFile);

export interface FmanzListEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  intro: string;
}

interface FmanzListPage {
  entries: FmanzListEntry[];
  nextPageUrl: string | null;
}

interface FmanzDetail {
  title: string;
  dateIssued: string | null;
  summary: string;
  body: string;
  pdfUrl: string | null;
  canonicalUrl: string | null;
}

type FmanzHtmlLoader = (url: string) => Promise<string>;

export function isFmanzChallengeHtml(html: string) {
  return /<title[^>]*>\s*Just a moment|cf-chl-|challenge-platform|Enable JavaScript and cookies/i.test(
    html,
  );
}

function parseFmanzDate(input: string) {
  const cleaned = normalizeWhitespace(input)
    .replace(/^published\s+/i, "")
    .replace(/^updated\s+/i, "");
  return parseMonthNameDate(cleaned);
}

export function parseFmanzAmount(text: string) {
  const normalized = normalizeWhitespace(text);
  const explicitPenaltyPatterns = [
    /\bordered\s+[^.]{0,80}?\bto\s+pay\s+(?:a\s+)?(?:pecuniary\s+|civil\s+)?penalty\s+of\s+(?:NZD\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|m|k)?/i,
    /\bagreed\s+to\s+pay\s+(?:a\s+total\s+of\s+)?(?:NZD\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|m|k)?(?:\s+to\s+the\s+Crown)?\s+(?:in\s+lieu\s+of\s+)?(?:a\s+)?(?:pecuniary\s+|civil\s+)?penalty/i,
    /\bpay\s+(?:a\s+)?(?:NZD\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|m|k)?\s+(?:pecuniary\s+|civil\s+)?penalty/i,
    /\b(?:pecuniary\s+|civil\s+)?penalty\s+of\s+(?:NZD\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|m|k)?/i,
  ];

  for (const pattern of explicitPenaltyPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const amount = parseScaledAmount(match[1], match[2]);
      if (amount !== null) return amount;
    }
  }

  return null;
}

export function parseFmanzListingHtml(html: string, pageUrl: string): FmanzListPage {
  const $ = cheerio.load(html);
  const entries = new Map<string, FmanzListEntry>();

  $("li.search-results-semantic__result-item").each((_, element) => {
    const item = $(element);
    const link = item.find("h3 a[href]").first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const title = normalizeWhitespace(link.text());
    const intro = normalizeWhitespace(item.find("section p").first().text());
    const dateIssued = parseFmanzDate(
      item.find(".search-results-semantic__date").first().text(),
    );

    if (!href || !title || !dateIssued) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(pageUrl, href);
    entries.set(detailUrl, {
      title,
      detailUrl,
      dateIssued,
      intro,
    });
  });

  const nextHref = normalizeWhitespace(
    $("a.next.page-link[href]").first().attr("href") || "",
  );

  return {
    entries: [...entries.values()],
    nextPageUrl: nextHref ? makeAbsoluteUrl(pageUrl, nextHref) : null,
  };
}

export function parseFmanzDetailHtml(html: string, detailUrl: string): FmanzDetail {
  const $ = cheerio.load(html);
  const contentRoot = $(".registry-item-page__body-wrap-main--elemental").first();
  const summary =
    normalizeWhitespace(contentRoot.children("div, p").first().text()) ||
    normalizeWhitespace(contentRoot.find("p").first().text());
  const narrativeSegments = contentRoot
    .find("p, li")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean);
  const pdfHref = normalizeWhitespace(
    contentRoot.find('a[href$=".pdf"]').first().attr("href") || "",
  );
  const canonicalHref = normalizeWhitespace(
    $('link[rel="canonical"]').first().attr("href") || "",
  );

  return {
    title:
      normalizeWhitespace(
        $(".registry-item-page__heading-wrap--title-item").first().text(),
      ) || normalizeWhitespace($("h1").first().text()),
    dateIssued: parseFmanzDate(
      $(".registry-item-page__heading-wrap--date-published").first().text(),
    ),
    summary,
    body: normalizeWhitespace([summary, ...narrativeSegments].join(" ")),
    pdfUrl: pdfHref ? makeAbsoluteUrl(detailUrl, pdfHref) : null,
    canonicalUrl: canonicalHref ? makeAbsoluteUrl(detailUrl, canonicalHref) : null,
  };
}

function normalizeFmanzCaseUrl(url: string) {
  const parsed = new URL(url);
  if (
    parsed.origin !== FMANZ_BASE_URL ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    throw new Error(`FMANZ case URL is outside the official FMA origin: ${url}`);
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
  return `https://www.fma.govt.nz${normalizedPath}`;
}

function normalizeFmanzResponseUrl(url: string) {
  const parsed = new URL(url);
  if (
    parsed.origin !== FMANZ_BASE_URL ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return null;
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
  const normalizedQuery = [...parsed.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    )
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `https://www.fma.govt.nz${normalizedPath}${normalizedQuery ? `?${normalizedQuery}` : ""}`;
}

export function isSameFmanzResponseUrl(requestedUrl: string, responseUrl: string) {
  try {
    const requested = normalizeFmanzResponseUrl(requestedUrl);
    const response = normalizeFmanzResponseUrl(responseUrl);
    return requested !== null && response !== null && requested === response;
  } catch {
    return false;
  }
}

function normalizeFmanzIdentity(value: string) {
  return normalizeWhitespace(value).normalize("NFKC").toLocaleLowerCase("en-NZ");
}

function categorizeFmanzRecord(text: string) {
  const corpus = text.toLowerCase();
  const categories: string[] = [];

  if (/fair dealing|misleading|deceptive|representation/.test(corpus)) {
    categories.push("CONDUCT");
  }
  if (/disclosure|offer document|prospectus|continuous disclosure/.test(corpus)) {
    categories.push("DISCLOSURE");
  }
  if (/licence|licensing|fap licence|authorisation|registration/.test(corpus)) {
    categories.push("LICENSING");
  }
  if (/market manipulation|insider|market abuse|trading/.test(corpus)) {
    categories.push("MARKET_ABUSE");
  }
  if (/anti-money laundering|aml|terrorism financing|ctf/.test(corpus)) {
    categories.push("AML");
  }
  if (/governance|systems and processes|controls/.test(corpus)) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

export async function loadFmanzEntries(
  limit: number | null,
  loadHtml: FmanzHtmlLoader = requestFmanzHtml,
) {
  const entries = new Map<string, FmanzListEntry>();
  const visited = new Set<string>();
  let nextPageUrl: string | null = FMANZ_LIST_URL;

  while (nextPageUrl) {
    if (visited.has(nextPageUrl)) {
      throw new Error(`FMANZ archive pagination repeated a page URL: ${nextPageUrl}`);
    }
    visited.add(nextPageUrl);

    const html = await loadHtml(nextPageUrl);
    if (isFmanzChallengeHtml(html)) {
      throw new Error(
        `FMANZ official source returned a Cloudflare challenge for ${nextPageUrl}`,
      );
    }
    const page = parseFmanzListingHtml(html, nextPageUrl);

    // A successful HTTP response is not evidence that the archive was parsed.
    // In particular, a changed listing template (or a challenge/error document)
    // must not be reported as a successful zero/partial refresh.
    if (page.entries.length === 0) {
      throw new Error(
        `FMANZ enforcement archive page returned no parseable dated cases: ${nextPageUrl}`,
      );
    }

    for (const entry of page.entries) {
      entries.set(entry.detailUrl, entry);
      if (limit && entries.size >= limit) {
        return [...entries.values()];
      }
    }

    nextPageUrl = page.nextPageUrl;
  }

  return [...entries.values()];
}

export async function enrichFmanzEntriesSequentially(
  entries: FmanzListEntry[],
  loadHtml: FmanzHtmlLoader,
) {
  const records = [];
  for (const entry of entries) {
    records.push(await enrichFmanzEntry(entry, loadHtml));
  }
  return records.filter((record) => record !== null);
}

async function enrichFmanzEntry(
  entry: FmanzListEntry,
  loadHtml: FmanzHtmlLoader = requestFmanzHtml,
) {
  const detailHtml = await loadHtml(entry.detailUrl);
  if (isFmanzChallengeHtml(detailHtml)) {
    throw new Error(`FMANZ detail page returned a Cloudflare challenge: ${entry.detailUrl}`);
  }
  const detail = parseFmanzDetailHtml(detailHtml, entry.detailUrl);
  if (!detail.title || !detail.body) {
    throw new Error(`FMANZ detail page has no usable title or body: ${entry.detailUrl}`);
  }
  if (normalizeFmanzIdentity(detail.title) !== normalizeFmanzIdentity(entry.title)) {
    throw new Error(
      `FMANZ detail title does not match requested archive case: ${entry.detailUrl} (listing: ${entry.title}; detail: ${detail.title})`,
    );
  }
  if (!detail.dateIssued) {
    throw new Error(
      `FMANZ detail page has no parseable publication date: ${entry.detailUrl}`,
    );
  }
  if (detail.dateIssued && entry.dateIssued && detail.dateIssued !== entry.dateIssued) {
    throw new Error(
      `FMANZ archive and detail publication dates disagree: ${entry.detailUrl} (listing: ${entry.dateIssued}; detail: ${detail.dateIssued})`,
    );
  }
  if (
    detail.canonicalUrl &&
    normalizeFmanzCaseUrl(detail.canonicalUrl) !== normalizeFmanzCaseUrl(entry.detailUrl)
  ) {
    throw new Error(
      `FMANZ detail canonical URL does not match requested case: ${entry.detailUrl} -> ${detail.canonicalUrl}`,
    );
  }
  const textCorpus = `${entry.title} ${entry.intro} ${detail.summary} ${detail.body}`;

  return buildEuFineRecord({
    regulator: "FMANZ",
    regulatorFullName: "Financial Markets Authority",
    countryCode: "NZ",
    countryName: "New Zealand",
    firmIndividual: detail.title || entry.title,
    firmCategory: "Financial Entity",
    amount: parseFmanzAmount(textCorpus),
    currency: "NZD",
    dateIssued: detail.dateIssued,
    breachType: entry.intro || detail.summary || detail.title,
    breachCategories: categorizeFmanzRecord(textCorpus),
    summary: detail.summary || entry.intro || detail.title,
    finalNoticeUrl: detail.pdfUrl || entry.detailUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
    },
  });
}

export async function loadFmanzLiveRecords() {
  const flags = getCliFlags();
  const flareSolverr = { current: null as FlareSolverrClient | null };

  const loadOfficialHtml: FmanzHtmlLoader = async (url) => {
    try {
      const directHtml = await requestFmanzHtml(url);
      if (!isFmanzChallengeHtml(directHtml)) {
        return directHtml;
      }
    } catch (error) {
      if (!flareSolverrEnabled()) {
        throw error;
      }
    }

    if (!flareSolverrEnabled()) {
      throw new Error(
        `FMANZ official source returned a Cloudflare challenge for ${url}; FLARESOLVERR_URL is not configured`,
      );
    }

    flareSolverr.current ??= await createFlareSolverrClient({
      maxTimeoutMs: 120_000,
      responseURLValidator: isSameFmanzResponseUrl,
    });
    const solvedHtml = await flareSolverr.current.get(url);
    if (isFmanzChallengeHtml(solvedHtml)) {
      throw new Error(`FlareSolverr did not clear the FMANZ challenge for ${url}`);
    }
    return solvedHtml;
  };

  try {
    const entries = await loadFmanzEntries(
      flags.limit && flags.limit > 0 ? flags.limit : null,
      loadOfficialHtml,
    );
    // FlareSolverr's persistent session is a single browser context. Concurrent
    // request.get calls can navigate that context over one another and pair one
    // case URL with another case's HTML. Keep both the direct probe and any
    // challenge fallback for each detail page in a deterministic sequence.
    return enrichFmanzEntriesSequentially(entries, loadOfficialHtml);
  } finally {
    await flareSolverr.current?.destroy();
  }
}

async function requestFmanzHtml(url: string) {
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

export async function main() {
  await runScraper({
    name: "🇳🇿 FMA New Zealand Enforcement Cases Scraper",
    liveLoader: loadFmanzLiveRecords,
    testLoader: loadFmanzLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FMANZ scraper failed:", error);
    process.exit(1);
  });
}
