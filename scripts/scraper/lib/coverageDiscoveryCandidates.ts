import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import type { DbReadyRecord } from "./euFineHelpers.js";
import { getRegulatorCoverage } from "../../../src/data/regulatorCoverage.js";
import { isKnownMalformedAfmEntity } from "../../corrections/afmQuality.js";
import { assessEntityName } from "./entityName.js";

export interface DiscoveryCandidateRow {
  fingerprint: string;
  regulator: string;
  sourceUrl: string;
  sourceContentHash: string;
  entity: string;
  issuedDate: string;
  amount: number | null;
  currency: string | null;
  summary: string;
  scraperRunId: string | number;
}

export interface DiscoveryValidationIssue {
  code:
  | "missing_required_field"
  | "invalid_source_url"
  | "unapproved_source"
  | "invalid_entity"
  /** Looks like a headline/descriptor rather than a party (assessEntityName). Excludes the row only; never a batch-quarantine trigger. */
  | "headline_entity"
  | "invalid_date"
  | "future_date"
  | "invalid_amount"
  | "invalid_summary";
  field: string;
  message: string;
}

export interface DiscoveryValidationResult {
  row: DiscoveryCandidateRow | null;
  issues: DiscoveryValidationIssue[];
}

export interface BlockedSourceDiscovery {
  regulator: string;
  sourceUrl: string;
  fingerprint: string;
  reasonCode: string;
  reason: string;
  payload: unknown;
}

/**
 * Keep official-source discoveries visible without allowing incomplete or
 * inaccessible evidence to enter the enforcement dataset.
 */
export async function persistBlockedSourceDiscoveries(
  sql: Sql,
  discoveries: BlockedSourceDiscovery[],
  scraperRunId: string | number,
) {
  for (const discovery of discoveries) {
    await sql`
      INSERT INTO public.coverage_discovery_quarantine (
        regulator, scraper_run_id, source_url, fingerprint,
        reason_codes, reasons, payload
      )
      SELECT
        ${discovery.regulator}, ${scraperRunId}, ${discovery.sourceUrl},
        ${discovery.fingerprint}, ${sql.json([discovery.reasonCode])},
        ${sql.json([discovery.reason])}, ${sql.json(discovery.payload as never)}
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.coverage_discovery_quarantine
        WHERE regulator = ${discovery.regulator}
          AND fingerprint = ${discovery.fingerprint}
          AND status = 'pending'
      )
    `;
  }
  return discoveries.length;
}

function normaliseUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  for (const name of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(name)) url.searchParams.delete(name);
  }
  return url.toString().replace(/\/$/, "");
}

function hostname(value: string) {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

function isOfficialDomain(regulator: string, sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const sources = getRegulatorCoverage(regulator)?.officialSources ?? [];
  return sources.some((source) => {
    const configured = hostname(source.url);
    const hostMatches = host === configured || host.endsWith(`.${configured}`);
    if (!hostMatches) return false;
    if (!source.pathPrefix) return true;
    return parsed.pathname.startsWith(source.pathPrefix);
  });
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1900) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function hasVerifiedShortFssEntity(record: DbReadyRecord, entity: string) {
  if (record.regulator.toUpperCase() !== "FSS" || !/^[\uAC00-\uD7A3]{2}$/u.test(entity)) return false;

  // FSS publishes some real institution names as two Hangul syllables. Permit
  // only a source-bound case identity, not arbitrary short labels from another
  // regulator or from list-page furniture.
  if (/^(?:다음|이전|메뉴|목록|검색|상세|공지|제목|내용|회사|법인|기관|개인|없음|미상|기타)$/u.test(entity)) return false;
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(record.rawPayload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    payload = parsed as Record<string, unknown>;
  } catch {
    return false;
  }

  const actionId = String(payload.actionId ?? "");
  const identity = /^(\d{9}):(\d+):(\d{4}-\d{2}-\d{2})$/.exec(actionId);
  if (!identity) return false;
  const [, examMgmtNo, emOpenSeq, actionDate] = identity;
  if (actionDate !== record.dateIssued) return false;
  const canonicalId = `FSS-KR-SANCTION::${examMgmtNo}::${emOpenSeq}::${actionDate}`;
  if (
    payload.source !== "fss-korean-inspection-sanctions"
    || payload.entity !== entity
    || payload.actionDate !== record.dateIssued
    || payload.canonicalId !== canonicalId
    || payload.detailUrl !== record.sourceUrl
    || payload.pdfUrl !== record.finalNoticeUrl
  ) return false;

  try {
    const detail = new URL(record.sourceUrl);
    const pdf = new URL(record.finalNoticeUrl ?? "");
    const pdfFile = pdf.searchParams.get("file") ?? "";
    return detail.protocol === "https:"
      && detail.hostname === "www.fss.or.kr"
      && detail.pathname === "/fss/job/openInfo/view.do"
      && detail.searchParams.get("menuNo") === "200476"
      && detail.searchParams.get("examMgmtNo") === examMgmtNo
      && detail.searchParams.get("emOpenSeq") === emOpenSeq
      && /^\d{9}$/.test(examMgmtNo)
      && /^\d+$/.test(emOpenSeq)
      && /^\d{9}_[^/]+\.pdf$/i.test(pdfFile)
      && pdfFile.startsWith(`${examMgmtNo}_`)
      && payload.pdfName === pdfFile
      && pdf.protocol === "https:"
      && pdf.hostname === "www.fss.or.kr"
      && pdf.pathname === "/fss.hpdownload"
      && pdf.searchParams.get("path") === "/dtm/opn/";
  } catch {
    return false;
  }
}

function isInvalidEntity(value: string, verifiedShortFssEntity = false) {
  const entity = value.trim();
  // Some official decisions name a long, finite group of respondents in one
  // action (CySEC is the clearest example). Those names are evidence, not page
  // furniture, and the database column is text. Keep a defensive ceiling for
  // accidental page-body capture without discarding genuine joint actions.
  if ((entity.length < 3 && !verifiedShortFssEntity) || entity.length > 1_000) return true;
  return isKnownMalformedAfmEntity(entity)
    || /<[^>]+>|^(?:main |site )?navigation\b|\b(?:press release|read more|cookie policy|page title)\b/i.test(entity)
    || /^(?:instruction|decision|notice|warning|measure)\b/i.test(entity)
    || /\b(?:issued to|for breach|for failure|for violating|enforcement action)\b/i.test(entity)
    || /\bconsumenten\b.*\b(?:digitalisering|duurzaamheid|marktmisbru)/i.test(entity)
    || /^(?:a|an|the)\s+(?:company|firm|entity|individual|person)$/i.test(entity);
}

function isInvalidSummary(value: string) {
  const summary = value.trim();
  return summary.length < 10 || /<\/?(?:html|body|nav|script|style)[^>]*>/i.test(summary);
}

export function validateDiscoveryCandidate(
  record: DbReadyRecord,
  scraperRunId: string | number,
): DiscoveryValidationResult {
  const issues: DiscoveryValidationIssue[] = [];
  const required: Array<[keyof DbReadyRecord, string]> = [
    ["contentHash", "content hash"],
    ["regulator", "regulator"],
    ["firmIndividual", "entity"],
    ["dateIssued", "issued date"],
    ["sourceUrl", "source URL"],
  ];
  for (const [field, label] of required) {
    const value = record[field];
    if (value === null || value === undefined || String(value).trim() === "") {
      issues.push({ code: "missing_required_field", field: String(field), message: `${label} is required.` });
    }
  }

  let sourceUrl: string | null = null;
  if (record.sourceUrl) {
    try {
      sourceUrl = normaliseUrl(record.sourceUrl);
      const parsed = new URL(sourceUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        issues.push({ code: "invalid_source_url", field: "sourceUrl", message: "Source URL must use HTTP or HTTPS." });
      } else if (!isOfficialDomain(record.regulator, sourceUrl)) {
        issues.push({ code: "unapproved_source", field: "sourceUrl", message: "Source URL is outside the configured official source contract." });
      }
    } catch {
      issues.push({ code: "invalid_source_url", field: "sourceUrl", message: "Source URL is not a valid URL." });
    }
  }
  const verifiedShortFssEntity = Boolean(record.firmIndividual && hasVerifiedShortFssEntity(record, record.firmIndividual.trim()));
  if (record.firmIndividual && isInvalidEntity(record.firmIndividual, verifiedShortFssEntity)) {
    issues.push({ code: "invalid_entity", field: "firmIndividual", message: "Entity name is empty, contaminated or page furniture." });
  }
  if (record.firmIndividual && !issues.some((issue) => issue.code === "invalid_entity") && !assessEntityName(record.firmIndividual).ok) {
    issues.push({ code: "headline_entity", field: "firmIndividual", message: "Entity name looks like a headline or description, not a party." });
  }
  if (record.dateIssued && !isValidDate(record.dateIssued)) {
    issues.push({ code: "invalid_date", field: "dateIssued", message: "Issued date must be a real ISO date (YYYY-MM-DD)." });
  } else if (record.dateIssued && record.dateIssued > new Date().toISOString().slice(0, 10)) {
    issues.push({ code: "future_date", field: "dateIssued", message: "Issued date is in the future." });
  }
  if (record.amount !== null && (!Number.isFinite(record.amount) || record.amount < 0)) {
    issues.push({ code: "invalid_amount", field: "amount", message: "Amount must be finite and non-negative, or null when undisclosed." });
  }
  for (const [field, value] of [["amountEur", record.amountEur], ["amountGbp", record.amountGbp]] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      issues.push({ code: "invalid_amount", field, message: `${field} must be finite and non-negative, or null when undisclosed.` });
    }
  }
  if (record.amount !== null && !record.currency?.trim()) {
    issues.push({ code: "invalid_amount", field: "currency", message: "A disclosed amount requires a currency." });
  }
  if (record.summary && isInvalidSummary(record.summary)) {
    issues.push({ code: "invalid_summary", field: "summary", message: "Summary is empty or contains HTML/page furniture." });
  }
  if (issues.length > 0 || !sourceUrl) return { row: null, issues };

  const fingerprint = createHash("sha256")
    .update([record.regulator.toUpperCase(), sourceUrl, record.firmIndividual.trim().toLowerCase(), record.dateIssued].join("|"))
    .digest("hex");
  return {
    issues,
    row: {
      fingerprint,
      regulator: record.regulator,
      sourceUrl,
      sourceContentHash: record.contentHash,
      entity: record.firmIndividual,
      issuedDate: record.dateIssued,
      amount: record.amount,
      currency: record.currency || null,
      summary: record.summary,
      scraperRunId,
    },
  };
}

export function buildDiscoveryCandidateRow(record: DbReadyRecord, scraperRunId: string | number): DiscoveryCandidateRow {
  const result = validateDiscoveryCandidate(record, scraperRunId);
  if (!result.row) {
    const detail = result.issues.map((issue) => issue.message).join(" ");
    throw new Error(
      `${record.regulator || "unknown"} prepared record failed validation: ${detail}${result.issues.some((issue) => issue.code === "unapproved_source") ? " (outside configured official regulator domains)" : ""}`,
    );
  }
  return result.row;
}

/**
 * Persists prepared official-source evidence before the scraper upsert. It is
 * idempotent and preserves the human-controlled candidate status. No report
 * run may alter status; only explicit operational review may do so.
 */
/** Save records dropped by the prepared-batch field checks so none disappears silently. */
export async function quarantineDroppedRecords(
  sql: Sql,
  dropped: Array<{ record: DbReadyRecord; reason: string }>,
  scraperRunId: string | number,
) {
  if (dropped.length === 0) return 0;
  const payload = dropped.map(({ record, reason }) => ({
    regulator: record.regulator || "UNKNOWN",
    scraper_run_id: scraperRunId,
    source_url: record.sourceUrl || null,
    fingerprint: record.contentHash || null,
    reason_codes: ["prepared_batch_validation"],
    reasons: [reason],
    payload: record,
  }));
  await sql.unsafe(`
    INSERT INTO public.coverage_discovery_quarantine (
      regulator, scraper_run_id, source_url, fingerprint, reason_codes, reasons, payload
    )
    SELECT item.regulator, item.scraper_run_id::bigint, item.source_url, item.fingerprint,
           item.reason_codes::jsonb, item.reasons::jsonb, item.payload::jsonb
    FROM jsonb_to_recordset($1::jsonb) AS item(
      regulator text, scraper_run_id bigint, source_url text, fingerprint text,
      reason_codes jsonb, reasons jsonb, payload jsonb
    )
  `, [payload as never]);
  return dropped.length;
}

export async function persistPreparedDiscoveryCandidates(
  sql: Sql,
  records: DbReadyRecord[],
  scraperRunId: string | number,
) {
  const results = records.map((record) => ({ record, result: validateDiscoveryCandidate(record, scraperRunId) }));
  const invalid = results.filter(({ result }) => result.issues.length > 0);
  if (invalid.length > 0) {
    const quarantinePayload = invalid.map(({ record, result }) => ({
      regulator: record.regulator || "UNKNOWN",
      scraper_run_id: scraperRunId,
      source_url: record.sourceUrl || null,
      fingerprint: record.contentHash || null,
      reason_codes: result.issues.map((issue) => issue.code),
      reasons: result.issues.map((issue) => issue.message),
      payload: record,
    }));
    await sql.unsafe(`
      INSERT INTO public.coverage_discovery_quarantine (
        regulator, scraper_run_id, source_url, fingerprint, reason_codes, reasons, payload
      )
      SELECT item.regulator, item.scraper_run_id::bigint, item.source_url, item.fingerprint,
             item.reason_codes::jsonb, item.reasons::jsonb, item.payload::jsonb
      FROM jsonb_to_recordset($1::jsonb) AS item(
        regulator text, scraper_run_id bigint, source_url text, fingerprint text,
        reason_codes jsonb, reasons jsonb, payload jsonb
      )
    `, [quarantinePayload.map((item) => ({ ...item, reason_codes: item.reason_codes, reasons: item.reasons, payload: item.payload })) as never]);
  }
  const rows = [...new Map(
    results
      .flatMap(({ result }) => result.row ? [result.row] : [])
      .map((row) => [row.fingerprint, row] as const),
  ).values()];
  if (!rows.length) return 0;
  // postgres.js serialises plain JavaScript values for json/jsonb parameters.
  // Passing a pre-stringified value produces a JSON string scalar, so
  // jsonb_to_recordset rejects it as a non-array.
  const payload = rows.map((row) => ({
    fingerprint: row.fingerprint,
    regulator: row.regulator,
    source_url: row.sourceUrl,
    source_content_hash: row.sourceContentHash,
    entity: row.entity,
    issued_date: row.issuedDate,
    amount: row.amount,
    currency: row.currency,
    summary: row.summary,
    scraper_run_id: row.scraperRunId,
  }));
  await sql.unsafe(`
    INSERT INTO public.coverage_discovery_candidates (
      fingerprint, regulator, source_url, source_content_hash, entity,
      issued_date, amount, currency, summary, scraper_run_id
    )
    SELECT
      candidate.fingerprint, candidate.regulator, candidate.source_url,
      candidate.source_content_hash, candidate.entity, candidate.issued_date::date,
      candidate.amount::numeric, candidate.currency, candidate.summary,
      candidate.scraper_run_id::bigint
    FROM jsonb_to_recordset($1::jsonb) AS candidate(
      fingerprint text, regulator text, source_url text, source_content_hash text,
      entity text, issued_date text, amount numeric, currency text, summary text,
      scraper_run_id bigint
    )
    ON CONFLICT (fingerprint) DO UPDATE SET
      source_content_hash = EXCLUDED.source_content_hash,
      amount = EXCLUDED.amount,
      currency = EXCLUDED.currency,
      summary = EXCLUDED.summary,
      scraper_run_id = EXCLUDED.scraper_run_id,
      last_seen_at = now(),
      updated_at = now()
  `, [payload]);
  return rows.length;
}
