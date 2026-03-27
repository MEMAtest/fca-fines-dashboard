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
  liveLoader: () => Promise<DbReadyRecord[]>;
  testLoader?: () => Promise<DbReadyRecord[]>;
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
}

export async function runScraper(options: RunnerOptions) {
  const flags = getCliFlags();
  const startedAt = new Date().toISOString();
  const summary: ScraperRunSummary = {
    name: options.name,
    status: flags.dryRun ? "dry-run" : "success",
    recordsPrepared: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    startedAt,
    finishedAt: null,
    errorMessage: null,
  };
  let sql: ReturnType<typeof createSqlClient> | null = null;

  console.log(`${options.name}\n`);

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

    const result = await upsertEuFines(sql, records);
    summary.inserted = result.inserted;
    summary.updated = result.updated;
    summary.errors = result.errors;
    console.log(`\n💾 Upsert summary`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Errors: ${result.errors}`);

    console.log("\n🔄 Refreshing unified regulatory fines view...");
    await refreshUnifiedView(sql);
    console.log("✅ View refreshed");
  } catch (error) {
    summary.status = "error";
    summary.errorMessage =
      error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (sql) {
      await sql.end();
    }

    summary.finishedAt = new Date().toISOString();
    await writeScraperRunSummary(summary);
  }
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
