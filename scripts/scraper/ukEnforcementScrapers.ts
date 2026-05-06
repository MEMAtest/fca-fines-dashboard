import * as cheerio from "cheerio";
import type { UKEnforcementDomain } from "../../src/data/ukEnforcement.js";
import {
  fetchText,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseMonthNameDate,
  parsePlainAmount,
} from "./lib/euFineHelpers.js";
import type { UKEnforcementSeedRecord } from "./data/ukEnforcementSeed.js";

const GBP = "GBP";

const SOURCE_URLS = {
  praEnforcement:
    "https://www.bankofengland.co.uk/prudential-regulation/the-bank-of-england-enforcement",
  praNewsApi: "https://www.bankofengland.co.uk/_api/News/RefreshPagedNewsList",
  praNews: "https://www.bankofengland.co.uk/news/news",
  psrCases:
    "https://www.psr.org.uk/information-for-firms/enforcement/enforcement-cases/",
  ofsiCollection:
    "https://www.gov.uk/government/collections/enforcement-of-financial-sanctions",
  icoSearch: "https://ico.org.uk/api/search",
  cmaSearch: "https://www.gov.uk/api/search.json",
  frcCases: "https://www.frc.org.uk/library/enforcement/enforcement-cases/",
  tprPenaltyNotices:
    "https://www.thepensionsregulator.gov.uk/en/document-library/enforcement-activity/penalty-notices",
};

const REGULATORS = {
  PRA: {
    regulator: "PRA",
    regulatorFullName: "Prudential Regulation Authority",
    sourceDomain: "prudential" as UKEnforcementDomain,
  },
  PSR: {
    regulator: "PSR",
    regulatorFullName: "Payment Systems Regulator",
    sourceDomain: "payments" as UKEnforcementDomain,
  },
  OFSI: {
    regulator: "OFSI",
    regulatorFullName: "Office of Financial Sanctions Implementation",
    sourceDomain: "sanctions" as UKEnforcementDomain,
  },
  ICO: {
    regulator: "ICO",
    regulatorFullName: "Information Commissioner's Office",
    sourceDomain: "data_protection" as UKEnforcementDomain,
  },
  CMA: {
    regulator: "CMA",
    regulatorFullName: "Competition and Markets Authority",
    sourceDomain: "competition_consumer" as UKEnforcementDomain,
  },
  FRC: {
    regulator: "FRC",
    regulatorFullName: "Financial Reporting Council",
    sourceDomain: "audit_reporting" as UKEnforcementDomain,
  },
  TPR: {
    regulator: "TPR",
    regulatorFullName: "The Pensions Regulator",
    sourceDomain: "pensions" as UKEnforcementDomain,
  },
};

interface PartialUKEnforcementRecord {
  regulator: string;
  regulatorFullName: string;
  sourceDomain: UKEnforcementDomain;
  firmIndividual: string;
  firmCategory?: string | null;
  amount?: number | null;
  currency?: string;
  dateIssued: string;
  breachType: string;
  breachCategories?: string[];
  summary: string;
  noticeUrl: string;
  sourceUrl: string;
  sourceWindowNote: string;
  aliases?: string[];
}

interface IcoSearchResponse {
  results?: Array<{
    title?: string;
    url?: string;
    description?: string;
    filterItemMetaData?: string;
  }>;
  pagination?: {
    totalPages?: number;
    hasMore?: boolean;
  };
}

interface GovUkSearchResponse {
  results?: Array<{
    title?: string;
    link?: string;
    description?: string;
    public_timestamp?: string;
    format?: string;
  }>;
}

function toRecord(input: PartialUKEnforcementRecord): UKEnforcementSeedRecord {
  return {
    regulator: input.regulator,
    regulatorFullName: input.regulatorFullName,
    sourceDomain: input.sourceDomain,
    firmIndividual: cleanFirmName(input.firmIndividual),
    firmCategory: input.firmCategory ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? GBP,
    dateIssued: input.dateIssued,
    breachType: input.breachType,
    breachCategories: input.breachCategories ?? categoriesForText(input.summary),
    summary: normalizeWhitespace(input.summary),
    noticeUrl: input.noticeUrl,
    sourceUrl: input.sourceUrl,
    sourceWindowNote: input.sourceWindowNote,
    aliases: input.aliases,
  };
}

function cleanFirmName(value: string) {
  return normalizeWhitespace(value)
    .replace(/\s+PDF\s+\d+KB.*$/i, "")
    .replace(/\s+Â\s+PDF.*$/i, "")
    .replace(/\s*[-–:]\s*(Regulatory intervention report|Determination notice|Final notice|Decision notice)(?:\s+Opens in a new window)?$/i, "")
    .replace(/\s+Opens in a new window$/i, "")
    .replace(/[,\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function categoriesForText(value: string) {
  const text = value.toLowerCase();
  const categories = new Set<string>();

  if (text.includes("sanction")) categories.add("SANCTIONS");
  if (text.includes("competition") || text.includes("cartel")) {
    categories.add("COMPETITION");
  }
  if (text.includes("consumer")) categories.add("CONSUMER_PROTECTION");
  if (text.includes("data") || text.includes("gdpr") || text.includes("pecr")) {
    categories.add("DATA_PROTECTION");
  }
  if (text.includes("audit") || text.includes("accountanc")) {
    categories.add("AUDIT");
  }
  if (text.includes("pension") || text.includes("trustee")) {
    categories.add("PENSIONS");
  }
  if (text.includes("payment") || text.includes("interchange")) {
    categories.add("PAYMENTS");
  }
  if (text.includes("prudential") || text.includes("capital")) {
    categories.add("PRUDENTIAL");
  }
  if (text.includes("report")) categories.add("REPORTING");
  if (text.includes("governance") || text.includes("controls")) {
    categories.add("SYSTEMS_CONTROLS");
  }

  return categories.size > 0 ? [...categories] : ["OTHER"];
}

function parseGbpAmount(value: string) {
  if (!/£|gbp|pound/i.test(value)) return null;

  const amounts = parseGbpAmounts(value);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

function parseFirstGbpAmount(value: string) {
  return parseGbpAmounts(value)[0] ?? null;
}

function parseGbpAmounts(value: string) {
  const amounts: number[] = [];
  const pattern =
    /(?:£|GBP\s*)\s*([\d]+(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(billion|bn|million|m|thousand|k)?/gi;

  for (const match of value.matchAll(pattern)) {
    const scale = (match[2] || "").toLowerCase();
    const normalized = match[1].replace(/[,\s]/g, "");
    const base = Number.parseFloat(normalized);
    if (!Number.isFinite(base)) continue;

    if (scale === "billion" || scale === "bn") {
      amounts.push(base * 1_000_000_000);
    } else if (scale === "million" || scale === "m") {
      amounts.push(base * 1_000_000);
    } else if (scale === "thousand" || scale === "k") {
      amounts.push(base * 1_000);
    } else {
      amounts.push(base);
    }
  }

  return amounts;
}

function parseContextualGbpAmount(value: string, keywords: string[]) {
  const escapedKeywords = keywords
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const keywordBeforeAmount = new RegExp(
    `(?:${escapedKeywords})[^£]{0,120}(?:£|GBP\\s*)\\s*[\\d,\\s]+(?:\\.\\d+)?\\s*(?:billion|bn|million|m|thousand|k)?`,
    "gi",
  );
  const amountBeforeKeyword = new RegExp(
    `(?:£|GBP\\s*)\\s*[\\d,\\s]+(?:\\.\\d+)?\\s*(?:billion|bn|million|m|thousand|k)?[^£.]{0,120}(?:${escapedKeywords})`,
    "gi",
  );
  const amounts = [
    ...value.matchAll(keywordBeforeAmount),
    ...value.matchAll(amountBeforeKeyword),
  ].flatMap((match) => parseGbpAmounts(match[0]));

  return amounts.length > 0 ? Math.max(...amounts) : null;
}

function parsePraAmount(title: string, summary: string) {
  const titleAmount = parseGbpAmount(title);
  if (titleAmount !== null) return titleAmount;

  const beforeCounterfactual = summary.split(/without which/i)[0] || summary;
  const firstFineSentence = beforeCounterfactual.slice(0, 700);
  const amounts = parseGbpAmounts(firstFineSentence);

  if (amounts.length > 1 && /(?:and|,)/i.test(firstFineSentence)) {
    return amounts.reduce((total, amount) => total + amount, 0);
  }

  return amounts[0] ?? parseGbpAmount(summary);
}

function parsePraEnforcementAmount(value: string) {
  const amounts = parseGbpAmounts(value);
  if (amounts.length === 0) return null;

  if (amounts.length > 1 && /\b(?:penalties|respectively|and)\b/i.test(value)) {
    return amounts.reduce((total, amount) => total + amount, 0);
  }

  return amounts[0];
}

function parsePenaltyCell(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized || /disclosure|none|n\/a/i.test(normalized)) return null;
  return parseGbpAmount(normalized) ?? parsePlainAmount(normalized);
}

function parseIsoFromDateText(value: string) {
  const text = normalizeWhitespace(value);
  const dayMonthYear = text.match(/\b(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/);
  if (dayMonthYear) {
    return parseMonthNameDate(dayMonthYear[1]);
  }

  const dotted = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
  if (dotted) {
    const yearRaw = Number.parseInt(dotted[3], 10);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    return `${year}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  }

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  return null;
}

function parseIsoFromTimestamp(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseDateRangeEnd(value: string) {
  const text = normalizeWhitespace(value);
  const range = text.match(
    /\b\d{1,2}\s+[A-Za-z]+\s+to\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/i,
  );
  if (!range) {
    return parseIsoFromDateText(text);
  }

  return parseMonthNameDate(`${range[1]} ${range[2]} ${range[3]}`);
}

function textFromHtml(html: string) {
  return cheerio.load(html).text();
}

function detailSummary(html: string) {
  const $ = cheerio.load(html);
  return normalizeWhitespace(
    $('meta[name="description"]').attr("content") ||
      $("main p").first().text() ||
      $("p").first().text(),
  );
}

function detailBody(html: string) {
  const $ = cheerio.load(html);
  return normalizeWhitespace($("main").text() || $("body").text());
}

function extractPraFirm(title: string) {
  let firm = normalizeWhitespace(title)
    .replace(/^The\s+Prudential\s+Regulation\s+Authority\s+\(PRA\)\s+fines\s+/i, "")
    .replace(/^The\s+PRA\s+fines\s+/i, "")
    .replace(/^PRA\s+fines\s+and\s+bans\s+/i, "")
    .replace(/^PRA\s+fines\s+/i, "")
    .replace(/^FCA\s+and\s+PRA\s+fine\s+/i, "")
    .replace(/^FCA\s+and\s+PRA\s+jointly\s+fine\s+/i, "")
    .replace(/^PRA\s+imposes\s+fines?\s+on\s+/i, "")
    .replace(/^The\s+PRA\s+imposes\s+record\s+fine\s+of\s+£?[\d.,]+\s*(?:m|million)?\s+on\s+/i, "")
    .replace(/^PRA\s+takes\s+action\s+against\s+/i, "");

  firm = firm
    .replace(/\s+£[\d.,]+\s*(?:m|million)?\b.*$/i, "")
    .replace(/\s+\d+(?:\.\d+)?\s*(?:m|million)\b.*$/i, "")
    .replace(/\s+for\s+.*$/i, "")
    .replace(/\s+dated\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}.*$/i, "");

  return firm || title;
}

function extractPsrFirm(title: string) {
  let firm = normalizeWhitespace(title)
    .replace(/^The\s+PSR\s+fines\s+/i, "")
    .replace(/^PSR\s+fines\s+/i, "")
    .replace(/^Press release:\s*/i, "");

  firm = firm
    .replace(/\s+(?:over|more\s+than)?\s*£[\d.,]+\s*(?:m|million)?\b.*$/i, "")
    .replace(/\s+for\s+.*$/i, "");

  return firm || title;
}

function extractCmaFirm(title: string) {
  let firm = normalizeWhitespace(title)
    .replace(/^CMA\s+fines?\s+/i, "")
    .replace(/^Court\s+upholds\s+CMA(?:'s|’s)?\s+£?[\d.,]+\s*(?:m|million)?\s+fine\s+on\s+/i, "")
    .replace(/^CMA\s+secures\s+.*?\s+from\s+/i, "");

  firm = firm
    .replace(/\s+£[\d.,]+\s*(?:m|million|k)?\b.*$/i, "")
    .replace(/\s+for\s+.*$/i, "")
    .replace(/\s+over\s+.*$/i, "");

  if (
    !firm ||
    /^(?:over|firms?|companies?|businesses?|suppliers?|retailers?|court|tribunal|case study|why we|£|\d)/i.test(
      firm,
    ) ||
    /\b(?:fine|fined|fines|penalt(?:y|ies))\b/i.test(firm)
  ) {
    return title;
  }

  return firm || title;
}

function extractFrcDateFromRow(rowText: string) {
  const labelledDate = rowText.match(
    /(?:Imposed Sanctions|Settlement Agreement|Tribunal Report|Final Decision|Sanctions|Outcome)[^:]*:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i,
  );
  return parseIsoFromDateText(labelledDate?.[1] ?? rowText);
}

function dedupeRecords(records: UKEnforcementSeedRecord[]) {
  const seen = new Set<string>();
  const deduped: UKEnforcementSeedRecord[] = [];

  for (const record of records) {
    const key = [
      record.regulator,
      record.noticeUrl,
      record.dateIssued,
      record.firmIndividual.toLowerCase(),
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(record);
    }
  }

  return deduped;
}

export function parseBoeNewsResults(resultsHtml: string) {
  const $ = cheerio.load(resultsHtml);
  const items: Array<{ title: string; href: string; dateIssued: string }> = [];

  $("a.release[href]").each((_, element) => {
    const title = normalizeWhitespace(
      $(element).find("h3.list").text() || $(element).find("h3").last().text(),
    );
    const href = $(element).attr("href") || "";
    const dateIssued =
      $(element).find("time[datetime]").attr("datetime") ||
      parseIsoFromDateText($(element).text()) ||
      "";

    if (title && href && dateIssued) {
      items.push({ title, href, dateIssued });
    }
  });

  return items;
}

export function parsePraEnforcementActionsPage(html: string) {
  const mainHtml = cheerio.load(html)("main").html() || html;
  const start = mainHtml.indexOf("How has the Bank used its enforcement powers");
  const end = start >= 0 ? mainHtml.indexOf("Open investigations", start) : -1;
  const scopedHtml =
    start >= 0 && end > start ? mainHtml.slice(start, end) : mainHtml;
  const $ = cheerio.load(scopedHtml);
  const records: UKEnforcementSeedRecord[] = [];

  $("tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const dateIssued = parseIsoFromDateText($(cells[0]).text());
    const link = $(cells[1]).find("a[href]").first();
    const href = link.attr("href");
    const firmIndividual = cleanFirmName(link.text() || $(cells[1]).text());
    const penaltyText = normalizeWhitespace($(cells[2]).text());
    const amount = parsePraEnforcementAmount(penaltyText);

    if (!dateIssued || !href || !firmIndividual || !penaltyText) {
      return;
    }

    const breachType = amount === null ? "PRA public censure" : "PRA financial penalty";
    const summary = normalizeWhitespace(`${firmIndividual}: ${penaltyText}`);

    records.push(
      toRecord({
        ...REGULATORS.PRA,
        firmIndividual,
        firmCategory: null,
        amount,
        dateIssued,
        breachType,
        summary,
        noticeUrl: makeAbsoluteUrl("https://www.bankofengland.co.uk", href),
        sourceUrl: SOURCE_URLS.praEnforcement,
        sourceWindowNote:
          "Scraped from the official Bank of England enforcement actions table.",
      }),
    );
  });

  return dedupeRecords(records);
}

async function fetchPraSearchPage(term: string, page: number) {
  const body = new URLSearchParams();
  body.set("SearchTerm", term);
  body.set("Id", "{CE377CC8-BFBC-418B-B4D9-DBC1C64774A8}");
  body.set("PageSize", "30");
  body.append("NewsTypes[]", "09f8960ebc384e3589da5349744916ae");
  body.append("NewsTypesAvailable[]", "09f8960ebc384e3589da5349744916ae");
  body.set("Page", String(page));
  body.set("Direction", "1");
  body.set("Grid", "false");
  body.set("InfiniteScrolling", "false");

  const response = await fetch(SOURCE_URLS.praNewsApi, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      "user-agent":
        "Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`PRA news API failed with ${response.status}`);
  }

  return (await response.json()) as { Results?: string };
}

async function scrapePraNewsSearchEnforcement() {
  const searchTerms = ["PRA fines", "PRA takes action", "PRA imposes fine"];
  const found = new Map<string, { title: string; href: string; dateIssued: string }>();

  for (const term of searchTerms) {
    for (let page = 1; page <= 3; page += 1) {
      const response = await fetchPraSearchPage(term, page);
      const items = parseBoeNewsResults(response.Results || "");
      if (items.length === 0) break;

      for (const item of items) {
        const title = item.title;
        if (
          /\b(PRA|Prudential Regulation Authority)\b/i.test(title) &&
          /\b(fines?|penalty|imposes|takes action|sanction)\b/i.test(title) &&
          !/^PRA takes action(?! against\b)/i.test(title) &&
          !/annual fees|policy statement|consults|consultation|approach to enforcement/i.test(
            title,
          )
        ) {
          found.set(makeAbsoluteUrl("https://www.bankofengland.co.uk", item.href), item);
        }
      }
    }
  }

  const records = await mapWithConcurrency([...found.entries()], 4, async ([url, item]) => {
    let summary = item.title;

    try {
      const html = await fetchText(url);
      summary = detailSummary(html) || item.title;
    } catch {
      // Listing data is sufficient if a detail page has a transient issue.
    }

    const amount = parsePraAmount(item.title, summary);
    return toRecord({
      ...REGULATORS.PRA,
      firmIndividual: extractPraFirm(item.title),
      firmCategory: null,
      amount,
      dateIssued: item.dateIssued,
      breachType: "PRA enforcement action",
      summary: summary || item.title,
      noticeUrl: url,
      sourceUrl: SOURCE_URLS.praNews,
      sourceWindowNote: "Scraped from official Bank of England news API and PRA announcement pages.",
    });
  });

  return records;
}

export async function scrapePraEnforcement() {
  const html = await fetchText(SOURCE_URLS.praEnforcement);
  const records = parsePraEnforcementActionsPage(html);

  if (records.length > 0) {
    return records;
  }

  return scrapePraNewsSearchEnforcement();
}

export function parsePsrEnforcementCases(html: string) {
  const $ = cheerio.load(html);
  const records: UKEnforcementSeedRecord[] = [];

  $(".m-rte li").each((_, element) => {
    const text = normalizeWhitespace($(element).text());
    const link = $(element).find("a[href]").first();
    const title = normalizeWhitespace(link.text());
    const href = link.attr("href");
    const dateIssued = parseIsoFromDateText(text);

    if (
      !href ||
      !dateIssued ||
      !/^Press release:/i.test(text) ||
      !/\bfines?\b/i.test(title)
    ) {
      return;
    }

    records.push(
      toRecord({
        ...REGULATORS.PSR,
        firmIndividual: extractPsrFirm(title),
        firmCategory: "Payment service provider",
        amount: parseGbpAmount(title),
        dateIssued,
        breachType: "Payment systems enforcement",
        summary: title,
        noticeUrl: makeAbsoluteUrl(SOURCE_URLS.psrCases, href),
        sourceUrl: SOURCE_URLS.psrCases,
        sourceWindowNote: "Scraped from official PSR enforcement cases page.",
      }),
    );
  });

  return dedupeRecords(records);
}

export async function scrapePsrEnforcement() {
  return parsePsrEnforcementCases(await fetchText(SOURCE_URLS.psrCases));
}

export function parseOfsiCollection(html: string) {
  const $ = cheerio.load(html);
  const records: UKEnforcementSeedRecord[] = [];

  $(".govspeak h3").each((_, heading) => {
    const firm = normalizeWhitespace($(heading).text());
    const link = $(heading).find("a[href]").first().attr("href");
    const table = $(heading).nextAll("table").first();
    if (!firm || table.length === 0) return;

    const rows = new Map<string, string>();
    table.find("tr").each((__, row) => {
      const key = normalizeWhitespace($(row).find("th").first().text()).toLowerCase();
      const value = normalizeWhitespace($(row).find("td").first().text());
      if (key && value) rows.set(key, value);
    });

    const dateIssued = parseIsoFromDateText(rows.get("date") || "");
    if (!dateIssued) return;

    const penalty = rows.get("penalty") || "";
    const reason = rows.get("reason") || "Financial sanctions enforcement";
    const regulations = rows.get("regulations") || "";

    records.push(
      toRecord({
        ...REGULATORS.OFSI,
        firmIndividual: firm,
        firmCategory: rows.get("sector") || null,
        amount: parsePenaltyCell(penalty),
        dateIssued,
        breachType:
          /disclosure/i.test(penalty) ? "Financial sanctions disclosure" : "Financial sanctions penalty",
        summary: normalizeWhitespace([reason, regulations].filter(Boolean).join(" ")),
        noticeUrl: link ? makeAbsoluteUrl(SOURCE_URLS.ofsiCollection, link) : SOURCE_URLS.ofsiCollection,
        sourceUrl: SOURCE_URLS.ofsiCollection,
        sourceWindowNote: "Scraped from official GOV.UK OFSI enforcement collection.",
        aliases: /wise/i.test(firm)
          ? ["Wise", "Wise Payments", "TransferWise", "Kristo Kaarmann", "Kristo Käärmann"]
          : undefined,
      }),
    );
  });

  return dedupeRecords(records);
}

export async function scrapeOfsiEnforcement() {
  return parseOfsiCollection(await fetchText(SOURCE_URLS.ofsiCollection));
}

export function parseIcoSearchResponse(response: IcoSearchResponse) {
  return (response.results || [])
    .map((item) => {
      const dateIssued = parseIsoFromDateText(item.filterItemMetaData || "");
      const title = normalizeWhitespace(item.title || "");
      if (!dateIssued || !title || !item.url) return null;

      const metadataParts = normalizeWhitespace(item.filterItemMetaData || "")
        .split(",")
        .map((part) => normalizeWhitespace(part));
      const sector = metadataParts[2] || null;
      const description = normalizeWhitespace(item.description || title);

      return toRecord({
        ...REGULATORS.ICO,
        firmIndividual: title,
        firmCategory: sector,
        amount: parseFirstGbpAmount(description),
        dateIssued,
        breachType: "Data protection monetary penalty",
        summary: description,
        noticeUrl: makeAbsoluteUrl("https://ico.org.uk", item.url),
        sourceUrl: "https://ico.org.uk/action-weve-taken/enforcement/",
        sourceWindowNote: "Scraped from official ICO enforcement search API.",
      });
    })
    .filter((record): record is UKEnforcementSeedRecord => Boolean(record));
}

async function fetchIcoSearchPage(pageNumber: number) {
  const response = await fetch(SOURCE_URLS.icoSearch, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)",
    },
    body: JSON.stringify({
      filters: [{ key: "entype", values: ["monetary-penalties"] }],
      pageNumber,
      order: "newest",
      rootPageId: 17222,
    }),
  });

  if (!response.ok) {
    throw new Error(`ICO search API failed with ${response.status}`);
  }

  return (await response.json()) as IcoSearchResponse;
}

export async function scrapeIcoEnforcement() {
  const firstPage = await fetchIcoSearchPage(1);
  const pages = Math.max(firstPage.pagination?.totalPages || 1, 1);
  const responses = [firstPage];

  for (let page = 2; page <= pages; page += 1) {
    responses.push(await fetchIcoSearchPage(page));
  }

  return dedupeRecords(responses.flatMap(parseIcoSearchResponse));
}

export function parseGovUkSearchResults(response: GovUkSearchResponse) {
  return (response.results || [])
    .map((item) => {
      const title = normalizeWhitespace(item.title || "");
      const description = normalizeWhitespace(item.description || "");
      const dateIssued = parseIsoFromTimestamp(item.public_timestamp);
      const link = item.link || "";
      const searchableText = `${title}. ${description}`;
      const amount = parseContextualGbpAmount(searchableText, [
        "fine",
        "fined",
        "fines",
        "penalty",
        "penalties",
      ]);

      if (
        !title ||
        !link ||
        !dateIssued ||
        !/\b(fines?|fined|penalt(?:y|ies))\b/i.test(searchableText) ||
        amount === null
      ) {
        return null;
      }

      return toRecord({
        ...REGULATORS.CMA,
        firmIndividual: extractCmaFirm(title),
        firmCategory: item.format || null,
        amount,
        dateIssued,
        breachType: "Competition or consumer enforcement penalty",
        summary: description || title,
        noticeUrl: makeAbsoluteUrl("https://www.gov.uk", link),
        sourceUrl:
          "https://www.gov.uk/search/all?organisations%5B%5D=competition-and-markets-authority",
        sourceWindowNote: "Scraped from official GOV.UK search API for CMA publications.",
      });
    })
    .filter((record): record is UKEnforcementSeedRecord => Boolean(record));
}

async function fetchCmaSearch(query: string, start: number) {
  const url = new URL(SOURCE_URLS.cmaSearch);
  url.searchParams.set("q", query);
  url.searchParams.set("filter_organisations", "competition-and-markets-authority");
  url.searchParams.set("count", "100");
  url.searchParams.set("start", String(start));

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (compatible; MEMA-Regulatory-Scraper/1.0; +https://regactions.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`CMA GOV.UK search failed with ${response.status}`);
  }

  return (await response.json()) as GovUkSearchResponse;
}

export async function scrapeCmaEnforcement() {
  const queries = ["fine", "fined", "penalty"];
  const responses: GovUkSearchResponse[] = [];

  for (const query of queries) {
    responses.push(await fetchCmaSearch(query, 0));
  }

  return dedupeRecords(responses.flatMap(parseGovUkSearchResults));
}

export function parseFrcEnforcementCases(html: string) {
  const $ = cheerio.load(html);
  const records: Array<UKEnforcementSeedRecord & { rawDetailUrl?: string }> = [];

  $("table tbody tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => normalizeWhitespace($(cell).text()))
      .get();
    if (cells.length < 5) return;

    const respondent = cells[0];
    const entity = cells[1];
    const scheme = cells[2];
    const matter = cells[3];
    const milestones = cells[4];
    const status = cells[5] || "";
    const link =
      $(row)
        .find("a[href]")
        .filter((__, anchor) =>
          /imposed sanctions|settlement agreement|tribunal report|outcome|sanction/i.test(
            normalizeWhitespace($(anchor).parent().text()),
          ),
        )
        .first()
        .attr("href") || $(row).find("a[href]").first().attr("href");

    const dateIssued = extractFrcDateFromRow(milestones);
    if (!respondent || !dateIssued || !link) return;

    const noticeUrl = makeAbsoluteUrl(SOURCE_URLS.frcCases, link);
    records.push({
      ...toRecord({
        ...REGULATORS.FRC,
        firmIndividual: respondent,
        firmCategory: [scheme, matter].filter(Boolean).join(" / ") || null,
        amount: parseGbpAmount(milestones),
        dateIssued,
        breachType: "Audit and accountancy enforcement outcome",
        summary: normalizeWhitespace(
          [respondent, entity, scheme, matter, status].filter(Boolean).join(" - "),
        ),
        noticeUrl,
        sourceUrl: SOURCE_URLS.frcCases,
        sourceWindowNote: "Scraped from official FRC enforcement cases table.",
      }),
      rawDetailUrl: noticeUrl,
    });
  });

  return dedupeRecords(records);
}

export async function scrapeFrcEnforcement() {
  const parsed = parseFrcEnforcementCases(await fetchText(SOURCE_URLS.frcCases));
  const enriched = await mapWithConcurrency(parsed, 4, async (record) => {
    if (record.amount !== null || !record.noticeUrl) return record;
    try {
      const html = await fetchText(record.noticeUrl);
      const text = detailBody(html);
      return {
        ...record,
        amount: parseContextualGbpAmount(text, [
          "fine",
          "fined",
          "financial sanction",
          "sanction",
          "penalty",
        ]),
        summary: detailSummary(html) || record.summary,
      };
    } catch {
      return record;
    }
  });

  return dedupeRecords(enriched);
}

export function parseTprPenaltyNoticePage(html: string) {
  const $ = cheerio.load(html);
  const records: UKEnforcementSeedRecord[] = [];

  $("table.govuk-table").each((_, table) => {
    const heading = $(table).prevAll("h4, h3").first();
    const dateIssued =
      parseDateRangeEnd(heading.text()) ||
      `${new Date().getUTCFullYear()}-12-31`;
    const section = normalizeWhitespace(heading.text()) || "Penalty notices";

    $(table)
      .find("tr")
      .slice(1)
      .each((__, row) => {
        const cells = $(row)
          .find("td")
          .map((___, cell) => normalizeWhitespace($(cell).text()))
          .get();
        if (cells.length < 3) return;

        const [firm, district, paid] = cells;
        const amount = parsePenaltyCell(paid);
        if (!firm || amount === null) return;

        records.push(
          toRecord({
            ...REGULATORS.TPR,
            firmIndividual: firm,
            firmCategory: district || null,
            amount,
            dateIssued,
            breachType: "Pensions escalating penalty notice",
            breachCategories: ["PENSIONS"],
            summary: `${firm} was listed by TPR in ${section} with paid penalties of ${paid}.`,
            noticeUrl: SOURCE_URLS.tprPenaltyNotices,
            sourceUrl: SOURCE_URLS.tprPenaltyNotices,
            sourceWindowNote: "Scraped from official TPR penalty notices tables.",
          }),
        );
      });
  });

  return dedupeRecords(records);
}

export async function scrapeTprEnforcement() {
  return parseTprPenaltyNoticePage(await fetchText(SOURCE_URLS.tprPenaltyNotices));
}

export async function scrapeAllUKEnforcementSources() {
  const groups = await Promise.all([
    scrapePraEnforcement(),
    scrapePsrEnforcement(),
    scrapeOfsiEnforcement(),
    scrapeIcoEnforcement(),
    scrapeCmaEnforcement(),
    scrapeFrcEnforcement(),
    scrapeTprEnforcement(),
  ]);

  return dedupeRecords(groups.flat());
}
