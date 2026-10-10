import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import { CIRO_SNAPSHOT_RECORDS } from "./data/ciroSnapshot.js";
import {
  buildEuFineRecord,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
} from "./lib/euFineHelpers.js";
import { assessEntityName, unnamedParty, UNNAMED_PARTY_CATEGORY } from "./lib/entityName.js";
import {
  createBrowserHtmlClient,
  type BrowserHtmlClient,
} from "./lib/browserChallengeFetch.js";
import {
  createFlareSolverrClient,
  flareSolverrEnabled,
  type FlareSolverrClient,
} from "./lib/flaresolverr.js";
import { runScraper } from "./lib/runScraper.js";

const CIRO_PUBLICATIONS_URL =
  "https://www.ciro.ca/newsroom/publications?field_type_of_publication=471";

interface CiroListingRow {
  title: string;
  detailUrl: string;
  dateIssued: string;
  rulebook: string | null;
  noticeType: string | null;
}

export function loadCiroSnapshotRecords() {
  return CIRO_SNAPSHOT_RECORDS.map((record) =>
    buildEuFineRecord({
      regulator: "CIRO",
      regulatorFullName: "Canadian Investment Regulatory Organization",
      countryCode: "CA",
      countryName: "Canada",
      firmIndividual: record.firmIndividual,
      firmCategory: "Dealer or Individual",
      amount: record.amount,
      currency: record.currency,
      dateIssued: record.dateIssued,
      breachType: record.breachType,
      breachCategories: record.breachCategories,
      summary: record.summary,
      finalNoticeUrl: record.sourceUrl,
      sourceUrl: record.sourceUrl,
      rawPayload: record,
    }),
  );
}

export function mergeCiroRecords(
  liveRecords: ReturnType<typeof loadCiroSnapshotRecords>,
  snapshotRecords = loadCiroSnapshotRecords(),
) {
  const merged = new Map<string, ReturnType<typeof loadCiroSnapshotRecords>[number]>();

  for (const record of [...snapshotRecords, ...liveRecords]) {
    const key = record.sourceUrl || record.finalNoticeUrl || record.firmIndividual;
    const existing = merged.get(key);

    if (
      !existing
      || (existing.amount === null && record.amount !== null)
      || (existing.summary || '').length < (record.summary || '').length
    ) {
      merged.set(key, record);
    }
  }

  return Array.from(merged.values()).sort((left, right) =>
    right.dateIssued.localeCompare(left.dateIssued),
  );
}

export function parseCiroListingHtml(html: string): CiroListingRow[] {
  const $ = cheerio.load(html);
  const rows: CiroListingRow[] = [];

  $("div.coh-container.views-row.coh-ce-a2b7edc0").each((_, element) => {
    const titleLink = $(element).find(".views-field-title a").first();
    const title = normalizeWhitespace(titleLink.text());
    const detailUrl = makeAbsoluteUrl(
      CIRO_PUBLICATIONS_URL,
      titleLink.attr("href") || "",
    );
    const dateIssued = normalizeWhitespace(
      $(element).find("time.datetime").first().attr("datetime") || "",
    ).slice(0, 10);
    const rulebook =
      normalizeWhitespace(
        $(element)
          .find(".views-field-field-rulebook .field-content")
          .first()
          .text(),
      ) || null;
    const noticeType =
      normalizeWhitespace(
        $(element)
          .find(".views-field-field-type-of-publication .field-content")
          .first()
          .text(),
      ) || null;

    if (!title || !detailUrl || !dateIssued) {
      return;
    }

    rows.push({
      title,
      detailUrl,
      dateIssued,
      rulebook,
      noticeType,
    });
  });

  return rows;
}

function extractCiroPageCount(html: string) {
  const matches = [...html.matchAll(/page=(\d+)/g)];
  const highestPageIndex = matches.reduce(
    (max, match) => Math.max(max, Number.parseInt(match[1], 10)),
    0,
  );
  return highestPageIndex + 1;
}

/** Extractor as stored rows were hashed; content-hash identity ONLY (identityFirm). */
export function legacyExtractCiroFirm(title: string) {
  const patterns = [
    /^CIRO Sanctions\s+(.+)$/i,
    /^CIRO Hearing Panel issues .*? in the matter of\s+(.+)$/i,
    /^MFDA Hearing Panel .*? in the matter of\s+(.+)$/i,
    /^.*? in the matter of\s+(.+)$/i,
    /^CIRO Hearing Panel Finds\s+(.+?)\s+Liable$/i,
    // Additional patterns to avoid including "A CIRO Hearing Panel" in the name
    /^(?:A\s+)?CIRO Hearing Panel (?:sanctions|fines|reprimands)\s+(.+?)(?:\s+and|$)/i,
    /^Decision and Reasons .*? - (.+?)(?:\s*\(|$)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1].replace(/[.]+$/g, ""));
    }
  }

  // Fallback: truncate to first 150 chars to avoid overly verbose firm names
  const fallback = normalizeWhitespace(title.replace(/[.]+$/g, ""));
  if (fallback.length > 150) {
    // Try to find a natural break point
    const breakMatch = fallback.match(
      /^(.{20,150}?)(?:\s*(?:-|in the matter|regarding|concerning))/i,
    );
    if (breakMatch?.[1]) {
      return breakMatch[1].trim();
    }
    return fallback.substring(0, 150) + "...";
  }

  return fallback;
}

/**
 * Party named in a CIRO/MFDA/IIROC headline. Keeps the legacy extraction whenever
 * it already yields a real name, and only re-derives the party for headlines the
 * legacy patterns left whole ("CIRO Hearing Panel accepts settlement agreement
 * with X"). Returns null when no party can be read (caller labels it unnamed).
 */
export function extractCiroParty(title: string): string | null {
  const legacy = legacyExtractCiroFirm(title);
  if (assessEntityName(legacy).ok) return legacy;

  const text = normalizeWhitespace(title);
  const candidates = [
    text.match(/^IN THE MATTER OF\s+(.+?)\s+[\u2013\u2014-]\s+.+$/i)?.[1],
    text.match(/^(?:IIROC|CIRO|MFDA)\s+(?:Sanctions|Fines|Suspends|Bars|Penalizes)\s+(?:(?:Former|Vancouver|Winnipeg|Toronto|Calgary|Montreal|Ottawa|Edmonton|Halifax)\s+)*(?:Investment Advis[eo]r|Advis[eo]r|Registered Representative|Representative|Dealer|Registrant|Firm)\s+(.+)$/i)?.[1],
    text.match(/\b(?:Hearing Panel|Panel)\b.*?\b(?:settlement agreement with|settlement with|against|in the matter of)\s+(.+)$/i)?.[1],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const cleaned = normalizeWhitespace(candidate).replace(/\s+(?:liable|-\s+.*)$/i, "").replace(/[.]+$/g, "");
    if (cleaned && assessEntityName(cleaned).ok) return cleaned;
  }
  return null;
}

export function extractCiroFirm(title: string) {
  return extractCiroParty(title) ?? unnamedParty("CIRO").name;
}

function categorizeCiroTitle(title: string) {
  const normalized = title.toLowerCase();
  const categories = ["SRO_ENFORCEMENT"];

  if (normalized.startsWith("ciro sanctions")) {
    categories.push("DISCIPLINARY_ACTION", "MONETARY_SANCTION");
  }
  if (
    normalized.includes("reasons for decision") ||
    normalized.includes("decision and reasons")
  ) {
    categories.push("DECISION_NOTICE");
  }
  if (normalized.includes("hearing panel")) {
    categories.push("HEARING_PANEL");
  }
  if (normalized.includes("liable")) {
    categories.push("FINDING");
  }

  return Array.from(new Set(categories));
}

export function buildCiroListingRecord(row: CiroListingRow) {
  const snapshot = CIRO_SNAPSHOT_RECORDS.find(
    (record) => record.sourceUrl === row.detailUrl,
  );

  const ciroParty = extractCiroParty(row.title);
  const ciroName = ciroParty ?? unnamedParty("CIRO").name;

  return buildEuFineRecord({
    regulator: "CIRO",
    regulatorFullName: "Canadian Investment Regulatory Organization",
    countryCode: "CA",
    countryName: "Canada",
    firmIndividual: snapshot?.firmIndividual || ciroName,
    identityFirm: snapshot?.firmIndividual || legacyExtractCiroFirm(row.title),
    firmCategory: !snapshot?.firmIndividual && ciroParty === null ? UNNAMED_PARTY_CATEGORY : "Dealer or Individual",
    amount: snapshot?.amount ?? null,
    currency: snapshot?.currency || "CAD",
    dateIssued: row.dateIssued,
    breachType: snapshot?.breachType || row.title,
    breachCategories:
      snapshot?.breachCategories || categorizeCiroTitle(row.title),
    summary:
      snapshot?.summary ||
      `Decision notice published by CIRO${row.rulebook ? ` under ${row.rulebook}` : ""}: ${row.title}.`,
    finalNoticeUrl: row.detailUrl,
    sourceUrl: row.detailUrl,
    rawPayload: {
      ...row,
      snapshotMatch: Boolean(snapshot),
    },
  });
}

export async function loadCiroLiveRecords() {
  let browserClient: BrowserHtmlClient | null = null;
  let flareClient: FlareSolverrClient | null = null;

  const safeErrorDetail = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // Do not carry credentials from a solver endpoint into job logs.
    return message
      .replace(/https?:\/\/[^\s/@]+@/g, "https://[redacted]@")
      .replace(/([?&](?:token|key|password|secret)=)[^&\s]+/gi, "$1[redacted]");
  };

  const loadWithBrowser = async (url: string, solverDetail?: string) => {
    if (browserClient === null) {
      browserClient = await createBrowserHtmlClient();
    }
    try {
      return await browserClient.get(url, {
        readySelector: ".views-row",
        timeoutMs: 60_000,
      });
    } catch (browserError) {
      const solverContext = solverDetail
        ? ` FlareSolverr detail: ${solverDetail}.`
        : "";
      throw new Error(
        "CIRO's official site is serving a Cloudflare managed challenge that "
        + "the available challenge clients could not clear. Configure or repair "
        + "FLARESOLVERR_URL on the scraper runner, then rerun the official CIRO loader."
        + solverContext
        + ` Browser detail: ${safeErrorDetail(browserError)}`,
      );
    }
  };

  const loadWithFlareSolverrThenBrowser = async (url: string) => {
    try {
      if (flareClient === null) {
        flareClient = await createFlareSolverrClient();
      }
      return await flareClient.get(url);
    } catch (solverError) {
      const solverDetail = safeErrorDetail(solverError);
      console.warn(
        `CIRO FlareSolverr request failed; falling back to Puppeteer: ${solverDetail}`,
      );
      if (flareClient !== null) {
        await (flareClient as FlareSolverrClient).destroy().catch(() => undefined);
        flareClient = null;
      }
      return loadWithBrowser(url, solverDetail);
    }
  };

  const loadPage = async (url: string) => {
    if (flareClient) {
      return loadWithFlareSolverrThenBrowser(url);
    }
    if (browserClient) {
      return loadWithBrowser(url);
    }

    try {
      return await fetchText(url);
    } catch (error) {
      console.warn(
        `CIRO direct request failed; switching to browser challenge handling: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (flareSolverrEnabled()) {
        return loadWithFlareSolverrThenBrowser(url);
      }
      return loadWithBrowser(url);
    }
  };

  try {
    const firstPageHtml = await loadPage(CIRO_PUBLICATIONS_URL);
    const pageCount = extractCiroPageCount(firstPageHtml);
    const rows = [...parseCiroListingHtml(firstPageHtml)];

    for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 1) {
      const pageHtml = await loadPage(
        `${CIRO_PUBLICATIONS_URL}&page=${pageIndex}`,
      );
      rows.push(...parseCiroListingHtml(pageHtml));
    }

    const uniqueRows = Array.from(
      new Map(rows.map((row) => [row.detailUrl, row])).values(),
    );
    return mergeCiroRecords(uniqueRows.map((row) => buildCiroListingRecord(row)));
  } finally {
    // The clients are assigned inside `loadPage`, so TypeScript's closure
    // analysis cannot see the mutation at this point.
    if (flareClient !== null) {
      await (flareClient as FlareSolverrClient).destroy();
    }
    if (browserClient !== null) {
      await (browserClient as BrowserHtmlClient).close();
    }
  }
}

export async function main() {
  await runScraper({
    name: "🇨🇦 CIRO Decision Notices Scraper",
    liveLoader: loadCiroLiveRecords,
    testLoader: async () => loadCiroSnapshotRecords(),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ CIRO scraper failed:", error);
    process.exit(1);
  });
}
