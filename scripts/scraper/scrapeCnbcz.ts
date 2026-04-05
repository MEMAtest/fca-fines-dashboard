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

const CNBCZ_BASE_URL = "https://www.cnb.cz";
const CNBCZ_LIST_PAGE_URL =
  "https://www.cnb.cz/cs/dohled-financni-trh/vykon-dohledu/pravomocna-rozhodnuti/pravomocna-rozhodnuti-cnb-v-rizenich-zahajenych-po-datu-1.1.2009/";
const CNBCZ_SANCTIONS_PROCEEDING_CODE = "400.410";
const DEFAULT_CNBCZ_PDF_ENRICH_LIMIT = 50;

interface CnbczPageConfig {
  ajaxUrl: string;
  contentPath: string;
  instanceId: string;
  elementId: string;
  sitePath: string;
  subsite: string;
  locale: string;
  detailPath: string;
  years: number[];
}

export interface CnbczListEntry {
  entityId: string;
  caseName: string;
  participants: string;
  finalDate: string;
  detailUrl: string;
  sourceUrl: string;
}

interface CnbczDetail {
  entityId: string;
  caseName: string;
  participants: string;
  dateIssued: string;
  finalDate: string | null;
  verdictText: string;
  pdfUrl: string | null;
}

function parseCnbczDate(input: string) {
  const cleaned = normalizeWhitespace(input);
  const match = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return null;
  }

  return toIsoDateFromParts(
    Number.parseInt(match[3], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[1], 10),
  );
}

export function parseCnbczConfig(html: string): CnbczPageConfig {
  const $ = cheerio.load(html);
  const listNode = $(".ap-list-entries").first();
  const rawListData = listNode.attr("data-list");
  const detailPath = normalizeWhitespace(
    $('input[name="detailUrl"]').attr("value") || "",
  );

  if (!rawListData || !detailPath) {
    throw new Error("Unable to locate CNBCZ dynamic list configuration.");
  }

  const listData = JSON.parse(rawListData) as {
    ajax: string;
    path: string;
    sitepath: string;
    subsite: string;
    locale: string;
  };

  const years = $('select[name="susr_year"] option')
    .map((_, element) => Number.parseInt(normalizeWhitespace($(element).text()), 10))
    .get()
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left);

  return {
    ajaxUrl: makeAbsoluteUrl(CNBCZ_BASE_URL, listData.ajax),
    contentPath: listData.path,
    instanceId: normalizeWhitespace(listNode.attr("id") || ""),
    elementId: normalizeWhitespace(listNode.attr("data-id") || ""),
    sitePath: listData.sitepath,
    subsite: listData.subsite,
    locale: listData.locale || "cs",
    detailPath,
    years,
  };
}

export function parseCnbczListHtml(html: string, sourceUrl: string, detailPath: string) {
  const $ = cheerio.load(html);
  const entries: CnbczListEntry[] = [];

  $(".list-entry").each((_, element) => {
    const table = $(element).find("table").first();
    const fieldMap = new Map<string, string>();
    let entityId = "";

    table.find("tr").each((_, rowElement) => {
      const cells = $(rowElement).find("td");
      if (cells.length < 2) {
        return;
      }

      const label = normalizeWhitespace($(cells[0]).text()).replace(/:$/, "");
      const valueCell = $(cells[1]);
      const value = normalizeWhitespace(valueCell.text());
      fieldMap.set(label, value);

      const href = normalizeWhitespace(valueCell.find("a").attr("href") || "");
      if (href.includes("entityId=")) {
        entityId = new URLSearchParams(href.split("?")[1] || "").get("entityId") || "";
      }
    });

    const finalDate = parseCnbczDate(fieldMap.get("Právní moc") || "");
    const caseName = normalizeWhitespace(fieldMap.get("Název spisu") || "");
    const participants = normalizeWhitespace(fieldMap.get("Účastníci řízení") || "");

    if (!entityId || !caseName || !finalDate) {
      return;
    }

    entries.push({
      entityId,
      caseName,
      participants,
      finalDate,
      detailUrl: `${makeAbsoluteUrl(CNBCZ_BASE_URL, detailPath)}?entityId=${encodeURIComponent(entityId)}`,
      sourceUrl,
    });
  });

  return entries;
}

export function parseCnbczDetailHtml(html: string) {
  const $ = cheerio.load(html);
  const fieldMap = new Map<string, string>();

  $(".dynapps-susr-detail-table tr").each((_, element) => {
    const cells = $(element).find("td");
    if (cells.length < 2) {
      return;
    }

    const label = normalizeWhitespace($(cells[0]).text()).replace(/:$/, "");
    const value = normalizeWhitespace($(cells[1]).text());
    fieldMap.set(label, value);
  });

  const entityId = normalizeWhitespace(fieldMap.get("Spisová značka") || "");
  const caseName = normalizeWhitespace(fieldMap.get("Název spisu") || "");
  const participants = normalizeWhitespace(fieldMap.get("Účastníci řízení") || "");
  const dateIssued = parseCnbczDate(fieldMap.get("Datum vydání rozhodnutí") || "");
  const finalDate = parseCnbczDate(
    fieldMap.get("Datum nabytí právní moci rozhodnutí") || "",
  );
  const pdfHref = normalizeWhitespace($('a[href$=".pdf"]').first().attr("href") || "");

  if (!entityId || !caseName || !dateIssued) {
    throw new Error("Unable to parse CNBCZ detail table.");
  }

  return {
    entityId,
    caseName,
    participants,
    dateIssued,
    finalDate,
    verdictText: normalizeWhitespace(
      fieldMap.get("Text výroku pravomocného rozhodnutí") || "",
    ),
    pdfUrl: pdfHref ? makeAbsoluteUrl(CNBCZ_BASE_URL, pdfHref) : null,
  } satisfies CnbczDetail;
}

export function extractCnbczFirm(input: string) {
  return normalizeWhitespace(input)
    .replace(/^\d+\s*[-–]\s*/, "")
    .replace(/\s*[,;]\s*I(?:Č|CO).*$/i, "")
    .replace(/\s*[,;]\s*ICO.*$/i, "")
    .trim();
}

function scaleCnbczAmount(rawAmount: string, scale?: string | null) {
  const digitsOnly = normalizeWhitespace(rawAmount).replace(/[^\d.,\s]/g, "");
  const compact = digitsOnly.replace(/\s+/g, "");
  const normalizedScale = (scale || "").toLowerCase();

  if (!compact) {
    return null;
  }

  const base = Number.parseFloat(compact.replace(/,/g, "."));
  if (!Number.isFinite(base)) {
    return null;
  }

  if (
    normalizedScale.startsWith("mld")
    || normalizedScale.includes("miliard")
  ) {
    return Math.round(base * 1_000_000_000);
  }

  if (
    normalizedScale.startsWith("mil")
    || normalizedScale.includes("milion")
  ) {
    return Math.round(base * 1_000_000);
  }

  if (
    normalizedScale.startsWith("tis")
    || normalizedScale.includes("tisíc")
    || normalizedScale.includes("tisic")
  ) {
    return Math.round(base * 1_000);
  }

  return Math.round(base);
}

export function parseCnbczAmount(text: string) {
  const normalized = normalizeWhitespace(text);
  const matches = [
    ...normalized.matchAll(
      /(?:pokuta|pen[ěe]žit[áa]\s+sankce|pen[ěe]žit[ýy]\s+trest)[^.]{0,40}?ve\s+v[ýy]ši\s+([\d\s.,]+)\s*(mld\.?|miliard(?:y|a|u)?|mil\.?|milion(?:y|u|ů)?|tis\.?|tis[íi]c(?:e|ů|u)?)?\s*(?:Kč|CZK)/giu,
    ),
  ];

  const amounts = matches
    .map((match) => scaleCnbczAmount(match[1] || "", match[2] || ""))
    .filter((amount): amount is number => amount !== null && amount > 0);

  return amounts.length > 0 ? Math.max(...amounts) : null;
}

export function buildCnbczAjaxUrl(
  config: CnbczPageConfig,
  year: number,
  page: number,
) {
  const params = new URLSearchParams({
    contentpath: config.contentPath,
    instanceId: config.instanceId,
    elementId: config.elementId,
    sitepath: config.sitePath,
    subsite: config.subsite,
    __locale: config.locale,
    loc: config.locale,
    option: "paginate",
  });

  return `${config.ajaxUrl}?${params.toString()}&reloaded&sort=asc&susr_year=${year}&susr_druh_rizeni=${CNBCZ_SANCTIONS_PROCEEDING_CODE}&page=${page}`;
}

export function extractCnbczMaxPage(html: string) {
  const matches = [...html.matchAll(/page=(\d+)/g)].map((match) =>
    Number.parseInt(match[1], 10)
  );
  return matches.length > 0 ? Math.max(...matches) : 1;
}

function getCnbczSinceYear() {
  const raw = Number.parseInt(process.env.CNBCZ_SINCE_YEAR || "", 10);
  return Number.isFinite(raw) ? raw : null;
}

function getCnbczPdfEnrichLimit() {
  const raw = Number.parseInt(process.env.CNBCZ_PDF_ENRICH_LIMIT || "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CNBCZ_PDF_ENRICH_LIMIT;
}

function categorizeCnbczRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (
    normalized.includes("praní")
    || normalized.includes("prani")
    || normalized.includes("money laundering")
    || normalized.includes("terorist")
  ) {
    categories.push("AML");
  }
  if (normalized.includes("spotřebitelsk") || normalized.includes("spotrebitelsk")) {
    categories.push("CONSUMER_CREDIT");
  }
  if (normalized.includes("poji") || normalized.includes("insurance")) {
    categories.push("INSURANCE");
  }
  if (normalized.includes("plateb") || normalized.includes("payment")) {
    categories.push("PAYMENTS");
  }
  if (
    normalized.includes("kapitálov")
    || normalized.includes("kapitalov")
    || normalized.includes("cenných papír")
    || normalized.includes("cennych papir")
  ) {
    categories.push("CAPITAL_MARKETS");
  }
  if (normalized.includes("bank")) {
    categories.push("BANKING");
  }

  return categories.length > 0 ? categories : ["SUPERVISORY_SANCTION"];
}

export async function loadCnbczEntries(limit: number | null) {
  const html = await fetchText(CNBCZ_LIST_PAGE_URL);
  const config = parseCnbczConfig(html);
  const entries = new Map<string, CnbczListEntry>();
  const sinceYear = getCnbczSinceYear();
  const years = sinceYear
    ? config.years.filter((year) => year >= sinceYear)
    : config.years;

  for (const year of years) {
    let page = 1;
    let maxPage = 1;

    while (page <= maxPage) {
      const pageUrl = buildCnbczAjaxUrl(config, year, page);
      const pageHtml = await fetchText(pageUrl);
      const pageEntries = parseCnbczListHtml(pageHtml, pageUrl, config.detailPath);

      for (const entry of pageEntries) {
        entries.set(entry.detailUrl, entry);
        if (limit && entries.size >= limit) {
          return [...entries.values()];
        }
      }

      maxPage = extractCnbczMaxPage(pageHtml);
      page += 1;
    }
  }

  return [...entries.values()];
}

async function enrichCnbczEntry(entry: CnbczListEntry, shouldExtractPdf: boolean) {
  const detailHtml = await fetchText(entry.detailUrl);
  const detail = parseCnbczDetailHtml(detailHtml);

  let pdfText = "";
  if (detail.pdfUrl && shouldExtractPdf) {
    try {
      pdfText = await extractPdfTextFromUrl(detail.pdfUrl);
    } catch {
      pdfText = "";
    }
  }

  const textCorpus = `${detail.caseName} ${detail.participants} ${detail.verdictText} ${pdfText}`;
  const amount =
    parseCnbczAmount(textCorpus)
    ?? parseLargestAmountFromText(textCorpus, {
      currency: "CZK",
      symbols: ["Kč", "CZK"],
      keywords: ["pokuta", "pokuty", "sankce", "penále", "penale"],
    });

  return buildEuFineRecord({
    regulator: "CNBCZ",
    regulatorFullName: "Czech National Bank",
    countryCode: "CZ",
    countryName: "Czech Republic",
    firmIndividual: extractCnbczFirm(detail.caseName || detail.participants),
    firmCategory: "Firm or Individual",
    amount,
    currency: "CZK",
    dateIssued: detail.dateIssued,
    breachType: detail.verdictText || detail.caseName,
    breachCategories: categorizeCnbczRecord(textCorpus),
    summary:
      detail.verdictText
      || `${detail.caseName}. Final administrative decision of the Czech National Bank.`,
    finalNoticeUrl: detail.pdfUrl,
    sourceUrl: entry.detailUrl,
    rawPayload: {
      entry,
      detail,
      pdfTextPreview: pdfText.slice(0, 500),
    },
  });
}

export async function loadCnbczLiveRecords() {
  const flags = getCliFlags();
  const entries = await loadCnbczEntries(flags.limit && flags.limit > 0 ? flags.limit : null);
  const pdfEnrichLimit = getCnbczPdfEnrichLimit();
  const sortedEntries = [...entries].sort((left, right) =>
    right.finalDate.localeCompare(left.finalDate),
  );

  return mapWithConcurrency(sortedEntries, 2, (entry, index) =>
    enrichCnbczEntry(entry, index < pdfEnrichLimit),
  );
}

export async function main() {
  await runScraper({
    name: "🇨🇿 Czech National Bank Final Decisions Scraper",
    liveLoader: loadCnbczLiveRecords,
    testLoader: loadCnbczLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CNBCZ scraper failed:", error);
    process.exit(1);
  });
}
