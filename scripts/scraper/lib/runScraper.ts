import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DbReadyRecord } from "./euFineHelpers.js";
import {
  createSqlClient,
  getCliFlags,
  limitRecords,
  printDryRunSummary,
  requireDatabaseUrl,
  upsertEuFines,
} from "./euFineHelpers.js";

interface RunnerOptions {
  name: string;
  region?: string;
  liveLoader: () => Promise<DbReadyRecord[]>;
  testLoader?: () => Promise<DbReadyRecord[]>;
  afterUpsert?: (
    sql: ReturnType<typeof createSqlClient>,
    records: DbReadyRecord[],
  ) => Promise<void>;
  retryOnTransientFailure?: boolean;
  maxRetries?: number;
}

interface ScraperRunSummary {
  name: string;
  status: "success" | "error" | "dry-run";
  recordsPrepared: number;
  inserted: number;
  updated: number;
  errors: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  retryAttempt: number;
}

const DEFAULT_RETRY_DELAY_MS = 60_000;

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("eai_again") ||
    message.includes("enotfound") ||
    message.includes("socket hang up") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("429")
  );
}

export async function runScraper(options: RunnerOptions) {
  const flags = getCliFlags();
  const startedAt = new Date();
  const maxRetries = options.retryOnTransientFailure === false ? 0 : (options.maxRetries ?? 1);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await runScraperAttempt(options, flags, startedAt, attempt);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && isTransientError(error)) {
        console.warn(
          `\n⚠️ Transient failure on attempt ${attempt + 1}/${maxRetries + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.warn(`   Retrying in ${DEFAULT_RETRY_DELAY_MS / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, DEFAULT_RETRY_DELAY_MS));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

async function runScraperAttempt(
  options: RunnerOptions,
  flags: ReturnType<typeof getCliFlags>,
  startedAt: Date,
  attempt: number,
) {
  const summary: ScraperRunSummary = {
    name: options.name,
    status: flags.dryRun ? "dry-run" : "success",
    recordsPrepared: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    errorMessage: null,
    durationMs: null,
    retryAttempt: attempt,
  };
  let sql: ReturnType<typeof createSqlClient> | null = null;
  let scraperRunId: number | null = null;

  if (attempt === 0) {
    console.log(`${options.name}\n`);
  } else {
    console.log(`\n${options.name} (retry attempt ${attempt})\n`);
  }

  try {
    let records =
      flags.useTestData && options.testLoader
        ? await options.testLoader()
        : await options.liveLoader();

    records = limitRecords(records, flags.limit);
    summary.recordsPrepared = records.length;

    console.log(`📊 Prepared ${records.length} records`);

    if (flags.dryRun) {
      printDryRunSummary(records);
      return;
    }

    requireDatabaseUrl();
    sql = createSqlClient();

    scraperRunId = await insertScraperRun(sql, options, startedAt);

    const result = await upsertEuFines(sql, records);
    summary.inserted = result.inserted;
    summary.updated = result.updated;
    summary.errors = result.errors;
    console.log(`\n💾 Upsert summary`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Errors: ${result.errors}`);

    if (options.afterUpsert) {
      await options.afterUpsert(sql, records);
    }

    console.log("\n🔄 Refreshing unified regulatory fines view...");
    await refreshUnifiedView(sql);
    console.log("✅ View refreshed");

    if (scraperRunId) {
      await updateScraperRun(sql, scraperRunId, summary);
    }
  } catch (error) {
    summary.status = "error";
    summary.errorMessage =
      error instanceof Error ? error.message : String(error);

    if (sql && scraperRunId) {
      try {
        await updateScraperRun(sql, scraperRunId, summary);
      } catch {
        // Metrics persistence failure should not mask the original error
      }
    }

    throw error;
  } finally {
    if (sql) {
      await sql.end();
    }

    summary.finishedAt = new Date().toISOString();
    summary.durationMs = Date.now() - startedAt.getTime();
    await writeScraperRunSummary(summary);
  }
}

async function insertScraperRun(
  sql: ReturnType<typeof createSqlClient>,
  options: RunnerOptions,
  startedAt: Date,
): Promise<number | null> {
  try {
    const regulatorCode = extractRegulatorCode(options.name);
    const region = options.region ?? "Unknown";
    const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

    const result = await sql`
      INSERT INTO scraper_runs (regulator, region, started_at, status, source, run_url)
      VALUES (${regulatorCode}, ${region}, ${startedAt.toISOString()}, 'running', 'github-actions', ${runUrl})
      RETURNING id
    `;

    return result[0]?.id ?? null;
  } catch {
    // Table may not exist yet — don't break the scraper
    console.warn("⚠️ Could not insert scraper_runs row (table may not exist yet)");
    return null;
  }
}

async function updateScraperRun(
  sql: ReturnType<typeof createSqlClient>,
  runId: number,
  summary: ScraperRunSummary,
) {
  try {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(summary.startedAt).getTime();

    await sql`
      UPDATE scraper_runs
      SET
        finished_at = ${finishedAt},
        status = ${summary.status},
        records_prepared = ${summary.recordsPrepared},
        records_inserted = ${summary.inserted},
        records_updated = ${summary.updated},
        errors = ${summary.errors},
        error_message = ${summary.errorMessage},
        duration_ms = ${durationMs}
      WHERE id = ${runId}
    `;
  } catch {
    // Metrics update failure should not break anything
  }
}

function extractRegulatorCode(scraperName: string): string {
  // Extract regulator code from scraper name like "🇩🇪 BaFin Enforcement Actions Scraper"
  const match = scraperName.match(/(?:[\p{Emoji}\s]+)?(\S+)/u);
  return match?.[1]?.replace(/[^A-Za-z-]/g, "") || "UNKNOWN";
}

async function refreshUnifiedView(sql: ReturnType<typeof createSqlClient>) {
  try {
    await sql`SELECT refresh_all_fines()`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("cannot refresh materialized view")) {
      throw error;
    }

    console.warn(
      "⚠️ Concurrent refresh unavailable, falling back to standard refresh",
    );
    await sql`REFRESH MATERIALIZED VIEW all_regulatory_fines`;
  }
}

async function writeScraperRunSummary(summary: ScraperRunSummary) {
  const outputFile = process.env.SCRAPER_RUN_SUMMARY_FILE?.trim();

  if (!outputFile) {
    return;
  }

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
