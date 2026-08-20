/**
 * One-off cleanup: remove superseded CIMA and CMVM rows left behind by the
 * firm-name extraction fixes (PRs #146 and #148).
 *
 * Why these rows exist
 * --------------------
 * Both scrapers previously wrote unusable party names -- CIMA every row as
 * `Enforcement Action <date>`, CMVM every row as a Portuguese press-release
 * headline. The fixed scrapers extract the real party, which changes each row's
 * `content_hash`, so the backfill run INSERTED correctly-named rows ALONGSIDE
 * the legacy ones rather than updating them. Same class of duplication as the
 * 2026-06-02 BaFin content_hash change.
 *
 * The legacy rows are hidden from hub tables by `isGarbageFirmName`, so nothing
 * wrong was ever displayed. They are still counted, and regulator hubs now show
 * a LIVE action count (PR #145), so they inflate a user-visible number.
 *
 * What it deletes
 * ---------------
 * CIMA/CMVM rows that BOTH carry a placeholder-shaped name AND were created
 * before today. The date guard matters: the fixed CIMA scraper still legitimately
 * writes `Enforcement Action <date>` for bulk "Struck or Dissolved Entities"
 * notices, which genuinely name no party. Those are re-inserted by the next
 * scheduled run, so the cleanup is self-healing either way.
 *
 * Safety
 * ------
 * Dry-run by default; pass `--apply` to delete. The delete runs in a
 * transaction and rolls back if the row count does not match what the dry run
 * reported, so a concurrent scrape cannot widen the blast radius. Writes a
 * JSON backup of every doomed row before deleting.
 *
 *   npx tsx scripts/dedupe-cima-cmvm-legacy.ts            # dry run
 *   npx tsx scripts/dedupe-cima-cmvm-legacy.ts --apply    # delete
 */
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(databaseUrl, {
  ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
});

const REGULATORS = ["CIMA", "CMVM"];
const APPLY = process.argv.includes("--apply");

/**
 * Placeholder shapes the two scrapers used to emit. Deliberately narrow: each
 * is anchored, so a real firm whose name merely contains one of these words is
 * not matched.
 */
const PLACEHOLDER = sql`(
  firm_individual ~ '^Enforcement Action [0-9]{4}'
  OR firm_individual ILIKE 'CMVM %'
  OR firm_individual ILIKE 'Contraordena%'
)`;

async function main() {
  console.log(APPLY ? "MODE: APPLY (rows will be deleted)\n" : "MODE: DRY RUN (no changes)\n");

  let expected = 0;
  for (const regulator of REGULATORS) {
    const [row] = await sql<{ doomed: number; keep: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE ${PLACEHOLDER} AND created_at::date < CURRENT_DATE)::int AS doomed,
        COUNT(*) FILTER (WHERE NOT (${PLACEHOLDER} AND created_at::date < CURRENT_DATE))::int AS keep
      FROM eu_fines WHERE regulator = ${regulator}
    `;
    console.log(`${regulator}: delete ${row.doomed}, keep ${row.keep}`);
    expected += row.doomed;
  }

  if (expected === 0) {
    console.log("\nNothing to do.");
    await sql.end();
    return;
  }

  const doomed = await sql`
    SELECT * FROM eu_fines
    WHERE regulator = ANY(${REGULATORS})
      AND ${PLACEHOLDER}
      AND created_at::date < CURRENT_DATE
  `;
  const backupPath =
    process.env.DEDUPE_BACKUP_PATH
    ?? `cima-cmvm-dedupe-backup-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(backupPath, doomed.map((r) => JSON.stringify(r)).join("\n"));
  console.log(`\nBacked up ${doomed.length} rows -> ${backupPath}`);

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to delete.");
    await sql.end();
    return;
  }

  // Explicit BEGIN/COMMIT rather than sql.begin(): the transaction-scoped
  // client's tagged-template signature does not type-check against the
  // interpolated `PLACEHOLDER` fragment, and hand-rolling the transaction keeps
  // the rollback-on-count-mismatch guard obvious.
  await sql`BEGIN`;
  try {
    const deleted = await sql`
      DELETE FROM eu_fines
      WHERE regulator = ANY(${REGULATORS})
        AND ${PLACEHOLDER}
        AND created_at::date < CURRENT_DATE
      RETURNING id
    `;
    console.log(`Deleted ${deleted.length} rows`);
    if (deleted.length !== expected) {
      throw new Error(
        `Expected to delete ${expected} rows but matched ${deleted.length}; rolling back.`,
      );
    }
    await sql`COMMIT`;
  } catch (error) {
    await sql`ROLLBACK`;
    throw error;
  }

  console.log("Committed.\n");
  for (const regulator of REGULATORS) {
    const [row] = await sql<{ total: number; placeholder: number }[]>`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ${PLACEHOLDER})::int AS placeholder
      FROM eu_fines WHERE regulator = ${regulator}
    `;
    console.log(`${regulator}: total=${row.total} placeholder=${row.placeholder}`);
  }
  await sql.end();
}

main().catch(async (error) => {
  console.error("Cleanup failed:", error instanceof Error ? error.message : error);
  await sql.end();
  process.exit(1);
});
