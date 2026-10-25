import { describe, expect, it } from "vitest";
import { CONTROL_TAXONOMY_VERSION } from "../../src/data/controlTaxonomy.js";
import { CONTROL_DISCOVERY_REGULATOR_CODES } from "../../src/data/controlDiscoveryScope.js";
import { buildControlArticleIndexReadinessQuery, buildControlArticleQuery } from "./articleData.js";

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
    expect(readiness.text).toContain("enforcement_control_summary_index_state");
    expect(readiness.text).toContain("complete = TRUE");
    expect(readiness.params).toEqual(["public", CONTROL_TAXONOMY_VERSION]);
  });
});
