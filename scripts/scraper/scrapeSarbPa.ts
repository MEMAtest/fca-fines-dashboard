/**
 * South African Reserve Bank - Prudential Authority (PA) enforcement loader.
 *
 * Two official PA publications are loaded:
 *
 *  1. FIC Act administrative sanctions on supervised institutions (banks and
 *     insurers, 2014 onwards). These are published as an HTML table on the PA
 *     "Administrative sanctions" page and as a PDF extract whose file name
 *     changes (e.g. "...supervised institutions August.pdf"). The PDF URL is
 *     DISCOVERED from the PA functions page, never hard-coded, and is parsed as
 *     an independent cross-check of the HTML table.
 *  2. Administrative penalty orders under section 167 of the Financial Sector
 *     Regulation Act (FSR Act), listed in the "Regulatory actions" table on the
 *     PA functions page, each linking to the signed penalty order PDF.
 *
 * The SARB web application firewall rejects non-browser clients, so requests
 * carry browser-like headers. No rows are ever deleted by this loader.
 */
import "dotenv/config";
import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildEuFineRecord,
  fetchBinary,
  fetchText,
  makeAbsoluteUrl,
  normalizeWhitespace,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";
import { withStableIdentity } from "./lib/stableIdentity.js";
import { normalizeZarSpacing, parseZarAmounts, parseZarWordsAmount, wordsToNumber } from "./lib/zarAmounts.js";

const execFileAsync = promisify(execFile);

export const PA_BASE_URL = "https://www.resbank.co.za";
export const PA_FUNCTIONS_URL = `${PA_BASE_URL}/en/home/what-we-do/Prudentialregulation/functions-of-the-prudential-authority`;
export const PA_SANCTIONS_URL = `${PA_BASE_URL}/en/home/what-we-do/Prudentialregulation/Administrative-sanctions`;

export const SARB_BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

const REGULATOR = "SARBPA";
const REGULATOR_FULL_NAME = "South African Reserve Bank - Prudential Authority";

export interface PaFicActRow {
  no: number;
  institution: string;
  sector: "Bank" | "Insurer";
  /** Date of the SARB media release (publication date). */
  releaseDate: string;
  sanctionText: string;
  details: string[];
  mediaReleaseUrl: string | null;
}

export interface PaPenaltyOrderRow {
  orderDate: string;
  description: string;
  entity: string;
  outcome: string;
  orderUrl: string | null;
}

export interface PaOutcome {
  /** Financial penalty imposed (rand), including any suspended portion. */
  amount: number | null;
  /** Portion suspended on conditions (rand). */
  suspendedAmount: number | null;
  cautions: number;
  reprimands: number;
  directive: boolean;
  /** Reason the amount was left null, if any. */
  note: string | null;
}

// ---------------------------------------------------------------------------
// Outcome / amount parsing
// ---------------------------------------------------------------------------

const COUNT_WORDS: Record<string, number> = {
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function countOf(text: string, noun: RegExp): number {
  const match = text.match(new RegExp(`\\b(a|one|two|three|four|five|six|seven|eight|nine|ten)\\s+${noun.source}`, "i"));
  return match ? COUNT_WORDS[match[1].toLowerCase()] ?? 1 : 0;
}

/** Extracts the penalty, suspended portion and non-monetary actions from an outcome sentence. */
export function parsePaOutcome(rawText: string): PaOutcome {
  const text = normalizeZarSpacing(normalizeWhitespace(rawText));
  const sentences = text.split(/(?<=[.;])\s+(?=[A-Z])/);
  const lower = text.toLowerCase();

  const cautionMatch = lower.match(/\b(a|one|two|three|four|five|six|seven|eight|nine|ten)\s+cautions?\b/);
  const cautions = cautionMatch
    ? COUNT_WORDS[cautionMatch[1]] ?? 1
    : /cautions?\b/.test(lower) ? 1 : 0;
  const reprimands = /reprimands?/.test(lower)
    ? Math.max(countOf(text, /reprimands?/), 1)
    : 0;
  const directive = /directive to take remedial action|directed to take remedial/i.test(text);

  // --- total penalty: first amount (digits, else words) in the penalty phrase
  let amount: number | null = null;
  let note: string | null = null;
  const penaltyAt = text.search(/(?:financial\s+penalty|administrative\s+penalty|\bpenalty\b)/i);
  if (penaltyAt >= 0) {
    const tail = text.slice(penaltyAt);
    const digits = parseZarAmounts(tail);
    const words = parseZarWordsAmount(tail.slice(0, 200));
    const wordsIndex = words !== null ? tail.toLowerCase().search(/(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b[^.]*rands?\b/) : -1;
    if (digits.length && (wordsIndex < 0 || digits[0].index <= wordsIndex)) {
      amount = digits[0].amount;
      // "Penalty of R5 of which R3 million ... suspended and the remaining R2 million is payable":
      // the source dropped "million" from the headline figure. Reconcile against its own parts.
      const rest = digits.slice(1);
      if (amount < 1000 && rest.length >= 2) {
        const parts = rest[0].amount + rest[1].amount;
        if (Math.abs(parts - amount * 1_000_000) < 1) amount = parts;
      }
    } else if (words !== null) {
      amount = words;
    }
  }
  if (amount === null && /(?:financial|administrative)?\s*penalty/i.test(text)) {
    note = "penalty amount not stated in outcome text";
  }

  // --- suspended portion
  let suspendedAmount: number | null = null;
  // "Penalty of R3 000 000 ... will be suspended ... The remaining balance of R2 000 000 ... must be paid":
  // the headline figure is only the suspended part; the order's total is suspended + payable.
  const balance = text.match(/remaining\s+balance\s+of\s+(R\s?[\d][\d ,.]*(?:\s*(?:million|billion|thousand))?)/i);
  if (amount !== null && balance && !/\bof which\b|\btotal\b/i.test(text) && /(?:will be|is|are)\s+suspended/i.test(text)) {
    const payable = parseZarAmounts(balance[1])[0]?.amount;
    if (payable !== undefined) {
      suspendedAmount = amount;
      amount = Math.round((amount + payable) * 100) / 100;
    }
  }
  if (amount !== null && suspendedAmount === null) {
    const suspendedSentence = sentences.find((sentence) => /suspend/i.test(sentence));
    if (suspendedSentence) {
      if (/(?:fully|wholly|in full)\b[^.]*suspend|suspend[^.]*\bin full\b/i.test(suspendedSentence)) {
        suspendedAmount = amount;
      } else {
        const beforeSuspend = suspendedSentence.slice(0, suspendedSentence.search(/suspend/i));
        const sentenceDigits = parseZarAmounts(beforeSuspend);
        const sentenceWords = parseZarWordsAmount(beforeSuspend);
        let candidate: number | null = null;
        if (sentenceDigits.length) {
          // "R7.5 million of the financial penalty is suspended" -> first amount;
          // "The financial penalty of R15 million was, however suspended" -> only amount.
          candidate = sentenceDigits[0].amount;
        } else if (sentenceWords !== null) {
          candidate = sentenceWords;
        } else if (/penalty[^.]*\bis (?:however )?suspended|penalty[^.]*suspended for a period/i.test(suspendedSentence) && !/\bof which\b/i.test(suspendedSentence)) {
          // The whole penalty is suspended ("Penalty of X ... is suspended for a period").
          candidate = amount;
        }
        // A headline "of which R5 million is suspended" phrase.
        const ofWhich = suspendedSentence.match(/of which\s+(.{0,80}?)\s+(?:is|will be|are)\s+(?:be\s+)?suspended/i);
        if (ofWhich) {
          const inner = parseZarAmounts(ofWhich[1])[0]?.amount ?? parseZarWordsAmount(ofWhich[1] + " rand");
          if (inner !== null && inner !== undefined) candidate = inner;
        }
        // "...the remaining/balance R5 million is suspended" sentences name the suspended part directly.
        // "Three million of the penalty will be suspended" (number in words, no "rand").
        if (candidate === null || candidate === amount) {
          const lead = suspendedSentence.match(/((?:[A-Za-z-]+[\s,]+){0,6}?(?:thousand|million|hundred))\s+of\s+the\s+(?:administrative\s+)?penalty/i);
          const leadValue = lead ? wordsToNumber(lead[1].replace(/^.*;\s*/, "")) : null;
          if (leadValue !== null && leadValue > 0 && leadValue < amount) candidate = leadValue;
        }
        if (candidate !== null && candidate <= amount) suspendedAmount = candidate;
        else if (candidate !== null) note = "suspended figure exceeds penalty; left unset";
      }
    }
  }

  return { amount, suspendedAmount, cautions, reprimands, directive, note };
}

/**
 * The SARB media-release date is a publication date. The sanction itself is
 * dated by the start of the suspension period ("...suspended for a period of
 * three years from 25 September 2019"), which the table states for most
 * suspended penalties. Use that decision date when it is plausible (before the
 * release, within 400 days); otherwise fall back to the release date.
 */
export function resolvePaDecisionDate(
  sanctionText: string,
  releaseDate: string,
): { date: string; basis: "sanction_date" | "media_release_date" } {
  const match = sanctionText.match(/\bfrom\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (match) {
    const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const month = months.indexOf(match[2].toLowerCase()) + 1;
    const iso = `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
    const gapDays = (Date.parse(releaseDate) - Date.parse(iso)) / 86_400_000;
    if (Number.isFinite(gapDays) && gapDays >= 0 && gapDays <= 400) return { date: iso, basis: "sanction_date" };
  }
  return { date: releaseDate, basis: "media_release_date" };
}

// ---------------------------------------------------------------------------
// HTML parsing
// ---------------------------------------------------------------------------

function cellText($: cheerio.CheerioAPI, cell: Parameters<typeof $>[0]): string {
  return normalizeWhitespace($(cell).text().replace(/[​ ]/g, " "));
}

function cellLines($: cheerio.CheerioAPI, cell: Parameters<typeof $>[0]): string[] {
  const html = ($(cell).html() || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|li|div)>/gi, "\n");
  return cheerio
    .load(`<div>${html}</div>`)("div")
    .text()
    .split("\n")
    .map((line) => normalizeWhitespace(line.replace(/[​ ]/g, " ")))
    .filter(Boolean);
}

function balanceParens(name: string): string {
  const open = (name.match(/\(/g) || []).length;
  const close = (name.match(/\)/g) || []).length;
  return open > close ? `${name})` : name;
}

/** Parses the FIC Act sanctions tables (banks first, then insurers) from the PA "Administrative sanctions" page. */
export function parsePaFicActSanctionsHtml(html: string, baseUrl = PA_SANCTIONS_URL): PaFicActRow[] {
  const $ = cheerio.load(html);
  const rows: PaFicActRow[] = [];
  const accordionTitles = $(".cmp-accordion__title").map((_, el) => normalizeWhitespace($(el).text()).toLowerCase()).get();
  let tableIndex = 0;
  $("table").each((_, table) => {
    const headerText = normalizeWhitespace($(table).find("tr").first().text()).toLowerCase();
    if (!headerText.includes("date of sarb media release")) return;
    const sector: PaFicActRow["sector"] =
      accordionTitles[tableIndex] === "insurance" || (tableIndex > 0 && accordionTitles.length === 0) ? "Insurer" : "Bank";
    tableIndex += 1;
    $(table).find("tr").slice(1).each((__, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 4) return;
      const no = Number.parseInt(cellText($, cells.get(0)), 10);
      const institution = balanceParens(cellText($, cells.get(1)));
      const releaseDate = cellText($, cells.get(2)).match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const sanctionText = cellText($, cells.get(3));
      if (!Number.isFinite(no) || !institution || !releaseDate || !sanctionText) return;
      const details = cells.length > 4 ? cellLines($, cells.get(4)!) : [];
      const href = $(tr).find("a[href]").first().attr("href");
      rows.push({
        no,
        institution,
        sector,
        releaseDate,
        sanctionText,
        details,
        mediaReleaseUrl: href ? makeAbsoluteUrl(baseUrl, href) : null,
      });
    });
  });
  return rows;
}

/** Parses the FSR Act "Regulatory actions" table (section 167 administrative penalty orders). */
export function parsePaPenaltyOrdersHtml(html: string, baseUrl = PA_FUNCTIONS_URL): PaPenaltyOrderRow[] {
  const $ = cheerio.load(html);
  const rows: PaPenaltyOrderRow[] = [];
  $("table").each((_, table) => {
    const headerText = normalizeWhitespace($(table).find("tr").first().text()).toLowerCase();
    if (!(headerText.includes("outcome") && headerText.includes("entity") && headerText.includes("description"))) return;
    $(table).find("tr").slice(1).each((__, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 4) return;
      const orderDate = cellText($, cells.get(0)).match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const description = cellText($, cells.get(1));
      const entity = cellText($, cells.get(2)).replace(/\.$/, "");
      const outcome = cellText($, cells.get(3));
      const href = $(tr).find("a[href]").first().attr("href");
      if (!orderDate || !entity || !outcome) return;
      rows.push({ orderDate, description, entity, outcome, orderUrl: href ? makeAbsoluteUrl(baseUrl, href) : null });
    });
  });
  return rows;
}

/**
 * Finds the current "Administrative sanctions imposed on supervised
 * institutions" PDF on the PA functions page. The file name embeds a month
 * ("... August.pdf") and changes, so the link is matched by its content.
 */
export function discoverPaSanctionsPdfUrl(html: string, baseUrl = PA_FUNCTIONS_URL): string | null {
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href") || "";
    let decoded = href;
    try { decoded = decodeURIComponent(href); } catch { /* keep raw */ }
    if (/\.pdf(?:$|[?#])/i.test(decoded) && /administrative\s+sanctions\s+imposed\s+on\s+supervised/i.test(decoded)) {
      candidates.push(makeAbsoluteUrl(baseUrl, href));
    }
  });
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// PDF parsing (pdftotext -layout)
// ---------------------------------------------------------------------------

export interface PaPdfRow {
  no: number;
  institution: string;
  releaseDate: string;
  sanctionText: string;
}

/** Parses the layout text of the PA sanctions PDF; keeps every numbered row (numbering gaps are source gaps). */
export function parsePaSanctionsPdfText(layoutText: string): PaPdfRow[] {
  const lines = layoutText.replace(/\r/g, "").replace(/\f/g, "").split("\n");
  const rows: PaPdfRow[] = [];
  let current: { no: number; releaseDate: string; nameCol: number; dateCol: number; sanctionCol: number; detailCol: number; name: string[]; sanction: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    rows.push({
      no: current.no,
      institution: normalizeWhitespace(current.name.join(" ")),
      releaseDate: current.releaseDate,
      sanctionText: normalizeWhitespace(current.sanction.join(" ")),
    });
    current = null;
  };
  for (const line of lines) {
    const start = line.match(/^(\d{1,2})(\s{2,})(\S.*?)(\s{2,})(\d{4}-\d{2}-\d{2})(\s+)(\S.*)$/);
    if (start) {
      flush();
      const nameCol = start[1].length + start[2].length;
      const dateCol = nameCol + start[3].length + start[4].length;
      const sanctionCol = dateCol + start[5].length + start[6].length;
      const bullet = line.slice(sanctionCol).search(/\s{2,}(?:•|Section)/);
      const detailCol = bullet >= 0 ? sanctionCol + bullet : line.length;
      current = {
        no: Number(start[1]),
        releaseDate: start[5],
        nameCol, dateCol, sanctionCol, detailCol,
        name: [start[3]],
        sanction: [line.slice(sanctionCol, detailCol)],
      };
      continue;
    }
    if (!current) continue;
    if (/^\s*Page \d+ of \d+/.test(line) || /^No\s+Bank/.test(line) || /^\s+media release/.test(line)) {
      continue;
    }
    if (!line.trim()) continue;
    const name = line.slice(current.nameCol, current.dateCol).trim();
    const sanction = line.slice(current.sanctionCol, current.detailCol).trim();
    if (name) current.name.push(name);
    if (sanction) current.sanction.push(sanction);
  }
  flush();
  return rows.filter((row) => row.institution && row.sanctionText);
}

async function pdfBufferToLayoutText(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mema-sarb-pa-"));
  try {
    const path = join(dir, "document.pdf");
    await writeFile(path, buffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", path, "-"], { maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Record building
// ---------------------------------------------------------------------------

function formatZar(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `R${Number.isInteger(millions) ? millions : Number(millions.toFixed(3))} million`;
  }
  return `R${amount.toLocaleString("en-ZA").replace(/ /g, " ")}`;
}

function describeOutcome(outcome: PaOutcome): string[] {
  const parts: string[] = [];
  if (outcome.amount !== null) {
    if (outcome.suspendedAmount !== null && outcome.suspendedAmount >= outcome.amount) {
      parts.push(`financial penalty of ${formatZar(outcome.amount)}, wholly suspended on conditions`);
    } else if (outcome.suspendedAmount !== null) {
      parts.push(`financial penalty of ${formatZar(outcome.amount)} of which ${formatZar(outcome.suspendedAmount)} is suspended on conditions`);
    } else {
      parts.push(`financial penalty of ${formatZar(outcome.amount)}`);
    }
  }
  if (outcome.cautions) parts.push(outcome.cautions === 1 ? "a caution not to repeat the conduct" : `${outcome.cautions} cautions not to repeat the conduct`);
  if (outcome.reprimands) parts.push(outcome.reprimands === 1 ? "a reprimand" : `${outcome.reprimands} reprimands`);
  if (outcome.directive) parts.push("a directive to take remedial action");
  return parts;
}

function actionLabel(outcome: PaOutcome): string {
  const labels: string[] = [];
  if (outcome.amount !== null) labels.push(outcome.suspendedAmount !== null && outcome.suspendedAmount >= (outcome.amount ?? 0) ? "Suspended financial penalty" : "Financial penalty");
  if (outcome.cautions) labels.push("Caution");
  if (outcome.reprimands) labels.push("Reprimand");
  if (outcome.directive) labels.push("Remedial directive");
  return labels.join(" + ") || "Administrative sanction";
}

const PROVISION_PATTERN = /Sections?\s+([0-9A-Za-z(), /and]+?):\s*([^•]+)/;

function provisionSummary(details: string[]): string[] {
  const out: string[] = [];
  for (const line of details) {
    const cleaned = line.replace(/^•\s*/, "");
    const match = cleaned.match(PROVISION_PATTERN);
    out.push(match ? `section ${match[1].trim()} (${match[2].trim().replace(/\s*\(.*$/, "")})` : cleaned);
  }
  return [...new Set(out.filter(Boolean))];
}

export function buildPaFicActRecord(row: PaFicActRow): DbReadyRecord {
  const outcome = parsePaOutcome(row.sanctionText);
  const decision = resolvePaDecisionDate(row.sanctionText, row.releaseDate);
  const provisions = provisionSummary(row.details);
  const actions = describeOutcome(outcome);
  const summary = [
    `${row.institution} was sanctioned by the Prudential Authority (SARB) under the Financial Intelligence Centre Act 38 of 2001`,
    actions.length ? `: ${actions.join(", ")}` : "",
    provisions.length ? `. Non-compliance found with ${provisions.join("; ")}` : "",
    ".",
  ].join("");
  const record = buildEuFineRecord({
    regulator: REGULATOR,
    regulatorFullName: REGULATOR_FULL_NAME,
    countryCode: "ZA",
    countryName: "South Africa",
    firmIndividual: row.institution,
    firmCategory: row.sector === "Bank" ? "Bank" : "Insurer",
    amount: outcome.amount,
    currency: "ZAR",
    dateIssued: decision.date,
    breachType: `${actionLabel(outcome)} - FIC Act non-compliance`,
    breachCategories: outcome.amount !== null ? ["AML", "MONETARY_SANCTION"] : ["AML", "SUPERVISORY_SANCTION"],
    summary: summary.slice(0, 1000),
    finalNoticeUrl: row.mediaReleaseUrl || PA_SANCTIONS_URL,
    sourceUrl: PA_SANCTIONS_URL,
    dedupeKey: `fic-act::${row.sector}::${row.no}::${row.institution}::${row.releaseDate}`,
    rawPayload: { ...row, outcome, decisionDate: decision.date, dateBasis: decision.basis, legalBasis: "FIC Act s45C" },
  });
  return withStableIdentity(record, `fic-act::${row.releaseDate}::${row.institution.toLowerCase().replace(/[^a-z0-9]/g, "")}::${row.sector}`);
}

function extractContravention(description: string): string | null {
  const match = description.match(/(?:regarding|for)\s+(?:a\s+)?(?:the\s+)?(?:breach|contravention)s?\s+of\s+(.{5,200}?)(?:,?\s+(?:by|where|whereby|as it)\b|\.\s|$)/i)
    || description.match(/contravened\s+(.{5,200}?)(?:,?\s+(?:as|by|which|where)\b|\.\s|$)/i)
    || description.match(/failed to comply with\s+(.{5,200}?)(?:\s+read in|\.\s|$)/i);
  return match ? normalizeWhitespace(match[1]).replace(/[.;,]$/, "") : null;
}

export function buildPaPenaltyOrderRecord(row: PaPenaltyOrderRow): DbReadyRecord {
  const outcome = parsePaOutcome(row.outcome);
  const contravention = extractContravention(row.description);
  const actions = describeOutcome(outcome);
  const summary = [
    `${row.entity} was fined by the Prudential Authority (SARB) under section 167 of the Financial Sector Regulation Act 9 of 2017`,
    actions.length ? `: ${actions.join(", ")}` : ".",
    actions.length && contravention ? `. Contravention: ${contravention}` : contravention ? ` Contravention: ${contravention}` : "",
    actions.length ? "." : "",
  ].join("");
  const orderFile = row.orderUrl ? decodeURIComponent(row.orderUrl.split("/").pop() || "") : "";
  const record = buildEuFineRecord({
    regulator: REGULATOR,
    regulatorFullName: REGULATOR_FULL_NAME,
    countryCode: "ZA",
    countryName: "South Africa",
    firmIndividual: row.entity,
    firmCategory: "Supervised financial institution",
    amount: outcome.amount,
    currency: "ZAR",
    dateIssued: row.orderDate,
    breachType: contravention ? `Administrative penalty - ${contravention}`.slice(0, 250) : "Administrative penalty (FSR Act s167)",
    breachCategories: outcome.amount !== null ? ["PRUDENTIAL", "MONETARY_SANCTION"] : ["PRUDENTIAL", "SUPERVISORY_SANCTION"],
    summary: summary.slice(0, 1000),
    finalNoticeUrl: row.orderUrl || PA_FUNCTIONS_URL,
    sourceUrl: PA_FUNCTIONS_URL,
    // The order file name distinguishes same-day orders (e.g. five Hollard entities on 2025-10-30).
    dedupeKey: `fsr-s167::${row.orderDate}::${row.entity}::${orderFile}`,
    rawPayload: { ...row, outcome, legalBasis: "FSR Act s167" },
  });
  return withStableIdentity(record, `fsr-s167::${row.orderDate}::${row.entity.toLowerCase().replace(/[^a-z0-9]/g, "")}::${orderFile.toLowerCase()}`);
}

export function buildPaRecords(ficAct: PaFicActRow[], orders: PaPenaltyOrderRow[]): DbReadyRecord[] {
  return [...ficAct.map(buildPaFicActRecord), ...orders.map(buildPaPenaltyOrderRecord)].sort((a, b) =>
    b.dateIssued.localeCompare(a.dateIssued),
  );
}

/**
 * Rows present in the PDF extract but absent from the HTML table (matched on
 * institution + media-release date). The PDF is an older cut of the same
 * register, so this should be empty; anything returned is added so no
 * official row is dropped.
 */
export function findPdfOnlyRows(pdfRows: PaPdfRow[], htmlRows: PaFicActRow[]): PaPdfRow[] {
  const key = (name: string, date: string) => `${date}::${name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
  const known = new Set(htmlRows.map((row) => key(row.institution, row.releaseDate)));
  return pdfRows.filter((row) => !known.has(key(row.institution, row.releaseDate)));
}

export async function loadPaLiveRecords(): Promise<DbReadyRecord[]> {
  const headers = SARB_BROWSER_HEADERS;
  const functionsHtml = await fetchText(PA_FUNCTIONS_URL, { headers });
  const sanctionsHtml = await fetchText(PA_SANCTIONS_URL, { headers });

  const ficAct = parsePaFicActSanctionsHtml(sanctionsHtml);
  const orders = parsePaPenaltyOrdersHtml(functionsHtml);
  if (!ficAct.length) throw new Error("PA FIC Act sanctions table returned zero rows");
  if (!orders.length) throw new Error("PA section 167 penalty-order table returned zero rows");

  // Discover the PDF extract from the parent page and reconcile it with the HTML table.
  const pdfUrl = discoverPaSanctionsPdfUrl(functionsHtml);
  const extra: PaFicActRow[] = [];
  if (!pdfUrl) {
    console.warn("⚠️ PA sanctions PDF link not found on the functions page; relying on the HTML table");
  } else {
    try {
      const pdfRows = parsePaSanctionsPdfText(await pdfBufferToLayoutText(await fetchBinary(pdfUrl, { headers, maxRedirects: 5 })));
      const missing = findPdfOnlyRows(pdfRows, ficAct);
      console.log(`📄 PA sanctions PDF ${pdfUrl}: ${pdfRows.length} rows, ${missing.length} not in HTML table`);
      for (const row of missing) {
        extra.push({ no: row.no, institution: row.institution, sector: "Bank", releaseDate: row.releaseDate, sanctionText: row.sanctionText, details: [], mediaReleaseUrl: pdfUrl });
      }
    } catch (error) {
      console.warn(`⚠️ PA sanctions PDF cross-check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return buildPaRecords([...ficAct, ...extra], orders);
}

export async function main() {
  await runScraper({
    name: "🇿🇦 SARB Prudential Authority Enforcement Scraper",
    region: "Africa",
    regulatorCode: "SARBPA",
    liveLoader: loadPaLiveRecords,
    testLoader: loadPaLiveRecords,
    qualityContract: { minimumPreparedRecords: 60 },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error("❌ SARB PA scraper failed:", error); process.exit(1); });
}
