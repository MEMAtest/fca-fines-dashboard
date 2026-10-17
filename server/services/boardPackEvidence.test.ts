import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BOARD_PROFILE } from "../../src/data/boardIntelligence.js";
import {
  clearBoardPackEvidenceCacheForTests,
  getBoardPackEvidence,
  mapBoardPackEvidenceRow,
  parseBoardPackEvidenceInput,
} from "./boardPackEvidence.js";

describe("Board Pack server evidence", () => {
  it("reads all 6,001 scoped records in keyset pages, including old evidence", async () => {
    clearBoardPackEvidenceCacheForTests();
    const records = Array.from({ length: 6001 }, (_, index) => ({
      public_case_id: `case-${String(index + 1).padStart(5, "0")}`,
      firm_individual: `Bank ${index + 1}`, firm_category: "Bank", regulator: "FCA",
      notice_url: "https://www.fca.org.uk/example", source_url: "https://www.fca.org.uk/example",
      summary: "Money laundering control failures and governance oversight.", breach_type: "AML",
      breach_categories: index === 0 ? JSON.stringify(JSON.stringify(["Sanctions"])) : ["AML"], trusted_amount_gbp: 1000, amount_quality: "verified_override",
      requires_amount_review: false, date_issued: index === 0 ? new Date("2024-12-31T23:30:00-02:00") : "2025-01-01", year_issued: 2025, month_issued: 1,
      source_link_status: "verified_detail",
    }));
    const sql = vi.fn(async (query: string, params: unknown[]) => {
      expect(query).toContain("regulator = ANY($1::text[])");
      expect(query).toContain("regulator = ANY($2::text[])");
      expect(query).toContain("public_case_id > $3");
      expect(query).toContain("LIMIT $4");
      expect(params[1]).toContain("FCA");
      const cursor = String(params[2]);
      return records.filter((row) => row.public_case_id > cursor).slice(0, Number(params[3]));
    }) as never;
    const result = await getBoardPackEvidence({ profile: { ...DEFAULT_BOARD_PROFILE, priorityRegulators: ["FCA"], focusRegions: ["UK"], priorityThemeIds: ["sanctions-screening"] }, selectedCaseIds: ["case-00001"] }, sql);
    expect(sql).toHaveBeenCalledTimes(4);
    expect(result.totalConsidered).toBe(6001);
    expect(result.methodologyVersion).toBe("board-pack-evidence-v1");
    expect(result.pack.notableCases.length).toBeGreaterThan(0);
    expect(result.pack.selectedCases[0].dateIssued).toBe("2025-01-01");
    expect(result.pack.selectedCases[0].matchedThemes).toContain("sanctions-screening");
  });

  it("rejects regulators outside the live public evidence registry", async () => {
    await expect(getBoardPackEvidence({ profile: { ...DEFAULT_BOARD_PROFILE, priorityRegulators: ["NOPE"] } }, vi.fn() as never))
      .rejects.toThrow("outside the public evidence perimeter");
  });

  it("rejects regions outside the shared regulator registry", () => {
    expect(() => parseBoardPackEvidenceInput({ profile: { ...DEFAULT_BOARD_PROFILE, focusRegions: ["Atlantis"] } }))
      .toThrow("region outside the public evidence perimeter");
  });

  it("normalizes database Date values and double-encoded categories", () => {
    const mapped = mapBoardPackEvidenceRow({
      public_case_id: "case-1", date_issued: new Date("2024-12-31T23:30:00-02:00"),
      breach_categories: JSON.stringify(JSON.stringify(["Sanctions", "AML"])),
    });
    expect(mapped.date_issued).toBe("2025-01-01");
    expect(mapped.breach_categories).toEqual(["Sanctions", "AML"]);
    expect(mapBoardPackEvidenceRow({ public_case_id: "case-2", date_issued: "2025-04-19" }).date_issued).toBe("2025-04-19");
  });

  it("hydrates selected public cases outside the profile without changing automatic counts", async () => {
    clearBoardPackEvidenceCacheForTests();
    const inScope = {
      public_case_id: "fca-case", firm_individual: "UK Bank", firm_category: "Bank", regulator: "FCA",
      summary: "AML transaction monitoring controls failed.", breach_type: "AML", breach_categories: ["AML"],
      trusted_amount_gbp: 100000, requires_amount_review: false, date_issued: "2025-02-01", year_issued: 2025, month_issued: 2,
      notice_url: "https://example.test/fca", source_url: "https://example.test/fca", source_link_status: "verified_detail",
    };
    const outsideScope = {
      ...inScope, source_row_id: "raw-search-uuid", public_case_id: "public-sebi-case", canonical_case_id: "internal-canonical-fingerprint",
      firm_individual: "India Payments Ltd", regulator: "SEBI",
      summary: "Sanctions screening controls failed.", breach_type: "Sanctions", breach_categories: ["Sanctions"],
      notice_url: "https://example.test/sebi", source_url: "https://example.test/sebi",
    };
    const queryParams: unknown[][] = [];
    const sql = vi.fn(async (query: string, params?: unknown[]) => {
      queryParams.push(params ?? []);
      return query.includes("canonical_case_id = ANY($1::text[])") ? [outsideScope] : [inScope];
    }) as never;
    const profile = { ...DEFAULT_BOARD_PROFILE, priorityRegulators: ["FCA"], focusRegions: ["UK"], priorityThemeIds: ["aml-controls"] as const };
    const baseline = await getBoardPackEvidence({ profile }, sql);
    const aliases = ["raw-search-uuid", "internal-canonical-fingerprint", "public-sebi-case"];
    const withBasket = await getBoardPackEvidence({ profile, selectedCaseIds: aliases }, sql);

    expect(sql).toHaveBeenCalledTimes(2);
    expect(queryParams[1]).toEqual([aliases, expect.arrayContaining(["SEBI"])]);
    expect(withBasket.totalConsidered).toBe(baseline.totalConsidered);
    expect(withBasket.pack.relevantActionCount).toBe(baseline.pack.relevantActionCount);
    expect(withBasket.pack.selectedCases).toHaveLength(1);
    expect(withBasket.pack.selectedCases[0]).toMatchObject({ id: "public-sebi-case", firm: "India Payments Ltd", regulator: "SEBI" });
    expect(withBasket.selectedCaseResolutions).toEqual(aliases.map((requestedId) => ({ requestedId, canonicalCaseId: "public-sebi-case" })));
  });
});
