import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertCaseIdentity, assertSourceHashUnchanged, REVIEWED_EVIDENCE_UPSERT_SQL, validateReviewedManifest, validateReviewedManifestForApply, type ReviewManifest } from "../../scripts/control-evidence/review.js";
import type { ControlEvidenceCandidate } from "../../server/services/controlEvidence.js";

const candidate: ControlEvidenceCandidate = {
  public_case_id: "case-1", control_code: "AML_CASH_CONTROLS", taxonomy_version: "v1",
  source_url: "https://www.fca.org.uk/notice", content_hash: "f".repeat(64), passage: "Named Bank failed cash controls.",
  locator: "html:p[2]", respondent: "Named Bank Limited", attribution_method: "respondent_name_in_same_passage",
  fetched_at: "2026-10-25T00:00:00.000Z", review_status: "candidate",
};
const manifest = (): ReviewManifest => ({ schemaVersion: 1, dbTarget: { host: "db.example", database: "regactions" }, generatedAt: "2026-10-25T00:00:00Z", reviewedBy: "operator", reviewedAt: "2026-10-25T01:00:00Z", rows: [{ ...candidate, review_status: "approved" }] });

describe("reviewed control evidence manifest", () => {
  it("requires explicit human review and exact DB target", () => {
    const reviewed = manifest();
    expect(() => validateReviewedManifest(reviewed, reviewed.dbTarget)).not.toThrow();
    expect(() => validateReviewedManifest({ ...reviewed, reviewedBy: undefined }, reviewed.dbTarget)).toThrow(/reviewed manifest/);
    expect(() => validateReviewedManifest(reviewed, { host: "other", database: "regactions" })).toThrow(/target/);
    expect(() => validateReviewedManifest({ ...reviewed, rows: [{ ...candidate, review_status: "candidate" }] }, reviewed.dbTarget)).toThrow(/explicit/);
  });

  it("fails closed if source bytes or case identity changed after review", () => {
    expect(() => assertSourceHashUnchanged("abc", "different")).toThrow(/hash changed/);
    expect(() => assertCaseIdentity({ public_case_id: "case-1", source_url: candidate.source_url, firm_individual: candidate.respondent }, candidate)).not.toThrow();
    expect(() => assertCaseIdentity({ public_case_id: "case-2", source_url: candidate.source_url, firm_individual: candidate.respondent }, candidate)).toThrow(/identity/);
  });

  it("documents idempotent insert key and rejected decisions are reviewable", () => {
    const reviewed = manifest();
    reviewed.rows[0].review_status = "rejected";
    expect(() => validateReviewedManifest(reviewed, reviewed.dbTarget)).not.toThrow();
    // Stable source identity is retained; the upsert is a no-op on identical reviewed values.
    expect(reviewed.rows[0].review_status).toBe("rejected");
    expect(REVIEWED_EVIDENCE_UPSERT_SQL).toContain("ON CONFLICT (public_case_id, control_code, taxonomy_version, source_url, content_hash, locator)");
    expect(REVIEWED_EVIDENCE_UPSERT_SQL).toContain("OR existing.review_status IS DISTINCT FROM EXCLUDED.review_status");
  });

  it("allows a validated re-review to promote the same source identity to a new taxonomy version", () => {
    const current = manifest();
    current.rows[0].taxonomy_version = "v3";
    expect(() => validateReviewedManifestForApply(current, current.dbTarget, "v3", new Set(["AML_CASH_CONTROLS"]))).not.toThrow();

    const stale = { ...current, rows: current.rows.map((row) => ({ ...row, taxonomy_version: "v2" })) };
    expect(() => validateReviewedManifestForApply(stale, stale.dbTarget, "v3", new Set(["AML_CASH_CONTROLS"]))).toThrow(/taxonomy version is stale/);
    expect(REVIEWED_EVIDENCE_UPSERT_SQL).toContain("ON CONFLICT (public_case_id, control_code, taxonomy_version, source_url, content_hash, locator)");
    expect(REVIEWED_EVIDENCE_UPSERT_SQL).not.toContain("taxonomy_version = EXCLUDED.taxonomy_version");
  });

  it("keeps old and new reviewed evidence decisions version-scoped without migrating approvals", () => {
    const v4 = manifest();
    v4.rows[0].taxonomy_version = "2026-10-25.v4";
    const v5 = manifest();
    v5.rows[0].taxonomy_version = "2026-10-25.v5";
    expect(v4.rows[0].taxonomy_version).not.toBe(v5.rows[0].taxonomy_version);
    expect(REVIEWED_EVIDENCE_UPSERT_SQL).toContain("taxonomy_version, source_url, content_hash, locator");

    const migration = readFileSync(resolve(process.cwd(), "migrations/20261025_control_versioned_readiness.sql"), "utf8");
    expect(migration).toMatch(/BEGIN;\s+SET LOCAL lock_timeout = '5s';\s+SET LOCAL statement_timeout = '30s';/);
    expect(migration).toContain("enforcement_control_summary_index_state_versions");
    expect(migration).toContain("enforcement_control_evidence_versioned_unique");
    expect(migration).toContain("UNIQUE (public_case_id, control_code, taxonomy_version, source_url, content_hash, locator)");
    expect(migration).toContain("ON CONFLICT (scope_key, taxonomy_version) DO NOTHING");
    expect(migration).not.toMatch(/(?:INSERT|UPDATE)\s+(?:INTO\s+|public\.)?enforcement_control_evidence\b/i);
  });
});
