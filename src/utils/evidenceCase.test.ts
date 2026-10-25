import { describe, expect, it } from "vitest";
import { buildFineRecordEvidence } from "./evidenceCase.js";

describe("control evidence provenance mapping", () => {
  it("keeps basis, passage, source URL and hash when a control result enters the evidence basket", () => {
    const controlMatches = [
      { code: "AML_CASH_CONTROLS", label: "AML cash controls", basis: "stored_summary" as const, passage: "Cash transaction monitoring was inadequate." },
      { code: "CDD_KYC", label: "Customer due diligence (CDD/KYC)", basis: "official_passage" as const, passage: "Identity documents were not verified.", sourceUrl: "https://www.fca.org.uk/example", contentHash: "sha256:example", locator: "paragraph 4", respondent: "Example Ltd", attributionMethod: "exact_respondent", date: "2025-01-02T00:00:00.000Z" },
    ];

    const evidence = buildFineRecordEvidence({
      id: "public-case-1",
      canonical_case_id: "public-case-1",
      fine_reference: "public-case-1",
      firm_individual: "Example Ltd",
      firm_category: null,
      regulator: "FCA",
      date_issued: "2025-01-01",
      year_issued: 2025,
      month_issued: 1,
      amount: 0,
      breach_type: "AML controls",
      breach_categories: [],
      summary: "Stored summary",
      control_matches: controlMatches,
      final_notice_url: null,
      source_url: null,
      listing_url: null,
      detail_url: null,
      official_publication_url: null,
      source_link_status: "missing",
      source_link_label: "No source",
    }, "enforcement_search");

    expect(evidence.id).toBe("public-case-1");
    expect(evidence.controlMatches).toEqual(controlMatches);
    expect(evidence.controlMatches?.[0]?.basis).toBe("stored_summary");
    expect(evidence.controlMatches?.[1]).toMatchObject({ basis: "official_passage", sourceUrl: "https://www.fca.org.uk/example", contentHash: "sha256:example", locator: "paragraph 4", respondent: "Example Ltd", attributionMethod: "exact_respondent", date: "2025-01-02T00:00:00.000Z" });
  });
});
