import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scraperDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface ScraperBatchResult {
  scraper: string;
  ok: boolean;
  detail: string;
}

/**
 * Run scrapers one after another in child processes. A failure (non-zero exit,
 * spawn error or per-scraper timeout) is recorded and the batch CONTINUES, so
 * one broken source can no longer starve every scraper listed after it. The
 * returned results let the caller exit non-zero at the end.
 */
export async function runScraperBatch(
  scrapers: string[],
  args: string[],
  options: { perScraperTimeoutMs?: number } = {},
): Promise<ScraperBatchResult[]> {
  const timeoutMs =
    options.perScraperTimeoutMs
    ?? (Number.parseInt(process.env.SCRAPER_BATCH_TIMEOUT_MS || "", 10) || 20 * 60_000);
  const results: ScraperBatchResult[] = [];

  for (const scraper of scrapers) {
    const outcome = await new Promise<ScraperBatchResult>((resolve) => {
      const moduleUrl = pathToFileURL(join(scraperDir, scraper)).href;
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx/esm",
          "-e",
          `import(${JSON.stringify(moduleUrl)}).then((m) => m.main())`,
          "--",
          ...args,
        ],
        { stdio: "inherit", env: process.env },
      );
      const timer = setTimeout(() => {
        console.error(`⏱️ ${scraper} exceeded ${Math.round(timeoutMs / 60_000)} min; terminating.`);
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 15_000).unref();
      }, timeoutMs);

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ scraper, ok: false, detail: error.message });
      });
      child.on("exit", (code, signal) => {
        clearTimeout(timer);
        resolve(
          code === 0
            ? { scraper, ok: true, detail: "ok" }
            : { scraper, ok: false, detail: signal ? `killed by ${signal}` : `exit code ${code}` },
        );
      });
    });

    results.push(outcome);
    if (!outcome.ok) {
      console.error(`❌ ${scraper} failed (${outcome.detail}); continuing with the remaining scrapers.`);
    }
  }

  console.log("\nBatch summary:");
  for (const result of results) {
    console.log(`  ${result.ok ? "OK  " : "FAIL"} ${result.scraper}${result.ok ? "" : ` (${result.detail})`}`);
  }
  return results;
}

export async function runScraperBatchOrThrow(label: string, scrapers: string[], args: string[]) {
  const results = await runScraperBatch(scrapers, args);
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(`${label}: ${failed.length}/${results.length} scraper(s) failed: ${failed.map((r) => r.scraper).join(", ")}`);
  }
}
