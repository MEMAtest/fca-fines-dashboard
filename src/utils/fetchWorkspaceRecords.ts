import { fetchUnifiedSearch, type UnifiedSearchParams } from "../api.js";
import { transformUnifiedRecord } from "../hooks/useUnifiedData.js";
import type { FineRecord } from "../types.js";

export async function fetchWorkspaceRecords(
  params: UnifiedSearchParams,
  currency = "GBP",
  maximumRecords = 5000,
): Promise<{ records: FineRecord[]; total: number; truncated: boolean }> {
  const pageSize = 500;
  let offset = 0;
  let total = 0;
  let hasMore = true;
  const results: FineRecord[] = [];

  while (hasMore && offset < maximumRecords) {
    const response = await fetchUnifiedSearch({
      ...params,
      currency,
      limit: pageSize,
      offset,
    });
    total = response.pagination.total;
    results.push(...response.results.map((record) => transformUnifiedRecord(record, currency)));
    offset += response.results.length;
    hasMore = response.pagination.hasMore && response.results.length > 0;
  }

  return { records: results, total, truncated: total > results.length };
}
