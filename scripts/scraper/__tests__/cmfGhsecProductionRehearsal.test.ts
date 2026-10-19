import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { reconcileCmfGhsecRun } from "../cmfGhsecRehearsalReconcile.js";

const workflowPath = resolve(process.cwd(), ".github/workflows/cmf-ghsec-production-rehearsal.yml");
const snapshotPath = resolve(process.cwd(), "scripts/scraper/cmfGhsecProductionRehearsalSnapshot.ts");

describe("targeted CMF/GHSEC production rehearsal", () => {
  it("reconciles exactly one successful operational run to summary and raw-row changes", () => {
    const before = [{ id: "row-1", content_hash: "old-hash", stable_id: "CMF:1", date_issued: "2026-10-01", touched_at: "2026-10-01T00:00:00.000Z" }];
    const after = [
      { id: "row-1", content_hash: "new-hash", stable_id: "CMF:1", date_issued: "2026-10-01", touched_at: "2026-10-19T01:02:00.000Z" },
      { id: "row-2", content_hash: "hash-2", stable_id: "CMF:2", date_issued: "2026-10-02", touched_at: "2026-10-19T01:02:00.000Z" },
    ];
    const runs = [{
      id: "run-1", regulator: "CMF", started_at: "2026-10-19T01:00:00.000Z", finished_at: "2026-10-19T01:03:00.000Z",
      status: "success", quality_status: "passed", records_prepared: 2, records_inserted: 1, records_updated: 1,
      records_quarantined: 0, errors: 0,
    }];
    const summary = { regulatorCode: "CMF", status: "success", qualityStatus: "passed", recordsPrepared: 2, inserted: 1, updated: 1, errors: 0 };
    const result = reconcileCmfGhsecRun("CMF", before, after, runs, after, summary);
    expect(result.failures).toEqual([]);
    expect(result.changedCounts).toMatchObject({ insertedRawRows: 1, updatedRawRows: 1, deletedRawRows: 0, prepared: 2 });
    expect(result.insertedIds).toEqual(["row-2"]);
    expect(result.updatedIds).toEqual(["row-1"]);
  });

  it("fails closed on multiple or bad operational runs and summary mismatches", () => {
    const row = { id: "row-1", content_hash: "hash-1", stable_id: "GHSEC:1", date_issued: "2026-10-01", touched_at: "2026-10-19T01:02:00.000Z" };
    const run = {
      id: "run-1", regulator: "GHSEC", started_at: "2026-10-19T01:00:00.000Z", finished_at: "2026-10-19T01:03:00.000Z",
      status: "error", quality_status: "quarantined", records_prepared: 1, records_inserted: 0, records_updated: 1,
      records_quarantined: 0, errors: 1,
    };
    const wrongSummary = { regulatorCode: "CMF", status: "error", qualityStatus: "quarantined", recordsPrepared: 3, inserted: 0, updated: 0, errors: 1 };
    const result = reconcileCmfGhsecRun("GHSEC", [row], [row], [run], [row], wrongSummary);
    expect(result.failures.join(" ")).toContain("success / passed / zero errors");
    expect(result.failures.join(" ")).toContain("Scraper summary counts do not match");
    const multiple = reconcileCmfGhsecRun("GHSEC", [row], [row], [run, run], [row], wrongSummary);
    expect(multiple.failures.join(" ")).toContain("Expected exactly one GHSEC operational run");
  });

  it("is manual-only, choice-limited, locked per regulator, and runs one whitelisted command", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("type: choice");
    expect(workflow).toContain("- CMF");
    expect(workflow).toContain("- GHSEC");
    expect(/^\s+schedule:/m.test(workflow)).toBe(false);
    expect(workflow).toContain("group: live-regulator-${{ inputs.regulator }}");
    expect(workflow).toContain("CMF) npm run scrape:cmf");
    expect(workflow).toContain("GHSEC) npm run scrape:ghana-sec");
    expect(workflow.includes("npm run scrape:fss")).toBe(false);
    expect(workflow).toContain("workflowEvent: process.env.WORKFLOW_EVENT");
    expect(workflow).toContain("scheduled: false");
    expect(workflow).toContain("emailsSent: false");
    expect(workflow).toContain("otherRegulatorsRun: false");
    expect(workflow).toContain("actions/upload-artifact@v7");
  });

  it("guards the target database and captures bounded read-only snapshots plus run IDs", () => {
    const snapshot = readFileSync(snapshotPath, "utf8");
    expect(snapshot).toContain("requireExpectedDbTarget");
    expect(snapshot).toContain("REGACTIONS_EXPECTED_DB_HOST");
    expect(snapshot).toContain("REGACTIONS_EXPECTED_DB_NAME");
    expect(snapshot).toContain("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    expect(snapshot).toContain("public.eu_fines");
    expect(snapshot).toContain("public.all_regulatory_fines_trusted");
    expect(snapshot).toContain("public.regulatory_case_amount_reviews");
    expect(snapshot).toContain("public.scraper_runs");
    expect(snapshot).toContain("stableIdInventorySha256");
    expect(snapshot).toContain("contentInventorySha256");
    expect(snapshot).toContain("recordsFromThisRun");
    expect(snapshot).toContain("MAX_RAW_ROWS = 10_000");
  });
});
