import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  getCliFlags,
  mapWithConcurrency,
  normalizeWhitespace,
  parseLargestAmountFromText,
  legacyIdentity,
  parseMonthNameDate,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";
import { assessEntityName, unnamedParty, UNNAMED_PARTY_CATEGORY } from "./lib/entityName.js";

const SFC_CONTENT_URL = "https://apps.sfc.hk/edistributionWeb/api/news/list-content";
const SFC_DOC_URL = "https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/doc";
const SFC_DEFAULT_START_YEAR = Number.parseInt(
  process.env.SFC_START_YEAR || "2020",
  10,
);
const SFC_DEFAULT_END_YEAR = Number.parseInt(
  process.env.SFC_END_YEAR || String(new Date().getUTCFullYear()),
  10,
);
const SFC_MAX_REF_PER_YEAR = Number.parseInt(
  process.env.SFC_MAX_REF_PER_YEAR || "220",
  10,
);
const SFC_CONCURRENCY = Number.parseInt(process.env.SFC_CONCURRENCY || "8", 10);

export interface SfcPressRelease {
  refNo: string;
  title: string;
  dateIssued: string;
  body: string;
  sourceUrl: string;
}

const SFC_ENFORCEMENT_TITLE_REGEX =
  /\b(fines?|fined|reprimands?|bans?|banned|suspends?|suspended|sanctions?|disciplinary|prohibits?|prohibited|penalt(?:y|ies)|prosecut(?:es|ed|ion))\b/i;

const SFC_EXCLUDED_TITLE_REGEX =
  /\b(appoints?|welcomes?|consults?|publishes?|launches?|seminar|conference|speech|survey|circular|statement on|annual report|hearing fixed)\b/i;

function buildSfcContentUrl(refNo: string) {
  return `${SFC_CONTENT_URL}?lang=EN&refNo=${encodeURIComponent(refNo)}`;
}

function buildSfcDocUrl(refNo: string) {
  return `${SFC_DOC_URL}?refNo=${encodeURIComponent(refNo)}`;
}

function isLikelySfcEnforcementTitle(title: string) {
  return SFC_ENFORCEMENT_TITLE_REGEX.test(title) && !SFC_EXCLUDED_TITLE_REGEX.test(title);
}

export function parseSfcPressReleaseHtml(
  html: string,
  refNo: string,
): SfcPressRelease | null {
  const $ = cheerio.load(html);
  const title = normalizeWhitespace(
    $("h1").first().text() || $("title").first().text(),
  );
  const metaDate = normalizeWhitespace($("meta[name='date']").attr("content") || "");
  const visibleDate = normalizeWhitespace($("small").first().text());
  const dateIssued =
    parseSfcDate(metaDate) || parseSfcDate(visibleDate) || null;
  const body = normalizeWhitespace(
    $(".newsc").text() || $("#content").text() || $("body").text(),
  );

  if (!title || !dateIssued || !body || !isLikelySfcEnforcementTitle(title)) {
    return null;
  }

  return {
    refNo,
    title,
    dateIssued,
    body,
    sourceUrl: buildSfcContentUrl(refNo),
  };
}

function parseSfcDate(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  return parseMonthNameDate(normalized);
}

const SFC_AMOUNT_OPTIONS = {
  currency: "HKD",
  symbols: ["HK$", "$"],
  keywords: ["fine", "fines", "fined", "penalty", "penalties"],
};
const SFC_TITLE_FINE_REGEX = /\b(?:fines?|fined|pecuniary\s+penalt(?:y|ies)|penalt(?:y|ies))\b/i;
/** Figures that are not the SFC's fine: market-misconduct and disgorgement
 * amounts, compensation, profits, losses, costs and statutory ceilings. */
const SFC_NON_FINE_CONTEXT_REGEX =
  /\b(?:disgorge(?:ment|d|s)?|market\s+misconduct|compensat(?:e|ion|ing)|restitution|profits?|losses|loss\s+avoided|costs?|assets?\s+frozen|frozen|undistributed|remediation|per\s+share)\b/i;

/** Sentences in a release body that state a fine or penalty actually imposed. */
function sfcFineSentences(body: string) {
  return normalizeWhitespace(body)
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    // "fined $20,000 and ordered to pay the SFC's investigation costs": the costs clause is not the fine.
    .map((sentence) => sentence.replace(/,?\s*(?:and\s+)?(?:was |were )?(?:ordered to pay|to pay)\s+[^.]*\bcosts?\b[^.]*/gi, ''))
    .filter((sentence) => SFC_TITLE_FINE_REGEX.test(sentence) && !SFC_NON_FINE_CONTEXT_REGEX.test(sentence));
}

/**
 * Only a fine or pecuniary penalty counts. A licence revocation that quotes a
 * HK$154m market-misconduct figure, a court "further adjournment" listing, or a
 * disgorgement order is not a monetary penalty and gets no amount.
 */
export function parseSfcAmount(title: string, body: string) {
  if (SFC_TITLE_FINE_REGEX.test(title) && !SFC_NON_FINE_CONTEXT_REGEX.test(title)) {
    const fromTitle = parseLargestAmountFromText(title, SFC_AMOUNT_OPTIONS);
    if (fromTitle !== null) {
      return fromTitle;
    }
  }

  const amounts = sfcFineSentences(body.slice(0, 1500))
    .map((sentence) => parseLargestAmountFromText(sentence, SFC_AMOUNT_OPTIONS))
    .filter((amount): amount is number => amount !== null);

  return amounts.length > 0 ? Math.max(...amounts) : null;
}

/** Pre-fix SFC amount (title, else the first 800 characters of the body), kept
 * only for content-hash identity. */
export function legacySfcAmount(title: string, body: string) {
  return legacyIdentity(
    () => parseLargestAmountFromText(title, SFC_AMOUNT_OPTIONS)
      ?? parseLargestAmountFromText(body.slice(0, 800), SFC_AMOUNT_OPTIONS),
  );
}

/** Extractor as stored rows were hashed; content-hash identity ONLY (identityFirm). */
export function legacyExtractSfcFirm(title: string) {
  const cleaned = normalizeWhitespace(
    title
      .replace(/^SFC\s+/i, "")
      .replace(/\s+(?:HK|US)?\$[\d,.]+\s*(?:million|billion|thousand|m|bn|k)?/gi, "")
      .replace(/\s+for\s+.*$/i, "")
      .replace(/\s+over\s+.*$/i, "")
      .replace(/\s+after\s+.*$/i, "")
      .replace(/\s+and\s+suspends?.*$/i, "")
      .replace(/\s+and\s+bans?.*$/i, ""),
  );

  const patterns = [
    /^(?:reprimands?\s+and\s+fines?|fines?|reprimands?|bans?|suspends?|prohibits?|sanctions?)\s+(.+)$/i,
    /^SFAT\s+(?:affirms?|upholds?|dismisses?)\s+.+?\s+(?:against|of|on)\s+(.+)$/i,
    /^(.+?)\s+(?:fined|banned|reprimanded|suspended|prohibited)$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = normalizeWhitespace(match[1])
      .replace(/\s+\([^)]*\)\s*$/g, "")
      .replace(/[.;,:]+$/g, "");
    if (candidate && candidate.length <= 180) {
      return candidate;
    }
  }

  return cleaned.length <= 180 ? cleaned : "Unknown";
}

const SFC_HEAD_TOKENS = new Set(['SFC', 'SFAT', 'MMT', 'Court', 'Market', 'Misconduct', 'Tribunal', 'Hearing', 'Movie', 'Takeovers', 'Code', 'The', 'HK', 'US']);
const SFC_ROLE_BEFORE_OF = /\b(?:responsible officers?|officers?|directors?(?: and shareholder)?|senior management|executives?|chief investment officer)\s+of\s+$/i;
const SFC_SANCTION_VERBS = /\b(?:fines?|fined|reprimands?|bans?|banned|suspends?|suspended|sanctions?|revokes?|revoked|prohibits?|penalises?|disciplinary)\b/i;

/** Capitalised proper-name run starting at the first non-head capitalised token. */
function sfcProperNameRun(title: string): { name: string; before: string } | null {
  const tokens = normalizeWhitespace(title).replace(/[’']s\b/g, '').split(' ');
  let start = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (/^[A-Z(]/.test(token) && !SFC_HEAD_TOKENS.has(token.replace(/[,.]$/, ''))) {
      start = index;
      break;
    }
  }
  if (start < 0) return null;
  // A company named only as the subject of the conduct ("insider dealing in X shares",
  // "conviction ... involving X shares") is not the sanctioned party, except where the
  // action itself is a trading suspension of that company.
  const lead = tokens.slice(Math.max(0, start - 2), start).join(' ');
  if (/\b(?:in|involving)$/i.test(lead) && !/\bsuspends dealings\b/i.test(tokens.join(' '))) return null;
  const run: string[] = [];
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1] ?? '';
    const isCapital = /^[A-Z0-9(&]/.test(token) || /^[A-Z]/.test(token.replace(/^\(/, ''));
    const isLinker = /^(?:and|of|&)$/i.test(token) && /^[A-Z(]/.test(next);
    if (isCapital || isLinker) {
      run.push(token);
      if (/[,]$/.test(token) && !/^[A-Z(]/.test(next)) break;
      continue;
    }
    break;
  }
  const name = run.join(' ').replace(/[,]+$/, '');
  return name ? { name, before: tokens.slice(0, start).join(' ') + ' ' } : null;
}

/**
 * Sanctioned party named in an SFC headline, or null when none is named.
 * Legacy extraction is kept when it already yields a real name.
 */
function extractSfcPartyFromTitle(title: string): string | null {
  const legacy = legacyExtractSfcFirm(title);
  if (assessEntityName(legacy).ok && !/^(?:retail|former|licensed|unlicensed|individuals?|investors?)$/i.test(legacy)) return legacy;

  const cleaned = normalizeWhitespace(title.replace(/\s+(?:HK|US)?\$[\d,.]+\s*(?:million|billion|thousand|m|bn|k)?/gi, ' '));
  const first = sfcProperNameRun(cleaned);
  if (!first) return null;
  // "former Agg. Asset Management responsible officer Chow Tsz Lam": the person follows the title.
  const afterFirst = cleaned.slice(cleaned.indexOf(first.name) + first.name.length);
  const personAfterRole = afterFirst.match(/^\s+(?:[a-z-]+\s+){0,3}(?:officer|director|manager|representative)\s+([A-Z][\w’'.-]+(?:\s+[A-Z][\w’'.-]+){1,3})/);
  if (personAfterRole) return personAfterRole[1];
  // "revokes ... bans former responsible officer of Guosen Securities": a firm's unnamed officer.
  if (SFC_ROLE_BEFORE_OF.test(first.before)) return null;
  // Strip a trailing "and" left by the run.
  const name = first.name.replace(/\s+(?:and|of|&)$/i, '');
  if (/^(?:retail|former|licensed|unlicensed|individuals?|investors?)$/i.test(name)) return null;
  return assessEntityName(name).ok ? name : null;
}

const SFC_CONVICTION = /\b(?:convict\w*|sentenced|pleaded guilty|jailed)\b/i;
const SFC_PROSECUTION = /\b(?:criminal (?:proceedings|prosecution)|prosecution)\b/i;
const SFC_PROCEDURAL = /\b(?:adjourn\w*|pre-trial|hearing fixed|trial (?:date|set)|set for (?:trial|mention))\b/i;

/**
 * Criminal outcomes the SFC brought: a conviction/sentence, or criminal proceedings it
 * commenced against named defendants. Purely procedural items (adjournments, trial
 * dates) are not outcomes.
 */
export function sfcCriminalKind(title: string, body = ''): 'conviction' | 'prosecution' | null {
  const lead = body.slice(0, 450);
  if (SFC_CONVICTION.test(title) || SFC_CONVICTION.test(lead)) return 'conviction';
  if (SFC_PROSECUTION.test(title) || SFC_PROSECUTION.test(lead)) return 'prosecution';
  return null;
}

export function isSfcProcedural(title: string, body = ''): boolean {
  return SFC_PROCEDURAL.test(title) && sfcCriminalKind(title, body) !== 'conviction';
}

/** Defendants named in the first sentence of a release ("... against Mr Chan Hoi Shing and Mr Li Po Ching"). */
export function extractSfcDefendants(body: string): string[] {
  const firstSentence = normalizeWhitespace(body).split(/(?<=[.)])\s+(?=[A-Z])/)[0] ?? '';
  const names: string[] = [];
  for (const match of firstSentence.matchAll(/\b(?:Mr|Ms|Mrs|Miss|Dr)\.?\s+([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){1,3})/g)) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

export interface SfcParties {
  names: string[];
  criminal: 'conviction' | 'prosecution' | null;
}

/**
 * Who a release is about. The headline's party when it has one; otherwise, for a criminal
 * outcome, the defendants named in the body (one entry per person). Procedural items and
 * releases that name nobody return no names.
 */
export function resolveSfcParties(title: string, body = ''): SfcParties {
  const criminal = isSfcProcedural(title, body) ? null : sfcCriminalKind(title, body);
  if (isSfcProcedural(title, body)) return { names: [], criminal: null };
  const fromTitle = extractSfcPartyFromTitle(title);
  if (fromTitle) return { names: [fromTitle], criminal: sfcCriminalKind(title) };
  if (criminal) {
    const defendants = extractSfcDefendants(body).filter((name) => assessEntityName(name).ok);
    if (defendants.length > 0) return { names: defendants, criminal };
  }
  return { names: [], criminal: null };
}

export function extractSfcParty(title: string, body = ''): string | null {
  return resolveSfcParties(title, body).names[0] ?? null;
}

/** True for court-news items that record no decision and name no party: nothing to publish. */
export function isSfcNonRecord(title: string, body = ''): boolean {
  if (isSfcProcedural(title, body)) return true;
  return resolveSfcParties(title, body).names.length === 0 && !SFC_SANCTION_VERBS.test(title);
}

export function extractSfcFirm(title: string, body = '') {
  return extractSfcParty(title, body) ?? unnamedParty('SFC').name;
}

function categorizeSfcRecord(text: string) {
  const normalized = text.toLowerCase();
  const categories: string[] = [];

  if (/anti-money laundering|money laundering|aml|terrorist financing/.test(normalized)) {
    categories.push("AML");
  }
  if (/market misconduct|market manipulation|insider|inside information/.test(normalized)) {
    categories.push("MARKET_ABUSE");
  }
  if (/disclosure|research report|reporting/.test(normalized)) {
    categories.push("DISCLOSURE");
  }
  if (/client asset|suitability|selling practice|fund management|asset management|margin lending/.test(normalized)) {
    categories.push("CONDUCT");
  }
  if (/licen[cs]e|registration|suspend|ban|prohibit/.test(normalized)) {
    categories.push("LICENSING");
  }

  return categories.length > 0 ? [...new Set(categories)] : ["SUPERVISORY_SANCTION"];
}

export function buildSfcRecords(release: SfcPressRelease): DbReadyRecord[] {
  const textCorpus = `${release.title} ${release.body}`;
  const parties = resolveSfcParties(release.title, release.body);
  const amount = parseSfcAmount(release.title, release.body);
  // A fine is only attached to a defendant when the source actually imposes one. A single
  // sum imposed on several people ("fined a sum of $114,000") stays on one combined row so it
  // is not counted twice; otherwise each defendant gets their own row.
  const names = parties.names.length === 0
    ? [unnamedParty("SFC").name]
    : amount !== null && parties.names.length > 1 && parties.criminal
      ? [parties.names.join(" and ")]
      : parties.names;
  const unnamedRow = parties.names.length === 0;
  const criminalType = parties.criminal === "conviction" ? "Criminal conviction" : parties.criminal === "prosecution" ? "Criminal prosecution commenced" : null;

  return names.map((name, index) => buildEuFineRecord({
    regulator: "SFC",
    regulatorFullName: "Securities and Futures Commission",
    countryCode: "HK",
    countryName: "Hong Kong",
    firmIndividual: name,
    // Only the first row can be the one already stored: it keeps the legacy hash. Further
    // defendants are new rows with their own identity.
    identityFirm: index === 0 ? legacyExtractSfcFirm(release.title) : undefined,
    firmCategory: unnamedRow ? UNNAMED_PARTY_CATEGORY : parties.criminal ? "Individual" : "Financial Entity",
    amount,
    legacyAmountIdentity: legacySfcAmount(release.title, release.body),
    currency: "HKD",
    dateIssued: release.dateIssued,
    breachType: criminalType ?? release.title,
    breachCategories: parties.criminal ? ["CRIMINAL_ACTION", ...categorizeSfcRecord(textCorpus)] : categorizeSfcRecord(textCorpus),
    summary: release.body.slice(0, 500) || release.title,
    finalNoticeUrl: buildSfcDocUrl(release.refNo),
    sourceUrl: release.sourceUrl,
    dedupeKey: index === 0 ? release.refNo : `${release.refNo}::${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    rawPayload: release,
  }));
}

/** First (stored-identity) row of a release. */
export function buildSfcRecord(release: SfcPressRelease): DbReadyRecord {
  return buildSfcRecords(release)[0];
}

async function fetchSfcRelease(refNo: string) {
  try {
    const html = await fetchText(buildSfcContentUrl(refNo), {
      timeout: 45000,
      validateStatus: (status) => status >= 200 && status < 500,
    });
    return parseSfcPressReleaseHtml(html, refNo);
  } catch {
    return null;
  }
}

function buildSfcRefNos(startYear: number, endYear: number, maxRefPerYear: number) {
  const refNos: string[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const yearShort = String(year).slice(-2);
    for (let refIndex = 1; refIndex <= maxRefPerYear; refIndex += 1) {
      refNos.push(`${yearShort}PR${refIndex}`);
    }
  }

  return refNos;
}

export async function loadSfcLiveRecords(): Promise<DbReadyRecord[]> {
  const flags = getCliFlags();
  const refNos = buildSfcRefNos(
    SFC_DEFAULT_START_YEAR,
    SFC_DEFAULT_END_YEAR,
    SFC_MAX_REF_PER_YEAR,
  );
  const releases = await mapWithConcurrency(
    refNos,
    Math.max(1, SFC_CONCURRENCY),
    fetchSfcRelease,
  );
  const records = releases
    .filter((release): release is SfcPressRelease => release !== null)
    // Court-news headlines that name no party and impose no sanction are not records.
    .filter((release) => !isSfcNonRecord(release.title, release.body))
    .flatMap(buildSfcRecords)
    .sort(
      (left, right) =>
        right.dateIssued.localeCompare(left.dateIssued) ||
        left.firmIndividual.localeCompare(right.firmIndividual),
    );

  return flags.limit && flags.limit > 0 ? records.slice(0, flags.limit) : records;
}

export async function main() {
  await runScraper({
    name: "🇭🇰 SFC Enforcement Actions Scraper",
    region: "APAC",
    regulatorCode: "SFC",
    liveLoader: loadSfcLiveRecords,
    testLoader: loadSfcLiveRecords,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ SFC scraper failed:", error);
    process.exit(1);
  });
}
