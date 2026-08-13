import type { EnforcementCandidate } from "../../../src/types/coverageAgent.js";

export interface DiscoveryQueueDatabaseRow {
  fingerprint: string;
  regulator: string;
  source_url: string;
  source_content_hash: string | null;
  entity: string;
  issued_date: string | null;
  amount: number | string | null;
  currency: string | null;
  summary: string | null;
}

/** Maps a prepared official source candidate without assigning an import status. */
export function mapDiscoveryQueueCandidate(row: DiscoveryQueueDatabaseRow): EnforcementCandidate {
  const summary = row.summary?.trim() || `${row.regulator} prepared enforcement evidence`;
  return {
    id: `discovery:${row.fingerprint}`,
    regulator: row.regulator,
    sourceUrl: row.source_url,
    sourceContentHash: row.source_content_hash,
    title: `${row.regulator}: ${row.entity}`,
    entity: row.entity,
    issuedDate: row.issued_date,
    amount: row.amount === null ? null : Number(row.amount),
    currency: row.currency,
    summary,
    candidateKind: "enforcement",
    contentType: row.amount === null ? "notice" : "penalty",
    // The shared scraper persistence bridge has already validated this URL
    // against the configured regulator official domains.
    officialSource: true,
  };
}
