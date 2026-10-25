import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BOARD_PROFILE } from "../../src/data/boardIntelligence.js";
import { CONTROL_DISCOVERY_REGULATOR_CODES } from "../../src/data/controlDiscoveryScope.js";
import {
  BOARD_PACK_CASE_ID_ALIASES,
  BOARD_PACK_CASE_ID_ALIAS_VERSION,
} from "./boardPackCaseIdAliases.js";
import {
  clearBoardPackEvidenceCacheForTests,
  buildBoardPackSelectedControlEvidenceQuery,
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
    expect(sql).toHaveBeenCalledTimes(5);
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

    expect(sql).toHaveBeenCalledTimes(3);
    expect(queryParams[1]).toEqual([aliases, expect.arrayContaining(["SEBI"])]);
    expect(withBasket.totalConsidered).toBe(baseline.totalConsidered);
    expect(withBasket.pack.relevantActionCount).toBe(baseline.pack.relevantActionCount);
    expect(withBasket.pack.selectedCases).toHaveLength(1);
    expect(withBasket.pack.selectedCases[0]).toMatchObject({ id: "public-sebi-case", firm: "India Payments Ltd", regulator: "SEBI" });
    expect(withBasket.selectedCaseResolutions).toEqual(aliases.map((requestedId) => ({ requestedId, canonicalCaseId: "public-sebi-case" })));
  });

  it("hydrates manually selected ICO and PRA cases from the public UK enforcement search perimeter only", async () => {
    clearBoardPackEvidenceCacheForTests();
    const inScope = {
      public_case_id: "fca-case-2", firm_individual: "UK Bank", firm_category: "Bank", regulator: "FCA",
      summary: "AML transaction monitoring controls failed.", breach_type: "AML", breach_categories: ["AML"],
      trusted_amount_gbp: 100000, requires_amount_review: false, date_issued: "2025-02-01", year_issued: 2025, month_issued: 2,
      notice_url: "https://example.test/fca", source_url: "https://example.test/fca", source_link_status: "verified_detail",
    };
    const selected = [
      { ...inScope, source_row_id: "ico-search-id", public_case_id: "ico-public-id", canonical_case_id: "ico-public-id", firm_individual: "ICO Case", regulator: "ICO" },
      { ...inScope, source_row_id: "pra-search-id", public_case_id: "pra-public-id", canonical_case_id: "pra-public-id", firm_individual: "PRA Case", regulator: "PRA" },
    ];
    const queryParams: unknown[][] = [];
    const sql = vi.fn(async (query: string, params?: unknown[]) => {
      queryParams.push(params ?? []);
      return query.includes("canonical_case_id = ANY($1::text[])") ? selected : [inScope];
    }) as never;
    const profile = { ...DEFAULT_BOARD_PROFILE, priorityRegulators: ["FCA"], focusRegions: ["UK"] };
    const baseline = await getBoardPackEvidence({ profile }, sql);
    const basket = await getBoardPackEvidence({ profile, selectedCaseIds: ["ico-search-id", "pra-search-id"] }, sql);

    expect(queryParams[1][1]).toEqual(expect.arrayContaining(["ICO", "PRA", "FCA"]));
    expect(basket.totalConsidered).toBe(baseline.totalConsidered);
    expect(basket.pack.relevantActionCount).toBe(baseline.pack.relevantActionCount);
    expect(basket.pack.selectedCases.map((item) => item.firm)).toEqual(["ICO Case", "PRA Case"]);
  });

  it("resolves AIA retired and retained IDs to one selected case while preserving each requested ID", async () => {
    clearBoardPackEvidenceCacheForTests();
    const aia = {
      public_case_id: "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
      source_row_id: "1d17f226-d075-448a-9f88-0cc9ddff5acf",
      canonical_case_id: "aia-internal-fingerprint", firm_individual: "AIA", firm_category: "Insurer", regulator: "FMANZ",
      summary: "AIA agreed to pay a NZD 700,000 pecuniary penalty.", breach_type: "Conduct", breach_categories: ["Conduct"],
      trusted_amount_gbp: 329000, requires_amount_review: false, date_issued: "2022-09-30", year_issued: 2022, month_issued: 9,
      notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/", source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
      source_link_status: "verified_detail",
    };
    const sql = vi.fn(async (query: string, params?: unknown[]) => {
      if (query.includes("public_case_id > $3")) return [aia];
      if (query.includes("canonical_case_id = ANY($1::text[])")) {
        const ids = params?.[0] as string[];
        return ids.includes(aia.public_case_id) ? [aia] : [];
      }
      return [];
    }) as never;
    const profile = { ...DEFAULT_BOARD_PROFILE, priorityRegulators: ["FMANZ"], focusRegions: [] };
    const baseline = await getBoardPackEvidence({ profile }, sql);
    const oldId = "da3264db-6860-4325-a19c-2fe8ddb334e8";
    const currentId = aia.public_case_id;
    const both = await getBoardPackEvidence({ profile, selectedCaseIds: [oldId, currentId] }, sql);

    expect(both.totalConsidered).toBe(baseline.totalConsidered);
    expect(both.pack.relevantActionCount).toBe(baseline.pack.relevantActionCount);
    expect(both.pack.selectedCases).toHaveLength(1);
    expect(both.pack.selectedCases[0]).toMatchObject({ id: currentId, firm: "AIA", regulator: "FMANZ" });
    expect(both.selectedCaseResolutions).toEqual([
      { requestedId: oldId, canonicalCaseId: currentId, aliasVersion: BOARD_PACK_CASE_ID_ALIAS_VERSION },
      { requestedId: currentId, canonicalCaseId: currentId },
    ]);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("rehydrates Board Pack control provenance from current server evidence and guards source identity", async () => {
    const query = buildBoardPackSelectedControlEvidenceQuery(["case-1"]);
    expect(query?.params[2]).toEqual(CONTROL_DISCOVERY_REGULATOR_CODES);
    expect(query?.params[2]).toContain("BAFIN");
    expect(query?.params[2]).toContain("ICO");
    expect(query?.params[2]).toContain("PRA");
    expect(query?.params[2]).not.toContain("FCA_FINES");
    expect(query?.text).toContain("evidence.respondent = c.firm_individual");
    expect(query?.text).toContain("evidence.source_url = COALESCE(");
    expect(query?.text).toContain("evidence.content_hash");
    expect(query?.text).toContain("current_case.created_at DESC NULLS LAST");
    expect(query?.text).toContain("current_case.id::text DESC");

    clearBoardPackEvidenceCacheForTests();
    const record = {
      public_case_id: "case-1", firm_individual: "NatWest", regulator: "FCA",
      summary: "AML cash controls failed.", breach_type: "AML", breach_categories: ["AML"],
      trusted_amount_gbp: 1000, requires_amount_review: false, date_issued: "2025-01-01",
      year_issued: 2025, month_issued: 1, notice_url: "https://fca.example/notice",
      source_url: "https://fca.example/notice", source_link_status: "verified_detail",
    };
    const sql = vi.fn(async (text: string) => {
      if (text.includes("jsonb_agg(match_item.item")) return [{
        public_case_id: "case-1",
        control_matches: [{
          code: "AML_CASH_CONTROLS", basis: "official_passage",
          passage: "The bank failed to monitor cash transactions.",
          sourceUrl: "https://fca.example/notice", contentHash: "sha256:current",
          locator: "paragraph 4", respondent: "NatWest", attributionMethod: "named respondent",
        }],
      }];
      if (text.includes("public_case_id > $3")) return [record];
      if (text.includes("canonical_case_id = ANY($1::text[])")) return [record];
      return [];
    }) as never;
    const result = await getBoardPackEvidence({
      profile: { ...DEFAULT_BOARD_PROFILE, priorityRegulators: ["FCA"], focusRegions: ["UK"] },
      selectedCaseIds: ["case-1"],
    }, sql);

    expect(result.controlEvidenceAvailable).toBe(true);
    expect(result.pack.selectedCases[0].controlMatches).toEqual([expect.objectContaining({
      code: "AML_CASH_CONTROLS", basis: "official_passage", label: "AML cash controls",
      contentHash: "sha256:current", respondent: "NatWest",
    })]);
  });

  it("resolves all seven reviewed retired IDs to six current records without double-counting", async () => {
    clearBoardPackEvidenceCacheForTests();
    const currentIds = [...new Set(Object.values(BOARD_PACK_CASE_ID_ALIASES))];
    const rows = currentIds.map((publicCaseId, index) => ({
      public_case_id: publicCaseId,
      source_row_id: `current-source-${index}`,
      canonical_case_id: `current-fingerprint-${index}`,
      firm_individual: `Handoff firm ${index + 1}`, firm_category: "Financial institution", regulator: "FMANZ",
      summary: "Reviewed FMA enforcement event.", breach_type: "Conduct", breach_categories: ["Conduct"],
      trusted_amount_gbp: 1000, requires_amount_review: false, date_issued: "2024-01-01", year_issued: 2024, month_issued: 1,
      notice_url: "https://example.test/fma", source_url: "https://example.test/fma", source_link_status: "verified_detail",
    }));
    const sql = vi.fn(async (query: string, params?: unknown[]) => {
      if (!query.includes("public_case_id > $3")) return [];
      const cursor = String(params?.[2] ?? "");
      return rows.filter((row) => row.public_case_id > cursor).slice(0, Number(params?.[3]));
    }) as never;
    const profile = { ...DEFAULT_BOARD_PROFILE, priorityRegulators: ["FMANZ"], focusRegions: [] };
    const retiredIds = Object.keys(BOARD_PACK_CASE_ID_ALIASES);
    const selected = await getBoardPackEvidence({ profile, selectedCaseIds: [...retiredIds, ...currentIds] }, sql);

    expect(selected.totalConsidered).toBe(currentIds.length);
    expect(selected.pack.selectedCases).toHaveLength(currentIds.length);
    expect(new Set(selected.pack.selectedCases.map((item) => item.id))).toEqual(new Set(currentIds));
    expect(selected.selectedCaseResolutions).toHaveLength(retiredIds.length + currentIds.length);
    for (const [retiredId, currentId] of Object.entries(BOARD_PACK_CASE_ID_ALIASES)) {
      expect(selected.selectedCaseResolutions).toContainEqual({
        requestedId: retiredId, canonicalCaseId: currentId, aliasVersion: BOARD_PACK_CASE_ID_ALIAS_VERSION,
      });
    }
  });

  it("hydrates exact retired source/public IDs without widening the profile or resolving unknown IDs", async () => {
    clearBoardPackEvidenceCacheForTests();
    const inScope = {
      public_case_id: "fca-scope-case", firm_individual: "UK Bank", firm_category: "Bank", regulator: "FCA",
      summary: "AML transaction monitoring controls failed.", breach_type: "AML", breach_categories: ["AML"],
      trusted_amount_gbp: 100000, requires_amount_review: false, date_issued: "2025-02-01", year_issued: 2025, month_issued: 2,
      notice_url: "https://example.test/fca", source_url: "https://example.test/fca", source_link_status: "verified_detail",
    };
    const aia = {
      ...inScope,
      public_case_id: "3ec81b4c-6e62-44b6-9c06-654f37363ee0",
      source_row_id: "1d17f226-d075-448a-9f88-0cc9ddff5acf",
      canonical_case_id: "aia-internal-fingerprint", firm_individual: "AIA", firm_category: "Insurer", regulator: "FMANZ",
      summary: "AIA agreed to pay a NZD 700,000 pecuniary penalty.", breach_type: "Conduct", breach_categories: ["Conduct"],
    };
    const calls: Array<{ query: string; params: unknown[] }> = [];
    const sql = vi.fn(async (query: string, params?: unknown[]) => {
      calls.push({ query, params: params ?? [] });
      if (query.includes("public_case_id > $3")) return [inScope];
      if (query.includes("canonical_case_id = ANY($1::text[])")) {
        return (params?.[0] as string[]).includes(aia.public_case_id) ? [aia] : [];
      }
      return [];
    }) as never;
    const profile = { ...DEFAULT_BOARD_PROFILE, priorityRegulators: ["FCA"], focusRegions: ["UK"] };
    const baseline = await getBoardPackEvidence({ profile }, sql);
    const legacyRawId = "541a89d0-465d-4cc1-8589-6b3b7d92ce91";
    const currentId = aia.public_case_id;
    const selected = await getBoardPackEvidence({ profile, selectedCaseIds: [legacyRawId, currentId] }, sql);

    expect(selected.totalConsidered).toBe(baseline.totalConsidered);
    expect(selected.pack.relevantActionCount).toBe(baseline.pack.relevantActionCount);
    expect(selected.pack.selectedCases).toHaveLength(1);
    expect(selected.selectedCaseResolutions).toEqual([
      { requestedId: legacyRawId, canonicalCaseId: currentId, aliasVersion: BOARD_PACK_CASE_ID_ALIAS_VERSION },
      { requestedId: currentId, canonicalCaseId: currentId },
    ]);
    const hydration = calls.find(({ query }) => query.includes("canonical_case_id = ANY($1::text[])"));
    expect(hydration?.params[0]).toEqual([currentId]);
    expect(hydration?.params[1]).toEqual(expect.arrayContaining(["FMANZ"]));
    expect(hydration?.query).toContain("AND regulator = ANY($2::text[])");

    clearBoardPackEvidenceCacheForTests();
    const unknownCalls: unknown[][] = [];
    const unknownSql = vi.fn(async (query: string, params?: unknown[]) => {
      if (query.includes("canonical_case_id = ANY($1::text[])")) unknownCalls.push(params ?? []);
      return query.includes("public_case_id > $3") ? [inScope] : [];
    }) as never;
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const unknown = await getBoardPackEvidence({ profile, selectedCaseIds: [unknownId] }, unknownSql);
    expect(unknown.pack.selectedCases).toHaveLength(0);
    expect(unknown.selectedCaseResolutions).toEqual([]);
    expect(unknownCalls[0]?.[0]).toEqual([unknownId]);
    expect(unknownCalls[0]?.[1]).toEqual(expect.arrayContaining(["FCA", "FMANZ"]));
  });
});
