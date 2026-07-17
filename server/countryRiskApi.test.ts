import { describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import countryHandler from "../api/country-risk/[iso2].js";
import sourcesHandler from "../api/country-risk/sources/status.js";

function invoke(handler: (req: VercelRequest, res: VercelResponse) => unknown, query: Record<string, string> = {}) {
  let code = 200;
  let payload: unknown;
  const req = { method: "GET", query } as unknown as VercelRequest;
  const res = {
    setHeader: () => undefined,
    status(value: number) { code = value; return this; },
    json(value: unknown) { payload = value; return this; },
  } as unknown as VercelResponse;
  handler(req, res);
  return { code, payload: payload as any };
}

describe("country-risk v2 public API contract", () => {
  it("returns exact country evidence and a non-binding floor explanation for Iraq", () => {
    const response = invoke(countryHandler, { iso2: "IQ", methodology: "v2" });
    expect(response.code).toBe(200);
    expect(response.payload.result).toMatchObject({ score: 6.1, status: "provisional", confidence: "low" });
    expect(response.payload.result.floors).toContainEqual({
      reason: "fatf-grey",
      minimum: 6,
      applied: false,
      status: "non-binding",
    });
    expect(response.payload.change.explanation).toContain("No regulatory floor raised");
    expect(response.payload.evidence.aml.assessment.effectiveness).toHaveProperty("IO1");
    expect(response.payload.evidence.aml.assessment.technicalCompliance).toHaveProperty("R1");
    expect(response.payload.evidence.governance.dimensions).toEqual(expect.objectContaining({ cc: expect.any(Number), rl: expect.any(Number) }));
    expect(response.payload.evidence.governance.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(response.payload.evidence.sanctions.coverageStatus).toBe("unavailable");
    expect(response.payload.evidence.sanctions.pendingCandidates.length).toBeGreaterThan(0);
    expect(response.payload.calculationContext.persistedScoreRunId).toBeNull();
  });

  it("withholds the BVI headline instead of treating missing evidence as low risk", () => {
    const response = invoke(countryHandler, { iso2: "VG", methodology: "2.0.0" });
    expect(response.code).toBe(200);
    expect(response.payload.result).toMatchObject({ score: null, band: null, status: "insufficient-data" });
    expect(response.payload.result.floors[0].status).toBe("not-evaluated");
    expect(response.payload.previous).toEqual({
      methodologyVersion: "1.0.0",
      score: null,
      band: null,
      status: "insufficient-data",
    });
    expect(response.payload.change).toBeNull();
  });

  it("exposes the FATF required-action distinction", () => {
    expect(invoke(countryHandler, { iso2: "IR" }).payload.evidence.aml.listing.requiredAction).toBe("countermeasures");
    expect(invoke(countryHandler, { iso2: "MM" }).payload.evidence.aml.listing.requiredAction).toBe("enhanced-due-diligence");
  });

  it("reports sanctions as unpromoted and not ready for default", () => {
    const response = invoke(sourcesHandler);
    expect(response.code).toBe(200);
    expect(response.payload.readyForDefault).toBe(false);
    expect(response.payload.sanctionsReview).toMatchObject({
      scoringReady: false,
      pending: 117,
      approvedSnapshot: { coverageComplete: false, approvedCount: 0 },
    });
  });
});
