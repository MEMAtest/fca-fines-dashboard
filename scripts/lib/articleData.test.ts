import { describe, expect, it } from "vitest";
import { CONTROL_TAXONOMY_VERSION } from "../../src/data/controlTaxonomy.js";
import { CONTROL_DISCOVERY_REGULATOR_CODES } from "../../src/data/controlDiscoveryScope.js";
import { buildControlArticleIndexReadinessQuery, buildControlArticleQuery, getTimelyWindow, shouldContinueTimelyPaging } from "./articleData.js";
import type { EnforcementRecord } from "./articleData.js";

describe("control-focused article evidence selection", () => {
  it("uses the same current indexed summary and approved-passage case corpus as Explorer", () => {
    const query = buildControlArticleQuery(["AML_CASH_CONTROLS", "CDD_KYC"]);

    expect(query).not.toBeNull();
    expect(query?.text).toContain("public.all_regulatory_fines_trusted c");
    expect(query?.text).toContain("enforcement_control_summary_matches");
    expect(query?.text).toContain("source_field_fingerprints = jsonb_build_object");
    expect(query?.text).toContain("enforcement_control_evidence");
    expect(query?.text).toContain("review_status = 'approved'");
    expect(query?.text).toContain("evidence.respondent = c.firm_individual");
    expect(query?.text).toContain("evidence.source_url = COALESCE(");
    expect(query?.params).toHaveLength(3);
    expect(query?.params.slice(0, 2)).toEqual([["AML_CASH_CONTROLS", "CDD_KYC"], CONTROL_TAXONOMY_VERSION]);
    expect(query?.params[2]).toEqual(CONTROL_DISCOVERY_REGULATOR_CODES);
    expect(query?.params[2]).toContain("BAFIN");
    expect(query?.params[2]).toContain("ICO");
    expect(query?.params[2]).toContain("PRA");
    expect(query?.params[2]).not.toContain("FCA_FINES");
    expect(query?.text).toContain("UPPER(candidate_case.regulator) = ANY($3::text[])");
    expect(query?.text).toContain("LIMIT 120");
  });

  it("fails closed for unknown control codes rather than falling back to broad topic search", () => {
    expect(buildControlArticleQuery(["cash", "UNKNOWN_CONTROL"])).toBeNull();
  });

  it("requires a complete current public index before control-focused article sampling", () => {
    const readiness = buildControlArticleIndexReadinessQuery();
    expect(readiness.text).toContain("enforcement_control_summary_index_state_versions");
    expect(readiness.text).not.toContain("FROM public.enforcement_control_summary_index_state\n");
    expect(readiness.text).toContain("complete = TRUE");
    expect(readiness.params).toEqual(["public", CONTROL_TAXONOMY_VERSION]);
  });
});

describe("timely editorial sampling windows", () => {
  it("keeps the rolling fortnight bounded and supports a distinct month-to-date window", () => {
    const now = new Date(Date.UTC(2026, 9, 28, 12));
    expect(getTimelyWindow(14, now)).toEqual({ start: "2026-10-14", end: "2026-10-28" });
    expect(getTimelyWindow(14, now, "month-to-date")).toEqual({ start: "2026-10-01", end: "2026-10-28" });
    expect(getTimelyWindow(14, new Date("2026-03-29T00:30:00.000Z"))).toEqual({ start: "2026-03-15", end: "2026-03-29" });
  });

  it("pages past non-official rows before applying the 25-record sample cap", () => {
    const row = (index: number, official: boolean): EnforcementRecord => ({
      id: "page-row-" + index, regulator: "FCA", firm_individual: "Firm " + index,
      amount: 0, currency: "GBP", amount_gbp: 0, date_issued: "2026-10-23",
      breach_type: "AML controls", summary: "Official source describes AML control findings.",
      notice_url: official ? "https://www.fca.org.uk/news/" + index : "https://example.com/" + index,
      source_url: "", amount_verified: false,
    });
    const firstPage = [...Array.from({ length: 2 }, (_, index) => row(index, true)), ...Array.from({ length: 98 }, (_, index) => row(index + 2, false))];
    expect(shouldContinueTimelyPaging(firstPage, 100, 100)).toBe(true);
    const enoughOfficial = [...firstPage, ...Array.from({ length: 23 }, (_, index) => row(index + 100, true))];
    expect(shouldContinueTimelyPaging(enoughOfficial, 100, 100)).toBe(false);
  });
});
