import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());

describe("canonical regulatory evidence layer", () => {
  it("deduplicates official cases and applies audited amount overrides", () => {
    const migration = fs.readFileSync(
      path.join(root, "migrations/20260715_canonical_regulatory_evidence.sql"),
      "utf8",
    );
    expect(migration).toContain("CREATE MATERIALIZED VIEW public.all_regulatory_fines_canonical");
    expect(migration).toContain("row_number() OVER");
    expect(migration).toContain("duplicate_count");
    expect(migration).toContain("regulatory_amount_overrides");
    expect(migration).toContain("COALESCE(corrected.amount_original::text, 'undisclosed')");
    expect(migration).toContain("COALESCE(corrected.breach_type, '')");
    expect(migration).toContain("REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical");
  });

  it("fails closed only for explicitly reviewed publication-level aggregate amounts", () => {
    const guard = fs.readFileSync(
      path.join(root, "migrations/20260813_enforcement_evidence_quality_guard.sql"),
      "utf8",
    );
    expect(guard).toContain("regulatory_case_amount_reviews");
    expect(guard).not.toContain("shared_amount_groups");
    expect(guard).toContain("aggregate_unallocated");
    expect(guard).toContain("25-298mr-asic-issues-over-2-2-million");
    expect(guard).toContain("26-057mr-mecca-companies-pay-594-000");
    expect(guard).toContain("requires_amount_review");
    expect(guard).toContain("source_duplicate_identity");
    expect(guard).toContain("PARTITION BY identified.source_duplicate_identity");
    expect(guard).toContain("idx_all_regulatory_fines_canonical_year");
  });

  it("does not offer shared-source aggregate candidates across different action dates", () => {
    const audit = fs.readFileSync(
      path.join(root, "scripts/corrections/auditEnforcementDataQuality.ts"),
      "utf8",
    );
    expect(audit).toContain("GROUP BY upper(regulator), ${NORMALISED_URL}, date_issued, amount_original");
  });

  it("ships a dry-run-first audit that can persist review markers without altering source rows", () => {
    const audit = fs.readFileSync(
      path.join(root, "scripts/corrections/auditEnforcementDataQuality.ts"),
      "utf8",
    );
    expect(audit).toContain('mode: apply ? "apply-review-markers" : "dry-run"');
    expect(audit).toContain("regulatory_case_amount_reviews");
    expect(audit).toContain("exactSameSourceDuplicates");
    expect(audit).toContain("aggregateAmountCandidates");
    expect(audit).toContain("--apply requires --source-url=");
    expect(audit).not.toMatch(/UPDATE public\.(?:fca_fines|eu_fines)/);
  });

  it("routes every public analytics query through the canonical view", () => {
    const applicationFiles = [
      "api/search.ts",
      "api/unified/overview.ts",
      "api/unified/search.ts",
      "api/unified/compare.ts",
      "api/unified/stats.ts",
      "server/services/agenticDataLayer.ts",
      "server/services/enforcementBriefingAgent.ts",
      "server/services/personaDigestService.ts",
      "scripts/lib/articleData.ts",
      "scripts/jobs/processAlerts.ts",
      "scripts/jobs/sendWeeklyDigest.ts",
    ];

    for (const file of applicationFiles) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source, file).toMatch(/all_regulatory_fines_(?:canonical|trusted)/);
      expect(source, file).not.toMatch(/all_regulatory_fines(?!_(?:canonical|trusted))/);
    }
  });

  it("uses canonical case identity to keep paginated evidence stable", () => {
    const search = fs.readFileSync(path.join(root, "api/unified/search.ts"), "utf8");
    expect(search).toContain("ORDER BY ${sortColumn} ${sortOrder}, canonical_case_id ASC, id ASC");
  });
});
