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
