/**
 * Official Korean FSS inspection-result sanctions archive.
 *
 * This is deliberately separate from `scrapeFss.ts`: the English supervision
 * board / DART press releases are announcements, while this Korean archive
 * publishes institution-level inspection sanctions and their official PDFs.
 * The archive page does not reliably expose monetary amounts or full findings;
 * this loader therefore leaves amount undisclosed (null) and never guesses.
 *
 * Source: https://www.fss.or.kr/fss/job/openInfo/list.do?menuNo=200476
 * The listing is date-filtered and paginated. We query Jan 1 through today and
 * follow every page; IDs are the official examMgmtNo + emOpenSeq + action date.
 */

import "dotenv/config";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";
import {
  buildEuFineRecord,
  fetchText,
  normalizeWhitespace,
  type DbReadyRecord,
} from "./lib/euFineHelpers.js";
import { fetchPdfText } from "./lib/politePdf.js";
import { runScraper } from "./lib/runScraper.js";

const FSS_BASE_URL = "https://www.fss.or.kr";
const FSS_SANCTIONS_PATH = "/fss/job/openInfo/list.do";
const FSS_SANCTIONS_MENU = "200476";
const MAX_ARCHIVE_PAGES = 100;

export interface FssSanctionListRow {
  entity: string;
  actionDate: string;
  detailUrl: string;
  department: string | null;
  examMgmtNo: string;
  emOpenSeq: string;
}

export interface FssSanctionDetail {
  entity: string;
  actionDate: string;
  department: string | null;
  institutionSanction: string | null;
  executiveSanction: string | null;
  employeeSanction: string | null;
  disclosedFacts: string | null;
  pdfUrl: string;
  pdfName: string;
  detailUrl: string;
  examMgmtNo: string;
  emOpenSeq: string;
}

export interface FssSanctionPdfEvidence {
  parsed: boolean;
  institutionOutcome: string | null;
  executiveOutcome: string | null;
  employeeOutcome: string | null;
  violationSummary: string | null;
  amount: number | null;
  amountReviewReason: string | null;
  amountDisclosureState: "verified-from-pdf" | "undisclosed-or-not-confidently-parsed" | "pdf-unavailable"
    | "pdf-text-insufficient-review-required" | "pdf-unavailable-review-required";
}

function deterministicOutcomeGloss(outcome: string): string[] {
  const labels: Array<[RegExp, string]> = [
    [/과태료/, "administrative fine"],
    [/과징금/, "administrative surcharge"],
    [/기관경고/, "institutional warning"],
    [/기관주의/, "institutional caution"],
    [/경고/, "warning"],
    [/주의/, "caution"],
    [/업무정지/, "business suspension"],
    [/일부영업정지/, "partial business suspension"],
    [/등록취소|인가취소/, "registration or authorization cancellation"],
    [/문책경고/, "executive reprimand"],
    [/견책/, "reprimand"],
    [/감봉/, "salary reduction"],
    [/정직/, "suspension from duty"],
    [/면직|해임/, "dismissal"],
    [/자율처리필요사항/, "required self-correction"],
    [/개선명령/, "order to remediate"],
    [/기관제재없음|조치없음/, "no institutional sanction stated"],
  ];
  return [...new Set(labels.filter(([pattern]) => pattern.test(outcome)).map(([, label]) => label))];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseFssSanctionsDate(input: string): string | null {
  const value = normalizeWhitespace(input);
  const match = value.match(/^(\d{4})(?:[-.]?(\d{2})[-.]?(\d{2}))$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || isoDate(date) !== `${year}-${month}-${day}`) return null;
  return `${year}-${month}-${day}`;
}

function parseOfficialCaseIdentity(href: string, pageUrl: string) {
  try {
    const url = new URL(href, pageUrl);
    if (url.origin !== FSS_BASE_URL || !url.pathname.endsWith("/fss/job/openInfo/view.do")) return null;
    if (url.searchParams.get("menuNo") !== FSS_SANCTIONS_MENU) return null;
    const examMgmtNo = url.searchParams.get("examMgmtNo")?.trim() || "";
    const emOpenSeq = url.searchParams.get("emOpenSeq")?.trim() || "";
    if (!/^\d{6,}$/.test(examMgmtNo) || !/^\d+$/.test(emOpenSeq)) return null;
    const stable = new URL(`${FSS_BASE_URL}/fss/job/openInfo/view.do`);
    stable.searchParams.set("menuNo", FSS_SANCTIONS_MENU);
    stable.searchParams.set("examMgmtNo", examMgmtNo);
    stable.searchParams.set("emOpenSeq", emOpenSeq);
    return { examMgmtNo, emOpenSeq, detailUrl: stable.toString() };
  } catch {
    return null;
  }
}

export function buildFssSanctionsListUrl(
  pageIndex: number,
  now = new Date(),
): string {
  if (!Number.isInteger(pageIndex) || pageIndex < 1 || pageIndex > MAX_ARCHIVE_PAGES) {
    throw new Error(`Invalid FSS sanctions page index: ${pageIndex}`);
  }
  const today = isoDate(now);
  const params = new URLSearchParams({
    menuNo: FSS_SANCTIONS_MENU,
    sdate: `${today.slice(0, 4)}-01-01`,
    edate: today,
    pageIndex: String(pageIndex),
  });
  return `${FSS_BASE_URL}${FSS_SANCTIONS_PATH}?${params}`;
}

export function parseFssSanctionsListHtml(
  html: string,
  pageUrl = buildFssSanctionsListUrl(1),
): FssSanctionListRow[] {
  const $ = cheerio.load(html);
  const rows: FssSanctionListRow[] = [];
  $("table.tbl.list-data tbody tr").each((_, element) => {
    const $cells = $(element).find("td");
    const entity = normalizeWhitespace($cells.eq(1).text());
    const actionDate = parseFssSanctionsDate($cells.eq(2).text());
    const href = $cells.eq(3).find("a[href]").attr("href")?.trim() || "";
    const identity = parseOfficialCaseIdentity(href, pageUrl);
    const department = normalizeWhitespace($cells.eq(4).text()) || null;
    if (!entity || !actionDate || !identity) return;
    rows.push({ entity, actionDate, ...identity, department });
  });
  return rows;
}

function fieldValue($: cheerio.CheerioAPI, label: string): string | null {
  const normalizedLabel = label.replace(/\s+/g, "");
  const $field = $("dl.form-group").filter((_, element) =>
    normalizeWhitespace($(element).find("dt").text()).replace(/\s+/g, "") === normalizedLabel,
  ).first();
  const value = normalizeWhitespace($field.find("dd").text());
  return value || null;
}

export function parseFssSanctionsDetailHtml(
  html: string,
  detailUrl: string,
): FssSanctionDetail | null {
  const identity = parseOfficialCaseIdentity(detailUrl, detailUrl);
  if (!identity) return null;
  const $ = cheerio.load(html);
  const entity = fieldValue($, "금융기관명");
  const actionDate = parseFssSanctionsDate(fieldValue($, "제재조치일") || "");
  if (!entity || !actionDate) return null;
  const pdfField = $("dl.form-group").filter((_, element) =>
    normalizeWhitespace($(element).find("dt").text()).includes("첨부파일"),
  ).first();
  const pdf = pdfField.find("a[href]").toArray().map((element) => {
    const href = $(element).attr("href")?.trim() || "";
    const name = normalizeWhitespace($(element).find(".name").text() || $(element).text());
    let url: URL;
    try { url = new URL(href, FSS_BASE_URL); } catch { return null; }
    const file = url.searchParams.get("file");
    const path = url.searchParams.get("path");
    if (url.origin !== FSS_BASE_URL || url.pathname !== "/fss.hpdownload"
      || !file?.toLowerCase().includes(".pdf") || !path
      // Older archive items use `공시` in place of the newer `공개안`.
      // Both are official sanction-disclosure PDFs in the same attachment field.
      || !/(?:제재내용[\s_]*)?(?:공개(?:안)?|공시).*\.pdf$/i.test(name)) return null;
    // FSS alternates query-parameter ordering and can add viewer metadata.
    // Keep only the official identity pair, sorted to stabilize contentHash.
    url.search = "";
    url.searchParams.set("file", file);
    url.searchParams.set("path", path);
    url.searchParams.sort();
    return { url: url.toString(), name };
  }).find((item) => item !== null);
  if (!pdf) return null;

  return {
    ...identity,
    entity,
    actionDate,
    department: fieldValue($, "관련부서"),
    institutionSanction: fieldValue($, "기관 제재대상"),
    executiveSanction: fieldValue($, "임원 제재대상"),
    employeeSanction: fieldValue($, "직원 제재대상"),
    disclosedFacts: fieldValue($, "제재대상사실"),
    pdfUrl: pdf.url,
    pdfName: pdf.name,
    detailUrl: identity.detailUrl,
  };
}

export function buildFssSanctionsRecord(
  detail: FssSanctionDetail,
  archiveUrl: string,
  evidence: FssSanctionPdfEvidence = {
    parsed: false,
    institutionOutcome: detail.institutionSanction,
    executiveOutcome: detail.executiveSanction,
    employeeOutcome: detail.employeeSanction,
    violationSummary: detail.disclosedFacts,
    amount: null,
    amountReviewReason: "FSS sanction PDF has not been parsed; amount and outcome require source review.",
    amountDisclosureState: "pdf-unavailable-review-required",
  },
): DbReadyRecord {
  const outcome = [
    evidence.institutionOutcome ? `기관: ${evidence.institutionOutcome}` : null,
    evidence.executiveOutcome ? `임원: ${evidence.executiveOutcome}` : null,
    evidence.employeeOutcome ? `직원: ${evidence.employeeOutcome}` : null,
  ].filter(Boolean).join("; ");
  const glosses = [...new Set([evidence.institutionOutcome, evidence.executiveOutcome, evidence.employeeOutcome]
    .filter((value): value is string => Boolean(value))
    .flatMap(deterministicOutcomeGloss))];
  const gloss = glosses.length ? ` Deterministic English indicators: ${glosses.join(", ")}. Original Korean outcome text is retained in the source evidence.` : "";
  const findings = evidence.violationSummary ? ` First disclosed finding: ${evidence.violationSummary}.` : "";
  return buildEuFineRecord({
    regulator: "FSS",
    regulatorFullName: "Financial Supervisory Service (Korea)",
    countryCode: "KR",
    countryName: "South Korea",
    firmIndividual: detail.entity,
    firmCategory: "Financial Institution",
    // Only `parseFssSanctionsPdfText` can supply a monetary amount; missing or
    // unparsed PDF evidence stays null and is never represented as zero.
    amount: evidence.amount,
    currency: "KRW",
    dateIssued: detail.actionDate,
    breachType: "Inspection-results sanction disclosure",
    breachCategories: ["SUPERVISORY_SANCTION"],
    summary: `Official FSS inspection-results sanction disclosure for ${detail.entity}, dated ${detail.actionDate}.${outcome ? ` Disclosed outcome: ${outcome}.` : " Outcome not exposed in the structured archive fields."}${gloss}${findings} See the attached official disclosure (${detail.pdfName}).`,
    finalNoticeUrl: detail.pdfUrl,
    // The list URL contains the date range (its `edate` changes daily), which
    // would change the legacy content hash on every scheduled scrape. Keep the
    // case-specific detail URL as stable source provenance; the paginated list
    // URL is retained separately in rawPayload for the archive query context.
    sourceUrl: detail.detailUrl,
    amountReviewReason: evidence.amountReviewReason,
    dedupeKey: `FSS-KR-SANCTION::${detail.examMgmtNo}::${detail.emOpenSeq}::${detail.actionDate}`,
    rawPayload: {
      source: "fss-korean-inspection-sanctions",
      actionId: `${detail.examMgmtNo}:${detail.emOpenSeq}:${detail.actionDate}`,
      canonicalId: `FSS-KR-SANCTION::${detail.examMgmtNo}::${detail.emOpenSeq}::${detail.actionDate}`,
      entity: detail.entity,
      actionDate: detail.actionDate,
      department: detail.department,
      institutionSanction: detail.institutionSanction,
      executiveSanction: detail.executiveSanction,
      employeeSanction: detail.employeeSanction,
      disclosedFacts: detail.disclosedFacts,
      institutionOutcome: evidence.institutionOutcome,
      executiveOutcome: evidence.executiveOutcome,
      employeeOutcome: evidence.employeeOutcome,
      violationSummary: evidence.violationSummary,
      amountDisclosureState: evidence.amountDisclosureState,
      detailUrl: detail.detailUrl,
      archiveUrl,
      pdfUrl: detail.pdfUrl,
      pdfName: detail.pdfName,
    },
  });
}

function amountFromExplicitKoreanPenaltyOutcome(outcome: string | null): {
  amount: number | null;
  reviewReason: string | null;
  disclosureState: FssSanctionPdfEvidence["amountDisclosureState"];
} {
  if (!outcome || !/(?:과태료|과징금)/.test(outcome)) {
    return { amount: null, reviewReason: null, disclosureState: "undisclosed-or-not-confidently-parsed" };
  }
  // Do not treat an explicitly waived surcharge as a monetary amount.
  // Split only at the next sanction label, never at commas: commas are also
  // thousands separators in published Korean amounts (e.g. 1,494백만원).
  const penaltyPhrases = [...outcome.matchAll(/(?:과태료|과징금)\s*([\s\S]*?)(?=(?:과태료|과징금)|$)/g)]
    .map((match) => match[1])
    .filter((part) => !/부과\s*면제/.test(part));
  if (penaltyPhrases.length === 0) {
    return { amount: null, reviewReason: null, disclosureState: "undisclosed-or-not-confidently-parsed" };
  }
  const unitMultiplier: Record<string, number> = {
    억원: 100_000_000,
    천만원: 10_000_000,
    백만원: 1_000_000,
    만원: 10_000,
    천원: 1_000,
    백원: 100,
    원: 1,
  };
  let total = 0;
  let tokenCount = 0;
  for (const phrase of penaltyPhrases) {
    const matches = [...phrase.matchAll(/([\d,]+(?:\.\d+)?)\s*(억원|천만원|백만원|만원|천원|백원|원)/g)];
    // If any named fine/surcharge phrase contains a number but not a supported
    // unit, don't use a partial total; require the full outcome to be legible.
    if (matches.length === 0) {
      return {
        amount: null,
        reviewReason: "The official institution-sanction outcome mentions a fine/surcharge but its Korean amount unit was not fully recognized.",
        disclosureState: "undisclosed-or-not-confidently-parsed",
      };
    }
    for (const match of matches) {
      const value = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(value) || value < 0) {
        return {
          amount: null,
          reviewReason: "The official institution-sanction fine/surcharge amount could not be parsed safely.",
          disclosureState: "undisclosed-or-not-confidently-parsed",
        };
      }
      total += value * unitMultiplier[match[2]];
      tokenCount += 1;
    }
  }
  if (tokenCount === 0 || !Number.isSafeInteger(total)) {
    return { amount: null, reviewReason: "The official institution-sanction amount was not a safe integer KRW value.", disclosureState: "undisclosed-or-not-confidently-parsed" };
  }
  return { amount: Math.round(total), reviewReason: null, disclosureState: "verified-from-pdf" };
}

export function parseFssSanctionsPdfText(text: string): FssSanctionPdfEvidence {
  const normalized = text.replace(/\r\n?/g, "\n");
  const start = normalized.search(/(?:^|\n)\s*3\s*[.]\s*제재조치내용/);
  const end = normalized.search(/(?:^|\n)\s*4\s*[.]\s*제재대상사실/);
  if (start < 0 || end <= start) {
    return {
    parsed: false, institutionOutcome: null, executiveOutcome: null, employeeOutcome: null,
    violationSummary: null, amount: null,
    amountReviewReason: "Official FSS PDF was retrieved, but its text did not expose the expected sanctions/findings sections. Monetary outcome requires source review; amount withheld.",
    amountDisclosureState: "pdf-text-insufficient-review-required",
    };
  }
  const section = normalized.slice(start, end).replace(/[ \t]+/g, " ");
  const row = (label: string, nextLabel: string) => {
    const match = section.match(new RegExp(`(?:^|\\n)[\\t ]*${label}[\\t ]+([\\s\\S]*?)(?=\\n[\\t ]*${nextLabel}(?:[\\t ]|\\n|$)|$)`));
    return normalizeWhitespace(match?.[1] || "") || null;
  };
  const institutionOutcome = row("기\\s*관", "임\\s*원");
  const executiveOutcome = row("임\\s*원", "직\\s*원");
  const employeeOutcome = row("직\\s*원(?:\\s*등)?", "(?:$)");
  const factSection = normalized.slice(end).split(/(?:^|\n)\s*5\s*[.]\s*/)[0];
  const violationSummary = factSection.match(/(?:\(1\)|1\.)\s*([^\n]{3,120})/)?.[1]?.trim() || null;
  const monetary = amountFromExplicitKoreanPenaltyOutcome(institutionOutcome);
  return {
    parsed: true,
    institutionOutcome,
    executiveOutcome,
    employeeOutcome,
    violationSummary,
    amount: monetary.amount,
    amountReviewReason: monetary.reviewReason,
    amountDisclosureState: monetary.disclosureState,
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await map(items[index]);
    }
  }));
  return results;
}

export async function loadFssSanctionsRecords(options: {
  now?: Date;
  maxPages?: number;
  maxRecords?: number;
  parsePdfs?: boolean;
  fetchPdfText?: (url: string) => Promise<string>;
  fetch?: (url: string) => Promise<string>;
} = {}): Promise<DbReadyRecord[]> {
  const now = options.now ?? new Date();
  const maxPages = options.maxPages ?? MAX_ARCHIVE_PAGES;
  const maxRecords = options.maxRecords ?? Number.POSITIVE_INFINITY;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_ARCHIVE_PAGES) {
    throw new Error(`FSS sanctions maxPages must be between 1 and ${MAX_ARCHIVE_PAGES}`);
  }
  if (!(maxRecords === Number.POSITIVE_INFINITY || (Number.isInteger(maxRecords) && maxRecords > 0))) {
    throw new Error("FSS sanctions maxRecords must be a positive integer");
  }
  const getText = options.fetch ?? ((url) => fetchText(url, { timeout: 60_000 }));
  const getPdfText = options.fetchPdfText ?? fetchPdfText;
  const listRows = new Map<string, FssSanctionListRow>();
  let lastPage = maxPages;

  for (let pageIndex = 1; pageIndex <= Math.min(maxPages, MAX_ARCHIVE_PAGES); pageIndex += 1) {
    const pageUrl = buildFssSanctionsListUrl(pageIndex, now);
    const html = await getText(pageUrl);
    const rows = parseFssSanctionsListHtml(html, pageUrl);
    for (const row of rows) {
      const key = `${row.examMgmtNo}:${row.emOpenSeq}:${row.actionDate}`;
      listRows.set(key, row);
      if (listRows.size >= maxRecords) break;
    }
    if (listRows.size >= maxRecords || rows.length === 0) {
      lastPage = pageIndex;
      break;
    }
  }

  const rows = [...listRows.values()].sort((a, b) => b.actionDate.localeCompare(a.actionDate)
    || a.examMgmtNo.localeCompare(b.examMgmtNo) || a.emOpenSeq.localeCompare(b.emOpenSeq));
  const details = await mapWithConcurrency(rows, 4, async (row) => {
    const html = await getText(row.detailUrl);
    const detail = parseFssSanctionsDetailHtml(html, row.detailUrl);
    if (!detail) throw new Error(`FSS sanctions detail missing required official fields or PDF: ${row.detailUrl}`);
    if (detail.actionDate !== row.actionDate || detail.entity !== row.entity) {
      throw new Error(`FSS sanctions list/detail identity mismatch: ${row.detailUrl}`);
    }
    return detail;
  });
  const archiveUrl = buildFssSanctionsListUrl(1, now);
  // `lastPage` is kept in each raw payload for reproducible bounded previews.
  const records = await mapWithConcurrency(details, 2, async (detail) => {
    let evidence: FssSanctionPdfEvidence;
    if (options.parsePdfs === false) {
      evidence = {
        parsed: false,
        institutionOutcome: detail.institutionSanction,
        executiveOutcome: detail.executiveSanction,
        employeeOutcome: detail.employeeSanction,
        violationSummary: detail.disclosedFacts,
        amount: null,
        amountReviewReason: "FSS sanction PDF could not be fetched/extracted; amount and outcome require source review.",
        amountDisclosureState: "pdf-unavailable-review-required",
      };
    } else {
      try {
        evidence = parseFssSanctionsPdfText(await getPdfText(detail.pdfUrl));
      } catch {
        evidence = {
          parsed: false,
          institutionOutcome: detail.institutionSanction,
          executiveOutcome: detail.executiveSanction,
          employeeOutcome: detail.employeeSanction,
          violationSummary: detail.disclosedFacts,
          amount: null,
          amountReviewReason: "FSS sanction PDF could not be fetched/extracted; amount and outcome require source review.",
          amountDisclosureState: "pdf-unavailable-review-required",
        };
      }
    }
    const record = buildFssSanctionsRecord(detail, archiveUrl, evidence);
    return {
      ...record,
      rawPayload: JSON.stringify({ ...JSON.parse(record.rawPayload), archiveUrl, pagesVisited: lastPage }),
    };
  });
  return records;
}

/**
 * Read-only assurance pass: traverse every page, then hydrate every discovered
 * unique case unless an explicit sample limit is supplied. This deliberately
 * returns pagination and PDF quarantine evidence alongside records; it never
 * opens a DB connection.
 */
export async function previewFssSanctionsArchive(options: {
  now?: Date;
  maxPages?: number;
  /** Optional bounded sample for local parser work. Full archive is the default. */
  validateRecords?: number;
  fetchPdfText?: (url: string) => Promise<string>;
  fetch?: (url: string) => Promise<string>;
} = {}) {
  const now = options.now ?? new Date();
  const maxPages = options.maxPages ?? MAX_ARCHIVE_PAGES;
  const validateRecords = options.validateRecords;
  if (validateRecords !== undefined && (!Number.isInteger(validateRecords) || validateRecords < 20)) {
    throw new Error("FSS sanctions archive sample must validate at least 20 records; omit the option to validate the full archive");
  }
  const getText = options.fetch ?? ((url) => fetchText(url, { timeout: 60_000 }));
  const listRows = new Map<string, FssSanctionListRow>();
  let pagesVisited = 0;
  let reachedEmptyPage = false;
  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    const pageUrl = buildFssSanctionsListUrl(pageIndex, now);
    const rows = parseFssSanctionsListHtml(await getText(pageUrl), pageUrl);
    pagesVisited = pageIndex;
    if (rows.length === 0) {
      reachedEmptyPage = true;
      break;
    }
    for (const row of rows) {
      listRows.set(`${row.examMgmtNo}:${row.emOpenSeq}:${row.actionDate}`, row);
    }
  }
  const uniqueRows = [...listRows.values()].sort((a, b) => b.actionDate.localeCompare(a.actionDate)
    || a.examMgmtNo.localeCompare(b.examMgmtNo) || a.emOpenSeq.localeCompare(b.emOpenSeq));
  const rowsToValidate = uniqueRows.slice(0, validateRecords ?? uniqueRows.length);
  const quarantined: Array<{ actionId: string; reason: string; pdfUrl: string }> = [];
  const detailQuarantine: Array<{ actionId: string; reason: string }> = [];
  const archiveUrl = buildFssSanctionsListUrl(1, now);
  const getPdfText = options.fetchPdfText ?? fetchPdfText;
  const hydrated = await mapWithConcurrency(rowsToValidate, 6, async (row) => {
    const actionId = `${row.examMgmtNo}:${row.emOpenSeq}:${row.actionDate}`;
    let detail: FssSanctionDetail | null;
    try {
      detail = parseFssSanctionsDetailHtml(await getText(row.detailUrl), row.detailUrl);
    } catch (error) {
      detailQuarantine.push({ actionId, reason: `Official detail fetch failed: ${error instanceof Error ? error.message : "unknown error"}` });
      return null;
    }
    if (!detail || detail.actionDate !== row.actionDate || detail.entity !== row.entity) {
      detailQuarantine.push({ actionId, reason: "Official detail was missing required fields/PDF or did not match listed entity/action date." });
      return null;
    }
    let evidence: FssSanctionPdfEvidence;
    try {
      evidence = parseFssSanctionsPdfText(await getPdfText(detail.pdfUrl));
      if (!evidence.parsed) {
        quarantined.push({
          actionId: `${detail.examMgmtNo}:${detail.emOpenSeq}:${detail.actionDate}`,
          reason: "Official PDF fetched but the sanction and fact sections did not match the supported parser; amount withheld.",
          pdfUrl: detail.pdfUrl,
        });
      }
    } catch (error) {
      evidence = {
        parsed: false,
        institutionOutcome: detail.institutionSanction,
        executiveOutcome: detail.executiveSanction,
        employeeOutcome: detail.employeeSanction,
        violationSummary: detail.disclosedFacts,
        amount: null,
        amountReviewReason: "FSS sanction PDF could not be fetched/extracted; amount and outcome require source review.",
        amountDisclosureState: "pdf-unavailable-review-required",
      };
      quarantined.push({
        actionId: `${detail.examMgmtNo}:${detail.emOpenSeq}:${detail.actionDate}`,
        reason: `Official PDF retrieval/extraction failed; amount withheld (${error instanceof Error ? error.message : "unknown error"}).`,
        pdfUrl: detail.pdfUrl,
      });
    }
    const record = buildFssSanctionsRecord(detail, archiveUrl, evidence);
    return { ...record, rawPayload: JSON.stringify({ ...JSON.parse(record.rawPayload), archiveUrl, pagesVisited }) };
  });
  const records = hydrated.filter((record): record is DbReadyRecord => record !== null);
  const actionIds = uniqueRows.map((row) => `${row.examMgmtNo}:${row.emOpenSeq}:${row.actionDate}`);
  return {
    source: "FSS Korean inspection-results sanctions archive (read-only preview)",
    archiveUrl,
    dateRange: { from: `${isoDate(now).slice(0, 4)}-01-01`, to: isoDate(now) },
    pagesVisited,
    reachedEmptyPage,
    listedRows: uniqueRows.length,
    uniqueActionIds: actionIds.length,
    duplicateActionIds: [...new Set(actionIds.filter((id, index) => actionIds.indexOf(id) !== index))],
    validatedRecords: records.length,
    detailQuarantine,
    quarantineCount: detailQuarantine.length + quarantined.length,
    reconciliation: {
      listedRows: uniqueRows.length,
      detailAttempted: rowsToValidate.length,
      validRecords: records.length,
      detailQuarantined: detailQuarantine.length,
      pdfQuarantined: quarantined.length,
      unattemptedAfterValidationLimit: uniqueRows.length - rowsToValidate.length,
    },
    records,
    pdfQuarantine: quarantined,
    ingestion: "not performed; this function has no database writer",
  };
}

export async function main() {
  // Promotion is deliberately double-gated. A routine invocation is always a
  // read-only archive audit; no database writer is reached without an explicit
  // command flag and operator approval variable after the identity migration
  // has been applied and independently reviewed.
  if (process.argv.includes("--promote")) {
    if (process.env.FSS_KOREAN_SANCTIONS_PROMOTION_APPROVED !== "true") {
      throw new Error("Refusing FSS Korean sanctions promotion: set FSS_KOREAN_SANCTIONS_PROMOTION_APPROVED=true only after migration and source review approval.");
    }
    const documentA = "https://www.fss.or.kr/fss.hpdownload?path=/dtm/opn/&file=202400579_01_%ED%95%98%EB%82%98%EC%A6%9D%EA%B6%8C.pdf";
    const documentB = "https://www.fss.or.kr/fss.hpdownload?path=/dtm/opn/&file=202400365_01_%ED%95%9C%EA%B5%AD%EC%97%90%EC%8A%A4%EC%A7%80%EC%A6%9D%EA%B6%8C.pdf";
    await runScraper({
      name: "🇰🇷 FSS Korean Inspection Sanctions Disclosure Scraper",
      region: "APAC",
      regulatorCode: "FSS",
      liveLoader: () => loadFssSanctionsRecords(),
      testLoader: () => loadFssSanctionsRecords(),
      beforeUpsert: async (sql) => {
        const [identities] = await sql`
          SELECT
            public.normalise_regulatory_evidence_url(${documentA}) AS document_a,
            public.normalise_regulatory_evidence_url(${documentB}) AS document_b
        `;
        if (!identities || identities.document_a === identities.document_b) {
          throw new Error("FSS canonical evidence URL identity migration is missing or does not preserve case-specific PDF query parameters.");
        }
      },
    });
    return;
  }
  const preview = await previewFssSanctionsArchive();
  console.log(JSON.stringify({ ...preview, records: preview.records.map((record) => ({
      regulator: record.regulator,
      firmIndividual: record.firmIndividual,
      dateIssued: record.dateIssued,
      amount: record.amount,
      currency: record.currency,
      finalNoticeUrl: record.finalNoticeUrl,
      sourceUrl: record.sourceUrl,
      breachType: record.breachType,
      rawPayload: JSON.parse(record.rawPayload),
    })) }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("FSS Korean sanctions preview failed:", error);
    process.exit(1);
  });
}
