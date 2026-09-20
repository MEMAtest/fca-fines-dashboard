import { fetchUnifiedSearch, type UnifiedSearchParams } from "../api.js";
import { fetchPages, transformUnifiedRecord } from "../hooks/useUnifiedData.js";
import type { FineRecord } from "../types.js";

export async function fetchWorkspaceRecords(
  params: UnifiedSearchParams,
  currency = "GBP",
  maximumRecords = 10000,
): Promise<{ records: FineRecord[]; total: number; truncated: boolean }> {
  const pageSize = 1000;
  const searchParams = { ...params, currency };
  const firstPage = await fetchUnifiedSearch({
    ...searchParams,
    limit: pageSize,
    offset: 0,
  });
  const total = firstPage.pagination.total;
  const wanted = Math.min(maximumRecords, total);
  const remainingOffsets: number[] = [];
  for (let offset = firstPage.results.length; offset < wanted; offset += pageSize) {
    remainingOffsets.push(offset);
  }

  // Comparison selections can span several years and previously fetched up to
  // twenty 500-row pages one after another. Keep the database load bounded,
  // but fetch two pages at a time so the UI does not remain disabled while
  // independent result pages wait on one another.
  const remainingPages = await fetchPages(
    remainingOffsets,
    pageSize,
    searchParams,
    2,
  );
  const rawRecords = [
    ...firstPage.results,
    ...remainingPages.flatMap((page) => page.results),
  ].slice(0, wanted);
  const records = rawRecords.map((record) => transformUnifiedRecord(record, currency));

  return { records, total, truncated: total > records.length };
}
