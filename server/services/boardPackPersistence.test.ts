import { describe, expect, it } from "vitest";
import {
  createBoardPackShare,
  enforceBoardPackRateLimit,
  parseBoardPackDraftPayload,
  parseOwnerBearer,
} from "./boardPackPersistence.js";
import { BOARD_PACK_CASE_ID_ALIAS_VERSION } from "./boardPackCaseIdAliases.js";
import type { SqlClient } from "../db.js";
import {
  DEFAULT_BOARD_PACK_SETTINGS,
  DEFAULT_BOARD_PROFILE,
} from "../../src/data/boardIntelligence.js";

const payload = {
  schemaVersion: 1,
  label: "Northstar Board Pack",
  currency: "GBP",
  firmProfile: DEFAULT_BOARD_PROFILE,
  presentationSettings: DEFAULT_BOARD_PACK_SETTINGS,
  analystNote: "",
  evidenceLocators: [{
    caseId: "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0",
    regulator: "FCA",
  }],
  assuranceMode: true,
  controlStatuses: { "aml-control-1": "evidenced" },
} as const;

describe("Board Pack persistence contract", () => {
  it("accepts the minimal versioned input contract", () => {
    expect(parseBoardPackDraftPayload(payload)).toEqual(payload);
  });

  it("rejects contact details, arbitrary URLs and unknown fields", () => {
    expect(() => parseBoardPackDraftPayload({
      ...payload,
      email: "owner@example.com",
      callbackUrl: "https://example.com",
    })).toThrow();
  });

  it("caps evidence locators at 50", () => {
    expect(() => parseBoardPackDraftPayload({
      ...payload,
      evidenceLocators: Array.from({ length: 51 }, () => payload.evidenceLocators[0]),
    })).toThrow();
  });

  it("rejects payloads over the 64 KB storage limit", () => {
    expect(() => parseBoardPackDraftPayload({
      ...payload,
      analystNote: "A".repeat(70_000),
    })).toThrow();
  });

  it("requires a 256-bit base64url owner bearer token", () => {
    const token = "A".repeat(43);
    expect(parseOwnerBearer(`Bearer ${token}`)).toBe(token);
    expect(() => parseOwnerBearer("Bearer short")).toThrow();
    expect(() => parseOwnerBearer(undefined)).toThrow();
  });

  it("fails closed when the per-minute request limit is exceeded", async () => {
    const sql = Object.assign(
      async () => [{ request_count: 31 }],
      { end: async () => undefined },
    ) as unknown as SqlClient;
    await expect(enforceBoardPackRateLimit("203.0.113.1|packs", sql, 30))
      .rejects.toMatchObject({ statusCode: 429 });
  });

  it("ensures the persistence schema on the runtime connection before counting", async () => {
    const queries: string[] = [];
    const sql = Object.assign(
      async (query: string) => {
        queries.push(query);
        return query.includes("INSERT INTO public.board_pack_request_limits")
          ? [{ request_count: 1 }]
          : [];
      },
      { end: async () => undefined },
    ) as unknown as SqlClient;

    await expect(enforceBoardPackRateLimit("203.0.113.2|packs", sql, 30))
      .resolves.toBeUndefined();
    expect(queries).toHaveLength(10);
    expect(queries[0]).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(queries.some((query) => (
      query.includes("CREATE TABLE IF NOT EXISTS public.board_pack_drafts")
    ))).toBe(true);
    expect(queries.some((query) => (
      query.includes("CREATE TABLE IF NOT EXISTS public.board_pack_shares")
    ))).toBe(true);
    expect(queries.some((query) => (
      query.includes("CREATE TABLE IF NOT EXISTS public.board_pack_request_limits")
    ))).toBe(true);
    expect(queries[queries.length - 1]).toContain("INSERT INTO public.board_pack_request_limits");
  });

  it("hydrates retired Board Pack locators through the shared exact alias and dedupes retained IDs", async () => {
    const oldPublicId = "da3264db-6860-4325-a19c-2fe8ddb334e8";
    const oldRawId = "541a89d0-465d-4cc1-8589-6b3b7d92ce91";
    const currentId = "3ec81b4c-6e62-44b6-9c06-654f37363ee0";
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const currentEvidence = {
      public_case_id: currentId, firm_individual: "AIA", firm_category: "Insurer", regulator: "FMANZ",
      notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
      source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aia/",
      summary: "AIA agreed to pay a NZD 700,000 pecuniary penalty.", breach_type: "Conduct",
      breach_categories: ["Conduct"], trusted_amount_gbp: 329000, date_issued: "2022-09-30",
      year_issued: 2022, month_issued: 9, requires_amount_review: false,
    };

    for (const locators of [
      [{ caseId: oldPublicId, regulator: "FMANZ" }],
      [{ caseId: oldRawId, regulator: "FMANZ" }],
      [{ caseId: currentId, regulator: "FMANZ" }],
      [{ caseId: oldPublicId, regulator: "FMANZ" }, { caseId: currentId, regulator: "FMANZ" }],
      [{ caseId: oldRawId, regulator: "FMANZ" }, { caseId: currentId, regulator: "FMANZ" }],
    ]) {
      const draftPayload = { ...payload, evidenceLocators: locators };
      let savedSnapshot: any;
      let queriedIds: unknown[] = [];
      const sql = Object.assign(
        async (query: string, params?: unknown[]) => {
          if (query.includes("FROM public.board_pack_drafts")) return [{ payload: draftPayload, revision: 4 }];
          if (query.includes("SELECT public_case_id, firm_individual")) {
            queriedIds = params?.[0] as unknown[];
            return (params?.[0] as string[]).includes(currentId) ? [currentEvidence] : [];
          }
          if (query.includes("INSERT INTO public.board_pack_shares")) {
            savedSnapshot = JSON.parse(String(params?.[3]));
            return [{ id: "share-id", source_revision: 4, snapshot_hash: "hash", application_commit: "test", generated_at: "2026-10-21T00:00:00.000Z", expires_at: "2026-11-20T00:00:00.000Z" }];
          }
          return [];
        },
        { end: async () => undefined },
      ) as unknown as SqlClient;

      await createBoardPackShare("pack-id", "owner-token", sql);
      expect(queriedIds).toEqual([currentId]);
      expect(savedSnapshot.payload.evidenceLocators).toEqual(locators);
      expect(savedSnapshot.result.selectedCases).toHaveLength(1);
      expect(savedSnapshot.result.selectedCases[0].id).toBe(currentId);
      expect(savedSnapshot.selectedCaseResolutions).toEqual(locators.map(({ caseId }) => ({
        requestedId: caseId,
        canonicalCaseId: currentId,
        ...(caseId !== currentId ? { aliasVersion: BOARD_PACK_CASE_ID_ALIAS_VERSION } : {}),
      })));
    }

    let unknownSnapshot: any;
    const unknownPayload = { ...payload, evidenceLocators: [{ caseId: unknownId, regulator: "FMANZ" }] };
    const unknownSql = Object.assign(
      async (query: string, params?: unknown[]) => {
        if (query.includes("FROM public.board_pack_drafts")) return [{ payload: unknownPayload, revision: 1 }];
        if (query.includes("SELECT public_case_id, firm_individual")) {
          expect(params?.[0]).toEqual([unknownId]);
          return [];
        }
        if (query.includes("INSERT INTO public.board_pack_shares")) {
          unknownSnapshot = JSON.parse(String(params?.[3]));
          return [{ id: "share-id", source_revision: 1, snapshot_hash: "hash", application_commit: "test", generated_at: "2026-10-21T00:00:00.000Z", expires_at: "2026-11-20T00:00:00.000Z" }];
        }
        return [];
      },
      { end: async () => undefined },
    ) as unknown as SqlClient;
    await createBoardPackShare("pack-id", "owner-token", unknownSql);
    expect(unknownSnapshot.payload.evidenceLocators).toEqual(unknownPayload.evidenceLocators);
    expect(unknownSnapshot.result.selectedCases).toHaveLength(0);
    expect(unknownSnapshot.selectedCaseResolutions).toEqual([]);
  });
});
