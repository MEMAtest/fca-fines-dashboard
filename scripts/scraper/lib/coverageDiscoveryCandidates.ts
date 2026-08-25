import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import type { DbReadyRecord } from "./euFineHelpers.js";
import { getRegulatorCoverage } from "../../../src/data/regulatorCoverage.js";

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
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isInvalidEntity(value: string) {
  const entity = value.trim();
  if (entity.length < 3 || entity.length > 180) return true;
  return /<[^>]+>|\b(?:navigation|press release|read more|cookie policy|page title)\b/i.test(entity)
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
  if (record.firmIndividual && isInvalidEntity(record.firmIndividual)) {
    issues.push({ code: "invalid_entity", field: "firmIndividual", message: "Entity name is empty, contaminated or page furniture." });
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
