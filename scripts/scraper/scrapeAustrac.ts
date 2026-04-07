import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  parseLargestAmountFromText,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";

const AUSTRAC_BASE_URL = "https://www.austrac.gov.au";
const AUSTRAC_ENFORCEMENT_URL =
  "https://www.austrac.gov.au/about-us/record-our-actions/enforcement-actions-taken";
const AUSTRAC_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

type AustracSection =
  | "current_court"
  | "concluded_court"
  | "ongoing_undertakings"
  | "concluded_undertakings"
  | "infringement_notices"
  | "remedial_directions"
  | null;

interface AustracEntry {
  title: string;
  firmIndividual: string;
  actionType: string;
  dateIssued: string;
  amount: number | null;
  summary: string;
  finalNoticeUrl: string | null;
  sourceUrl: string;
  breachType: string;
  breachCategories: string[];
  section: AustracSection;
}

interface CourtProceedingDraft {
  title: string;
  paragraphs: string[];
  links: { label: string; url: string }[];
  section: Extract<AustracSection, "current_court" | "concluded_court">;
}

const COURT_SECTIONS = new Set<AustracSection>([
  "current_court",
  "concluded_court",
]);

function normalizeHeading(text: string) {
  return normalizeWhitespace(text).toLowerCase();
}

function classifySection(text: string): AustracSection {
  const normalized = normalizeHeading(text);

  if (normalized === "current court proceedings") return "current_court";
  if (normalized === "concluded court proceedings") return "concluded_court";
  if (normalized === "ongoing enforceable undertakings") {
    return "ongoing_undertakings";
  }
  if (normalized === "concluded enforceable undertakings") {
    return "concluded_undertakings";
  }
  if (normalized === "infringement notices") return "infringement_notices";
  if (normalized === "remedial directions") return "remedial_directions";

  return null;
}

function isYearHeading(text: string) {
  return /^\d{4}$/.test(normalizeWhitespace(text));
}

function cleanAustracTitle(text: string) {
  return normalizeWhitespace(
    text
      .replace(/\s*\((?:PDF|Word)[^)]+\)\s*/gi, " ")
      .replace(/\s*\(external link\)\s*/gi, " ")
      .replace(/\s*Ongoing$/i, "")
      .replace(/\s*\d{4}$/i, "")
      .replace(/\s{2,}/g, " "),
  );
}

function extractAustracFirm(title: string) {
  const normalized = cleanAustracTitle(title);
  const specificPatterns = [
    /^Infringement notice issued to\s+(.+)$/i,
    /^Remedial direction issued to\s+(.+)$/i,
  ];

  for (const pattern of specificPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  if (/^\(.+\)\s+/.test(normalized)) {
    return normalizeWhitespace(normalized.replace(/^\((.+?)\)\s+/, ""));
  }

  return normalizeWhitespace(
    normalized
      .replace(/\s+\(([^)]+)\)\s*$/, "")
      .replace(/\s+\(([^)]+)\)\s+\(([^)]+)\)\s*$/, ""),
  );
}

function parseAustracDate(text: string, fallbackYear: number | null = null) {
  const normalized = normalizeWhitespace(text);

  for (const match of normalized.matchAll(
    /\b(?:on\s+)?(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/g,
  )) {
    const parsed = parseMonthNameDate(match[1]);
    if (parsed) {
      return parsed;
    }
  }

  for (const match of normalized.matchAll(/\b([A-Za-z]+\s+\d{4})\b/g)) {
    const parsed = parseMonthNameDate(`1 ${match[1]}`);
    if (parsed) {
      return parsed;
    }
  }

  return fallbackYear ? `${fallbackYear}-01-01` : null;
}

export function parseAustracAmount(text: string) {
  const normalized = normalizeWhitespace(text);
  const scaledMatches = [
    ...normalized.matchAll(
      /(?:A\$|\$)\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|bn|mn|m|k)\b/gi,
    ),
  ];

  if (scaledMatches.length > 0) {
    const scaledValues = scaledMatches
      .map((match) => {
        const base = Number.parseFloat(match[1].replace(/,/g, ""));
        const scale = match[2].toLowerCase();
        const multiplier =
          scale === "billion" || scale === "bn"
            ? 1_000_000_000
            : scale === "million" || scale === "mn" || scale === "m"
              ? 1_000_000
              : 1_000;
        return Number.isFinite(base) ? base * multiplier : null;
      })
      .filter((value): value is number => value !== null);

    if (scaledValues.length > 0) {
      return Math.max(...scaledValues);
    }
  }

  return parseLargestAmountFromText(text, {
    currency: "AUD",
    symbols: ["A$", "$"],
    keywords: [
      "penalty",
      "civil penalty",
      "infringement notice",
      "fine",
      "ordered",
      "pay",
    ],
  });
}

function categorizeAustracEntry(section: AustracSection, title: string, summary: string) {
  const corpus = `${title} ${summary}`.toLowerCase();
  const categories = ["AML"];

  if (
    section === "current_court"
    || section === "concluded_court"
    || section === "ongoing_undertakings"
    || section === "concluded_undertakings"
    || section === "remedial_directions"
  ) {
    categories.push("CONTROLS");
  }

  if (/report|lodg|compliance report/.test(corpus)) {
    categories.push("DISCLOSURE");
  }

  if (/registration|register|renewal|refuses registration/.test(corpus)) {
    categories.push("LICENSING");
  }

  return [...new Set(categories)];
}

function buildCourtProceedingEntry(proceeding: CourtProceedingDraft) {
  const body = normalizeWhitespace(proceeding.paragraphs.join(" "));
  const dateIssued = parseAustracDate(body);
  const summary = normalizeWhitespace(proceeding.paragraphs.slice(0, 3).join(" "));
  const finalNoticeUrl =
    proceeding.links.find((link) => /media release|judg(e)?ment/i.test(link.label))
      ?.url
    || proceeding.links[0]?.url
    || null;
  const title = cleanAustracTitle(proceeding.title);

  if (!dateIssued || !title) {
    return null;
  }

  return {
    title,
    firmIndividual: extractAustracFirm(title),
    actionType:
      proceeding.section === "current_court"
        ? "Current court proceeding"
        : "Concluded court proceeding",
    dateIssued,
    amount: parseAustracAmount(body),
    summary,
    finalNoticeUrl,
    sourceUrl: AUSTRAC_ENFORCEMENT_URL,
    breachType: title,
    breachCategories: categorizeAustracEntry(proceeding.section, title, summary),
    section: proceeding.section,
  } satisfies AustracEntry;
}

function splitCombinedProceedingEntry(entry: AustracEntry) {
  const normalizedTitle = normalizeWhitespace(entry.title);
  const normalizedSummary = normalizeWhitespace(entry.summary);

  if (
    !/\bseparate proceedings\b/i.test(normalizedSummary)
    || !/\sand\s/i.test(normalizedTitle)
  ) {
    return [entry];
  }

  const candidates = normalizedTitle
    .split(/\s+and\s+/i)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (candidates.length < 2) {
    return [entry];
  }

  return candidates.map((firmIndividual) => ({
    ...entry,
    title: firmIndividual,
    firmIndividual,
    breachType: firmIndividual,
    summary: normalizedSummary,
  }));
}

function buildLinkedActionEntries(
  section: Exclude<AustracSection, "current_court" | "concluded_court" | null>,
  year: number | null,
  items: { title: string; url: string | null; rawText: string }[],
) {
  const deduped = new Map<string, AustracEntry>();

  items.forEach((item) => {
    const title = cleanAustracTitle(item.title);
    const itemYear =
      year
      || Number.parseInt(
        normalizeWhitespace(item.rawText).match(/\b(20\d{2}|19\d{2})\s*$/)?.[1] || "",
        10,
      )
      || null;

    if (!title || !itemYear) {
      return;
    }

    const firmIndividual = extractAustracFirm(title);
    const actionTypeMap: Record<typeof section, string> = {
      ongoing_undertakings: "Ongoing enforceable undertaking",
      concluded_undertakings: "Concluded enforceable undertaking",
      infringement_notices: "Infringement notice",
      remedial_directions: "Remedial direction",
    };
    const summaryMap: Record<typeof section, string> = {
      ongoing_undertakings: `${firmIndividual} is listed by AUSTRAC under ongoing enforceable undertakings in ${itemYear}.`,
      concluded_undertakings: `${firmIndividual} is listed by AUSTRAC under concluded enforceable undertakings with a commencement year of ${itemYear}.`,
      infringement_notices: `${firmIndividual} is listed by AUSTRAC as the subject of an infringement notice in ${itemYear}.`,
      remedial_directions: `${firmIndividual} is listed by AUSTRAC as the subject of a remedial direction in ${itemYear}.`,
    };
    const entry: AustracEntry = {
      title,
      firmIndividual,
      actionType: actionTypeMap[section],
      dateIssued: `${itemYear}-01-01`,
      amount: null,
      summary: summaryMap[section],
      finalNoticeUrl: item.url,
      sourceUrl: AUSTRAC_ENFORCEMENT_URL,
      breachType: title,
      breachCategories: categorizeAustracEntry(section, title, summaryMap[section]),
      section,
    };

    const dedupeKey = [section, itemYear, title].join("::");
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, entry);
    }
  });

  return [...deduped.values()];
}

function extractLinkedItems($: cheerio.CheerioAPI, element: unknown, pageUrl: string) {
  const node = element as any;
  const links = $(node)
    .find("a[href]")
    .map((_, link) => {
      const href = normalizeWhitespace($(link).attr("href") || "");
      return {
        title: cleanAustracTitle($(link).text() || $(node).text()),
        url: href ? makeAbsoluteUrl(pageUrl, href) : null,
        rawText: normalizeWhitespace($(link).parent().text() || $(node).text()),
      };
    })
    .get()
    .filter((item) => item.title);

  if (links.length > 0) {
    return links;
  }

  const text = cleanAustracTitle($(node).text());
  return text ? [{ title: text, url: null, rawText: text }] : [];
}

function extractTableItems($: cheerio.CheerioAPI, element: unknown, pageUrl: string) {
  const node = element as any;

  return $(node)
    .find("tbody tr")
    .map((_, row) => {
      const cells = $(row).find("td");
      const primaryCell = cells.eq(0);
      const secondaryCell = normalizeWhitespace(cells.eq(1).text());
      const primaryText = cleanAustracTitle(primaryCell.text());
      const href = normalizeWhitespace(primaryCell.find("a[href]").first().attr("href") || "");

      return {
        title: primaryText,
        url: href ? makeAbsoluteUrl(pageUrl, href) : null,
        rawText: normalizeWhitespace([primaryText, secondaryCell].filter(Boolean).join(" ")),
      };
    })
    .get()
    .filter((item) => item.title);
}

export function parseAustracEnforcementHtml(html: string, pageUrl = AUSTRAC_ENFORCEMENT_URL) {
  const $ = cheerio.load(html);
  const root = $("main").first().length ? $("main").first() : $("body");
  const nodes = root
    .find("h2, h3, h4, p, ul, table, button")
    .toArray();
  const entries: AustracEntry[] = [];
  let currentSection: AustracSection = null;
  let currentYear: number | null = null;
  let currentProceeding: CourtProceedingDraft | null = null;

  const flushProceeding = () => {
    if (!currentProceeding) {
      return;
    }

    const built = buildCourtProceedingEntry(currentProceeding);
    if (built) {
      entries.push(...splitCombinedProceedingEntry(built));
    }
    currentProceeding = null;
  };

  for (const element of nodes) {
    const tagName = element.tagName.toLowerCase();
    const text = normalizeWhitespace($(element).text());

    if (!text) {
      continue;
    }

    if (tagName === "button" && /accordion-term/.test($(element).attr("class") || "")) {
      const nextSection = classifySection(text);
      if (nextSection) {
        flushProceeding();
        currentSection = nextSection;
        currentYear = null;
      }
      continue;
    }

    if (tagName.startsWith("h")) {
      if (/was this page helpful/i.test(text)) {
        flushProceeding();
        currentSection = null;
        currentYear = null;
        continue;
      }

      const nextSection = classifySection(text);
      if (nextSection) {
        flushProceeding();
        currentSection = nextSection;
        currentYear = null;
        continue;
      }

      if (isYearHeading(text)) {
        flushProceeding();
        currentYear = Number.parseInt(text, 10);
        continue;
      }

      if (COURT_SECTIONS.has(currentSection)) {
        flushProceeding();
        currentProceeding = {
          title: text,
          paragraphs: [],
          links: [],
          section: currentSection as Extract<
            AustracSection,
            "current_court" | "concluded_court"
          >,
        };
      }

      continue;
    }

    if (COURT_SECTIONS.has(currentSection) && currentProceeding) {
      if (tagName === "p") {
        currentProceeding.paragraphs.push(text);
      } else if (tagName === "ul") {
        currentProceeding.links.push(
          ...extractLinkedItems($, element, pageUrl).map((item) => ({
            label: item.title,
            url: item.url || pageUrl,
          })),
        );
      }
      continue;
    }

    if (
      currentSection
      && currentSection !== "current_court"
      && currentSection !== "concluded_court"
      && tagName === "ul"
    ) {
      entries.push(
        ...buildLinkedActionEntries(
          currentSection,
          currentYear,
          extractLinkedItems($, element, pageUrl),
        ),
      );
      continue;
    }

    if (
      currentSection
      && currentSection !== "current_court"
      && currentSection !== "concluded_court"
      && tagName === "table"
    ) {
      entries.push(
        ...buildLinkedActionEntries(
          currentSection,
          currentYear,
          extractTableItems($, element, pageUrl),
        ),
      );
    }
  }

  flushProceeding();

  return entries;
}

function buildAustracRecords(entries: AustracEntry[]) {
  return entries.map((entry) =>
    buildEuFineRecord({
      regulator: "AUSTRAC",
      regulatorFullName:
        "Australian Transaction Reports and Analysis Centre",
      countryCode: "AU",
      countryName: "Australia",
      firmIndividual: entry.firmIndividual,
      firmCategory: "Reporting Entity",
      amount: entry.amount,
      currency: "AUD",
      dateIssued: entry.dateIssued,
      breachType: entry.breachType,
      breachCategories: entry.breachCategories,
      summary: entry.summary,
      finalNoticeUrl: entry.finalNoticeUrl,
      sourceUrl: entry.sourceUrl,
      rawPayload: entry,
    }),
  );
}

async function requestAustracHtml(url: string) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-features=UseDnsHttpsSvcb,UseDnsHttpsSvcbAlpn",
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(AUSTRAC_BROWSER_USER_AGENT);
      await page.setExtraHTTPHeaders({
        "accept-language": "en-GB,en;q=0.9",
      });
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      await page.waitForSelector("main h2, main h3", { timeout: 30000 });
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    try {
      return await fetchText(url, { timeout: 120000 });
    } catch {
      throw new Error(
        "AUSTRAC official enforcement page could not be fetched via browser or direct HTTP transport.",
      );
    }
  }
}

export async function loadAustracLiveRecords() {
  const html = await requestAustracHtml(AUSTRAC_ENFORCEMENT_URL);
  return buildAustracRecords(parseAustracEnforcementHtml(html));
}

export async function main() {
  await runScraper({
    name: "🇦🇺 AUSTRAC Enforcement Actions Scraper",
    liveLoader: loadAustracLiveRecords,
    testLoader: loadAustracLiveRecords,
    retryOnTransientFailure: true,
    maxRetries: 2,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("❌ AUSTRAC scraper failed:", error);
    process.exit(1);
  });
}
