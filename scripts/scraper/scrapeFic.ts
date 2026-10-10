/**
 * South Africa - Financial Intelligence Centre (FIC) administrative sanctions.
 *
 * The public pages (fic.gov.za/compliance/sanctions-issued-by-the-fic/ and
 * .../sanctions-issued-by-supervisory-bodies/) render their tables with the
 * Document Library Pro WordPress plugin via JavaScript, but the documents are
 * ordinary `dlp_document` posts exposed by the WordPress REST API:
 *
 *   /wp-json/wp/v2/dlp_document?doc_categories=<id>&per_page=100
 *
 * so no browser is needed. Category "sanctions-issued-by-fic" holds the FIC's
 * own sanctions (the records this loader publishes); category
 * "sanctions-issued-by-supervisory-bodies" re-hosts sanctions issued by the
 * SARB Prudential Authority and the FSCA. Those belong to the issuing body and
 * are already held under SARBPA and FSCA, so they are NOT emitted here (that
 * would double-count them); they are only classified and counted.
 *
 * Each sanction is a PDF. Text-layer PDFs are parsed live; scanned PDFs
 * (2017-2021 and some later notices) use the reviewed OCR snapshot in
 * data/ficScannedExtractions.ts. Amounts are published only when the document's
 * own figures reconcile, otherwise null. Nothing is ever deleted by this loader.
 */
import "dotenv/config";
import axios from "axios";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildEuFineRecord,
  fetchBinary,
  mapWithConcurrency,
  normalizeWhitespace,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { runScraper } from "./lib/runScraper.js";
import { recordRunWarning } from "./lib/runWarnings.js";
import { withStableIdentity } from "./lib/stableIdentity.js";
import { parseFicSanctionText, type FicActionType, type ParsedFicSanction } from "./lib/ficSanctionText.js";
import { FIC_SCANNED_EXTRACTIONS } from "./data/ficScannedExtractions.js";

const execFileAsync = promisify(execFile);

export const FIC_BASE_URL = "https://www.fic.gov.za";
export const FIC_API_URL = `${FIC_BASE_URL}/wp-json/wp/v2`;
export const FIC_SANCTIONS_PAGE_URL = `${FIC_BASE_URL}/compliance/sanctions-issued-by-the-fic/`;
export const FIC_SUPERVISORY_PAGE_URL = `${FIC_BASE_URL}/compliance/sanctions-issued-by-supervisory-bodies/`;
export const FIC_OWN_CATEGORY_SLUG = "sanctions-issued-by-fic";
export const FIC_SUPERVISORY_CATEGORY_SLUG = "sanctions-issued-by-supervisory-bodies";
/** Fallback ids if the slug lookup fails (verified 2026-10-10). */
const FALLBACK_CATEGORY_IDS: Record<string, number> = {
  [FIC_OWN_CATEGORY_SLUG]: 120,
  [FIC_SUPERVISORY_CATEGORY_SLUG]: 119,
};

const FIC_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9",
};

export interface FicDocument {
  id: number;
  /** WordPress publication date (NOT the decision date), yyyy-mm-dd. */
  publishedDate: string;
  title: string;
  pageUrl: string;
  downloadUrl: string;
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

export function decodeEntities(value: string): string {
  return value
    .replace(/&#0*38;|&amp;/gi, "&")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/gi, "-")
    .replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/gi, " ");
}

const TITLE_PREFIX = /^\s*(?:FIC|Notice of sanction|Amended administrative sanctions?|Administrative sanctions?|Admini?stration sanction|Admininstrative sanction|Admin sanction)\s*(?:[-–—:]+\s*|\s+(?=\S))/i;

function smartCase(name: string): string {
  const keep = new Set(["CC", "PTY", "LTD", "SA", "RSA", "SOC", "NPC", "NPO", "AFS", "FX", "T/A", "TA", "T-A", "II", "III"]);
  return name
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      const bare = token.replace(/[^A-Za-z/-]/g, "");
      if (keep.has(bare.toUpperCase())) return bare.toUpperCase() === "TA" || bare.toUpperCase() === "T-A" || bare.toUpperCase() === "T/A" ? token.toLowerCase() : token.toUpperCase();
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join("");
}

/** Entity named in a sanction document title ("Administrative sanction - Kynoch Fertilizer" -> "Kynoch Fertilizer"). */
export function extractFicEntityName(rawTitle: string): string {
  let name = normalizeWhitespace(decodeEntities(rawTitle));
  for (let i = 0; i < 3; i += 1) {
    const stripped = name.replace(TITLE_PREFIX, "");
    if (stripped === name) break;
    name = stripped;
  }
  name = name.replace(/^[-–—:\s]+/, "").trim();
  const letters = name.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (letters.length > 3 && upper / letters.length >= 0.75) name = smartCase(name);
  return name;
}

export function isAmendedTitle(rawTitle: string): boolean {
  return /^\s*Amended\b/i.test(decodeEntities(rawTitle));
}

export type SupervisoryIssuer = "PA" | "FSCA" | "SARB_OTHER" | "UNKNOWN";

/** Classifies a "sanctions issued by supervisory bodies" document by the body named in its title. */
export function classifySupervisoryDocument(rawTitle: string): { issuer: SupervisoryIssuer; subject: string } {
  const title = normalizeWhitespace(decodeEntities(rawTitle));
  const prefix = title.match(/^(Prudential Authority|PA|FSCA|SARB|South African Reserve Bank)\s*[-–—:]\s*(.*)$/i);
  if (!prefix) return { issuer: "UNKNOWN", subject: title };
  const body = prefix[1].toLowerCase();
  const subject = prefix[2].replace(/^Administrative sanctions?\s+(?:on\s+)?/i, "").trim();
  if (body === "fsca") return { issuer: "FSCA", subject };
  if (body === "prudential authority" || body === "pa") return { issuer: "PA", subject };
  return { issuer: "SARB_OTHER", subject };
}

// ---------------------------------------------------------------------------
// WordPress REST access
// ---------------------------------------------------------------------------

interface WpDocument {
  id: number;
  date: string;
  title: { rendered: string };
  link: string;
  download_url?: string;
}

async function wpGet<T>(path: string, params: Record<string, string | number>): Promise<{ data: T; totalPages: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await axios.get<T>(`${FIC_API_URL}${path}`, { params, headers: FIC_HEADERS, timeout: 60_000 });
      return { data: response.data, totalPages: Number(response.headers["x-wp-totalpages"] ?? 1) || 1 };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
    }
  }
  throw lastError;
}

export async function resolveCategoryId(slug: string): Promise<number> {
  try {
    const { data } = await wpGet<Array<{ id: number; slug: string }>>("/doc_categories", { slug, _fields: "id,slug" });
    const found = data.find((entry) => entry.slug === slug);
    if (found) return found.id;
  } catch {
    // fall through to the verified fallback id
  }
  const fallback = FALLBACK_CATEGORY_IDS[slug];
  if (!fallback) throw new Error(`FIC document category ${slug} not found`);
  return fallback;
}

export function toFicDocument(entry: WpDocument): FicDocument | null {
  if (!entry.download_url || !entry.title?.rendered) return null;
  return {
    id: entry.id,
    publishedDate: entry.date.slice(0, 10),
    title: entry.title.rendered,
    pageUrl: entry.link,
    downloadUrl: entry.download_url,
  };
}

export async function fetchCategoryDocuments(categoryId: number): Promise<FicDocument[]> {
  const docs: FicDocument[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const { data, totalPages: pages } = await wpGet<WpDocument[]>("/dlp_document", {
      doc_categories: categoryId,
      per_page: 100,
      page,
      orderby: "date",
      order: "desc",
      _fields: "id,date,title,link,download_url",
    });
    totalPages = pages;
    for (const entry of data) {
      const doc = toFicDocument(entry);
      if (doc) docs.push(doc);
    }
  }
  return docs;
}

// ---------------------------------------------------------------------------
// Document extraction
// ---------------------------------------------------------------------------

/** True when the PDF carries a real text layer (scanned notices yield only a stamp line). */
export function hasUsableTextLayer(text: string): boolean {
  return text.trim().length >= 400 && /sanction/i.test(text) && /(imposes?|caution|reprimand|directs?|penalty|fine)/i.test(text);
}

async function pdfBufferToText(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mema-fic-"));
  try {
    const path = join(dir, "document.pdf");
    await writeFile(path, buffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", path, "-"], { maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type ExtractionSource = "pdf_text" | "ocr_snapshot" | "unavailable";

export interface FicExtraction {
  source: ExtractionSource;
  confidence: string;
  signedDate: string | null;
  signedMonth: string | null;
  amount: number | null;
  suspendedAmount: number | null;
  reducedAmount: number | null;
  actions: string[];
  provisions: string[];
  warnings: string[];
  /** Figures reconciled by a rule that a person should check. */
  reviewFlags: string[];
}

export function extractionFromText(text: string): FicExtraction {
  const parsed: ParsedFicSanction = parseFicSanctionText(text);
  return {
    source: "pdf_text",
    confidence: parsed.issues.length ? "amount_withheld" : "text_layer",
    signedDate: parsed.signedDate,
    signedMonth: parsed.signedMonth,
    amount: parsed.amount,
    suspendedAmount: parsed.suspendedAmount,
    reducedAmount: parsed.reducedAmount,
    actions: parsed.actions,
    provisions: parsed.provisions,
    warnings: [...parsed.issues, ...parsed.warnings],
    reviewFlags: parsed.reviewFlags,
  };
}

export function extractionFromSnapshot(downloadUrl: string): FicExtraction | null {
  const snapshot = FIC_SCANNED_EXTRACTIONS[downloadUrl];
  if (!snapshot) return null;
  return {
    source: "ocr_snapshot",
    confidence: snapshot.confidence,
    signedDate: snapshot.signedDate,
    signedMonth: snapshot.signedMonth,
    amount: snapshot.amount,
    suspendedAmount: snapshot.suspendedAmount,
    reducedAmount: snapshot.reducedAmount,
    actions: snapshot.actions,
    provisions: snapshot.provisions,
    warnings: [],
    reviewFlags: snapshot.review ? [snapshot.review] : [],
  };
}

const UNAVAILABLE: FicExtraction = {
  source: "unavailable", confidence: "none", signedDate: null, signedMonth: null, amount: null,
  suspendedAmount: null, reducedAmount: null, actions: [], provisions: [], warnings: ["no readable text and no reviewed snapshot"], reviewFlags: [],
};

export async function extractFicDocument(doc: FicDocument, loadPdf: (url: string) => Promise<Buffer>): Promise<FicExtraction> {
  const text = await pdfBufferToText(await loadPdf(doc.downloadUrl));
  if (hasUsableTextLayer(text)) {
    const parsed = extractionFromText(text);
    // A text layer that yields neither a penalty nor any recognisable action has not been read.
    if (parsed.amount === null && parsed.actions.length === 0) return UNAVAILABLE;
    return parsed;
  }
  const snapshot = extractionFromSnapshot(doc.downloadUrl);
  if (!snapshot || (snapshot.confidence === "unresolved" && snapshot.amount === null && snapshot.actions.length === 0)) return UNAVAILABLE;
  return snapshot;
}

// ---------------------------------------------------------------------------
// Dates, summaries, records
// ---------------------------------------------------------------------------

export type DateBasis = "signed_date" | "signed_month" | "published_date";

/**
 * Decision date = the day the FIC signed the sanction. When the signing day was
 * left blank on the (scanned) notice, the month is used; if the document gives
 * no usable date the WordPress publication date is the only date available and
 * the basis is recorded as such.
 */
export function resolveFicDecisionDate(
  extraction: Pick<FicExtraction, "signedDate" | "signedMonth">,
  publishedDate: string,
): { date: string; basis: DateBasis } {
  const published = Date.parse(publishedDate);
  const plausible = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t <= published + 86_400_000 && published - t <= 3 * 365 * 86_400_000;
  };
  if (extraction.signedDate && plausible(extraction.signedDate)) return { date: extraction.signedDate, basis: "signed_date" };
  if (extraction.signedMonth) {
    const monthStart = `${extraction.signedMonth}-01`;
    if (plausible(monthStart)) {
      return publishedDate.startsWith(extraction.signedMonth)
        ? { date: publishedDate, basis: "signed_month" }
        : { date: monthStart, basis: "signed_month" };
    }
  }
  return { date: publishedDate, basis: "published_date" };
}

const ACTION_LABELS: Record<string, string> = {
  financial_penalty: "Financial penalty",
  caution: "Caution",
  reprimand: "Reprimand",
  directive: "Remedial directive",
  restriction: "Restriction",
  withdrawal: "Withdrawal",
};

function formatRand(amount: number): string {
  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const [whole, decimals] = fixed.split(".");
  return `R${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${decimals ? `.${decimals}` : ""}`;
}

export function buildFicSummary(name: string, extraction: FicExtraction, amended: boolean, dateBasis: DateBasis = "signed_date"): string {
  const parts: string[] = [];
  if (extraction.amount !== null) {
    let penalty = `financial penalty of ${formatRand(extraction.amount)}`;
    if (extraction.suspendedAmount !== null && extraction.suspendedAmount > 0) {
      penalty += extraction.suspendedAmount >= extraction.amount
        ? " (wholly suspended on conditions)"
        : ` (${formatRand(extraction.suspendedAmount)} suspended on conditions)`;
    }
    if (extraction.reducedAmount !== null) penalty += `, reducible to ${formatRand(extraction.reducedAmount)} if the institution complied by the stated deadline`;
    parts.push(penalty);
  }
  if (extraction.actions.includes("caution")) parts.push("a caution not to repeat the conduct");
  if (extraction.actions.includes("reprimand")) parts.push("a reprimand");
  if (extraction.actions.includes("directive")) parts.push("a directive to remedy the non-compliance");
  if (extraction.actions.includes("restriction")) parts.push("a restriction on its activities");
  if (extraction.actions.includes("withdrawal")) parts.push("withdrawal of registration");
  const lead = amended
    ? `${name}: amended administrative sanction issued by the Financial Intelligence Centre after an appeal under the FIC Act 38 of 2001`
    : `${name} was sanctioned by the Financial Intelligence Centre under section 45C of the FIC Act 38 of 2001`;
  const action = parts.length ? `: ${parts.join("; ")}` : "";
  const breaches = extraction.provisions.length ? `. Non-compliance found with ${extraction.provisions.join("; ")}` : "";
  const gap = extraction.amount === null && extraction.actions.includes("financial_penalty")
    ? ". The penalty amount could not be reliably read from the notice."
    : ".";
  const basis =
    dateBasis === "signed_month" ? " Decision date shown is the month the notice was signed (the day is not legible)."
    : dateBasis === "published_date" ? " The signing date is not legible on the notice, so the publication date is shown."
    : "";
  const review = extraction.reviewFlags.length ? " Figure reconciled by rule and flagged for review." : "";
  return `${lead}${action}${breaches}${gap}${basis}${review}`;
}

export function ficActionLabel(extraction: Pick<FicExtraction, "actions">): string {
  const labels = extraction.actions.map((action) => ACTION_LABELS[action]).filter(Boolean);
  return labels.length ? labels.join(" + ") : "Administrative sanction";
}

export function normalizeIdentityName(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/\b(pty|ltd|limited|cc|inc|incorporated|t\/?a|trading as)\b/g, "").replace(/[^a-z0-9]/g, "");
}

export interface FicSanctionRow {
  doc: FicDocument;
  name: string;
  amended: boolean;
  extraction: FicExtraction;
  decisionDate: string;
  dateBasis: DateBasis;
  duplicateDocIds: number[];
}

export function buildFicRow(doc: FicDocument, extraction: FicExtraction): FicSanctionRow {
  const decision = resolveFicDecisionDate(extraction, doc.publishedDate);
  return {
    doc,
    name: extractFicEntityName(doc.title),
    amended: isAmendedTitle(doc.title),
    extraction,
    decisionDate: decision.date,
    dateBasis: decision.basis,
    duplicateDocIds: [],
  };
}

/**
 * The FIC sometimes uploads the same notice twice (e.g. "Autocare Car Sales" and
 * "AUTOCARE CAR SALES"). Collapse rows only when the entity, decision date,
 * penalty and action set are all identical; the surviving row records the other
 * document ids. Rows with different amounts or dates are always kept apart.
 */
export function collapseDuplicateNotices(rows: FicSanctionRow[]): { rows: FicSanctionRow[]; collapsed: number } {
  const byKey = new Map<string, FicSanctionRow>();
  let collapsed = 0;
  for (const row of [...rows].sort((a, b) => a.doc.id - b.doc.id)) {
    const key = [
      normalizeIdentityName(row.name),
      row.decisionDate,
      row.extraction.amount ?? "null",
      [...row.extraction.actions].sort().join("+"),
      row.amended ? "amended" : "original",
    ].join("::");
    const existing = byKey.get(key);
    if (existing) {
      existing.duplicateDocIds.push(row.doc.id);
      collapsed += 1;
    } else {
      byKey.set(key, row);
    }
  }
  return { rows: [...byKey.values()], collapsed };
}

export function buildFicRecord(row: FicSanctionRow): DbReadyRecord {
  const { extraction } = row;
  const label = ficActionLabel(extraction);
  const breachType = extraction.provisions.length
    ? `${label} - FIC Act: ${extraction.provisions.slice(0, 3).join("; ")}`.slice(0, 250)
    : `${label} - FIC Act non-compliance`;
  const record = buildEuFineRecord({
    regulator: "FIC",
    regulatorFullName: "Financial Intelligence Centre",
    countryCode: "ZA",
    countryName: "South Africa",
    firmIndividual: row.name,
    firmCategory: "Accountable institution",
    amount: extraction.amount,
    currency: "ZAR",
    dateIssued: row.decisionDate,
    breachType,
    breachCategories: extraction.amount !== null ? ["AML", "MONETARY_SANCTION"] : ["AML", "SUPERVISORY_SANCTION"],
    summary: buildFicSummary(row.name, extraction, row.amended, row.dateBasis).slice(0, 1000),
    finalNoticeUrl: row.doc.downloadUrl,
    sourceUrl: FIC_SANCTIONS_PAGE_URL,
    dedupeKey: `fic-doc::${row.doc.id}`,
    rawPayload: {
      documentId: row.doc.id,
      documentTitle: decodeEntities(row.doc.title),
      documentPage: row.doc.pageUrl,
      publishedDate: row.doc.publishedDate,
      decisionDate: row.decisionDate,
      dateBasis: row.dateBasis,
      amended: row.amended,
      duplicateDocumentIds: row.duplicateDocIds,
      extraction: {
        source: extraction.source,
        confidence: extraction.confidence,
        suspendedAmount: extraction.suspendedAmount,
        reducedAmount: extraction.reducedAmount,
        actions: extraction.actions,
        provisions: extraction.provisions,
        warnings: extraction.warnings,
        reviewFlags: extraction.reviewFlags,
      },
    },
  });
  return withStableIdentity(record, `fic-doc::${row.doc.id}`);
}

export interface FicLoadStats {
  ownDocuments: number;
  collapsedDuplicates: number;
  failedDocuments: number[];
  /** Scanned notices with no text layer and no reviewed snapshot: held back, not published. */
  pendingExtraction: Array<{ id: number; title: string }>;
  supervisoryDocuments: number;
  supervisoryByIssuer: Record<SupervisoryIssuer, number>;
  extractionSources: Record<ExtractionSource, number>;
}

export async function loadFicRows(
  loadPdf: (url: string) => Promise<Buffer> = (url) => fetchBinary(url, { headers: FIC_HEADERS, maxRedirects: 5, timeout: 90_000 }),
): Promise<{ rows: FicSanctionRow[]; stats: FicLoadStats }> {
  const ownId = await resolveCategoryId(FIC_OWN_CATEGORY_SLUG);
  const supervisoryId = await resolveCategoryId(FIC_SUPERVISORY_CATEGORY_SLUG);
  const [own, supervisory] = await Promise.all([fetchCategoryDocuments(ownId), fetchCategoryDocuments(supervisoryId)]);
  if (!own.length) throw new Error("FIC sanctions category returned zero documents");

  const failed: number[] = [];
  const extractions = await mapWithConcurrency(own, 4, async (doc) => {
    try {
      return await extractFicDocument(doc, loadPdf);
    } catch (error) {
      console.warn(`⚠️ FIC document ${doc.id} (${decodeEntities(doc.title)}) could not be read: ${error instanceof Error ? error.message : String(error)}`);
      failed.push(doc.id);
      return null;
    }
  });
  // A handful of unreadable documents is tolerated (they are skipped, never deleted);
  // a larger failure means the source is unhealthy and the run must not publish a partial batch.
  if (failed.length > 3) throw new Error(`FIC: ${failed.length} sanction PDFs could not be fetched; refusing to publish a partial batch`);

  const built: FicSanctionRow[] = [];
  const pendingExtraction: Array<{ id: number; title: string }> = [];
  own.forEach((doc, index) => {
    const extraction = extractions[index];
    if (!extraction) return;
    if (extraction.source === "unavailable") {
      // Never publish an unread notice as a no-action sanction (it would read as non-monetary).
      pendingExtraction.push({ id: doc.id, title: decodeEntities(doc.title) });
      return;
    }
    built.push(buildFicRow(doc, extraction));
  });
  if (pendingExtraction.length) {
    recordRunWarning(
      `FIC: ${pendingExtraction.length} new scanned sanction notice(s) have no readable text and no reviewed snapshot entry; ` +
        `held back (amount not yet extracted) until reviewed: ${pendingExtraction.map((p) => `${p.id} ${p.title}`).join(" | ")}`.slice(0, 1500),
    );
  }
  const { rows, collapsed } = collapseDuplicateNotices(built);

  const supervisoryByIssuer: Record<SupervisoryIssuer, number> = { PA: 0, FSCA: 0, SARB_OTHER: 0, UNKNOWN: 0 };
  for (const doc of supervisory) supervisoryByIssuer[classifySupervisoryDocument(doc.title).issuer] += 1;
  const extractionSources: Record<ExtractionSource, number> = { pdf_text: 0, ocr_snapshot: 0, unavailable: 0 };
  for (const row of rows) extractionSources[row.extraction.source] += 1;

  return {
    rows,
    stats: {
      ownDocuments: own.length,
      collapsedDuplicates: collapsed,
      failedDocuments: failed,
      pendingExtraction,
      supervisoryDocuments: supervisory.length,
      supervisoryByIssuer,
      extractionSources,
    },
  };
}

export async function loadFicLiveRecords(): Promise<DbReadyRecord[]> {
  const { rows, stats } = await loadFicRows();
  console.log(
    `📄 FIC: ${stats.ownDocuments} own sanction documents, ${stats.collapsedDuplicates} duplicate uploads collapsed, ` +
      `sources ${JSON.stringify(stats.extractionSources)}; ${stats.supervisoryDocuments} supervisory-body documents ` +
      `${JSON.stringify(stats.supervisoryByIssuer)} left to their issuing regulators (SARBPA / FSCA)`,
  );
  return rows.map(buildFicRecord).sort((a, b) => b.dateIssued.localeCompare(a.dateIssued));
}

export async function main() {
  await runScraper({
    name: "🇿🇦 FIC South Africa Sanctions Scraper",
    region: "Africa",
    regulatorCode: "FIC",
    liveLoader: loadFicLiveRecords,
    testLoader: loadFicLiveRecords,
    qualityContract: { minimumPreparedRecords: 300 },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error("❌ FIC scraper failed:", error); process.exit(1); });
}

export type { FicActionType };
