import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import listHandler from "./list.js";
import detailHandler from "./[iso2].js";
import evidenceHandler from "./evidence/[iso2].js";

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
  it("lists all countries without publishing an index", () => {
    const response = responseDouble();
    listHandler({ method: "GET", query: {} } as unknown as VercelRequest, response as unknown as VercelResponse);
    const payload = response.payload as { count: number; totalJurisdictions: number; rows: Array<{ transparencyIndex: null }> };
    expect(response.statusCode).toBe(200);
    expect(payload.count).toBe(213);
    expect(payload.totalJurisdictions).toBe(213);
    expect((payload as unknown as { configuredRegulatorCount: number }).configuredRegulatorCount).toBe(54);
    expect(payload.rows.every((row) => row.transparencyIndex === null)).toBe(true);
  });

  it("returns detailed official-source states and fails closed for unknown ISO2", () => {
    const detail = responseDouble();
    detailHandler({ method: "GET", query: { iso2: "VE" } } as unknown as VercelRequest, detail as unknown as VercelResponse);
    expect(detail.statusCode).toBe(200);
    expect(detail.payload).toMatchObject({ status: "research-only", transparencyIndex: null, country: { iso2: "VE" } });
    expect((detail.payload as { ecosystem: { authorities: unknown[] } }).ecosystem.authorities.length).toBeGreaterThan(0);
    const authority = (detail.payload as { ecosystem: { authorities: Array<{ directorySources: string[]; sourceCheckedAt: string }> } }).ecosystem.authorities[0];
    expect(authority.directorySources).toBeInstanceOf(Array);
    expect(authority.sourceCheckedAt).toMatch(/^2026-/);
    const kp = responseDouble();
    detailHandler({ method: "GET", query: { iso2: "KP" } } as unknown as VercelRequest, kp as unknown as VercelResponse);
    expect(kp.payload).toMatchObject({
      evidenceDisposition: { state: "external-evidence-only", externalEvidenceUrl: expect.stringContaining("fatf-gafi.org") },
      regActionsCoverage: { state: "external-evidence-only" },
    });
    const missing = responseDouble();
    detailHandler({ method: "GET", query: { iso2: "ZZ" } } as unknown as VercelRequest, missing as unknown as VercelResponse);
    expect(missing.statusCode).toBe(404);
  });

  it("supports JSON, CSV and PDF evidence downloads", async () => {
    const json = responseDouble();
    await evidenceHandler({ method: "GET", query: { iso2: "GB", format: "json" } } as unknown as VercelRequest, json as unknown as VercelResponse);
    expect(json.statusCode).toBe(200);
    expect(json.headers["Content-Type"]).toContain("application/json");
    const csv = responseDouble();
    await evidenceHandler({ method: "GET", query: { iso2: "GB", format: "csv" } } as unknown as VercelRequest, csv as unknown as VercelResponse);
    expect(csv.headers["Content-Type"]).toContain("text/csv");
    expect(String(csv.payload)).toContain("accessState");
    const pdf = responseDouble();
    await evidenceHandler({ method: "GET", query: { iso2: "GB", format: "pdf" } } as unknown as VercelRequest, pdf as unknown as VercelResponse);
    expect(pdf.headers["Content-Type"]).toBe("application/pdf");
    expect(Buffer.isBuffer(pdf.payload)).toBe(true);
  }, 30_000);
});
