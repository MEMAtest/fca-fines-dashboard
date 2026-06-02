import "dotenv/config";
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { UKEnforcementSeedRecord } from "./data/ukEnforcementSeed.js";
import {
  convertToEur,
  fetchText,
  limitRecords,
  makeAbsoluteUrl,
  mapWithConcurrency,
  normalizeWhitespace,
  parseMonthNameDate,
} from "./lib/euFineHelpers.js";
import {
  createFlareSolverrClient,
  flareSolverrEnabled,
  type FlareSolverrClient,
} from "./lib/flaresolverr.js";

const FCA_BASE_URL = "https://www.fca.org.uk";
const PRESS_RELEASES_URL =
  "https://www.fca.org.uk/news/search-results?category=press%20releases&sort_by=dmetaZ";
const FINAL_NOTICES_URL =
  "https://www.fca.org.uk/publications/search-results?category=final%20notices&sort_by=dmetaZ";
const DEFAULT_DAYS_BACK = 90;
const DEFAULT_MAX_PAGES = 8;
const GBP = "GBP";

const FCA_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    process.env.FCA_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
  Referer: `${FCA_BASE_URL}/news`,
};

// When FLARESOLVERR_URL is set, all FCA fetches route through a shared
// FlareSolverr browser session that clears Cloudflare's "Just a moment"
// challenge (required on datacenter IPs such as Hetzner/CI). When unset,
// fetches go direct via fetchText, which works from residential IPs and local
// runs. The session is created in scrapeFcaEnforcement() and torn down there.
let flareClient: FlareSolverrClient | null = null;

async function fetchFcaHtml(url: string): Promise<string> {
  if (flareClient) {
    return flareClient.get(url);
  }
  return fetchText(url, { headers: FCA_BROWSER_HEADERS });
}

interface FcaSearchResult {
  title: string;
  type: string;
  dateIssued: string;
  description: string;
  url: string;
}

interface FcaAction extends UKEnforcementSeedRecord {
  rawAmountType?: "fine" | "voluntary_payment" | "none";
}

function getDaysBack() {
  const parsed = Number.parseInt(process.env.FCA_ENFORCEMENT_DAYS_BACK || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAYS_BACK;
}

function getMaxPages() {
  const parsed = Number.parseInt(process.env.FCA_ENFORCEMENT_MAX_PAGES || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PAGES;
}

function shouldLogProgress() {
  return process.env.FCA_ENFORCEMENT_LOG_PROGRESS === "1";
}

function cutoffDateIso(daysBack = getDaysBack()) {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);
  return cutoff.toISOString().slice(0, 10);
}

function parseFcaDate(text: string) {
  const cleaned = normalizeWhitespace(text)
    .replace(/^Published:\s*/i, "")
    .replace(/^Last modified:\s*/i, "");
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  return parseMonthNameDate(cleaned);
}

export function parseFcaSearchResults(html: string): FcaSearchResult[] {
  const $ = cheerio.load(html);
  const results: FcaSearchResult[] = [];

  $("li.search-item").each((_, item) => {
    const title = normalizeWhitespace(
      $(item).find("a.search-item__clickthrough").first().text(),
    ).replace(/\s+\[pdf\]$/i, "");
    const href = $(item).find("a.search-item__clickthrough").first().attr("href");
    const type = normalizeWhitespace($(item).find(".meta-item.type").first().text());
    const publishedText = normalizeWhitespace(
      $(item).find(".meta-item.published-date").first().text(),
    );
    const dateIssued = parseFcaDate(publishedText);
    const description = normalizeWhitespace($(item).find(".search-item__body").text());

    if (!title || !href || !dateIssued) return;

    results.push({
      title,
      type,
      dateIssued,
      description,
      url: makeAbsoluteUrl(FCA_BASE_URL, href),
    });
  });

  return results;
}

function isLikelyEnforcementResult(result: FcaSearchResult) {
  const text = `${result.title} ${result.description}`.toLowerCase();

  return /\b(fine|fined|penalt|censure|censured|ban|banned|prohibit|prohibition|restriction|requirement|final notice|decision notice|warning notice|enforcement|convict|sentence|charge|redress|voluntary payment|client money|market abuse|money launder)\b/.test(
    text,
  );
}

function parseGbpAmounts(text: string) {
  const amounts: number[] = [];
  const pattern =
    /(?:£|GBP\s*)\s*([\d]+(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(billion|bn|million|m|thousand|k)?/gi;

  for (const match of text.matchAll(pattern)) {
    const base = Number.parseFloat(match[1].replace(/[,\s]/g, ""));
    if (!Number.isFinite(base)) continue;

    const scale = (match[2] || "").toLowerCase();
    if (scale === "billion" || scale === "bn") amounts.push(base * 1_000_000_000);
    else if (scale === "million" || scale === "m") amounts.push(base * 1_000_000);
    else if (scale === "thousand" || scale === "k") amounts.push(base * 1_000);
    else amounts.push(base);
  }

  return amounts;
}

function parseEnforcementAmount(text: string) {
  const normalized = normalizeWhitespace(text);
  const voluntaryMatch = normalized.match(
    /voluntary payment[^£]{0,80}(?:£|GBP\s*)\s*[\d,\s.]+\s*(?:billion|bn|million|m|thousand|k)?|(?:£|GBP\s*)\s*[\d,\s.]+\s*(?:billion|bn|million|m|thousand|k)?[^.]{0,80}voluntary payment/i,
  );

  if (voluntaryMatch) {
    const amount = parseGbpAmounts(voluntaryMatch[0])[0] ?? null;
    return { amount: null, voluntaryPayment: amount, amountType: "voluntary_payment" as const };
  }

  const fineContext = normalized.match(
    /(?:fine|fined|financial penalty|penalty imposed|imposed a penalty|penalised)[^.£]{0,120}(?:£|GBP\s*)\s*[\d,\s.]+\s*(?:billion|bn|million|m|thousand|k)?|(?:£|GBP\s*)\s*[\d,\s.]+\s*(?:billion|bn|million|m|thousand|k)?[^.]{0,120}(?:fine|fined|financial penalty|penalty imposed|imposed a penalty|penalised)/i,
  );

  if (!fineContext) {
    return { amount: null, voluntaryPayment: null, amountType: "none" as const };
  }

  return {
    amount: parseGbpAmounts(fineContext[0])[0] ?? null,
    voluntaryPayment: null,
    amountType: "fine" as const,
  };
}

function stripTrailingContext(value: string) {
  return normalizeWhitespace(value)
    .replace(/\s+\[pdf\]$/i, "")
    .replace(/\s+\(PDF\)$/i, "")
    .replace(/^irst Supervisory Notice/i, "First Supervisory Notice")
    .replace(/\s+(?:for|after|over|following|due to|because of)\b.*$/i, "")
    .replace(/\s+(?:has|have|is|are|was|were)\b.*$/i, "")
    .replace(/\s+and\s+(?:fines|bans|censures|charges)\b.*$/i, "")
    .replace(/[,:;\s]+$/g, "")
    .trim();
}

export function extractFcaFirmName(title: string, body = "") {
  const normalizedTitle = normalizeWhitespace(title)
    .replace(/^Final Notice \d{4}:\s*/i, "")
    .replace(/\s+\[pdf\]$/i, "")
    .replace(/\s+\(PDF\)$/i, "")
    .replace(/^irst Supervisory Notice/i, "First Supervisory Notice");
  const patterns: RegExp[] = [
    /^(.+?)\s+agrees?\s+to\s+pay\b/i,
    /^FCA\s+(?:bans\s+and\s+fines|fines\s+and\s+bans|fines|bans|censures|charges|secures|prosecutes)\s+(.+?)\s+(?:for|after|over|following|and|£)/i,
    /^FCA\s+(?:bans\s+and\s+fines|fines\s+and\s+bans|fines|bans|censures|charges|secures|prosecutes)\s+(.+)$/i,
    /^(.+?)\s+(?:fined|banned|censured|charged|convicted|sentenced)\b/i,
    /^(?:(?:First|Second|Third)\s+)?(?:Final Notice|Decision Notice|Warning Notice|Supervisory Notice)(?:\s+\d{4})?:\s*(.+)$/i,
    /^(?:Annulment of Decision Notice)\s+\d{4}:\s*(.+)$/i,
    /^(.+?)\s+(?:Final Notice|Decision Notice|Warning Notice|Supervisory Notice)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedTitle.match(pattern);
    if (match?.[1]) {
      return stripTrailingContext(match[1]);
    }
  }

  const bodyMatch = body.match(/\b(?:against|on|to)\s+([A-Z][A-Za-z0-9&'().,\-\s]{3,120}?(?:Limited|Ltd|LLP|PLC|plc|ltd|llp|Bank|Group|Partners|Services|Markets|Adviser|Advisor))\b/);
  if (bodyMatch?.[1]) {
    return stripTrailingContext(bodyMatch[1]);
  }

  return stripTrailingContext(normalizedTitle);
}

function detectBreachType(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("client money")) return "Client money and safeguarding";
  if (lower.includes("money laundering") || lower.includes("aml")) return "Financial crime and AML";
  if (lower.includes("market abuse") || lower.includes("insider")) return "Market abuse";
  if (lower.includes("financial promotion")) return "Financial promotions";
  if (lower.includes("pension")) return "Pensions advice and transfers";
  if (lower.includes("consumer")) return "Consumer protection";
  if (lower.includes("prohibit") || lower.includes("ban")) return "Individual prohibition";
  if (lower.includes("censure")) return "Public censure";
  if (lower.includes("restriction") || lower.includes("requirement")) return "Supervisory restriction";
  return "FCA enforcement action";
}

function detectBreachCategories(text: string) {
  const lower = text.toLowerCase();
  const categories = new Set<string>();

  if (lower.includes("client money") || lower.includes("safeguard")) categories.add("CLIENT_MONEY");
  if (lower.includes("money laundering") || lower.includes("aml") || lower.includes("financial crime")) categories.add("AML");
  if (lower.includes("market abuse") || lower.includes("insider")) categories.add("MARKET_ABUSE");
  if (lower.includes("financial promotion")) categories.add("FINANCIAL_PROMOTIONS");
  if (lower.includes("pension")) categories.add("PENSIONS");
  if (lower.includes("consumer")) categories.add("CONSUMER_PROTECTION");
  if (lower.includes("governance") || lower.includes("systems") || lower.includes("controls")) categories.add("SYSTEMS_CONTROLS");
  if (lower.includes("fraud") || lower.includes("dishonest")) categories.add("FRAUD");
  if (lower.includes("prohibit") || lower.includes("ban")) categories.add("INDIVIDUAL_ACCOUNTABILITY");
  if (lower.includes("censure")) categories.add("PUBLIC_CENSURE");

  return categories.size > 0 ? [...categories] : ["OTHER"];
}

function detectFirmCategory(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("individual") || lower.includes("adviser") || lower.includes("advisor")) return "Individual";
  if (lower.includes("bank")) return "Bank";
  if (lower.includes("payment") || lower.includes("e-money")) return "Payments firm";
  if (lower.includes("wealth") || lower.includes("asset management") || lower.includes("investment")) return "Investment firm";
  if (lower.includes("motor") || lower.includes("credit")) return "Consumer credit firm";
  return null;
}

function getMainBody($: cheerio.CheerioAPI) {
  const body = $("main, article, .main-content, .region-content")
    .first()
    .text();
  return normalizeWhitespace(body || $("body").text());
}

function getFinalNoticeUrl($: cheerio.CheerioAPI, fallbackUrl: string) {
  const href = $(
    [
      'a[href*="/publication/final-notices/"]',
      'a[href*="/publication/decision-notices/"]',
      'a[href*="/publication/supervisory-notices/"]',
      'a[href*="/publication/warning-notices/"]',
    ].join(", "),
  )
    .first()
    .attr("href");
  return href ? makeAbsoluteUrl(FCA_BASE_URL, href) : fallbackUrl;
}

function getFinalNoticeFirm($: cheerio.CheerioAPI) {
  const text = normalizeWhitespace(
    $(
      [
        'a[href*="/publication/final-notices/"]',
        'a[href*="/publication/decision-notices/"]',
        'a[href*="/publication/supervisory-notices/"]',
        'a[href*="/publication/warning-notices/"]',
      ].join(", "),
    )
      .first()
      .text(),
  );
  if (!text) return null;
  const firm = extractFcaFirmName(text);
  return firm && !/^(final|decision|warning|supervisory) notice(?: statement)?$/i.test(firm)
    ? firm
    : null;
}

function isGenericFirmLabel(value: string) {
  return /^(final|decision|warning|supervisory) notice(?: statement)?$/i.test(value) ||
    /^(influencers?|firms?|individuals?|consumers?)$/i.test(value) ||
    /^tribunal\b/i.test(value) ||
    /firms told/i.test(value) ||
    /regulatory priorities/i.test(value);
}

export function parseFcaPressReleaseDetail(
  html: string,
  result: FcaSearchResult,
): FcaAction | null {
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($("h1").first().text()) || result.title;
  const body = getMainBody($);
  const combined = `${title}. ${body}`;
  const { amount, voluntaryPayment, amountType } = parseEnforcementAmount(combined);
  const finalNoticeUrl = getFinalNoticeUrl($, result.url);
  const firm = getFinalNoticeFirm($) ?? extractFcaFirmName(title, body);

  if (
    !firm ||
    firm.length < 3 ||
    isGenericFirmLabel(firm) ||
    /\/publication\/regulatory-priorities\//i.test(finalNoticeUrl) ||
    !isLikelyEnforcementResult(result)
  ) {
    return null;
  }

  const summary = normalizeWhitespace(
    [
      title,
      body
        .replace(/^.+?First published:\s*\d{1,2}\/\d{1,2}\/\d{4}/i, "")
        .split(/(?<=\.)\s+/)
        .slice(0, 2)
        .join(" "),
    ].filter(Boolean).join(" "),
  ).slice(0, 1200);

  return {
    regulator: "FCA",
    regulatorFullName: "Financial Conduct Authority",
    sourceDomain: "financial_conduct",
    firmIndividual: firm,
    firmCategory: detectFirmCategory(combined),
    amount,
    currency: GBP,
    dateIssued: result.dateIssued,
    breachType: detectBreachType(combined),
    breachCategories: detectBreachCategories(combined),
    summary,
    noticeUrl: finalNoticeUrl,
    sourceUrl: result.url,
    sourceWindowNote:
      voluntaryPayment === null
        ? "Official FCA press release enforcement feed."
        : `Official FCA press release enforcement feed; voluntary payment referenced: GBP ${voluntaryPayment.toLocaleString("en-GB")}.`,
    aliases: firm === "Sapia Partners LLP" ? ["Sapia", "WealthTek"] : undefined,
    rawAmountType: amountType,
  };
}

export function parseFcaFinalNoticeResult(result: FcaSearchResult): FcaAction | null {
  if (!/final notices?/i.test(result.type) && !/final notice|decision notice|warning notice/i.test(result.title)) {
    return null;
  }

  const title = result.title.replace(/\s+\[pdf\]$/i, "");
  const firm = extractFcaFirmName(title);
  if (!firm || isGenericFirmLabel(firm) || /annulment/i.test(title)) return null;

  const combined = `${title}. ${result.description}`;

  return {
    regulator: "FCA",
    regulatorFullName: "Financial Conduct Authority",
    sourceDomain: "financial_conduct",
    firmIndividual: firm,
    firmCategory: detectFirmCategory(combined),
    amount: null,
    currency: GBP,
    dateIssued: result.dateIssued,
    breachType: detectBreachType(combined),
    breachCategories: detectBreachCategories(combined),
    summary: normalizeWhitespace(`${title}. ${result.description || "FCA final notice publication."}`),
    noticeUrl: result.url,
    sourceUrl: result.url,
    sourceWindowNote:
      "Official FCA final-notice publication feed. Amount left blank unless an imposed financial penalty is confirmed by the fines table or press-release text.",
    rawAmountType: "none",
  };
}

async function fetchSearchResults(baseUrl: string, cutoffIso: string, sourceLabel: string) {
  const results: FcaSearchResult[] = [];
  const maxPages = getMaxPages();

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * 10 + 1;
    const html = await fetchFcaHtml(`${baseUrl}&start=${start}`);
    const pageResults = parseFcaSearchResults(html);
    if (pageResults.length === 0) break;

    results.push(...pageResults.filter((result) => result.dateIssued >= cutoffIso));
    if (shouldLogProgress() && (page === 0 || (page + 1) % 10 === 0)) {
      const newest = pageResults[0]?.dateIssued ?? "unknown";
      const oldest = pageResults[pageResults.length - 1]?.dateIssued ?? "unknown";
      console.log(
        `[FCA enforcement] ${sourceLabel}: fetched page ${page + 1}/${maxPages}; page date range ${newest} to ${oldest}; kept ${results.length}`,
      );
    }
    if (pageResults.some((result) => result.dateIssued < cutoffIso)) break;
  }

  return results;
}

function dedupeActions(records: FcaAction[]) {
  const seen = new Set<string>();
  const deduped: FcaAction[] = [];

  for (const record of records) {
    const key = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          firm: record.firmIndividual.toLowerCase(),
          date: record.dateIssued,
          noticeUrl: record.noticeUrl,
          amount: record.amount,
        }),
      )
      .digest("hex");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}

export async function scrapeFcaEnforcement(): Promise<UKEnforcementSeedRecord[]> {
  if (flareSolverrEnabled()) {
    flareClient = await createFlareSolverrClient();
    console.log(
      "[FCA enforcement] Routing fetches through FlareSolverr to clear the Cloudflare challenge",
    );
  }
  try {
    return await scrapeFcaEnforcementInner();
  } finally {
    if (flareClient) {
      await flareClient.destroy();
      flareClient = null;
    }
  }
}

async function scrapeFcaEnforcementInner(): Promise<UKEnforcementSeedRecord[]> {
  const cutoffIso = cutoffDateIso();
  const [pressResults, finalNoticeResults] = await Promise.all([
    fetchSearchResults(PRESS_RELEASES_URL, cutoffIso, "press releases"),
    fetchSearchResults(FINAL_NOTICES_URL, cutoffIso, "final notices"),
  ]);

  const enforcementPressResults = pressResults.filter(isLikelyEnforcementResult);
  let fetchedPressDetails = 0;
  const pressActions = await mapWithConcurrency(
    enforcementPressResults,
    3,
    async (result) => {
      try {
        const html = await fetchFcaHtml(result.url);
        fetchedPressDetails += 1;
        if (shouldLogProgress() && fetchedPressDetails % 25 === 0) {
          console.log(
            `[FCA enforcement] fetched ${fetchedPressDetails}/${enforcementPressResults.length} press release detail pages`,
          );
        }
        return parseFcaPressReleaseDetail(html, result);
      } catch (error) {
        console.warn(
          `Could not fetch FCA press release ${result.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },
  );

  const finalNoticeActions = finalNoticeResults
    .map(parseFcaFinalNoticeResult)
    .filter((record): record is FcaAction => record !== null);

  const pressRecords = pressActions.filter((record): record is FcaAction => record !== null);
  const pressNoticeUrls = new Set(pressRecords.map((record) => record.noticeUrl));

  return dedupeActions([
    ...pressRecords,
    ...finalNoticeActions.filter((record) => !pressNoticeUrls.has(record.noticeUrl)),
  ]).map(({ rawAmountType: _rawAmountType, ...record }) => record);
}

async function upsertStandalone(records: UKEnforcementSeedRecord[]) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required unless running --dry-run");

  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    let inserted = 0;
    let updated = 0;
    const noticeUrls = records.map((record) => record.noticeUrl).filter(Boolean);
    const existingFcaFineRows =
      noticeUrls.length > 0
        ? await sql`
            SELECT final_notice_url
            FROM fca_fines
            WHERE final_notice_url = ANY(${noticeUrls})
          `
        : [];
    const existingFcaFineUrls = new Set(
      existingFcaFineRows.map((row) => String(row.final_notice_url)),
    );

    for (const record of records) {
      if (existingFcaFineUrls.has(record.noticeUrl)) {
        console.log(`Skipping FCA fine already present in fca_fines: ${record.firmIndividual}`);
        continue;
      }

      const issuedAt = new Date(`${record.dateIssued}T00:00:00Z`);
      const contentHash = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            regulator: record.regulator,
            firmIndividual: record.firmIndividual,
            amount: record.amount,
            currency: record.currency,
            dateIssued: record.dateIssued,
            noticeUrl: record.noticeUrl,
          }),
        )
        .digest("hex");
      const id = `${record.regulator}-${record.dateIssued}-${record.firmIndividual
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 72)}-${contentHash.slice(0, 8)}`;

      const amountEur = convertToEur(record.amount, record.currency);
      const result = await sql`
        INSERT INTO uk_enforcement_actions (
          id, content_hash, regulator, regulator_full_name, source_domain,
          country_code, country_name, firm_individual, firm_category,
          amount_original, currency, amount_gbp, amount_eur, date_issued,
          year_issued, month_issued, breach_type, breach_categories, summary,
          notice_url, source_url, source_window_note, aliases, raw_payload
        ) VALUES (
          ${id}, ${contentHash}, ${record.regulator}, ${record.regulatorFullName},
          ${record.sourceDomain}, ${"GB"}, ${"United Kingdom"}, ${record.firmIndividual},
          ${record.firmCategory}, ${record.amount}, ${record.currency}, ${record.amount},
          ${amountEur}, ${record.dateIssued}, ${issuedAt.getUTCFullYear()},
          ${issuedAt.getUTCMonth() + 1}, ${record.breachType},
          ${sql.json(record.breachCategories)}, ${record.summary}, ${record.noticeUrl},
          ${record.sourceUrl}, ${record.sourceWindowNote}, ${record.aliases ?? []},
          ${sql.json(JSON.parse(JSON.stringify(record)))}
        )
        ON CONFLICT (id) DO UPDATE SET
          content_hash = EXCLUDED.content_hash,
          regulator_full_name = EXCLUDED.regulator_full_name,
          source_domain = EXCLUDED.source_domain,
          firm_individual = EXCLUDED.firm_individual,
          firm_category = EXCLUDED.firm_category,
          amount_original = EXCLUDED.amount_original,
          currency = EXCLUDED.currency,
          amount_gbp = EXCLUDED.amount_gbp,
          amount_eur = EXCLUDED.amount_eur,
          date_issued = EXCLUDED.date_issued,
          year_issued = EXCLUDED.year_issued,
          month_issued = EXCLUDED.month_issued,
          breach_type = EXCLUDED.breach_type,
          breach_categories = EXCLUDED.breach_categories,
          summary = EXCLUDED.summary,
          notice_url = EXCLUDED.notice_url,
          source_url = EXCLUDED.source_url,
          source_window_note = EXCLUDED.source_window_note,
          aliases = EXCLUDED.aliases,
          raw_payload = EXCLUDED.raw_payload
        RETURNING (xmax = 0) AS inserted
      `;

      if (result[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    await sql`SELECT refresh_all_fines()`;
    console.log(`Inserted: ${inserted}`);
    console.log(`Updated: ${updated}`);
  } finally {
    await sql.end();
  }
}

export async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const summaryOnly = process.argv.includes("--summary");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] || "", 10) : null;
  const records = limitRecords(await scrapeFcaEnforcement(), Number.isFinite(limit) ? limit : null);

  console.log(`FCA enforcement actions prepared: ${records.length}`);
  if (summaryOnly) {
    const dates = records.map((record) => record.dateIssued).sort();
    console.log(
      JSON.stringify(
        {
          count: records.length,
          earliest: dates[0] ?? null,
          latest: dates[dates.length - 1] ?? null,
          monetary: records.filter((record) => record.amount !== null).length,
          nonMonetary: records.filter((record) => record.amount === null).length,
          sample: records.slice(0, 10).map((record) => ({
            firm: record.firmIndividual,
            amount: record.amount,
            date: record.dateIssued,
            url: record.noticeUrl,
          })),
        },
        null,
        2,
      ),
    );
    if (dryRun) return;
  }
  if (dryRun) {
    records.forEach((record, index) => {
      const amount = record.amount === null ? "non-monetary" : `GBP ${record.amount.toLocaleString("en-GB")}`;
      console.log(
        `${String(index + 1).padStart(2, " ")}. ${record.firmIndividual} | ${amount} | ${record.dateIssued} | ${record.noticeUrl}`,
      );
    });
    return;
  }

  await upsertStandalone(records);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("FCA enforcement scraper failed:", error);
    process.exitCode = 1;
  });
}
