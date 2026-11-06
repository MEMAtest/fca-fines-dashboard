import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("canonical view honours every regulator's suppressions", () => {
  const sql = readFileSync("migrations/20261106_canonical_honours_all_suppressions.sql", "utf8");
  it("widens the FMANZ-only guard to all regulators and rebuilds dependents in one transaction", () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;\s*$/);
    expect(sql).toContain("NOT (EXISTS ( SELECT 1 FROM regulatory_case_suppressions suppression WHERE (suppression.source_row_id = identified.id))");
    expect(sql).toContain("DROP VIEW public.all_regulatory_fines_trusted");
    expect(sql).toContain("CREATE VIEW public.all_regulatory_fines_trusted");
    expect(sql).toContain("RAISE EXCEPTION");
  });
  it("the regex matches the live FMANZ-only guard text", () => {
    const live = "WHERE (NOT ((upper(identified.regulator) = 'FMANZ'::text) AND (EXISTS ( SELECT 1\n                   FROM regulatory_case_suppressions suppression\n                  WHERE ((suppression.source_row_id = identified.id) AND (upper(suppression.regulator) = 'FMANZ'::text))))))";
    const re = /\(NOT \(\(upper\(identified\.regulator\) = 'FMANZ'::text\) AND \(EXISTS \( SELECT 1\s+FROM regulatory_case_suppressions suppression\s+WHERE \(\(suppression\.source_row_id = identified\.id\) AND \(upper\(suppression\.regulator\) = 'FMANZ'::text\)\)\)\)\)\)/;
    expect(live.replace(re, "(NOT (EXISTS ( SELECT 1 FROM regulatory_case_suppressions suppression WHERE (suppression.source_row_id = identified.id))))")).toContain("(NOT (EXISTS (");
  });
});
