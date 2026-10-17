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
      "scripts/monitoring/auditDataFreshness.ts",
      "scripts/scraper/checkLiveRegulatorFreshness.ts",
    ];

    for (const file of applicationFiles) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source, file).toMatch(/all_regulatory_fines_(?:canonical|trusted)/);
      expect(source, file).not.toMatch(/all_regulatory_fines(?!_(?:canonical|trusted))/);
    }
  });

  it("uses the trusted public perimeter for globe and unified aggregates without changing response keys", () => {
    const routes = ["api/globe/stats.ts", "api/unified/stats.ts", "api/unified/compare.ts"];
    const sources = routes.map((file) => fs.readFileSync(path.join(root, file), "utf8"));
    for (const [index, source] of sources.entries()) {
      expect(source, routes[index]).toContain("FROM public.all_regulatory_fines_trusted");
      expect(source, routes[index]).not.toContain("all_regulatory_fines_canonical");
    }

    const globe = sources[0];
    expect(globe).toContain("COUNT(DISTINCT regulator)");
    expect(globe).toContain("COUNT(DISTINCT country_code)");
    expect(globe).toContain("import { PUBLIC_REGULATOR_CODES }");
    expect(globe).toContain("regulator = ANY(${PUBLIC_REGULATOR_CODES}::text[])");
    expect(globe).toContain("date_issued::date <> DATE '1900-01-01'");
    expect(globe).toContain("year_issued BETWEEN 1 AND ${currentYear}");
    expect(globe).toContain("COUNT(*) FILTER (WHERE date_issued::date = DATE '1900-01-01')::int as undated_actions");
    for (const key of ["totalActions", "undatedActions", "fcaActions", "totalRegulators", "totalCountries", "earliestYear", "latestYear"]) {
      expect(globe).toMatch(new RegExp(`\\b${key}\\b`));
    }

    const stats = sources[1];
    for (const key of ["summary:", "byRegulator:", "topFines:", "breachDistribution:", "crossBorderFirms:", "monthlyTrends:", "filters:"]) {
      expect(stats).toContain(key);
    }
    expect(stats).toContain("requires_amount_review THEN NULL");
    expect(stats).toContain("PUBLIC_REGULATOR_CODES.map");
    expect(stats).toContain("PUBLIC_EU_REGULATOR_CODES.map");

    const compare = sources[2];
    expect(compare).toContain("import { PUBLIC_REGULATOR_CODES }");
    expect(compare).toContain("regulatorList.some(regulator => !publicRegulators.has(regulator))");
    expect(compare).toContain("return res.status(400).json({");
    expect(compare.indexOf("regulatorList.some(regulator => !publicRegulators.has(regulator))"))
      .toBeLessThan(compare.indexOf("const stats = await sql.unsafe"));
    expect(compare).toContain("comparison,");
    expect(compare).toContain("insights");
    expect(compare).toContain("requires_amount_review THEN NULL");
  });

  it("uses canonical case identity to keep paginated evidence stable", () => {
    const search = fs.readFileSync(path.join(root, "api/unified/search.ts"), "utf8");
    expect(search).toContain("ORDER BY ${sortColumn} ${sortOrder}, canonical_case_id ASC, id ASC");
  });

  it("preserves immutable public IDs when canonical deduplication selects a different source row", () => {
    const migration = fs.readFileSync(
      path.join(root, "migrations/20260813_registry_alias_reconciliation.sql"),
      "utf8",
    );
    expect(migration).toContain("fingerprint_alias.public_case_id::text");
    expect(migration).toContain("fingerprint_alias.fingerprint = canonical.canonical_case_id");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).not.toContain("DELETE FROM public.regulatory_case_registry");
  });

  it("supports stable legacy public IDs when amount corrections change canonical fingerprints", () => {
    const migration = fs.readFileSync(
      path.join(root, "migrations/20261017_registry_legacy_public_case_id.sql"),
      "utf8",
    );
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS legacy_public_case_id text");
    expect(migration).toContain("source_registry.legacy_public_case_id");
    expect(migration).toContain("source_registry.public_case_id::text");
    expect(migration).toContain("fingerprint_alias.public_case_id::text");
    expect(migration).toContain("pg_get_viewdef('public.all_regulatory_fines_trusted'::regclass, true)");
    expect(migration).toContain("regulatory_case_suppressions");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.all_regulatory_fines_trusted AS ' || rewritten");
    expect(migration).toContain("RAISE EXCEPTION 'Could not safely locate public_case_id expression");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.regulatory_case_(?:registry|aliases)/i);
    const runner = fs.readFileSync(path.join(root, "scripts/run-data-trust-migration.ts"), "utf8");
    expect(runner.indexOf('"migrations/20261017_reviewed_case_suppressions.sql"'))
      .toBeLessThan(runner.indexOf('"migrations/20261017_registry_legacy_public_case_id.sql"'));
    expect(runner).toContain('"migrations/20261017_registry_legacy_public_case_id.sql"');
  });

  it("serves the stable public alias as the case ID from public search", () => {
    const search = fs.readFileSync(path.join(root, "api/search.ts"), "utf8");
    expect(search).toContain("public_case_id AS canonical_case_id");
    expect(search).not.toMatch(/\n\s*canonical_case_id,\s*\n\s*duplicate_count/);
    const endpointTest = fs.readFileSync(path.join(root, "api/search.test.ts"), "utf8");
    expect(endpointTest).toContain('rankedQuery?.sql).toContain("public_case_id AS canonical_case_id")');
  });
});
