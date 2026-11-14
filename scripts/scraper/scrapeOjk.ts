import "dotenv/config";
import { fileURLToPath } from "node:url";
import { buildEuFineRecord, normalizeWhitespace } from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";
import { recordRunWarning } from "./lib/runWarnings.js";

/**
 * Indonesia OJK (Otoritas Jasa Keuangan) administrative sanctions.
 *
 * Route: the official OJK announcements listing (English), which serves ordinary
 * unauthenticated requests with a generic user agent. The listing is an ASP.NET
 * page that pages with a standard form post-back; each "Administrative Sanction(s)"
 * announcement is a plain HTML page carrying the penalty text.
 *
 * Penalty definition: an explicit imposed monetary fine only, once per respondent
 * per announcement. Licence revocations, prohibitions, written warnings and written
 * orders carry no amount and are not rows. "Fulfillment of Administrative
 * Sanctions" notices restate a penalty already announced earlier and are skipped.
 */
export const OJK_ORIGIN = "https://www.ojk.go.id";
export const OJK_LISTING_URL = `${OJK_ORIGIN}/en/berita-dan-kegiatan/pengumuman/Default.aspx`;
const USER_AGENT = "RegActions-research";
const MAX_LISTING_PAGES = 150;
const REQUEST_DELAY_MS = 400;

export interface OjkListingItem {
  date: string;
  href: string;
  title: string;
}

export interface OjkFine {
  respondent: string;
  role: string | null;
  amount: number;
  joint: boolean;
  statement: string;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export function decodeHtml(input: string) {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseOjkDate(input: string): string | null {
  const match = input.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

export function parseOjkListing(html: string): OjkListingItem[] {
  const items: OjkListingItem[] = [];
  const pattern = /<li class="list-group-item">\s*<div class="date">\s*([^<]*?)\s*<\/div>\s*<a href="([^"]*)" class="group-item-title">\s*<strong>([\s\S]*?)<\/strong>/g;
  for (const match of html.matchAll(pattern)) {
    items.push({
      date: match[1].trim(),
      href: decodeHtml(match[2]),
      title: normalizeWhitespace(decodeHtml(match[3].replace(/<[^>]+>/g, ""))),
    });
  }
  return items;
}

/** Whether a listing title is an announcement that can carry a fine. */
export function isOjkSanctionTitle(title: string) {
  return /sanction/i.test(title) && !/fulfil|revocation of|lifts|rescind/i.test(title);
}

export function parseOjkHiddenFields(html: string) {
  const fields = new URLSearchParams();
  for (const input of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = input[0].match(/name="([^"]*)"/);
    const value = input[0].match(/value="([^"]*)"/);
    if (name) fields.set(name[1], value ? decodeHtml(value[1]) : "");
  }
  return fields;
}

/** The post-back target that moves the listing forward one step, or null on the last page. */
export function nextOjkPagerTarget(html: string): string | null {
  const current = Number(html.match(/currentPagingButton">(\d+)</)?.[1] ?? 0);
  const links = [...html.matchAll(/__doPostBack\(&#39;([^&]*DataPager[^&]*)&#39;,&#39;&#39;\)"([^>]*)>([^<]*)</g)]
    .map((match) => ({ target: match[1], attrs: match[2], label: match[3].trim() }));
  const numbered = links.find((link) => /^\d+$/.test(link.label) && Number(link.label) === current + 1);
  if (numbered) return numbered.target;
  const ellipsis = links.filter((link) => link.label === "...").pop();
  if (ellipsis) return ellipsis.target;
  return links.find((link) => /arrow-right/.test(link.attrs))?.target ?? null;
}

/**
 * "IDR1,350,000,000.00" and "Rp2.575.000.000,00" both become whole rupiah. Anything that is
 * not a cleanly grouped figure (for example "Rp500.000.00,00") is refused rather than guessed.
 */
export function parseOjkAmount(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/[.,]+$/, "");
  if (!/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?$/.test(cleaned) && !/^\d+$/.test(cleaned)) return null;
  const whole = cleaned.replace(/[.,]\d{2}$/, (tail, offset: number) => (cleaned.slice(0, offset).match(/[.,]\d{3}/) ? "" : tail));
  const digits = whole.replace(/[.,]/g, "");
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Article body text of one announcement page, with block tags kept as spaces. */
export function extractOjkNoticeText(html: string) {
  const start = html.indexOf('class="article-wrap"');
  if (start < 0) return null;
  const end = html.indexOf("Other Articles", start);
  const body = html.slice(start, end > start ? end : start + 60_000)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ");
  const text = normalizeWhitespace(decodeHtml(body).replace(/[​­]/g, ""));
  const content = text.indexOf("Page Content");
  return content >= 0 ? text.slice(content + "Page Content".length).trim() : text;
}

export function extractOjkReference(html: string) {
  return html.match(/(PENG-?\s?\d+[./]PM[.\d/]*\.?\d*\.?\d{4})/i)?.[1]?.replace(/\s+/g, "") ?? null;
}

const FINE_PATTERN = /(fined|monetary fine in the amount of|fine of|[Pp]enalty (?:of|in the amount of)|penalty|in the amount of)\s+(?:of\s+)?(?:IDR|Rp\.?)\s*(\d[\d.,]*\d)/g;
/** Any penalty wording followed closely by a rupiah figure; each must resolve to a respondent. */
const LOOSE_PENALTY_PATTERN = /(?:penalt(?:y|ies)|\bfine[ds]?\b|in the amount of)[^.;:]{0,80}?(?:IDR|Rp)\.?\s*\d/gi;
const NON_PENALTY_CONTEXT = /\b(?:daily|per day|late payment|late-payment|restitution|compensation|refund|disgorge)/i;

function stripHonorifics(name: string) {
  return name
    .replace(/^(?:Mr|Mrs|Ms|Messrs)\.?\s+/i, "")
    .replace(/^(?:Public Accountant|Appraiser)\s+/i, "")
    .trim();
}

const ROLE_PARENTHETICAL = /director|commissioner|president|chief|officer|auditor|accountant|appraiser|member/i;

function cleanRespondent(raw: string) {
  // Drop role parentheticals "(Director)" but keep corporate ones such as "(Persero)".
  let value = raw.replace(/\(([^)]*)\)/g, (whole, inner: string) =>
    ROLE_PARENTHETICAL.test(inner) || /^(?:PT\s+)?[A-Z&]{2,10}$/.test(inner.trim()) || /^d\.h\./i.test(inner.trim()) ? " " : whole);
  // Drop a trailing company/period tail: "... of PT X Tbk for the 2022 period".
  value = value.replace(/\s+(?:of|at|for)\s+(?:PT|the)\b.*$/i, "");
  value = value.replace(/\s+for the [^,]*$/i, "");
  value = normalizeWhitespace(stripHonorifics(normalizeWhitespace(value)))
    .replace(/\s+,/g, ",")
    .replace(/[,;:\s]+$/, "");
  // A numbered heading repeats the respondent: "PT X Tbk PT X Tbk".
  const half = value.length / 2;
  if (value.length % 2 === 1) {
    const first = value.slice(0, Math.floor(half));
    const second = value.slice(Math.floor(half) + 1);
    if (first === second) value = first;
  }
  return value;
}

function cleanRole(raw: string) {
  return normalizeWhitespace(raw.replace(/\s+(?:of|at)\s+PT\b.*$/i, "").replace(/\s+for the\b.*$/i, "")).replace(/[,\s]+$/, "");
}

function splitRole(subject: string): { names: string; role: string | null } {
  const match = subject.match(/^(.*?),?\s+as\s+(.*)$/i);
  if (!match) return { names: subject, role: null };
  return { names: match[1], role: normalizeWhitespace(match[2].replace(/[,\s]+$/, "")) };
}

function titleSubject(title: string) {
  const match = title.match(/\b(?:on|against|to)\s+(.+)$/i);
  return match ? cleanRespondent(match[1]) : null;
}

/**
 * Pull each explicit monetary fine out of an announcement. The subject is found
 * from the sentence the amount sits in ("X is fined", "OJK imposes X ... Penalty of")
 * and, for single-respondent notices, from the title.
 */
export function extractOjkFinesDetailed(title: string, text: string): { fines: OjkFine[]; unresolved: number } {
  const fines: OjkFine[] = [];
  let resolved = 0;
  const seen = new Set<string>();
  let previousEnd = 0;
  const statementCount = [...text.matchAll(FINE_PATTERN)].length;

  for (const match of text.matchAll(FINE_PATTERN)) {
    const index = match.index ?? 0;
    const amount = parseOjkAmount(match[2]);
    // Text before the amount, ending with the verb ("is fined", "Penalty of").
    const lead = text.slice(Math.max(previousEnd, index - 700), index + match[1].length);
    previousEnd = index + match[0].length;
    if (amount === null) continue;
    const around = text.slice(Math.max(0, index - 120), index + match[0].length + 160);
    if (NON_PENALTY_CONTEXT.test(around)) {
      resolved += 1;
      continue;
    }

    let subject: string | null = null;
    let joint = false;
    const trimmedLead = lead.trimEnd();

    const isFined = /(?:is|are)\s+(?:jointly and severally\s+)?fined$/i.test(trimmedLead);
    const toMatches = [...lead.matchAll(/\bTo\s+(?=(?:Mr|Mrs|Ms)\b)/g)];
    const toMatch = toMatches[toMatches.length - 1];
    const imposes = [...lead.matchAll(/OJK impos(?:es|ed)\s+(?:on\s+)?/g)].pop();
    const listItem = /(?:^|\s)[a-z]\.\s+(?:administrative sanctions?\s+(?:in the form of\s+)?(?:a\s+)?)?(?:fine|penalty)(?:\s+of)?$/i.test(trimmedLead);

    // "a. Penalty of Rp55.000.000,00 ... to Mr. Johannes;" names the respondent after the amount.
    let forwardNamed: string | null = null;
    if (listItem) {
      const forward = text.slice(index + match[0].length, index + match[0].length + 450).split(/OJK impos|Penalty of/)[0];
      forwardNamed = forward.match(/\bto\s+((?:Mr|Mrs|Ms)\.?\s+[^;.,]+?)\s*(?:[;,]|\.\s|\.$|$)/)?.[1] ?? null;
    }

    if (forwardNamed) {
      subject = forwardNamed;
    } else if (isFined) {
      joint = /jointly and severally\s+fined$/i.test(trimmedLead);
      const head = lead.replace(/\s*(?:is|are)\s+(?:jointly and severally\s+)?fined\s*$/i, "");
      const boundaries = [...head.matchAll(/(?:^|[.;:]\s+|\s\d{1,2}\.\s+|\s[a-z]\.\s+)(?=[A-Z])/g)];
      const last = boundaries[boundaries.length - 1];
      subject = last ? head.slice((last.index ?? 0) + last[0].length) : head;
    } else if (/(?<!fine )in the amount of$/i.test(trimmedLead)) {
      // "Mr. X as President Director of PT Y in the amount of Rp500.000.000,00 for being proven ..."
      const head = lead.replace(/\s*in the amount of\s*$/i, "");
      const boundaries = [...head.matchAll(/(?:^|[.;:]\s+|\s\d{1,2}\.\s+|\s[a-z]\.\s+)(?=[A-Z])/g)];
      const last = boundaries[boundaries.length - 1];
      subject = last ? head.slice((last.index ?? 0) + last[0].length) : head;
    } else if (toMatch && /subject to/i.test(lead.slice(toMatch.index))) {
      // "To Mr. X as Director of PT Y is subject to Administrative Sanctions in the form of a Penalty of ..."
      const after = lead.slice((toMatch.index ?? 0) + toMatch[0].length);
      subject = after.split(/\s+(?:is\s+|are\s+)?subject to\b/i)[0];
    } else if (imposes) {
      const after = lead.slice((imposes.index ?? 0) + imposes[0].length);
      const cut = after.search(/,\s*as\b|\s+as\s+(?:the|a|an)\b|\s+(?:an?\s+)?Administrative|\s+the following|\s+the\s+(?:Director|President|Commissioner|Shareholder|Owner)\b|\s+penalty|\s+a penalty|\s+with a/i);
      subject = cut > 0 ? after.slice(0, cut) : after;
      // The role belongs to the respondent even when it was cut from the name.
      const roleMatch = after.match(/,\s*as\s+(?:the\s+|a\s+|an\s+)?([^,]+?)(?:\s+of\s+PT[^,]*)?,/i);
      if (roleMatch) subject = `${subject}, as ${roleMatch[1]}`;
    } else if (statementCount === 1) {
      // A notice with a single penalty statement and no named subject concerns the respondent in its title.
      subject = titleSubject(title);
    }
    if (subject && /^administrative sanctions?\b/i.test(subject.trim())) {
      // "OJK imposes Administrative Sanctions and Written order for PT KAM as follows: Imposes penalty of ..."
      subject = titleSubject(title) ?? subject.match(/\bfor\s+(PT\s[^:]+?)\s+as follows/i)?.[1] ?? null;
    }
    if (!subject) continue;

    const people = normalizeWhitespace(subject).split(/\s+and\s+(?=(?:Mr|Mrs|Ms)\b)/);
    if (people.length > 1) {
      // "Mrs. A as President Director and Mr. B as Director ... penalty ... join responsibility"
      joint = true;
      subject = people.map((person) => stripHonorifics(person.replace(/\s+as\s+.*$/i, ""))).join(" and ");
    }

    const { names, role } = splitRole(normalizeWhitespace(subject));
    const respondent = cleanRespondent(names);
    if (!respondent || respondent.length < 3 || respondent.length > 200) continue;
    const key = respondent.toLowerCase();
    resolved += 1;
    if (seen.has(key)) continue;
    seen.add(key);
    fines.push({
      respondent,
      role: role ? cleanRole(role) || null : null,
      amount,
      joint,
      statement: normalizeWhitespace(text.slice(Math.max(0, index - 160), index + match[0].length + 60)),
    });
  }
  const loose = [...text.matchAll(LOOSE_PENALTY_PATTERN)].length;
  return { fines, unresolved: Math.max(0, loose - resolved) };
}

export function extractOjkFines(title: string, text: string): OjkFine[] {
  return extractOjkFinesDetailed(title, text).fines;
}

function ojkBreachCategories(text: string) {
  const categories = new Set<string>(["MONETARY_PENALTY"]);
  const corpus = text.toLowerCase();
  if (/financial statements?|fairness opinion|audit/.test(corpus)) categories.add("DISCLOSURE");
  if (/affiliated transaction|material transaction|conflict of interest/.test(corpus)) categories.add("GOVERNANCE");
  if (/prudential|risk management|net working capital|minimum capital/.test(corpus)) categories.add("SYSTEMS_AND_CONTROLS");
  if (/money laundering|know your customer/.test(corpus)) categories.add("AML");
  if (/redemption|mutual fund|investor/.test(corpus)) categories.add("CLIENT_PROTECTION");
  if (/prohibition|revoc/.test(corpus)) categories.add("LICENCE_OR_PROHIBITION");
  return [...categories];
}

export class OjkUnresolvedAmountsError extends Error {
  constructor(title: string, readonly unresolved: number) {
    super(`OJK notice "${title}" has ${unresolved} penalty figure(s) that could not be attributed to a respondent`);
    this.name = "OjkUnresolvedAmountsError";
  }
}

export function buildOjkRecords(input: { title: string; date: string; url: string; reference: string | null; text: string }) {
  const dateIssued = parseOjkDate(input.date);
  if (!dateIssued) throw new Error(`OJK announcement has an unreadable date: ${input.date}`);
  const { fines, unresolved } = extractOjkFinesDetailed(input.title, input.text);
  if (unresolved > 0) {
    // A figure we could not attribute to a named respondent: take none of the notice rather than a partial or wrong set.
    throw new OjkUnresolvedAmountsError(input.title, unresolved);
  }
  const noticeKey = input.reference ?? input.url.split("/").pop()!.replace(/\.aspx$/i, "");
  return fines.map((fine) => {
    const amountText = `IDR ${fine.amount.toLocaleString("en-GB")}`;
    const rolePart = fine.role ? ` (${fine.role})` : "";
    const jointPart = fine.joint ? " jointly and severally" : "";
    return buildEuFineRecord({
      regulator: "OJK",
      regulatorFullName: "Otoritas Jasa Keuangan (Indonesia Financial Services Authority)",
      countryCode: "ID",
      countryName: "Indonesia",
      firmIndividual: fine.respondent,
      firmCategory: fine.role ?? (/^PT\b/i.test(fine.respondent) ? "Company" : "Individual"),
      amount: fine.amount,
      currency: "IDR",
      dateIssued,
      breachType: "Administrative monetary sanction",
      breachCategories: ojkBreachCategories(input.text),
      summary: `${fine.respondent}${rolePart} fined ${amountText}${jointPart} by OJK. ${input.title}. ${fine.statement}`,
      finalNoticeUrl: input.url,
      sourceUrl: OJK_LISTING_URL,
      dedupeKey: `${noticeKey}:${fine.respondent.toLowerCase()}`,
      rawPayload: { title: input.title, reference: input.reference, statement: fine.statement, joint: fine.joint },
    });
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function ojkFetch(url: string, form?: URLSearchParams) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: form ? "POST" : "GET",
        headers: {
          "User-Agent": USER_AGENT,
          ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: form?.toString(),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (/Incapsula|_Incapsula_Resource|Just a moment|requested URL was rejected/i.test(body.slice(0, 4_000))) {
        throw new Error("OJK served a bot challenge instead of the page");
      }
      return body;
    } catch (error) {
      lastError = error;
      await sleep(1_500 * (attempt + 1));
    }
  }
  throw new Error(`OJK request failed for ${url}: ${(lastError as Error)?.message ?? lastError}`);
}

export async function loadOjkListing() {
  let html = await ojkFetch(OJK_LISTING_URL);
  const items = [...parseOjkListing(html)];
  const seenPages = new Set<string>();
  for (let page = 1; page < MAX_LISTING_PAGES; page += 1) {
    const target = nextOjkPagerTarget(html);
    if (!target) break;
    const form = parseOjkHiddenFields(html);
    form.set("__EVENTTARGET", target);
    form.set("__EVENTARGUMENT", "");
    await sleep(REQUEST_DELAY_MS);
    html = await ojkFetch(OJK_LISTING_URL, form);
    const pageItems = parseOjkListing(html);
    const signature = pageItems.map((item) => item.href).join("|");
    if (pageItems.length === 0 || seenPages.has(signature)) break;
    seenPages.add(signature);
    items.push(...pageItems);
  }
  return items;
}

export async function loadOjkLiveRecords() {
  console.log(`📡 Loading the official OJK announcements listing: ${OJK_LISTING_URL}`);
  const listing = await loadOjkListing();
  if (listing.length === 0) throw new Error("OJK announcements listing returned no items");
  const sanctionItems = listing.filter((item) => isOjkSanctionTitle(item.title));
  console.log(`   ${listing.length} announcements listed, ${sanctionItems.length} administrative-sanction announcements`);

  const records = [];
  let finedNotices = 0;
  for (const item of sanctionItems) {
    const url = new URL(item.href, OJK_ORIGIN).toString();
    await sleep(REQUEST_DELAY_MS);
    let html: string;
    try {
      html = await ojkFetch(url);
    } catch (error) {
      recordRunWarning(`OJK notice could not be fetched (${item.title}): ${(error as Error).message}`);
      continue;
    }
    const text = extractOjkNoticeText(html);
    if (!text) {
      recordRunWarning(`OJK notice has no readable body (${item.title})`);
      continue;
    }
    try {
      const built = buildOjkRecords({ title: item.title, date: item.date, url, reference: extractOjkReference(html), text });
      if (built.length > 0) finedNotices += 1;
      records.push(...built);
    } catch (error) {
      if (!(error instanceof OjkUnresolvedAmountsError)) throw error;
      recordRunWarning(`${error.message}; skipped (${url})`);
    }
  }
  console.log(`📊 Prepared ${records.length} OJK monetary sanctions from ${finedNotices} announcements`);
  return records;
}

export async function main() {
  await runScraper({
    name: "🇮🇩 OJK Administrative Sanctions Scraper",
    regulatorCode: "OJK",
    region: "APAC",
    liveLoader: loadOjkLiveRecords,
    testLoader: loadOjkLiveRecords,
    qualityContract: { minimumPreparedRecords: 5 },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ OJK scraper failed:", error);
    process.exit(1);
  });
}
