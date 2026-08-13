/**
 * Read-only adapter for RegActions' public unified-search API. It exists so an
 * external official-discovery feed can be matched against precisely the same
 * public record layer that users see. No write endpoint is called.
 */
import type { EnforcementCandidate, ExistingEnforcementRecord } from "../../../src/types/coverageAgent.js";

interface UnifiedSearchResponse {
  results?: Array<Record<string, unknown>>;
}

function string(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
}

function numeric(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value === null || value === undefined || value === "" ? null : Number(value);
}

export function mapUnifiedSearchRecord(row: Record<string, unknown>): ExistingEnforcementRecord {
  return {
    id: string(row, "canonical_case_id") ?? string(row, "id") ?? "",
    regulator: string(row, "regulator") ?? "",
    entity: string(row, "firm_individual") ?? "",
    sourceUrl: string(row, "source_url"),
    noticeUrl: string(row, "notice_url"),
    sourceContentHash: string(row, "source_content_hash"),
    issuedDate: string(row, "date_issued"),
    amount: numeric(row, "amount_original") ?? numeric(row, "amount_gbp") ?? numeric(row, "amount_eur"),
    currency: string(row, "currency"),
    summary: string(row, "summary"),
    publicCaseId: string(row, "canonical_case_id"),
    requiresAmountReview: row.requires_amount_review === true,
    amountQuality: string(row, "amount_quality"),
  };
}

/**
 * Uses official candidate fields to get a deliberately broad public-search
 * working set. The deterministic matcher makes the final decision locally.
 */
export async function lookupCandidatesViaUnifiedSearch(
  candidates: EnforcementCandidate[],
  apiBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExistingEnforcementRecord[]> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const records = new Map<string, ExistingEnforcementRecord>();
  for (const candidate of candidates) {
    const params = new URLSearchParams({ regulator: candidate.regulator, limit: "100" });
    if (candidate.entity) params.set("firmName", candidate.entity);
    const response = await fetchImpl(`${base}/api/unified/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Unified search returned HTTP ${response.status} for ${candidate.id}`);
    const payload = await response.json() as UnifiedSearchResponse;
    for (const row of payload.results ?? []) {
      const mapped = mapUnifiedSearchRecord(row);
      if (mapped.id) records.set(mapped.id, mapped);
    }
  }
  return [...records.values()];
}
