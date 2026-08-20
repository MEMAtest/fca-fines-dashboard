/**
 * One-off cleanup: remove CMVM rows that are not enforcement actions.
 *
 * Companion to the ingestion filter added in `scrapeCmvm.ts`
 * (`isCmvmSanctionRecord`). That filter only gates NEW rows — the table still
 * holds everything ingested before it existed.
 *
 * CMVM's search returns its whole institutional corpus for the terms
 * "contraordenacao" and "coima": annual reports, climate-disclosure notes,
 * fund-portfolio listings, issuer filings. All of it was written to `eu_fines`
 * as enforcement actions, which is why the regulator's hub claimed hundreds of
 * actions it could not evidence.
 *
 * Deletes rows whose stored title (`breach_type`, which is what the scraper
 * writes `entry.title` into) fails the same predicate the scraper now applies,
 * so the historical table matches what the scraper would ingest today.
 *
 * Safety: dry-run by default (`--apply` to delete); writes a JSON backup of
 * every doomed row; deletes inside a transaction that rolls back if the count
 * differs from the dry run; refreshes the materialized view afterwards, since
 * `all_regulatory_fines_canonical` keeps serving deleted rows until it is.
 *
 * Verified before writing: of 267 CMVM rows, 143 fail the predicate and NONE of
 * those 143 carry an amount, so no monetary data is lost.
 *
 *   npx tsx scripts/purge-cmvm-non-sanctions.ts            # dry run
 *   npx tsx scripts/purge-cmvm-non-sanctions.ts --apply    # delete
 */
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import * as dotenv from "dotenv";
import { isCmvmSanctionRecord } from "./scraper/scrapeCmvm.js";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
  // postgres.js forbids a hand-rolled BEGIN on a pooled connection.
  max: 1,
});

const APPLY = process.argv.includes("--apply");

async function refreshUnifiedView() {
  console.log("Refreshing all_regulatory_fines_canonical...");
  await sql`SELECT refresh_all_fines()`;
  const [row] = await sql<{ n: number; amt: number }[]>`
    SELECT COUNT(*)::int AS n, COUNT(amount_gbp)::int AS amt
    FROM all_regulatory_fines_canonical WHERE regulator = 'CMVM'
  `;
  console.log(`  canonical CMVM: ${row.n} rows, ${row.amt} with a GBP amount`);
}

async function main() {
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (no changes)\n");

  const rows = await sql<{ id: string; breach_type: string | null; amount: string | null }[]>`
    SELECT id, breach_type, amount FROM eu_fines WHERE regulator = 'CMVM'
  `;

  const doomed = rows.filter(
    (r) => !isCmvmSanctionRecord(r.breach_type ?? "", "", []),
  );
  const doomedWithAmount = doomed.filter((r) => r.amount !== null);

  console.log(`CMVM rows: ${rows.length}`);
  console.log(`  keep:   ${rows.length - doomed.length}`);
  console.log(`  delete: ${doomed.length}`);

  if (doomedWithAmount.length > 0) {
    // A non-sanction row carrying a monetary amount means the predicate is
    // wrong, not the data. Refuse rather than silently destroy evidence.
    console.error(
      `\nABORT: ${doomedWithAmount.length} row(s) would be deleted despite having an amount. Review the predicate.`,
    );
    await sql.end();
    process.exit(1);
  }

  if (doomed.length === 0) {
    console.log("\nNothing to delete.");
    if (APPLY) await refreshUnifiedView();
    await sql.end();
    return;
  }

  const backupPath =
    process.env.PURGE_BACKUP_PATH
    ?? `cmvm-non-sanction-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const full = await sql`
    SELECT * FROM eu_fines WHERE id = ANY(${doomed.map((r) => r.id)})
  `;
  writeFileSync(backupPath, full.map((r) => JSON.stringify(r)).join("\n"));
  console.log(`\nBacked up ${full.length} rows -> ${backupPath}`);

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to delete.");
    await sql.end();
    return;
  }

  await sql`BEGIN`;
  try {
    const deleted = await sql`
      DELETE FROM eu_fines WHERE id = ANY(${doomed.map((r) => r.id)}) RETURNING id
    `;
    console.log(`Deleted ${deleted.length} rows`);
    if (deleted.length !== doomed.length) {
      throw new Error(
        `Expected ${doomed.length} deletions but matched ${deleted.length}; rolling back.`,
      );
    }
    await sql`COMMIT`;
  } catch (error) {
    await sql`ROLLBACK`;
    throw error;
  }

  console.log("Committed.\n");
  await refreshUnifiedView();
  await sql.end();
}

main().catch(async (error) => {
  console.error("Purge failed:", error instanceof Error ? error.message : error);
  await sql.end();
  process.exit(1);
});
