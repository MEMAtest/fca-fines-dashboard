import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";

interface RawFssRow {
  id: string;
  content_hash: string;
  stable_id: string;
  date_issued: string | null;
  touched_at: string | null;
}

interface FssScraperRun {
  id: string;
  started_at: string;
  status: string;
  quality_status: string;
  records_prepared: number;
  records_inserted: number;
  records_updated: number;
  errors: number;
  finished_at: string | null;
}

function sha256(values: string[]): string {
  return createHash("sha256").update(`${values.sort().join("\n")}\n`).digest("hex");
}

export function reconcileFssRunRecords(
  beforeRows: RawFssRow[],
  afterRows: RawFssRow[],
  runs: FssScraperRun[],
  runRows: RawFssRow[],
) {
  const run = runs.length === 1 ? runs[0] : null;
  const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
  const insertedIds = afterRows.filter((row) => !beforeById.has(row.id)).map((row) => row.id).sort();
  const updatedIds = runRows.filter((row) => beforeById.has(row.id)).map((row) => row.id).sort();
  const changedCounts = {
    insertedRawRows: insertedIds.length,
    updatedRawRows: updatedIds.length,
    runSummaryInserted: run ? Number(run.records_inserted) : null,
    runSummaryUpdated: run ? Number(run.records_updated) : null,
    prepared: run ? Number(run.records_prepared) : null,
    recordsTouchedDuringRun: runRows.length,
  };
  const failures: string[] = [];
  if (runs.length !== 1) failures.push(`Expected exactly one FSS scraper run during the rehearsal window; found ${runs.length}.`);
  if (run && (run.status !== "success" || run.quality_status !== "passed" || Number(run.errors) !== 0)) {
    failures.push(`FSS scraper run ${run.id} did not finish with success / passed / zero errors.`);
  }
  if (!run?.finished_at) failures.push("FSS scraper run has no finished_at timestamp; run-touched rows cannot be identified.");
  if (run && runRows.length !== Number(run.records_prepared)) failures.push("Run-touched raw rows do not match records_prepared.");
  if (run && (changedCounts.insertedRawRows !== changedCounts.runSummaryInserted
    || changedCounts.updatedRawRows !== changedCounts.runSummaryUpdated
    || changedCounts.prepared !== changedCounts.runSummaryInserted + changedCounts.runSummaryUpdated)) {
    failures.push(`FSS run/database row counts do not reconcile: ${JSON.stringify(changedCounts)}`);
  }
  return { run, changedCounts, failures, insertedIds, updatedIds };
}

function requiredArg(index: number, label: string): string {
  const value = process.argv[index];
  if (!value) throw new Error(`Missing ${label} argument.`);
  return value;
}

async function readSnapshot(sql: ReturnType<typeof postgres>, generatedAt: string) {
  const rawRows = await sql<RawFssRow[]>`
    SELECT id::text AS id,
           content_hash,
           COALESCE(raw_payload ->> 'canonicalId', raw_payload ->> 'actionId', content_hash) AS stable_id,
           date_issued::text AS date_issued,
           GREATEST(COALESCE(updated_at, scraped_at), scraped_at)::text AS touched_at
      FROM public.eu_fines
     WHERE upper(regulator) = 'FSS'
     ORDER BY id
  `;
  const [trusted] = await sql`
    SELECT COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE requires_amount_review)::int AS amount_review_count,
           MAX(date_issued)::text AS latest_date
      FROM public.all_regulatory_fines_trusted
     WHERE upper(regulator) = 'FSS'
  `;
  const queueRows = await sql`
    SELECT review.review_status, COUNT(*)::int AS count
      FROM public.eu_fines AS fine
      JOIN public.regulatory_case_amount_reviews AS review
        ON review.source_row_id = fine.id::text
     WHERE upper(fine.regulator) = 'FSS'
     GROUP BY review.review_status
  `;
  const queueCounts: Record<string, number> = {};
  for (const row of queueRows) queueCounts[row.review_status] = Number(row.count);
  const inventory = rawRows.map((row) => row.stable_id);
  return {
    generatedAt,
    rawCount: rawRows.length,
    rawLatestDate: rawRows.reduce<string | null>((latest, row) =>
      row.date_issued && (!latest || row.date_issued > latest) ? row.date_issued : latest, null),
    stableIdInventorySha256: sha256(inventory),
    stableIdCount: inventory.length,
    trustedPublicCount: trusted?.count ?? 0,
    trustedPublicLatestDate: trusted?.latest_date ?? null,
    trustedAmountReviewCount: trusted?.amount_review_count ?? 0,
    amountReviewQueue: {
      required: queueCounts.required ?? 0,
      approved: queueCounts.approved ?? 0,
      total: Object.values(queueCounts).reduce((sum, count) => sum + count, 0),
    },
    rawRows,
  };
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--before" && mode !== "--after") {
    throw new Error("Usage: fssProductionRehearsalSnapshot.ts --before <output.json> | --after <baseline.json> <output.json>");
  }
  // Refuse an unspecified target even though this helper is SELECT-only. This
  // keeps the rehearsal evidence tied to the same explicitly approved site DB.
  requireExpectedDbTarget("FSS production rehearsal snapshot");
  if (!process.env.REGACTIONS_EXPECTED_DB_HOST?.trim() || !process.env.REGACTIONS_EXPECTED_DB_NAME?.trim()) {
    throw new Error("FSS rehearsal requires REGACTIONS_EXPECTED_DB_HOST and REGACTIONS_EXPECTED_DB_NAME.");
  }
  const connectionString = resolveConnectionString();
  if (!connectionString) throw new Error("Neither REGACTIONS_DATABASE_URL nor DATABASE_URL is configured.");
  const sql = postgres(connectionString, {
    ssl: connectionString.includes("sslmode=") ? { rejectUnauthorized: false } : false,
    max: 1,
    idle_timeout: 10,
    connect_timeout: 30,
  });

  try {
    // Force every default transaction in this process to read-only at the
    // server, in addition to keeping this script's SQL statements SELECT-only.
    await sql.unsafe("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const generatedAt = new Date().toISOString();
    const snapshot = await readSnapshot(sql, generatedAt);

    if (mode === "--before") {
      const outputPath = requiredArg(3, "baseline output path");
      const baseline = { rehearsalStartedAt: generatedAt, snapshot };
      writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`);
      console.log(JSON.stringify({ phase: "before", rehearsalStartedAt: generatedAt, snapshot: { ...snapshot, rawRows: undefined } }, null, 2));
      return;
    }

    const baselinePath = requiredArg(3, "baseline input path");
    const outputPath = requiredArg(4, "after snapshot output path");
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const runs = await sql<FssScraperRun[]>`
      SELECT id::text AS id, regulator, started_at::text AS started_at,
             finished_at::text AS finished_at, status, quality_status,
             records_prepared, records_inserted, records_updated, errors,
             records_quarantined, latest_prepared_date::text AS latest_prepared_date,
             reconciliation
        FROM public.scraper_runs
       WHERE upper(regulator) = 'FSS'
         AND started_at >= ${baseline.rehearsalStartedAt}::timestamptz
         AND started_at <= ${generatedAt}::timestamptz
       ORDER BY started_at DESC
    `;
    const run = runs.length === 1 ? runs[0] : null;
    const runRows = run ? await sql<RawFssRow[]>`
      SELECT id::text AS id,
             content_hash,
             COALESCE(raw_payload ->> 'canonicalId', raw_payload ->> 'actionId', content_hash) AS stable_id,
             date_issued::text AS date_issued,
             GREATEST(COALESCE(updated_at, scraped_at), scraped_at)::text AS touched_at
        FROM public.eu_fines
       WHERE upper(regulator) = 'FSS'
         AND GREATEST(COALESCE(updated_at, scraped_at), scraped_at) >= ${run.started_at}::timestamptz - interval '2 minutes'
         AND GREATEST(COALESCE(updated_at, scraped_at), scraped_at) <= ${run.finished_at ?? generatedAt}::timestamptz + interval '2 minutes'
       ORDER BY stable_id
    ` : [];
    const reconciliation = reconcileFssRunRecords(baseline.snapshot.rawRows, snapshot.rawRows, runs, runRows);

    const evidence = {
      rehearsalStartedAt: baseline.rehearsalStartedAt,
      generatedAt,
      run: reconciliation.run,
      changedCounts: reconciliation.changedCounts,
      reconciliationPassed: reconciliation.failures.length === 0,
      reconciliationFailures: reconciliation.failures,
      insertedIds: reconciliation.insertedIds,
      updatedIds: reconciliation.updatedIds,
      recordsFromThisRun: runRows.map((row) => ({
        id: row.id,
        stableId: row.stable_id,
        contentHash: row.content_hash,
        dateIssued: row.date_issued,
        touchedAt: row.touched_at,
      })),
      before: { ...baseline.snapshot, rawRows: undefined },
      after: { ...snapshot, rawRows: undefined },
    };
    writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
    if (reconciliation.failures.length > 0) {
      throw new Error(`FSS production rehearsal reconciliation failed: ${reconciliation.failures.join(" ")}`);
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
