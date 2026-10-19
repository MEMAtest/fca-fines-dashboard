import { fetchUnifiedSearch, type UnifiedSearchParams } from "../api.js";
import { fetchPages, transformUnifiedRecord } from "../hooks/useUnifiedData.js";
import type { FineRecord } from "../types.js";

export async function fetchWorkspaceRecords(
  params: UnifiedSearchParams,
  currency = "GBP",
  maximumRecords = 10000,
  options: { signal?: AbortSignal } = {},
): Promise<{ records: FineRecord[]; total: number; truncated: boolean }> {
  const pageSize = 1000;
  const searchParams = { ...params, currency };
  const signal = options.signal;
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  const firstPage = await fetchUnifiedSearch({
    ...searchParams,
    limit: pageSize,
    offset: 0,
    signal,
  });
  if (signal?.aborted) throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
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
  const remainingPages = signal
    ? await fetchPagesWithSignal(remainingOffsets, pageSize, searchParams, signal, 2)
    : await fetchPages(remainingOffsets, pageSize, searchParams, 2);
  const rawRecords = [
    ...firstPage.results,
    ...remainingPages.flatMap((page) => page.results),
  ].slice(0, wanted);
  const records = rawRecords.map((record) => transformUnifiedRecord(record, currency));

  return { records, total, truncated: total > records.length };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  }
}

function waitForRetry(signal: AbortSignal, delayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchPageWithSignal(
  params: UnifiedSearchParams,
  limit: number,
  offset: number,
  signal: AbortSignal,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    throwIfAborted(signal);
    try {
      const page = await fetchUnifiedSearch({ ...params, limit, offset, signal });
      throwIfAborted(signal);
      return page;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (attempt < 2) await waitForRetry(signal, 250 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function fetchPagesWithSignal(
  offsets: number[],
  limit: number,
  params: UnifiedSearchParams,
  signal: AbortSignal,
  concurrency: number,
) {
  if (!offsets.length) return [];
  const pages = new Array<Awaited<ReturnType<typeof fetchUnifiedSearch>>>(offsets.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), offsets.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < offsets.length) {
      throwIfAborted(signal);
      const index = nextIndex;
      nextIndex += 1;
      pages[index] = await fetchPageWithSignal(params, limit, offsets[index], signal);
    }
  }));

  throwIfAborted(signal);
  return pages;
}
