import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  extractPdfTextFromUrl,
  fetchText,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
  toIsoDateFromParts,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FTNO_BASE_URL = "https://www.finanstilsynet.no";
const FTNO_SOURCE_PAGES = [
  {
    listUrl:
      "https://www.finanstilsynet.no/tilsyn/markedsatferd/vedtak-om-overtredelsesgebyr---flaggeplikt/",
    topic: "flagging",
  },
  {
    listUrl:
      "https://www.finanstilsynet.no/tilsyn/markedsatferd/vedtak-om-overtredelsesgebyr--markedsmisbruk/",
    topic: "market-abuse",
  },
  {
    listUrl:
      "https://www.finanstilsynet.no/tilsyn/markedsatferd/vedtak-om-overtredelsesgebyr---meldeplikt/",
    topic: "notification",
  },
  {
    listUrl:
      "https://www.finanstilsynet.no/en/supervision/market-conduct/decision-regarding-violation-penalty---short-selling/",
    topic: "short-selling",
  },
] as const;

export interface FtnoEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  topic: (typeof FTNO_SOURCE_PAGES)[number]["topic"];
}

interface FtnoDetail {
  title: string;
  pdfUrl: string | null;
  body: string;
}

export function parseFtnoDate(input: string) {
  const cleaned = normalizeWhitespace(input);
  const match = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
  if (!match) {
    return null;
  }

  const year =
    match[3].length === 2 ? 2000 + Number.parseInt(match[3], 10) : Number.parseInt(match[3], 10);
  return toIsoDateFromParts(year, Number.parseInt(match[2], 10), Number.parseInt(match[1], 10));
}

export function parseFtnoListingHtml(
  html: string,
  listUrl: string,
  topic: FtnoEntry["topic"],
) {
  const $ = cheerio.load(html);
  const entries = new Map<string, FtnoEntry>();

  $("a[href]").each((_, element) => {
    const text = normalizeWhitespace($(element).text());
    const href = normalizeWhitespace($(element).attr("href") || "");
    const match = text.match(/^(\d{2}\.\d{2}\.\d{2,4}):\s+(.+)$/);

    if (!match || !href) {
      return;
    }

    const dateIssued = parseFtnoDate(match[1]);
    if (!dateIssued) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(FTNO_BASE_URL, href);
    entries.set(detailUrl, {
      title: normalizeWhitespace(match[2]),
      detailUrl,
      dateIssued,
      topic,
    });
  });

  return [...entries.values()];
}

export function extractFtnoFirm(title: string, text = "") {
  const normalizedTitle = normalizeWhitespace(title);
  const titleMatch = normalizedTitle.match(/-\s+(.+)$/);
  if (titleMatch?.[1]) {
    return normalizeWhitespace(titleMatch[1]);
  }

  const normalizedText = normalizeWhitespace(text);
  const patterns = [
    /impose a violation penalty on ([A-ZÆØÅ][^,.]{2,}?)(?:[,.]| pursuant)/i,
    /has concluded that ([A-ZÆØÅ][^,.]{2,}?) has breached/i,
    /har konkludert med at ([A-ZÆØÅ][^,.]{2,}?) har brutt/i,
    /decision on violation penalty - ([A-ZÆØÅ][^,.]{2,})/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeWhitespace(match[1]).replace(/\s+\(pdf\)$/i, "");
      if (/^natural persons?\b/i.test(candidate)) {
        return null;
      }
      return candidate;
    }
  }

  return null;
}

export function parseFtnoDetailHtml(html: string) {
  const $ = cheerio.load(html);
  const pdfHref = normalizeWhitespace(
    $('a[href$=".pdf"]').first().attr("href") || "",
  );
  const bodyRoot = $("#articleMainBody");
  const scopedParagraphText = (selectors: string) =>
    $(selectors)
      .map((_, element) => normalizeWhitespace($(element).text()))
      .get()
      .filter((text) => text.length > 20)
      .join(" ");
  const paragraphText =
    (bodyRoot.length > 0 ? scopedParagraphText("#articleMainBody p, #articleMainBody li") : "")
    || scopedParagraphText("main p, main li, article p, article li, .article p, .article li, .rich-text p, .rich-text li")
    || scopedParagraphText("p");
  const cleanedBody = normalizeWhitespace(
    paragraphText
      .replace(/Jump to main content/gi, "")
      .replace(/Go to search page/gi, "")
      .replace(/To the top of the page/gi, "")
      .replace(/document\.addEventListener[\s\S]*$/i, "")
      .replace(/ReactDOMClient\.createRoot[\s\S]*$/i, "")
      .replace(/Om tilsynsrapporter og vedtak[\s\S]*$/i, ""),
  );

  return {
    title: normalizeWhitespace($("h1").first().text()),
    pdfUrl: pdfHref ? makeAbsoluteUrl(FTNO_BASE_URL, pdfHref) : null,
    body: cleanedBody,
  } satisfies FtnoDetail;
}

function categorizeFtnoRecord(topic: FtnoEntry["topic"], text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (topic === "flagging" || normalized.includes("flaggeplikt")) {
    categories.push("DISCLOSURE");
  }
  if (
    topic === "market-abuse"
    || normalized.includes("markedsmanipulasjon")
    || normalized.includes("market manipulation")
  ) {
    categories.push("MARKET_MANIPULATION");
  }
  if (
    topic === "notification"
    || normalized.includes("meldeplikt")
    || normalized.includes("notification obligation")
  ) {
    categories.push("REPORTING");
  }
  if (
    topic === "short-selling"
    || normalized.includes("short selling")
    || normalized.includes("shortsalg")
  ) {
    categories.push("SHORT_SELLING");
  }

  return categories.length > 0 ? categories : ["MARKET_CONDUCT"];
}

export async function loadFtnoEntries(limit: number | null) {
  const entries = new Map<string, FtnoEntry>();

  for (const source of FTNO_SOURCE_PAGES) {
    const html = await fetchText(source.listUrl);
    for (const entry of parseFtnoListingHtml(html, source.listUrl, source.topic)) {
      entries.set(entry.detailUrl, entry);
      if (limit && entries.size >= limit) {
        return [...entries.values()];
      }
    }
  }

  return [...entries.values()];
}

async function enrichFtnoEntry(entry: FtnoEntry) {
  const detailHtml = await fetchText(entry.detailUrl);
  const detail = parseFtnoDetailHtml(detailHtml);

  let pdfText = "";
  if (detail.pdfUrl) {
    try {
      pdfText = await extractPdfTextFromUrl(detail.pdfUrl);
    } catch {
      pdfText = "";
    }
  }

  const textCorpus = `${entry.title} ${detail.title} ${detail.body} ${pdfText}`;
  const firmIndividual = extractFtnoFirm(entry.title, `${detail.body} ${pdfText}`);
  if (!firmIndividual) {
    return null;
  }

  const amount = parseLargestAmountFromText(textCorpus, {
    currency: "NOK",
    keywords: [
      "overtredelsesgebyr",
      "violation penalty",
      "administrative pecuniary sanction",
      "penalty",
    ],
  });

  return buildEuFineRecord({
    regulator: "FTNO",
    regulatorFullName: "Financial Supervisory Authority of Norway",
    countryCode: "NO",
    countryName: "Norway",
    firmIndividual,
    firmCategory: "Firm or Individual",
    amount,
    currency: "NOK",
    dateIssued: entry.dateIssued,
    breachType: detail.title || entry.title,
    breachCategories: categorizeFtnoRecord(entry.topic, textCorpus),
    summary: detail.body || detail.title || entry.title,
    finalNoticeUrl: detail.pdfUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
      pdfTextPreview: pdfText.slice(0, 500),
    },
  });
}

export async function loadFtnoLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadFtnoEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  const records = await mapWithConcurrency(entries, 2, enrichFtnoEntry);
  return records.filter((record) => record !== null);
}

export async function main() {
  await runScraper({
    name: "🇳🇴 Finanstilsynet Norway Market-Conduct Scraper",
    liveLoader: loadFtnoLiveRecords,
    testLoader: loadFtnoLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FTNO scraper failed:", error);
    process.exit(1);
  });
}
