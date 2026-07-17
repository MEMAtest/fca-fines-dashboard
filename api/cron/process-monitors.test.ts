import { describe, expect, it } from "vitest";
import { buildMonitorScopeQuery } from "./process-monitors.js";

describe("monitor scope query", () => {
  it("preserves regulator, year, theme, sector and text scope", () => {
    const result = buildMonitorScopeQuery(
      "/regulators/fca/analytics?year=2025&theme=AML&sector=Banking&q=controls",
      "2026-07-16T08:00:00.000Z",
    );
    expect(result.baseWhere).toContain("regulator = ANY($1::text[])");
    expect(result.baseWhere).toContain("year_issued = ANY($2::int[])");
    expect(result.baseWhere).toContain("jsonb_array_elements_text");
    expect(result.baseWhere).toContain("firm_category");
    expect(result.baseWhere).toContain("ILIKE");
    expect(result.values).toEqual([["FCA"], [2025], ["AML"], "Banking", "%controls%"]);
    expect(result.newWhere).toContain("created_at > $6::timestamptz");
  });

  it("supports multi-select comparison scopes", () => {
    const result = buildMonitorScopeQuery("/fines/compare?years=2024,2025&regulators=FCA,SEC&themes=AML,Market%20abuse", null);
    expect(result.values).toEqual([["FCA", "SEC"], [2024, 2025], ["AML", "Market abuse"]]);
    expect(result.newWhere).toBe(result.baseWhere);
  });
});
