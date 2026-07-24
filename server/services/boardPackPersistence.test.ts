import { describe, expect, it } from "vitest";
import {
  enforceBoardPackRateLimit,
  parseBoardPackDraftPayload,
  parseOwnerBearer,
} from "./boardPackPersistence.js";
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
});
