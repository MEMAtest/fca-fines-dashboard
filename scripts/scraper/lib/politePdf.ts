/**
 * Polite PDF text extraction for slow government hosts: bounded concurrency,
 * a small pause after every request, and large-output-safe pdftotext.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fetchBinary, mapWithConcurrency } from "./euFineHelpers.js";

const execFileAsync = promisify(execFile);

export interface PoliteOptions {
  concurrency: number;
  delayMs: number;
}

export const POLITE_DEFAULTS: PoliteOptions = { concurrency: 2, delayMs: 400 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pdfBufferToText(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mema-polite-pdf-"));
  const file = join(dir, "document.pdf");
  try {
    await writeFile(file, buffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", file, "-"], {
      maxBuffer: 256 * 1024 * 1024,
    });
    return stdout.replace(/\r\n/g, "\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fetchPdfText(url: string): Promise<string> {
  const buffer = await fetchBinary(url, { maxRedirects: 5, timeout: 120_000, maxContentLength: 200 * 1024 * 1024 });
  if (buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new Error(`Not a PDF response from ${url}`);
  }
  return pdfBufferToText(buffer);
}

/**
 * Run `task` over `items` with at most `concurrency` in flight and `delayMs`
 * of quiet time after each request completes (per worker).
 */
export async function politeMap<T, U>(
  items: T[],
  task: (item: T, index: number) => Promise<U>,
  options: PoliteOptions = POLITE_DEFAULTS,
  onProgress?: (done: number, total: number) => void,
): Promise<U[]> {
  let done = 0;
  return mapWithConcurrency(items, options.concurrency, async (item, index) => {
    try {
      return await task(item, index);
    } finally {
      done += 1;
      onProgress?.(done, items.length);
      await sleep(options.delayMs);
    }
  });
}

/** True when the host says the document does not exist (a permanently dead link, not a transient failure). */
export function isNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 404 || status === 410;
}
