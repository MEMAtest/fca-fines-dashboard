import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reconcileFssRunRecords } from "../fssProductionRehearsalSnapshot.js";

const workflow = readFileSync(".github/workflows/fss-production-rehearsal.yml", "utf8");
const validationWorkflow = readFileSync(".github/workflows/fca-validation.yml", "utf8");
const snapshotScript = readFileSync("scripts/scraper/fssProductionRehearsalSnapshot.ts", "utf8");

describe("FSS production rehearsal workflow", () => {
  it("is manual-only, runs only FSS, and shares the scheduled writer lock", () => {
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:\n/m);
    expect(workflow).not.toMatch(/^\s+schedule:/m);
    expect(workflow).not.toContain("matrix:");
    expect(workflow).toContain("group: live-regulator-FSS");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("manualOnly: true");
    expect(workflow).toContain("scheduled: false");
    expect(workflow).toContain("otherRegulatorsRun: false");
  });

  it("uses the approved production command, target guard, Node 22, and Poppler", () => {
    expect(workflow).toContain("FSS_KOREAN_SANCTIONS_PROMOTION_APPROVED");
    expect(workflow).toContain("npm run scrape:fss:promote");
    expect(workflow).toContain("node-version: 22");
    expect(workflow).toContain("apt-get install --yes poppler-utils");
    for (const variable of ["DATABASE_URL", "REGACTIONS_DATABASE_URL", "REGACTIONS_EXPECTED_DB_HOST", "REGACTIONS_EXPECTED_DB_NAME"]) {
      expect(workflow).toContain(variable);
    }
  });

  it("captures read-only before/after SQL reconciliation and run-specific IDs", () => {
    expect(workflow).toContain("--before /tmp/fss-production-rehearsal-before.json");
    expect(workflow).toContain("--after /tmp/fss-production-rehearsal-before.json /tmp/fss-production-rehearsal-after.json");
    expect(snapshotScript).toContain("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    expect(snapshotScript).toContain("public.eu_fines");
    expect(snapshotScript).toContain("public.all_regulatory_fines_trusted");
    expect(snapshotScript).toContain("public.regulatory_case_amount_reviews");
    expect(snapshotScript).toContain("stableIdInventorySha256");
    expect(snapshotScript).toContain("recordsFromThisRun");
    expect(snapshotScript).toContain("records_prepared");
  });

  it("reconciles inserted and updated FSS IDs against the run summary", () => {
    const before = [{ id: "old-row", content_hash: "hash-old", stable_id: "case-old", date_issued: "2026-08-01", touched_at: "2026-08-02T00:00:00Z" }];
    const after = [
      before[0],
      { id: "new-row", content_hash: "hash-new", stable_id: "case-new", date_issued: "2026-10-01", touched_at: "2026-10-18T00:00:00Z" },
    ];
    const run = {
      id: "42", started_at: "2026-10-18T00:00:00Z", status: "success", quality_status: "passed", records_prepared: 2,
      records_inserted: 1, records_updated: 1, errors: 0, finished_at: "2026-10-18T00:01:00Z",
    };
    const result = reconcileFssRunRecords(before, after, [run], after);
    expect(result.failures).toEqual([]);
    expect(result.changedCounts).toMatchObject({ insertedRawRows: 1, updatedRawRows: 1, prepared: 2, recordsTouchedDuringRun: 2 });
    expect(result.insertedIds).toEqual(["new-row"]);
    expect(result.updatedIds).toEqual(["old-row"]);
  });

  it("fails reconciliation when run metrics differ from observed FSS rows", () => {
    const rows = [{ id: "row", content_hash: "hash", stable_id: "case", date_issued: "2026-10-01", touched_at: "2026-10-18T00:00:00Z" }];
    const run = {
      id: "43", started_at: "2026-10-18T00:00:00Z", status: "success", quality_status: "passed", records_prepared: 2,
      records_inserted: 1, records_updated: 1, errors: 0, finished_at: "2026-10-18T00:01:00Z",
    };
    const result = reconcileFssRunRecords([], rows, [run], rows);
    expect(result.failures).toContain("Run-touched raw rows do not match records_prepared.");
  });

  it("emits a workflow-dispatch run manifest without email or unrelated regulator jobs", () => {
    expect(workflow).toContain("workflowEvent: process.env.WORKFLOW_EVENT");
    expect(workflow).toContain("WORKFLOW_EVENT: ${{ github.event_name }}");
    expect(workflow).not.toContain("GITHUB_EVENT_NAME:");
    expect(workflow).toContain("workflowPath: '.github/workflows/fss-production-rehearsal.yml'");
    expect(workflow).toContain("emailsSent: false");
    expect(workflow).toContain("checksumsSha256:");
    expect(workflow).not.toMatch(/uses:\s*[^\n]*(mail|email)/i);
    expect(validationWorkflow).toContain("scripts/scraper/__tests__/fssProductionRehearsal.test.ts");
  });
});
