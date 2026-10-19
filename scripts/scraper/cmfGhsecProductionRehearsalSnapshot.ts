import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { requireExpectedDbTarget, resolveConnectionString } from "../lib/dbTarget.js";
import {
  reconcileCmfGhsecRun,
  stableSourceId,
  type RehearsalOperationalRun,
  type RehearsalRawRow,
  type RehearsalRegulator,
  type RehearsalScraperSummary,
} from "./cmfGhsecRehearsalReconcile.js";

const MAX_RAW_ROWS = 10_000;

type RawRowCandidate = Omit<RehearsalRawRow, "stable_id"> & {
  canonical_id: string | null;
  action_id: string | null;
};

function sortedHash(values: string[]): string {
  return createHash("sha256").update(`${[...values].sort().join("\n")}\n`).digest("hex");
}

function stableIds(rows: RehearsalRawRow[]): string[] {
  return rows.map((row) => row.stable_id).sort();
}

function parseRegulator(input: string | undefined): RehearsalRegulator {
  if (input === "CMF" || input === "GHSEC") return input;
  throw new Error("Regulator must be exactly CMF or GHSEC.");
}

function requiredArg(index: number, label: string): string {
  const value = process.argv[index];
  if (!value) throw new Error(`Missing ${label} argument.`);
  return value;
}

async function readSnapshot(sql: ReturnType<typeof postgres>, regulator: RehearsalRegulator, generatedAt: string) {
  const candidates = await sql<RawRowCandidate[]>`
    SELECT id::text AS id,
           content_hash,
           raw_payload ->> 'canonicalId' AS canonical_id,
           raw_payload ->> 'actionId' AS action_id,
           date_issued::text AS date_issued,
           GREATEST(COALESCE(updated_at, scraped_at), scraped_at)::text AS touched_at
      FROM public.eu_fines
     WHERE upper(regulator) = ${regulator}
     ORDER BY id
     LIMIT ${MAX_RAW_ROWS + 1}
  `;
  const rawRows = candidates.map((row) => ({ ...row, stable_id: stableSourceId(row) }));
  if (rawRows.length > MAX_RAW_ROWS) throw new Error(`${regulator} raw record count exceeds bounded rehearsal snapshot limit ${MAX_RAW_ROWS}.`);
  const [trusted] = await sql`
    SELECT COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE requires_amount_review)::int AS amount_review_count,
           MAX(date_issued)::text AS latest_date
      FROM public.all_regulatory_fines_trusted
     WHERE upper(regulator) = ${regulator}
  `;
  const queueRows = await sql`
    SELECT review.review_status, COUNT(*)::int AS count
      FROM public.eu_fines AS fine
      JOIN public.regulatory_case_amount_reviews AS review
        ON review.source_row_id = fine.id::text
     WHERE upper(fine.regulator) = ${regulator}
     GROUP BY review.review_status
  `;
  const amountReviewQueue: Record<string, number> = {};
  for (const row of queueRows) amountReviewQueue[row.review_status] = Number(row.count);
  const ids = stableIds(rawRows);
  const duplicateStableIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return {
    regulator,
    generatedAt,
    rawCount: rawRows.length,
    rawLatestDate: rawRows.reduce<string | null>((latest, row) =>
      row.date_issued && (!latest || row.date_issued > latest) ? row.date_issued : latest, null),
    stableIdInventorySha256: sortedHash(ids),
    contentInventorySha256: sortedHash(rawRows.map((row) => `${row.stable_id}\t${row.content_hash}`)),
    stableIdCount: ids.length,
    stableIds: ids,
    duplicateStableIds,
    trustedPublicCount: trusted?.count ?? 0,
    trustedPublicLatestDate: trusted?.latest_date ?? null,
    trustedAmountReviewCount: trusted?.amount_review_count ?? 0,
    amountReviewQueue: {
      required: amountReviewQueue.required ?? 0,
      approved: amountReviewQueue.approved ?? 0,
      total: Object.values(amountReviewQueue).reduce((sum, count) => sum + count, 0),
      byStatus: amountReviewQueue,
    },
    rawRows,
  };
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--before" && mode !== "--after") {
    throw new Error("Usage: cmfGhsecProductionRehearsalSnapshot.ts --before <CMF|GHSEC> <output.json> | --after <CMF|GHSEC> <baseline.json> <output.json> <summary.json>");
  }
  const regulator = parseRegulator(process.argv[3]);
  requireExpectedDbTarget(`${regulator} production rehearsal snapshot`);
  if (!process.env.REGACTIONS_EXPECTED_DB_HOST?.trim() || !process.env.REGACTIONS_EXPECTED_DB_NAME?.trim()) {
    throw new Error("Rehearsal requires REGACTIONS_EXPECTED_DB_HOST and REGACTIONS_EXPECTED_DB_NAME.");
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
    await sql.unsafe("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const generatedAt = new Date().toISOString();
    const snapshot = await readSnapshot(sql, regulator, generatedAt);
    if (snapshot.duplicateStableIds.length) throw new Error(`${regulator} snapshot contains duplicate stable IDs.`);
    if (mode === "--before") {
      const outputPath = requiredArg(4, "baseline output path");
      writeFileSync(outputPath, `${JSON.stringify({ rehearsalStartedAt: generatedAt, snapshot }, null, 2)}\n`);
      console.log(JSON.stringify({ phase: "before", rehearsalStartedAt: generatedAt, snapshot: { ...snapshot, rawRows: undefined } }, null, 2));
      return;
    }
    const baselinePath = requiredArg(4, "baseline input path");
    const outputPath = requiredArg(5, "after snapshot output path");
    const summaryPath = requiredArg(6, "scraper summary path");
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    let summary: RehearsalScraperSummary | null = null;
    try { summary = JSON.parse(readFileSync(summaryPath, "utf8")); } catch { /* reported by reconciliation */ }
    const runs = await sql<RehearsalOperationalRun[]>`
      SELECT id::text AS id, regulator, started_at::text AS started_at,
             finished_at::text AS finished_at, status, quality_status,
             records_prepared, records_inserted, records_updated, records_quarantined, errors
        FROM public.scraper_runs
       WHERE upper(regulator) = ${regulator}
         AND started_at >= ${baseline.rehearsalStartedAt}::timestamptz
         AND started_at <= ${generatedAt}::timestamptz
       ORDER BY started_at DESC
    `;
    const run = runs.length === 1 ? runs[0] : null;
    const runRows = run ? await sql<RawRowCandidate[]>`
      SELECT id::text AS id,
             content_hash,
             raw_payload ->> 'canonicalId' AS canonical_id,
             raw_payload ->> 'actionId' AS action_id,
             date_issued::text AS date_issued,
             GREATEST(COALESCE(updated_at, scraped_at), scraped_at)::text AS touched_at
        FROM public.eu_fines
       WHERE upper(regulator) = ${regulator}
         AND GREATEST(COALESCE(updated_at, scraped_at), scraped_at) >= ${run.started_at}::timestamptz - interval '2 minutes'
         AND GREATEST(COALESCE(updated_at, scraped_at), scraped_at) <= ${run.finished_at ?? generatedAt}::timestamptz + interval '2 minutes'
       ORDER BY id
       LIMIT ${MAX_RAW_ROWS + 1}
    ` : [];
    const runRowsWithStableIds = runRows.map((row) => ({ ...row, stable_id: stableSourceId(row) }));
    const reconciled = reconcileCmfGhsecRun(regulator, baseline.snapshot.rawRows, snapshot.rawRows, runs, runRowsWithStableIds, summary);
    const evidence = {
      regulator,
      rehearsalStartedAt: baseline.rehearsalStartedAt,
      generatedAt,
      operationalRun: reconciled.run,
      scraperSummary: summary,
      changedCounts: reconciled.changedCounts,
      reconciliationPassed: reconciled.failures.length === 0,
      reconciliationFailures: reconciled.failures,
      insertedIds: reconciled.insertedIds,
      updatedIds: reconciled.updatedIds,
      deletedIds: reconciled.deletedIds,
      recordsFromThisRun: runRowsWithStableIds.map((row) => ({ id: row.id, stableId: row.stable_id, contentHash: row.content_hash, dateIssued: row.date_issued, touchedAt: row.touched_at })),
      before: { ...baseline.snapshot, rawRows: undefined },
      after: { ...snapshot, rawRows: undefined },
    };
    writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify(evidence, null, 2));
    if (reconciled.failures.length) throw new Error(`${regulator} rehearsal reconciliation failed: ${reconciled.failures.join(" ")}`);
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
