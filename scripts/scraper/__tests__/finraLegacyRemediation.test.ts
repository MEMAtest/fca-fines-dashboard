import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINRA_EXPORT_SOURCE_URL,
  FINRA_LEGACY_SOURCE_URL,
  auditFinraCaseCoverage,
  canApplyFinraRemediation,
  parseFinraRemediationArgs,
} from "../../corrections/remediateFinraLegacyRows.js";

const scriptPath = resolve(process.cwd(), "scripts/corrections/remediateFinraLegacyRows.ts");
const script = readFileSync(scriptPath, "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "migrations/20260825_finra_legacy_row_backup.sql"),
  "utf8",
);
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

describe("FINRA legacy-source remediation", () => {
  it("requires complete case-number coverage before apply", () => {
    const incomplete = auditFinraCaseCoverage(["CASE-1", "", "CASE-2"], ["CASE-1"]);
    expect(incomplete).toMatchObject({
      legacyRows: 3,
      uniqueLegacyCases: 2,
      emptyCaseNumbers: 1,
      missingCaseNumbers: ["CASE-2"],
    });
    expect(canApplyFinraRemediation(incomplete)).toBe(false);

    const complete = auditFinraCaseCoverage(["CASE-1", "CASE-1"], ["CASE-1", "CASE-2"]);
    expect(canApplyFinraRemediation(complete)).toBe(true);
  });

  it("keeps remediation dry-run by default and flags mutually exclusive", () => {
    expect(parseFinraRemediationArgs([])).toEqual({ apply: false, restore: false });
    expect(parseFinraRemediationArgs(["--apply"])).toEqual({ apply: true, restore: false });
    expect(parseFinraRemediationArgs(["--restore"])).toEqual({ apply: false, restore: true });
    expect(() => parseFinraRemediationArgs(["--apply", "--restore"])).toThrow(/mutually exclusive/);
  });

  it("uses exact FINRA source predicates and official export coverage", () => {
    expect(script).toContain("regulator = 'FINRA'");
    expect(script).toContain("source_url = ${FINRA_LEGACY_SOURCE_URL}");
    expect(script).toContain("source_url = ${FINRA_EXPORT_SOURCE_URL}");
    expect(script).toContain(FINRA_LEGACY_SOURCE_URL);
    expect(script).toContain(FINRA_EXPORT_SOURCE_URL);
    expect(script).toContain("to_jsonb(eu_fines)");
    expect(script).toContain("REFRESH MATERIALIZED VIEW public.all_regulatory_fines");
  });

  it("has a migration backup and explicit NaN-safe restore path", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.finra_legacy_row_backup");
    expect(migration).toContain("remediation_id uuid NOT NULL");
    expect(migration).toContain("backed_up_at timestamptz NOT NULL");
    expect(migration).toContain("row_data jsonb NOT NULL");
    expect(script).toContain("INSERT INTO public.eu_fines (");
    expect(script).toContain("id, content_hash, regulator");
    expect(script).toContain("NULLIF(NULLIF(row_data->>'amount',''),'NaN')::numeric");
    expect(script).toContain("NULLIF(NULLIF(row_data->>'amount_eur',''),'NaN')::numeric");
    expect(script).toContain("NULLIF(NULLIF(row_data->>'amount_gbp',''),'NaN')::numeric");
    expect(packageJson.scripts?.["data-trust:remediate-finra-legacy"]).toContain(
      "remediateFinraLegacyRows.ts",
    );
  });
});
