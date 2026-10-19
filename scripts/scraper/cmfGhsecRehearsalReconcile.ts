export type RehearsalRegulator = "CMF" | "GHSEC";

export interface RehearsalRawRow {
  id: string;
  content_hash: string;
  stable_id: string;
  date_issued: string | null;
  touched_at: string | null;
}

export interface RehearsalOperationalRun {
  id: string;
  regulator: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  quality_status: string;
  records_prepared: number;
  records_inserted: number;
  records_updated: number;
  records_quarantined: number;
  errors: number;
}

export interface RehearsalScraperSummary {
  regulatorCode: string;
  status: string;
  qualityStatus: string;
  recordsPrepared: number;
  inserted: number;
  updated: number;
  errors: number;
}

export function reconcileCmfGhsecRun(
  regulator: RehearsalRegulator,
  beforeRows: RehearsalRawRow[],
  afterRows: RehearsalRawRow[],
  runs: RehearsalOperationalRun[],
  runRows: RehearsalRawRow[],
  summary: RehearsalScraperSummary | null,
) {
  const run = runs.length === 1 ? runs[0] : null;
  const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
  const afterById = new Map(afterRows.map((row) => [row.id, row]));
  const insertedIds = afterRows.filter((row) => !beforeById.has(row.id)).map((row) => row.id).sort();
  const deletedIds = beforeRows.filter((row) => !afterById.has(row.id)).map((row) => row.id).sort();
  const updatedIds = runRows.filter((row) => beforeById.has(row.id)).map((row) => row.id).sort();
  const changedCounts = {
    insertedRawRows: insertedIds.length,
    updatedRawRows: updatedIds.length,
    deletedRawRows: deletedIds.length,
    runSummaryInserted: run ? Number(run.records_inserted) : null,
    runSummaryUpdated: run ? Number(run.records_updated) : null,
    prepared: run ? Number(run.records_prepared) : null,
    recordsTouchedDuringRun: runRows.length,
  };
  const failures: string[] = [];
  if (runs.length !== 1) failures.push(`Expected exactly one ${regulator} operational run in the rehearsal window; found ${runs.length}.`);
  if (run && (run.regulator.toUpperCase() !== regulator || run.status !== "success"
    || run.quality_status !== "passed" || Number(run.errors) !== 0)) {
    failures.push(`${regulator} run ${run.id} did not finish as success / passed / zero errors for the selected regulator.`);
  }
  if (run && Number(run.records_prepared) < 1) failures.push(`${regulator} run prepared zero records.`);
  if (!run?.finished_at) failures.push(`${regulator} operational run has no finished_at timestamp.`);
  if (!summary) failures.push("Scraper summary file is missing or unreadable.");
  if (summary && (summary.regulatorCode.toUpperCase() !== regulator || summary.status !== "success"
    || summary.qualityStatus !== "passed" || Number(summary.errors) !== 0)) {
    failures.push(`${regulator} scraper summary did not finish as success / passed / zero errors for the selected regulator.`);
  }
  if (run && summary && (Number(summary.recordsPrepared) !== Number(run.records_prepared)
    || Number(summary.inserted) !== Number(run.records_inserted)
    || Number(summary.updated) !== Number(run.records_updated)
    || Number(summary.errors) !== Number(run.errors))) {
    failures.push("Scraper summary counts do not match the operational database run row.");
  }
  if (run && runRows.length !== Number(run.records_prepared)) {
    failures.push("Run-touched raw rows do not match records_prepared.");
  }
  if (run && (changedCounts.insertedRawRows !== changedCounts.runSummaryInserted
    || changedCounts.updatedRawRows !== changedCounts.runSummaryUpdated
    || changedCounts.prepared !== changedCounts.runSummaryInserted + changedCounts.runSummaryUpdated)) {
    failures.push(`Operational summary counts do not reconcile to before/after raw rows: ${JSON.stringify(changedCounts)}`);
  }
  if (deletedIds.length > 0 || afterRows.length !== beforeRows.length + insertedIds.length) {
    failures.push("Before/after raw row inventory changed outside the reconciled inserts/updates.");
  }
  const touchedIds = new Set(runRows.map((row) => row.id));
  if (runRows.length !== touchedIds.size) failures.push("Run-touched raw row query returned duplicate database IDs.");
  const expectedChangedIds = new Set([...insertedIds, ...updatedIds]);
  if (expectedChangedIds.size !== touchedIds.size || [...expectedChangedIds].some((id) => !touchedIds.has(id))) {
    failures.push("Run-touched raw row IDs do not match the before/after inserted and updated IDs.");
  }
  return { run, changedCounts, failures, insertedIds, updatedIds, deletedIds };
}
