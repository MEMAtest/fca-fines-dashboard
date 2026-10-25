import { describe, expect, it } from "vitest";
import { buildControlCandidateCaseSourceSql } from "./controlDiscoverySql.js";

describe("bounded indexed control candidate source", () => {
  it("resolves indexed evidence IDs to canonical source rows before the trusted view, then applies exact grounding", () => {
    const source = buildControlCandidateCaseSourceSql({ alias: "c" });

    expect(source).toContain("candidate_public_ids AS MATERIALIZED");
    expect(source).toContain("summary_candidate.control_code = ANY($1::text[])");
    expect(source).toContain("summary_candidate.taxonomy_version = $2");
    expect(source).toContain("passage_candidate.control_code = ANY($1::text[])");
    expect(source).toContain("passage_candidate.review_status = 'approved'");
    expect(source).toContain("candidate_source_rows AS MATERIALIZED");
    expect(source).toContain("registry_source.public_case_id::text = candidate_id.public_case_id");
    expect(source).toContain("registry_legacy.legacy_public_case_id = candidate_id.public_case_id");
    expect(source).toContain("fingerprint_alias.public_case_id::text = candidate_id.public_case_id");
    expect(source).toContain("canonical_candidates AS MATERIALIZED");
    expect(source).toContain("ON candidate_source.source_row_id = candidate_case.id::text");
    expect(source).toContain("UPPER(candidate_case.regulator) = ANY($3::text[])");
    expect(source).toContain("candidate_case.created_at DESC NULLS LAST");
    expect(source).toContain("candidate_case.id::text DESC");
    expect(source).toContain("source_field_fingerprints = jsonb_build_object(");
    expect(source).toContain("approved_evidence.respondent = canonical_case.firm_individual");
    expect(source).toContain("approved_evidence.source_url = COALESCE(");
    expect(source).toContain("index_state.complete = TRUE");
    expect(source).toMatch(/\) AS c$/);
    expect(source).not.toContain("outer_case");
  });

  it("supports parameterized composition after ordinary search filters", () => {
    const source = buildControlCandidateCaseSourceSql({
      controlCodesParameter: 5,
      taxonomyVersionParameter: 6,
      regulatorCodesParameter: 7,
      alias: "case_row",
    });
    expect(source).toContain("ANY($5::text[])");
    expect(source).toContain("= $6");
    expect(source).toContain("ANY($7::text[])");
    expect(source).toMatch(/\) AS case_row$/);
  });
});
