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
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const FINFSA_BASE_URL = "https://www.finanssivalvonta.fi";
const FINFSA_PRESS_RELEASES_URL =
  "https://www.finanssivalvonta.fi/en/publications-and-press-releases/Press-release/";
const FINFSA_START_YEAR = 2013;

export interface FinfsaArchiveEntry {
  title: string;
  detailUrl: string;
  dateIssued: string;
  keywords: string[];
}

interface FinfsaDetail {
  title: string;
  dateIssued: string | null;
  lead: string;
  body: string;
  pdfUrl: string | null;
  keywords: string[];
}

function stripFinfsaDecisionAppendixPrefix(title: string) {
  return normalizeWhitespace(
    title.replace(/^A Decision Appendix has been added:\s*/i, ""),
  );
}

function parseFinfsaDate(input: string) {
  return parseMonthNameDate(normalizeWhitespace(input));
}

function isFinfsaSanctionLike(title: string, keywords: string[]) {
  const corpus = `${title} ${keywords.join(" ")}`.toLowerCase();
  return /penalty payment|public warning|conditional fine|administrative fine|administrative sanction|sanction/.test(
    corpus,
  );
}

function isNonNominativeFinfsaEntity(entity: string) {
  const normalized = normalizeWhitespace(entity).toLowerCase();
  return /^(?:three natural persons|natural person|natural persons|unnamed persons?|persons?)$/.test(
    normalized,
  );
}

function cleanFinfsaEntitySegment(segment: string) {
  const normalized = normalizeWhitespace(segment)
    .replace(/^the\s+/i, "")
    .replace(/^former\s+.+?\s+board member\s+/i, "")
    .replace(/^a\s+joint\s+penalty\s+payment\s+for\s+several\s+omissions\s+on\s+/i, "")
    .replace(/^combined\s+penalty\s+payment\s+for\s+several\s+omissions\s+on\s+each\s+of\s+/i, "")
    .replace(/^penalty payment\s+on\s+/i, "")
    .replace(/^public warning\s+to\s+/i, "")
    .replace(/\s+(?:due to|because|against)\b.*$/i, "")
    .replace(/\s+for\s+(?:omissions?|failures?|breaches?|violation|late notification|non-compliance|shortcomings?)\b.*$/i, "")
    .replace(/\s+payable\b.*$/i, "")
    .replace(/[.;,:-]+$/g, "");

  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (
    isNonNominativeFinfsaEntity(normalized)
    || /^(?:a person closely associated with.+|persons discharging managerial responsibilities.*|former board member of listed company|former listed company|the company|the bank|the individuals in question|notify|interviews are coordinated by fin-fsa communications|omissions\b.+|control and supervise the amalgamation|requirements\b.+)$/i.test(
      normalized,
    )
    || !/[A-ZÅÄÖ]/.test(normalized)
    || lower === normalized
  ) {
    return null;
  }

  return normalized;
}

function finalizeFinfsaEntityList(candidate: string) {
  const normalized = normalizeWhitespace(candidate)
    .replace(
      /,\s+and\s+a\s+joint\s+penalty\s+payment\s+for\s+several\s+omissions\s+on\s+/ig,
      "; ",
    )
    .replace(
      /\s+and\s+a\s+joint\s+penalty\s+payment\s+for\s+several\s+omissions\s+on\s+/ig,
      "; ",
    )
    .replace(/\s+and\s+issued\s+a\s+public\s+warning\s+to\s+/ig, "; ")
    .replace(/\s+and\s+a\s+public\s+warning\s+on\s+/ig, "; ");

  const splitCandidates = normalized
    .split(/\s*;\s*|,\s+(?=[A-ZÅÄÖ])|\s+and\s+(?=[A-ZÅÄÖ])/)
    .map(cleanFinfsaEntitySegment)
    .filter((segment): segment is string => Boolean(segment));

  const deduped = [...new Set(splitCandidates)];
  return deduped.length > 0 ? deduped.join("; ") : null;
}

export function extractFinfsaFirm(title: string, body = "") {
  const normalizedTitle = stripFinfsaDecisionAppendixPrefix(title);
  const normalizedBody = normalizeWhitespace(body);

  const bodyPatterns = [
    /appeal by\s+(.+?)\s+against penalty payment imposed by FIN-FSA/i,
    /has ordered\s+(.+?)\s+to pay the supplementary amounts/i,
    /has imposed (?:a )?(?:combined )?penalty payment(?:s)?(?: for several omissions)? on each of\s+(.+?)(?:\.|\s+They\b)/i,
    /has imposed (?:a )?penalty payment on\s+(.+?),\s+and\s+a\s+joint\s+penalty\s+payment\s+for\s+several\s+omissions\s+on\s+(.+?)\./i,
    /has imposed (?:a )?(?:combined )?penalty payment(?: of [^.]+?)?\s+on\s+(.+?)(?:\.|\s+(?:because|due to|for)\b)/i,
    /has imposed on\s+(.+?)\s+a penalty payment(?: of [^.]+?)?(?:\.|\s+(?:because|due to|for)\b)/i,
    /has also imposed a public warning on\s+(.+?)(?:\.|\s+(?:because|due to|for)\b)/i,
    /has issued a public warning to\s+(.+?)(?:\.|\s+(?:because|due to|for)\b)/i,
  ];

  for (const pattern of bodyPatterns) {
    const match = normalizedBody.match(pattern);
    if (!match) {
      continue;
    }

    const finalized = finalizeFinfsaEntityList(match.slice(1).filter(Boolean).join("; "));
    if (finalized) {
      return finalized;
    }
  }

  const titlePatterns = [
    /helsinki administrative court rejects appeal by\s+(.+?)\s+against penalty payment imposed by FIN-FSA/i,
    /supplementary amounts of conditional fine imposed on\s+(.+?)\s+payable/i,
    /conditional fine imposed on\s+(.+?)\s+payable/i,
    /penalty payment imposed on\s+(.+?)(?:\s+(?:due to|for)\b|$)/i,
    /public warning imposed on\s+(.+?)(?:\s+(?:due to|for)\b|$)/i,
    /public warning to\s+(.+?)(?:\s+(?:due to|for)\b|$)/i,
    /public warning for\s+(.+?)(?:\s+(?:due to|for)\b|$)/i,
    /fin-fsa imposes a penalty payment(?: and a public warning)? on\s+(.+?)(?:\s+(?:due to|for)\b|$)/i,
    /(?:combined\s+)?penalty payment(?:s)?(?: imposed)?\s+of\s+(?:EUR|euro|€)?[\d\s,.]+(?:\s+and\s+public warning)?\s+(?:to|for)\s+(.+?)(?:\s+(?:due to|for|because)\b|$)/i,
    /administrative fine(?:s)?\s+of\s+(?:EUR|euro|€)?[\d\s,.]+\s+(?:to|for)\s+(.+?)(?:\s+(?:due to|for|because)\b|$)/i,
    /administrative fine\s+for\s+(.+?)(?:\s+(?:due to|for)\b|$)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = normalizedTitle.match(pattern);
    if (match?.[1]) {
      const finalized = finalizeFinfsaEntityList(match[1]);
      if (finalized) {
        return finalized;
      }
    }
  }

  return null;
}

export function parseFinfsaArchiveHtml(html: string) {
  const $ = cheerio.load(html);
  const entries = new Map<string, FinfsaArchiveEntry>();

  $("li").each((_, element) => {
    const item = $(element);
    const link = item
      .find('a[href*="/en/publications-and-press-releases/Press-release/"]')
      .first();
    const href = normalizeWhitespace(link.attr("href") || "");
    const title = stripFinfsaDecisionAppendixPrefix(link.text());
    const dateIssued = parseFinfsaDate(item.find("time.meta").first().text());
    const keywords = item
      .find(".page-list-block-time span")
      .map((__, keywordElement) => normalizeWhitespace($(keywordElement).text()))
      .get()
      .filter(Boolean);

    if (!href || !title || !dateIssued || !isFinfsaSanctionLike(title, keywords)) {
      return;
    }

    if (/decision appendix has been added/i.test(link.text())) {
      return;
    }

    const detailUrl = makeAbsoluteUrl(FINFSA_BASE_URL, href);
    entries.set(detailUrl, {
      title,
      detailUrl,
      dateIssued,
      keywords,
    });
  });

  return [...entries.values()];
}

export function parseFinfsaDetailHtml(html: string, detailUrl: string): FinfsaDetail {
  const $ = cheerio.load(html);
  const article = $("article.col-sm-12").first();
  const articleText = normalizeWhitespace(article.text());
  const dateMatch = articleText.match(/Press release\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  const pdfHref = normalizeWhitespace(article.find('a[href$=".pdf"]').first().attr("href") || "");
  const paragraphs = article
    .find("p")
    .map((_, paragraph) => normalizeWhitespace($(paragraph).text()))
    .get()
    .filter(Boolean);
  const keywords = article
    .find('footer a.tag')
    .map((_, keyword) => normalizeWhitespace($(keyword).text()))
    .get()
    .filter(Boolean);

  return {
    title: stripFinfsaDecisionAppendixPrefix(article.find("h1").first().text()),
    dateIssued: dateMatch ? parseFinfsaDate(dateMatch[1]) : null,
    lead: normalizeWhitespace(article.find("span.lead-text").first().text()),
    body: normalizeWhitespace(paragraphs.join(" ")),
    pdfUrl: pdfHref ? makeAbsoluteUrl(FINFSA_BASE_URL, pdfHref) : null,
    keywords,
  };
}

function categorizeFinfsaRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (
    normalized.includes("anti-money laundering")
    || normalized.includes("money laundering")
    || normalized.includes("terrorist financing")
    || normalized.includes("customer due diligence")
  ) {
    categories.push("AML");
  }
  if (
    normalized.includes("managers’ transactions")
    || normalized.includes("managers' transactions")
    || normalized.includes("notification obligation")
    || normalized.includes("reporting")
  ) {
    categories.push("DISCLOSURE");
  }
  if (normalized.includes("conditional fine")) {
    categories.push("ENFORCEMENT");
  }
  if (normalized.includes("public warning")) {
    categories.push("GOVERNANCE");
  }

  return categories.length > 0 ? categories : ["MARKETS_SUPERVISION"];
}

async function enrichFinfsaEntry(entry: FinfsaArchiveEntry) {
  const detailHtml = await fetchText(entry.detailUrl);
  const detail = parseFinfsaDetailHtml(detailHtml, entry.detailUrl);
  const textCorpus = `${entry.title} ${detail.lead} ${detail.body} ${detail.keywords.join(" ")}`;
  const firmIndividual = extractFinfsaFirm(entry.title, `${detail.lead} ${detail.body}`);

  if (!firmIndividual) {
    return null;
  }

  const amount = parseLargestAmountFromText(textCorpus, {
    currency: "EUR",
    symbols: ["€"],
    keywords: [
      "penalty payment",
      "public warning",
      "conditional fine",
      "administrative fine",
      "sanction",
    ],
  });

  return buildEuFineRecord({
    regulator: "FINFSA",
    regulatorFullName: "Finnish Financial Supervisory Authority",
    countryCode: "FI",
    countryName: "Finland",
    firmIndividual,
    firmCategory: "Firm or Individual",
    amount,
    currency: "EUR",
    dateIssued: detail.dateIssued || entry.dateIssued,
    breachType: detail.title || entry.title,
    breachCategories: categorizeFinfsaRecord(textCorpus),
    summary: detail.lead || detail.body || entry.title,
    finalNoticeUrl: detail.pdfUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      ...entry,
      detail,
    },
  });
}

export async function loadFinfsaLiveRecords() {
  const flags = getCliFlags();
  const currentYear = new Date().getUTCFullYear();
  const archiveEntries = new Map<string, FinfsaArchiveEntry>();

  for (let year = currentYear; year >= FINFSA_START_YEAR; year -= 1) {
    const yearUrl = `${FINFSA_PRESS_RELEASES_URL}${year}/`;
    const html = await fetchText(yearUrl);
    const entries = parseFinfsaArchiveHtml(html).sort((left, right) =>
      right.dateIssued.localeCompare(left.dateIssued),
    );

    for (const entry of entries) {
      archiveEntries.set(entry.detailUrl, entry);
      if (flags.limit && flags.limit > 0 && archiveEntries.size >= flags.limit) {
        break;
      }
    }

    if (flags.limit && flags.limit > 0 && archiveEntries.size >= flags.limit) {
      break;
    }
  }

  const records = await mapWithConcurrency(
    [...archiveEntries.values()],
    3,
    enrichFinfsaEntry,
  );

  return records.filter(
    (record): record is NonNullable<(typeof records)[number]> => record !== null,
  );
}

export async function main() {
  await runScraper({
    name: "🇫🇮 FIN-FSA Sanctions Press Release Scraper",
    liveLoader: loadFinfsaLiveRecords,
    testLoader: loadFinfsaLiveRecords,
    afterUpsert: async (sql, records) => {
      if (records.length === 0) {
        return;
      }

      const deletedDuplicates = await sql`
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY regulator, source_url
              ORDER BY created_at DESC, updated_at DESC NULLS LAST, id DESC
            ) AS row_number
          FROM eu_fines
          WHERE regulator = 'FINFSA'
            AND source_url IS NOT NULL
        )
        DELETE FROM eu_fines
        WHERE id IN (
          SELECT id
          FROM ranked
          WHERE row_number > 1
        )
        RETURNING id
      `;

      if (deletedDuplicates.length > 0) {
        console.log(
          `🧹 Removed ${deletedDuplicates.length} stale FIN-FSA duplicate rows`,
        );
      }
    },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ FIN-FSA scraper failed:", error);
    process.exit(1);
  });
}
