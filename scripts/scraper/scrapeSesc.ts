import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const SESC_BASE_URL = "https://www.fsa.go.jp";
const SESC_MIN_YEAR = 2023;

const SESC_LIST_SOURCES = [
  {
    url: "https://www.fsa.go.jp/sesc/english/news/market_misconduct.html",
    category: "MARKET_MISCONDUCT",
  },
  {
    url: "https://www.fsa.go.jp/sesc/english/news/false_disclosure_statement.html",
    category: "FALSE_DISCLOSURE",
  },
  {
    url: "https://www.fsa.go.jp/sesc/english/news/financial_instruments.html",
    category: "FINANCIAL_INSTRUMENTS",
  },
] as const;

type SescCategory = (typeof SESC_LIST_SOURCES)[number]["category"];

export interface SescEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  category: SescCategory;
  listingUrl: string;
}

interface SescTopicsBlock {
  anchorId: string;
  dateIssued: string | null;
  title: string;
  detailUrl: string | null;
  summary: string;
}

interface SescDetail {
  title: string;
  dateIssued: string | null;
  summary: string;
}

export function parseSescListDate(input: string) {
  const cleaned = normalizeWhitespace(input)
    .replace(/\u00a0/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/:\s*$/, "")
    .replace(/\(\s*/g, "")
    .replace(/\s*\)\s*\.?$/, "")
    .trim();

  const match = cleaned.match(
    /([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})$/,
  );
  if (!match) {
    return null;
  }

  const monthMap: Record<string, string> = {
    January: "01",
    February: "02",
    March: "03",
    April: "04",
    May: "05",
    June: "06",
    July: "07",
    August: "08",
    September: "09",
    October: "10",
    November: "11",
    December: "12",
  };

  const month = monthMap[match[1]];
  if (!month) {
    return null;
  }

  return `${match[3]}-${month}-${match[2].padStart(2, "0")}`;
}

function stripSescTrailingDate(title: string) {
  return normalizeWhitespace(
    title.replace(/\(\s*[A-Z][a-z]+\s+\d{1,2},\s*\d{4}\s*\)\s*\.?$/, ""),
  );
}

function extractSescListItemsFromMain(
  $: cheerio.CheerioAPI,
  category: SescCategory,
  pageUrl: string,
) {
  const entries: SescEntry[] = [];

  $("#main h2")
    .filter((_, element) =>
      /Press Releases of\s+\d{4}/i.test(normalizeWhitespace($(element).text())),
    )
    .each((_, element) => {
      let cursor = $(element).next();
      while (cursor.length > 0 && cursor[0]?.tagName !== "ul") {
        cursor = cursor.next();
      }

      if (!cursor.length) {
        return;
      }

      cursor.find("> li > a[href]").each((__, anchor) => {
        const href = normalizeWhitespace($(anchor).attr("href") || "");
        const rawTitle = normalizeWhitespace($(anchor).text());
        const dateIssued = parseSescListDate(rawTitle);
        const title = stripSescTrailingDate(rawTitle);

        if (!href || !title || !dateIssued) {
          return;
        }

        if (Number.parseInt(dateIssued.slice(0, 4), 10) < SESC_MIN_YEAR) {
          return;
        }

        entries.push({
          title,
          detailUrl: makeAbsoluteUrl(SESC_BASE_URL, href),
          dateIssued,
          category,
          listingUrl: pageUrl,
        });
      });
    });

  return entries;
}

export function parseSescListPage(
  html: string,
  category: SescCategory,
  pageUrl: string,
) {
  const $ = cheerio.load(html);
  return extractSescListItemsFromMain($, category, pageUrl);
}

function extractTopicAnchors(
  $: cheerio.CheerioAPI,
  headerCell: cheerio.Cheerio<cheerio.Element>,
) {
  const anchors: Array<{ anchorId: string; dateIssued: string | null }> = [];
  let currentId: string | null = null;
  let buffer = "";

  const flush = () => {
    if (!currentId) {
      return;
    }
    anchors.push({
      anchorId: currentId,
      dateIssued: parseSescListDate(buffer),
    });
    buffer = "";
  };

  headerCell.contents().each((_, node) => {
    if (node.type === "tag" && node.tagName === "a") {
      const anchorId = normalizeWhitespace($(node).attr("id") || "");
      if (!anchorId) {
        return;
      }
      flush();
      currentId = anchorId;
      return;
    }

    if (node.type === "tag" && node.tagName === "br") {
      buffer += " ";
      return;
    }

    buffer += $(node).text();
  });

  flush();
  return anchors.filter((anchor) => anchor.dateIssued);
}

function extractTopicSections(
  tdHtml: string,
  pageUrl: string,
) {
  const matches = [
    ...tdHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
  ];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? tdHtml.length;
    const chunkHtml = tdHtml.slice(start, end);
    const $$ = cheerio.load(`<div>${chunkHtml}</div>`);
    const detailHref = normalizeWhitespace($$("a").first().attr("href") || "");
    const title = normalizeWhitespace($$("a").first().text());
    const text = normalizeWhitespace($$("div").text());
    const summary = normalizeWhitespace(
      text.replace(title, "").replace(/^<Summary>/i, ""),
    );

    return {
      title,
      detailUrl: detailHref ? makeAbsoluteUrl(pageUrl, detailHref) : null,
      summary,
    };
  });
}

export function parseSescTopicsPage(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const blocks = new Map<string, SescTopicsBlock>();

  $("#main table tr").each((_, row) => {
    const headerCell = $(row).find("th").first();
    const bodyCell = $(row).find("td").first();
    if (!headerCell.length || !bodyCell.length) {
      return;
    }

    const anchors = extractTopicAnchors($, headerCell);
    if (anchors.length === 0) {
      return;
    }

    const sections = extractTopicSections(bodyCell.html() || "", pageUrl);
    anchors.forEach((anchor, index) => {
      const section = sections[index];
      if (!section?.title) {
        return;
      }

      blocks.set(anchor.anchorId, {
        anchorId: anchor.anchorId,
        dateIssued: anchor.dateIssued,
        title: section.title,
        detailUrl: section.detailUrl,
        summary: section.summary,
      });
    });
  });

  return blocks;
}

export function parseSescDetailHtml(html: string, pageUrl: string): SescDetail {
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($("#main h1").first().text());
  const bodyText = normalizeWhitespace($("#main").text());
  const dateMatch = bodyText.match(
    /\b([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\b/,
  );

  return {
    title,
    dateIssued: dateMatch ? parseSescListDate(dateMatch[1]) : null,
    summary: normalizeWhitespace($("#main").text().replace(title, "")),
  };
}

export function parseSescAmount(text: string) {
  const normalized = normalizeWhitespace(text);
  const amounts = [
    ...normalized.matchAll(
      /administrative monetary penalty(?: payment order)?(?: applicable to [^.]{0,120}?)?(?: is| of)?\s*[¥]?\s*(\d[\d,]*)\s*yen/gi,
    ),
    ...normalized.matchAll(
      /penalty payment order of\s*[¥]?\s*(\d[\d,]*)\s*yen/gi,
    ),
    ...normalized.matchAll(
      /amount of the administrative monetary penalty[^.]{0,120}?\b(\d[\d,]*)\s*yen/gi,
    ),
  ]
    .map((match) => Number.parseInt((match[1] || "").replace(/,/g, ""), 10))
    .filter((value) => Number.isFinite(value));

  return amounts.length > 0 ? Math.max(...amounts) : null;
}

function cleanSescFirmCandidate(candidate: string) {
  return normalizeWhitespace(
    candidate
      .replace(/\s*\((?:“[^”]*”|"[^"]*"|'[^']*')\)\s*/g, " ")
      .replace(/^[Tt]he\s+/, "")
      .replace(
        /\s+and\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+other\s+(?:shares?|securities?)$/i,
        "",
      )
      .replace(/[,:;。]+$/, ""),
  );
}

function isGenericSescFirmCandidate(candidate: string) {
  const normalized = candidate.toLowerCase();
  return [
    "administrative monetary penalty payment order",
    "administrative monetary penalty payment orders",
    "administrative monetary penalty",
    "penalty payment order",
    "the employee",
    "employee",
    "the officer",
    "officer",
  ].includes(normalized)
    || /^(?:an?|the)\s+(?:employee|officer|suspect|individual)\b/.test(normalized)
    || /^(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+suspects?\b/.test(
      normalized,
    )
    || /^(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:corporation|individual)\b/.test(
      normalized,
    )
    || normalized.includes("suspect on suspicion")
    || normalized.includes("through market manipulation");
}

export function extractSescFirm(title: string, summary = "") {
  const normalizedTitle = normalizeWhitespace(title);
  const normalizedSummary = normalizeWhitespace(summary);
  const patterns = [
    /order against\s+(.+?)\s+for\b/i,
    /action based on findings of (?:the inspection of )?(.+?)(?:\.|$)/i,
    /by\s+(.+)$/i,
    /of shares of\s+(.+)$/i,
    /involving shares of\s+(.+)$/i,
    /for shares of\s+(.+?)(?:\s+by\b|$)/i,
    /in shares of\s+(.+?)(?:\s+by\b|$)/i,
    /related to .*?shares of\s+(.+?)(?:\s+by\b|$)/i,
    /(?:against|for)\s+(.+?)\s+for\b/i,
    /against\s+(.+?)(?:\.|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedTitle.match(pattern);
    if (match?.[1]) {
      const candidate = cleanSescFirmCandidate(match[1]);
      if (!isGenericSescFirmCandidate(candidate)) {
        return candidate;
      }
    }
  }

  const summaryPatterns = [
    /the suspected corporation,\s+(.+?)\s+\(hereinafter/i,
    /penalty payment order(?: be issued)?(?: of [¥\d, ]+yen)? against\s+(.+?)(?:\s+for\b|\.|$)/i,
    /(?:against|by)\s+(.+?)(?:\s+for|\s+in\b|\.|,|$)/i,
  ];

  for (const pattern of summaryPatterns) {
    const match = normalizedSummary.match(pattern);
    if (match?.[1]) {
      const candidate = cleanSescFirmCandidate(match[1]);
      if (!isGenericSescFirmCandidate(candidate)) {
        return candidate;
      }
    }
  }

  return normalizedTitle;
}

function extractSescBreachType(title: string, summary: string) {
  const corpus = `${title} ${summary}`.toLowerCase();

  if (corpus.includes("market manipulation")) return "Market manipulation";
  if (corpus.includes("insider trading")) return "Insider trading";
  if (corpus.includes("false statement") || corpus.includes("false disclosure")) {
    return "False disclosure";
  }
  if (corpus.includes("disciplinary action")) {
    return "Administrative disciplinary action";
  }
  if (corpus.includes("criminal charge")) return "Criminal charge";
  if (corpus.includes("court injunction") || corpus.includes("prohibition and stay order")) {
    return "Court injunction";
  }

  return "Enforcement action";
}

function categorizeSescRecord(title: string, summary: string, category: SescCategory) {
  const corpus = `${title} ${summary}`.toLowerCase();
  const categories = ["SUPERVISORY_SANCTION"];

  if (category === "MARKET_MISCONDUCT") categories.push("MARKET_MANIPULATION");
  if (corpus.includes("insider trading")) categories.push("INSIDER_TRADING");
  if (corpus.includes("false statement") || corpus.includes("false disclosure")) {
    categories.push("DISCLOSURE");
  }
  if (corpus.includes("criminal charge")) categories.push("CRIMINAL_ACTION");
  if (
    corpus.includes("court injunction")
    || corpus.includes("prohibition and stay order")
    || corpus.includes("petition")
  ) {
    categories.push("INJUNCTION");
  }
  if (corpus.includes("disciplinary action") || category === "FINANCIAL_INSTRUMENTS") {
    categories.push("GOVERNANCE");
  }
  if (corpus.includes("administrative monetary penalty")) {
    categories.push("MONETARY_PENALTY");
  }

  return [...new Set(categories)];
}

async function loadSescEntries(limit: number | null) {
  const allEntries = new Map<string, SescEntry>();

  for (const source of SESC_LIST_SOURCES) {
    const html = await fetchText(source.url);
    const entries = parseSescListPage(html, source.category, source.url);
    for (const entry of entries) {
      allEntries.set(entry.detailUrl, entry);
      if (limit && allEntries.size >= limit) {
        return [...allEntries.values()];
      }
    }
  }

  return [...allEntries.values()];
}

async function enrichSescEntry(
  entry: SescEntry,
  htmlCache: Map<string, Promise<string>>,
) {
  const getHtml = (url: string) => {
    let promise = htmlCache.get(url);
    if (!promise) {
      promise = fetchText(url);
      htmlCache.set(url, promise);
    }
    return promise;
  };

  let title = entry.title;
  let dateIssued = entry.dateIssued;
  let summary = entry.title;
  let sourceDetailUrl = entry.detailUrl;

  const [baseUrl, anchorId] = entry.detailUrl.split("#");
  const html = await getHtml(baseUrl);

  if (anchorId) {
    const topics = parseSescTopicsPage(html, baseUrl);
    const block = topics.get(anchorId);
    if (!block?.title) {
      return null;
    }
    title = block.title;
    dateIssued = block.dateIssued || dateIssued;
    summary = block.summary || title;
    sourceDetailUrl = block.detailUrl || entry.detailUrl;
  } else {
    const detail = parseSescDetailHtml(html, entry.detailUrl);
    title = detail.title || title;
    dateIssued = detail.dateIssued || dateIssued;
    summary = detail.summary || summary;
  }

  const firmIndividual = extractSescFirm(title, summary);
  const amount = parseSescAmount(`${title} ${summary}`);

  return buildEuFineRecord({
    regulator: "SESC",
    regulatorFullName: "Securities and Exchange Surveillance Commission",
    countryCode: "JP",
    countryName: "Japan",
    firmIndividual,
    firmCategory: "Target Entity or Individual",
    amount,
    currency: "JPY",
    dateIssued,
    breachType: extractSescBreachType(title, summary),
    breachCategories: categorizeSescRecord(title, summary, entry.category),
    summary,
    finalNoticeUrl: entry.detailUrl,
    sourceUrl: entry.listingUrl,
    dedupeKey: entry.detailUrl,
    rawPayload: {
      entry,
      resolvedDetailUrl: sourceDetailUrl,
      title,
      summary,
    },
  });
}

export async function loadSescLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadSescEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  const htmlCache = new Map<string, Promise<string>>();
  const records = await mapWithConcurrency(entries, 3, (entry) =>
    enrichSescEntry(entry, htmlCache),
  );
  return records.filter((record) => record !== null);
}

export async function main() {
  await runScraper({
    name: "🇯🇵 SESC Enforcement Actions Scraper",
    region: "APAC",
    liveLoader: loadSescLiveRecords,
    testLoader: loadSescLiveRecords,
    afterUpsert: async (sql, records) => {
      const keepHashes = new Set(records.map((record) => record.contentHash));
      const existing = await sql<{ id: string; content_hash: string }[]>`
        select id, content_hash
        from eu_fines
        where regulator = 'SESC'
      `;
      const staleIds = existing
        .filter((row) => !keepHashes.has(row.content_hash))
        .map((row) => row.id);

      if (staleIds.length > 0) {
        await sql`delete from eu_fines where id in ${sql(staleIds)}`;
        console.log(`🧹 Removed ${staleIds.length} stale SESC rows`);
      }
    },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ SESC scraper failed:", error);
    process.exit(1);
  });
}
