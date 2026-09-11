import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import listHandler from "../api/regulatory-signal/list.js";
import detailHandler from "../api/regulatory-signal/[iso2].js";
import evidenceHandler, { regulatoryEvidenceAuthorityKey } from "../api/regulatory-signal/evidence/[iso2].js";
import { allowWebsiteDataRequest } from "./services/developerApiAccess.js";

function responseDouble() {
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    payload: undefined as unknown,
    setHeader: vi.fn((name: string, value: string) => { response.headers[name] = String(value); }),
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((payload: unknown) => { response.payload = payload; return response; }),
    send: vi.fn((payload: unknown) => { response.payload = payload; return response; }),
    end: vi.fn(() => response),
  };
  return response;
}

describe("regulatory signal read-only APIs", () => {
  const firstParty = { host: "regactions.com", "sec-fetch-site": "same-origin" };
  const websiteRequest = (query: Record<string, string>) => {
    const request = { method: "GET", query, headers: firstParty } as unknown as VercelRequest;
    allowWebsiteDataRequest(request);
    return request;
  };
  it("uses stable unique PDF keys when authority names repeat", () => {
    const authority = { name: "Financial Services Authority", website: "https://example-regulator.test" };
    expect(regulatoryEvidenceAuthorityKey(authority, 0)).not.toBe(regulatoryEvidenceAuthorityKey(authority, 1));
    expect(regulatoryEvidenceAuthorityKey(authority, 0)).toBe(regulatoryEvidenceAuthorityKey(authority, 0));
  });

  it("lists all countries without publishing an index", async () => {
    const response = responseDouble();
    await listHandler(websiteRequest({}), response as unknown as VercelResponse);
    const payload = response.payload as { count: number; totalJurisdictions: number; rows: Array<{ ecosystem: { authorityCount: number }; transparencyIndex: null; activitySummary: { scanContract: { startMonth: string; datePrecision: string } | null }; evidenceLevels: Record<string, number> }> };
    expect(response.statusCode).toBe(200);
    expect(payload.count).toBe(214);
    expect(payload.totalJurisdictions).toBe(214);
    expect((payload as unknown as { configuredRegulatorCount: number }).configuredRegulatorCount).toBe(54);
    expect(payload.rows.every((row) => row.transparencyIndex === null)).toBe(true);
    expect(payload.rows.every((row) => row.ecosystem.authorityCount === 0
      ? row.activitySummary.scanContract === null
      : row.activitySummary.scanContract?.startMonth === "2024-01" && row.activitySummary.scanContract.datePrecision === "month")).toBe(true);
    expect(payload.rows.some((row) => Object.keys(row.evidenceLevels).includes("identity-confirmed"))).toBe(true);
  });

  it("returns detailed official-source states and fails closed for unknown ISO2", async () => {
    const detail = responseDouble();
    await detailHandler(websiteRequest({ iso2: "VE" }), detail as unknown as VercelResponse);
    expect(detail.statusCode).toBe(200);
    expect(detail.payload).toMatchObject({ status: "research-only", transparencyIndex: null, country: { iso2: "VE" } });
    expect((detail.payload as { ecosystem: { authorities: unknown[] } }).ecosystem.authorities.length).toBeGreaterThan(0);
    const authority = (detail.payload as { ecosystem: { authorities: Array<{ directorySources: string[]; researchPublicationSnapshotCheckedAt: string; evidenceLevel: string; activity: { signal: string }; regulatoryUpdates: unknown[]; enforcementCandidates: unknown[] }> } }).ecosystem.authorities[0];
    expect(authority.directorySources).toBeInstanceOf(Array);
    expect(authority.researchPublicationSnapshotCheckedAt).toMatch(/^2026-/);
    expect(["identity-confirmed", "regulatory-activity-visible", "enforcement-visible", "score-eligible"]).toContain(authority.evidenceLevel);
    expect(["recent", "periodic", "low-frequency", "unknown"]).toContain(authority.activity.signal);
    expect(authority.regulatoryUpdates).toBeInstanceOf(Array);
    expect(authority.enforcementCandidates).toBeInstanceOf(Array);
    const kp = responseDouble();
    await detailHandler(websiteRequest({ iso2: "KP" }), kp as unknown as VercelResponse);
    expect(kp.payload).toMatchObject({
      evidenceDisposition: { state: "external-evidence-only", externalEvidenceUrl: expect.stringContaining("fatf-gafi.org") },
      regActionsCoverage: { state: "external-evidence-only" },
      activitySummary: { scanContract: null },
    });
    const missing = responseDouble();
    await detailHandler(websiteRequest({ iso2: "ZZ" }), missing as unknown as VercelResponse);
    expect(missing.statusCode).toBe(404);
  });

  it("supports JSON, CSV and PDF evidence downloads", async () => {
    const json = responseDouble();
    await evidenceHandler(websiteRequest({ iso2: "GB", format: "json" }), json as unknown as VercelResponse);
    expect(json.statusCode).toBe(200);
    expect(json.headers["Content-Type"]).toContain("application/json");
    const csv = responseDouble();
    await evidenceHandler(websiteRequest({ iso2: "GB", format: "csv" }), csv as unknown as VercelResponse);
    expect(csv.headers["Content-Type"]).toContain("text/csv");
    expect(String(csv.payload)).toContain("accessState");
    expect(String(csv.payload)).toContain("researchPublicationSnapshotCheckedAt");
    expect(String(csv.payload)).not.toContain("sourceCheckedAt");
    const pdf = responseDouble();
    await evidenceHandler(websiteRequest({ iso2: "GB", format: "pdf" }), pdf as unknown as VercelResponse);
    expect(pdf.headers["Content-Type"]).toBe("application/pdf");
    expect(Buffer.isBuffer(pdf.payload)).toBe(true);
  }, 30_000);
});
