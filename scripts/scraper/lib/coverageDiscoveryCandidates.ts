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
  const host = hostname(sourceUrl);
  const sources = getRegulatorCoverage(regulator)?.officialSources ?? [];
  return sources.some((source) => {
    const configured = hostname(source.url);
    return host === configured || host.endsWith(`.${configured}`);
  });
}

export function buildDiscoveryCandidateRow(record: DbReadyRecord, scraperRunId: string | number): DiscoveryCandidateRow {
  const sourceUrl = normaliseUrl(record.sourceUrl);
  if (!isOfficialDomain(record.regulator, sourceUrl)) {
    throw new Error(`${record.regulator} prepared record has a source URL outside configured official regulator domains.`);
  }
  // Intentionally excludes content hash, summary and monetary amount. The
  // fingerprint identifies the source action over time while those fields may
  // be corrected by a regulator or scraper rerun.
  const fingerprint = createHash("sha256")
    .update([record.regulator.toUpperCase(), sourceUrl, record.firmIndividual.trim().toLowerCase(), record.dateIssued].join("|"))
    .digest("hex");
  return {
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
  };
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
  const rows = [...new Map(
    records
      .map((record) => buildDiscoveryCandidateRow(record, scraperRunId))
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
