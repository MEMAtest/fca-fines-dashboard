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

export async function runScraper(options: RunnerOptions) {
  const flags = getCliFlags();

  console.log(`${options.name}\n`);

  let records =
    flags.useTestData && options.testLoader
      ? await options.testLoader()
      : await options.liveLoader();

  records = limitRecords(records, flags.limit);

  console.log(`📊 Prepared ${records.length} records`);

  if (flags.dryRun) {
    printDryRunSummary(records);
    return;
  }

  requireDatabaseUrl();
  const sql = createSqlClient();

  try {
    const result = await upsertEuFines(sql, records);
    console.log(`\n💾 Upsert summary`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Errors: ${result.errors}`);

    console.log("\n🔄 Refreshing unified regulatory fines view...");
    await refreshUnifiedView(sql);
    console.log("✅ View refreshed");
  } finally {
    await sql.end();
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
