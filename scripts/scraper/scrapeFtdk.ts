import "dotenv/config";
import * as cheerio from "cheerio";
import { request as httpsRequest } from "node:https";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FTDK_BASE_URL = "https://www.finanstilsynet.dk";
const FTDK_FINE_FILTER_DATA =
  "W3sicXVlcnkiOiIiLCJtb250aHMiOltdLCJjYXRlZ29yaXphdGlvbnMiOlsiMWQ2Yzg3MTctOTczZS00N2FlLWEyM2EtNDM0YjAwOTM1MjM1Il0sImFkZGl0aW9uYWxGaWx0ZXJzIjp7fSwidGVtcGxhdGUiOiJBbGwiLCJzb3J0QnkiOiJkYXRlIiwicGFnZSI6MSwibW9kdWxlSWQiOiJuYV9hOWI5OGIyMS03NWYxLTRlMGUtOWViYy00MTYxYmEwNWQ3YTkifV0=";
const FTDK_FINE_PAGE_URL = `${FTDK_BASE_URL}/tilsyn/inspektion-og-afgoerelser?categorizations=8156&data=${encodeURIComponent(FTDK_FINE_FILTER_DATA)}`;
const FTDK_PAGE_SIZE = 10;

interface FtdkDynamicListConfig {
  options?: {
    endpoint?: string;
  };
}

interface FtdkSearchResponse {
  pageHtml: string;
  totalResultCount?: {
    All?: number;
  };
}

export interface FtdkEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  intro: string;
}

interface FtdkDetail {
  title: string;
  summary: string;
  narrative: string;
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#xA;/g, "\n")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

async function requestFtdkText(
  url: string,
  options: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  const target = new URL(url);

  return await new Promise<string>((resolve, reject) => {
    const req = httpsRequest(
      target,
      {
        method: options.method || "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)",
          "Accept-Language": "en-GB,en;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...options.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const status = response.statusCode || 0;
          const text = Buffer.concat(chunks).toString("utf8");

          if (status >= 200 && status < 300) {
            resolve(text);
            return;
          }

          reject(new Error(`Finanstilsynet request failed with status ${status}: ${text.slice(0, 200)}`));
        });
      },
    );

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

function getFtdkUserInput() {
  return JSON.parse(Buffer.from(FTDK_FINE_FILTER_DATA, "base64").toString("utf8"))[0] as {
    query: string;
    months: string[];
    categorizations: string[];
    additionalFilters: Record<string, string[]>;
    template: string;
    sortBy: string;
    page: number;
    moduleId: string;
  };
}

export function parseFtdkListConfig(html: string) {
  const match = html.match(/dynamic-list[^>]*data-config=\"([^\"]+)\"/);
  if (!match?.[1]) {
    throw new Error("Could not locate Finanstilsynet Denmark dynamic-list config.");
  }

  return JSON.parse(decodeHtmlAttribute(match[1])) as FtdkDynamicListConfig;
}

export async function fetchFtdkSearchPage(
  config: FtdkDynamicListConfig,
  page: number,
) {
  const endpoint = config.options?.endpoint || "search";
  const payload = JSON.stringify({
    config,
    page,
    userInput: { ...getFtdkUserInput(), page },
    lastGroupName: "",
    rootFolders: null,
  });
  const responseText = await requestFtdkText(`${FTDK_BASE_URL}/gbapi/${endpoint}/getPage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)),
      Referer: FTDK_FINE_PAGE_URL,
      gp_currentpage: FTDK_FINE_PAGE_URL,
      Accept: "application/json, text/plain, */*",
    },
    body: payload,
  });

  return JSON.parse(responseText) as FtdkSearchResponse;
}

export function parseFtdkListHtml(html: string) {
  const $ = cheerio.load(html);
  const entries = new Map<string, FtdkEntry>();

  $(".item[data-url]").each((_, element) => {
    const item = $(element);
    const detailUrl = makeAbsoluteUrl(
      FTDK_BASE_URL,
      normalizeWhitespace(item.attr("data-url") || item.find("h2 a").attr("href") || ""),
    );
    const title = normalizeWhitespace(item.find("h2 a").text());
    const dateIssued = normalizeWhitespace(item.find(".datetime").attr("data-date") || "").slice(0, 10);
    const intro = normalizeWhitespace(
      item
        .find(".text > p")
        .not(".pre-heading")
        .map((_, paragraph) => $(paragraph).text())
        .get()
        .join(" "),
    );

    if (!detailUrl || !title || !dateIssued) {
      return;
    }

    entries.set(detailUrl, {
      title,
      detailUrl,
      dateIssued,
      intro,
    });
  });

  return [...entries.values()];
}

export function extractFtdkFirm(title: string, text = "") {
  const normalizeCandidate = (value: string | null | undefined) => {
    const candidate = normalizeWhitespace(value || "");
    if (!candidate) {
      return null;
    }

    if (
      /^(tiltalte|domstolen|sagen|finanstilsynet|anklagemyndigheden)$/i.test(candidate)
    ) {
      return null;
    }

    return candidate;
  };
  const normalizedTitle = normalizeWhitespace(title);
  const titlePatterns = [
    /^Administrativt bødeforelæg til (.+?) for overtrædelse/i,
    /^Bøde til (.+?) for/i,
    /^Dom i sag om .*? - (.+)$/i,
  ];

  for (const pattern of titlePatterns) {
    const match = normalizedTitle.match(pattern);
    if (match?.[1]) {
      return normalizeCandidate(match[1]);
    }
  }

  const normalizedText = normalizeWhitespace(text);
  const textPatterns = [
    /^([A-ZÆØÅ0-9][^,.]{2,}?) har den \d{1,2}\. [A-Za-zæøå]+ \d{4} vedtaget/i,
    /^([A-ZÆØÅ0-9][^,.]{2,}?) har vedtaget/i,
    /Finanstilsynet politianmeldte den \d{1,2}\. [A-Za-zæøå]+ \d{4} ([A-ZÆØÅ0-9][^,.]{2,}?)(?: for|,|\.|$)/i,
    /sagen mod ([A-ZÆØÅ0-9][^,.]{2,}?)(?: for|,|\.|$)/i,
    /([A-ZÆØÅ0-9][^,.]{2,}?) blev idømt/i,
  ];

  for (const pattern of textPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      return normalizeCandidate(match[1]);
    }
  }

  return null;
}

export function parseFtdkDetailHtml(html: string) {
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($("h1").first().text());
  const summary = normalizeWhitespace($('meta[name="description"]').attr("content") || "");

  const narrative = $(".news-page .rich-text")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter((text) => {
      if (!text || text.length < 40) {
        return false;
      }

      if (
        text.startsWith("Risikobillede")
        || text.startsWith("Læs ")
        || text.includes("Strandgade 29")
      ) {
        return false;
      }

      return true;
    })
    .join("\n\n");

  return {
    title,
    summary,
    narrative,
  } satisfies FtdkDetail;
}

function categorizeFtdkRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (
    normalized.includes("hvidvask")
    || normalized.includes("aml")
    || normalized.includes("anti-money laundering")
  ) {
    categories.push("AML");
  }
  if (
    normalized.includes("markedsmanipulation")
    || normalized.includes("market manipulation")
    || normalized.includes("market abuse")
  ) {
    categories.push("MARKET_MANIPULATION");
  }
  if (
    normalized.includes("transaktionsindberet")
    || normalized.includes("transaction reporting")
  ) {
    categories.push("REPORTING");
  }
  if (
    normalized.includes("kontroller")
    || normalized.includes("internal control")
    || normalized.includes("kundekendskabsprocedure")
  ) {
    categories.push("CONTROLS");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

export async function loadFtdkEntries(limit: number | null) {
  const listPageHtml = await requestFtdkText(FTDK_FINE_PAGE_URL);
  const config = parseFtdkListConfig(listPageHtml);
  const firstPage = await fetchFtdkSearchPage(config, 1);
  const totalCount = firstPage.totalResultCount?.All ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / FTDK_PAGE_SIZE));
  const entries = new Map<string, FtdkEntry>();

  for (const entry of parseFtdkListHtml(firstPage.pageHtml)) {
    entries.set(entry.detailUrl, entry);
    if (limit && entries.size >= limit) {
      return [...entries.values()];
    }
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const response = await fetchFtdkSearchPage(config, page);
    const pageEntries = parseFtdkListHtml(response.pageHtml);

    if (pageEntries.length === 0) {
      break;
    }

    for (const entry of pageEntries) {
      entries.set(entry.detailUrl, entry);
      if (limit && entries.size >= limit) {
        return [...entries.values()];
      }
    }
  }

  return [...entries.values()];
}

async function enrichFtdkEntry(entry: FtdkEntry) {
  const detailHtml = await requestFtdkText(entry.detailUrl);
  const detail = parseFtdkDetailHtml(detailHtml);
  const textCorpus = `${entry.title} ${entry.intro} ${detail.summary} ${detail.narrative}`;
  const firmIndividual = extractFtdkFirm(entry.title, `${entry.intro} ${detail.summary} ${detail.narrative}`);

  if (!firmIndividual) {
    return null;
  }

  const amount = parseLargestAmountFromText(textCorpus, {
    currency: "DKK",
    keywords: [
      "bødeforelæg",
      "bøde",
      "idømt",
      "penalty",
      "fine",
    ],
  });

  return buildEuFineRecord({
    regulator: "FTDK",
    regulatorFullName: "Danish Financial Supervisory Authority",
    countryCode: "DK",
    countryName: "Denmark",
    firmIndividual,
    firmCategory: "Firm or Individual",
    amount,
    currency: "DKK",
    dateIssued: entry.dateIssued,
    breachType: detail.title || entry.title,
    breachCategories: categorizeFtdkRecord(textCorpus),
    summary: detail.summary || entry.intro || detail.narrative || entry.title,
    finalNoticeUrl: entry.detailUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
    },
  });
}

export async function loadFtdkLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadFtdkEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  const records = await mapWithConcurrency(entries, 2, enrichFtdkEntry);
  return records.filter((record) => record !== null);
}

export async function main() {
  await runScraper({
    name: "🇩🇰 Finanstilsynet Denmark Judgments and Fines Scraper",
    liveLoader: loadFtdkLiveRecords,
    testLoader: loadFtdkLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ Finanstilsynet Denmark scraper failed:", error);
    process.exit(1);
  });
}
