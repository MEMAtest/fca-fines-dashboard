import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../db.js";
import {
  assessFcaFineCaseIndexability,
  buildFcaFineCasePath,
  getFcaFineCaseById,
  listFcaMonetaryCasesForSeo,
  parseFcaFineCategories,
} from "./fcaFineCases.js";

const caseId = "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0";
const relatedCaseId = "f2ac10e1-a122-4e46-bde8-d7cac93acfe5";

function trustedRow(overrides: Record<string, unknown> = {}) {
  return {
    public_case_id: caseId,
    regulator: "FCA",
    firm_individual: "Example Bank plc",
    trusted_amount_gbp: 12_500_000,
    date_issued: "2026-06-12",
    year_issued: 2026,
    month_issued: 6,
    summary: "The FCA imposed a financial penalty after identifying material control weaknesses that exposed customers and markets to avoidable financial crime risk.",
    breach_type: "AML",
    breach_categories: JSON.stringify(JSON.stringify(["AML", "PRINCIPLES", "AML"])),
    notice_url: "https://www.fca.org.uk/publication/final-notices/example-bank-2026.pdf",
    source_url: "https://www.fca.org.uk/news/press-releases/example-bank-fined",
    source_link_status: "verified_detail",
    source_checked_at: "2026-07-22T10:30:00Z",
    source_http_status: 200,
    source_official_domain_match: true,
    source_content_hash: "abc123",
    source_resolved_url: "https://www.fca.org.uk/publication/final-notices/example-bank-2026.pdf",
    source_last_verified_at: "2026-07-22T10:30:00Z",
    source_next_check_at: "2026-08-21T10:30:00Z",
    source_consecutive_failures: 0,
    source_review_status: "clear",
    source_review_reason: null,
    amount_quality: "reported",
    requires_amount_review: false,
    amount_verification_url: null,
    amount_override_reason: null,
    duplicate_count: 1,
    created_at: "2026-06-12T12:00:00Z",
    ...overrides,
  };
}

function fakeSql(...responses: Record<string, unknown>[][]): SqlClient {
  const execute = vi.fn(async () => responses.shift() ?? []) as unknown as SqlClient;
  execute.end = vi.fn(async () => undefined);
  return execute;
}

describe("FCA fine case service", () => {
  it("builds the immutable canonical path without adding a firm hash", () => {
    expect(buildFcaFineCasePath({
      caseId,
      year: 2026,
      firm: "Example Bank plc",
    })).toBe(`/fca-fines/2026/example-bank-plc/${caseId}`);
  });

  it("normalises native and double-encoded category arrays", () => {
    expect(parseFcaFineCategories(["AML", "PRINCIPLES", "AML"])).toEqual(["AML", "PRINCIPLES"]);
    expect(parseFcaFineCategories(JSON.stringify(JSON.stringify(["AML", "SYSTEMS_CONTROLS"])))).toEqual([
      "AML",
      "SYSTEMS_CONTROLS",
    ]);
    expect(parseFcaFineCategories("not-json")).toEqual(["not-json"]);
    expect(parseFcaFineCategories(null)).toEqual([]);
  });

  it("keeps an official FCA case indexable while surfacing evidence and copy warnings", () => {
    const result = assessFcaFineCaseIndexability({
      caseId,
      firm: "Example Bank plc",
      amount: 1_000_000,
      dateIssued: "2026-06-12",
      year: 2026,
      month: 6,
      summary: "Short summary only.",
      breach: "AML",
      categories: ["AML"],
      sourceUrl: "https://www.fca.org.uk/news/example",
      sourceStatus: "official_unverified",
      sourceCheckedAt: null,
      sourceHttpStatus: null,
      sourceOfficialDomainMatch: null,
      sourceReviewStatus: null,
      requiresAmountReview: false,
    });

    expect(result.indexable).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      "thin_summary",
      "unverified_source",
      "source_check_missing",
    ]));
    expect(result.evidenceStrength).toBe("official_unverified");
  });

  it("blocks indexation when material case evidence is unsafe or absent", () => {
    const result = assessFcaFineCaseIndexability({
      caseId,
      firm: "Example Bank plc",
      amount: 1_000_000,
      dateIssued: "2026-06-12",
      year: 2026,
      month: 6,
      summary: "",
      breach: null,
      categories: [],
      sourceUrl: "https://example.com/not-the-fca",
      sourceStatus: "official_unverified",
      sourceCheckedAt: null,
      sourceHttpStatus: null,
      sourceOfficialDomainMatch: false,
      sourceReviewStatus: "needs_review",
      requiresAmountReview: true,
    });

    expect(result.indexable).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "amount_review_required",
      "missing_summary",
      "missing_breach_context",
      "missing_official_source",
      "source_domain_mismatch",
      "source_needs_review",
    ]));
  });

  it("returns SEO rows from the trusted FCA monetary query", async () => {
    const sql = fakeSql([trustedRow()]);
    const rows = await listFcaMonetaryCasesForSeo(sql);

    expect(rows).toEqual([
      expect.objectContaining({
        caseId,
        year: 2026,
        firmSlug: "example-bank-plc",
        firm: "Example Bank plc",
        amount: 12_500_000,
        categories: ["AML", "PRINCIPLES"],
        sourceStatus: "verified_detail",
        indexable: true,
        indexabilityReasons: [],
      }),
    ]);
    const query = (sql as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(query).toContain("public.all_regulatory_fines_trusted");
    expect(query).toContain("upper(regulator) = 'FCA'");
    expect(query).toContain("trusted_amount_gbp > 0");
  });

  it("returns a canonical case with useful same-entity and same-evidence relations", async () => {
    const sharedEvidence = "https://www.fca.org.uk/publication/final-notices/example-bank-2026.pdf";
    const sql = fakeSql(
      [trustedRow()],
      [
        trustedRow({
          public_case_id: relatedCaseId,
          date_issued: "2025-05-02",
          year_issued: 2025,
          month_issued: 5,
        }),
        trustedRow({
          public_case_id: "f7f61ce9-dd62-439a-b4f9-96d10e8ee36d",
          firm_individual: "Example Director",
          date_issued: "2026-06-11",
          notice_url: sharedEvidence,
          source_resolved_url: sharedEvidence,
        }),
      ],
    );

    const record = await getFcaFineCaseById(caseId.toUpperCase(), sql);
    expect(record).toEqual(expect.objectContaining({
      caseId,
      canonicalPath: `/fca-fines/2026/example-bank-plc/${caseId}`,
      regulator: "FCA",
      quality: expect.objectContaining({ indexable: true }),
    }));
    expect(record?.relatedCases).toEqual([
      expect.objectContaining({ caseId: relatedCaseId, relationship: "same_entity_and_evidence" }),
      expect.objectContaining({ relationship: "same_evidence" }),
    ]);
    const lookupParameters = (sql as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(lookupParameters).toEqual([caseId]);
  });

  it("does not query for a malformed public case ID", async () => {
    const sql = fakeSql();
    await expect(getFcaFineCaseById("../bad", sql)).resolves.toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});
