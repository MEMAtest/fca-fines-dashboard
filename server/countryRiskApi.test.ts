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
  it("returns complete country evidence and non-binding floor explanations for Iraq", () => {
    const response = invoke(countryHandler, { iso2: "IQ", methodology: "v2" });
    expect(response.code).toBe(200);
    expect(response.payload.result).toMatchObject({ score: 6, status: "complete", confidence: "high" });
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
    expect(response.payload.evidence.sanctions.coverageStatus).toBe("available");
    expect(response.payload.evidence.sanctions.pendingCandidates).toEqual([]);
    expect(response.payload.calculationContext.persistedScoreRunId).toBeNull();
  });

  it("publishes the BVI provisionally and applies the FATF floor instead of treating missing governance as low risk", () => {
    const response = invoke(countryHandler, { iso2: "VG", methodology: "2.0.0" });
    expect(response.code).toBe(200);
    expect(response.payload.result).toMatchObject({ score: 6, band: "high", status: "provisional" });
    expect(response.payload.result.floors[0].status).toBe("applied");
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

  it("reports the complete promoted sanctions snapshot and default readiness", () => {
    const response = invoke(sourcesHandler);
    expect(response.code).toBe(200);
    expect(response.payload.readyForDefault).toBe(true);
    expect(response.payload.sanctionsReview).toMatchObject({
      scoringReady: true,
      pending: 0,
      expectedCoverageCells: 856,
      approvedSnapshot: { coverageComplete: true, approvedCount: 107, rejectedCount: 10 },
    });
  });
});
