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
  it("returns exact country evidence and an applied floor for Iraq with sanctions promoted", () => {
    const response = invoke(countryHandler, { iso2: "IQ", methodology: "v2" });
    expect(response.code).toBe(200);
    // With the sanctions pillar now available, Iraq's headline completes and the
    // FATF-grey floor binds it to 6.
    expect(response.payload.result).toMatchObject({ score: 6, status: "complete", confidence: "high" });
    expect(response.payload.result.floors).toContainEqual({
      reason: "fatf-grey",
      minimum: 6,
      applied: true,
      status: "applied",
    });
    expect(response.payload.evidence.aml.assessment.effectiveness).toHaveProperty("IO1");
    expect(response.payload.evidence.aml.assessment.technicalCompliance).toHaveProperty("R1");
    expect(response.payload.evidence.governance.dimensions).toEqual(expect.objectContaining({ cc: expect.any(Number), rl: expect.any(Number) }));
    expect(response.payload.evidence.governance.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(response.payload.evidence.sanctions.coverageStatus).toBe("available");
    expect(response.payload.evidence.sanctions.pendingCandidates.length).toBe(0);
    expect(response.payload.evidence.sanctions.approvedPrograms.length).toBeGreaterThan(0);
    expect(response.payload.calculationContext.persistedScoreRunId).toBeNull();
  });

  it("does not treat the BVI's missing governance as low risk", () => {
    const response = invoke(countryHandler, { iso2: "VG", methodology: "2.0.0" });
    expect(response.code).toBe(200);
    // Governance is still missing, so the headline stays provisional; the FATF-grey
    // floor holds it at 6 (high) rather than letting a gap read as low risk.
    expect(response.payload.result).toMatchObject({ score: 6, band: "high", status: "provisional" });
    expect(response.payload.result.floors[0].status).toBe("applied");
    expect(response.payload.result.band).not.toBe("low");
    expect(response.payload.previous).toEqual({
      methodologyVersion: "1.0.0",
      score: null,
      band: null,
      status: "insufficient-data",
    });
  });

  it("exposes the FATF required-action distinction", () => {
    expect(invoke(countryHandler, { iso2: "IR" }).payload.evidence.aml.listing.requiredAction).toBe("countermeasures");
    expect(invoke(countryHandler, { iso2: "MM" }).payload.evidence.aml.listing.requiredAction).toBe("enhanced-due-diligence");
  });

  it("reports the sanctions classification as promoted and scoring-ready", () => {
    const response = invoke(sourcesHandler);
    expect(response.code).toBe(200);
    // readyForDefault stays false while some countries still lack governance/AML
    // evidence to complete a headline; that is independent of the sanctions gate.
    expect(response.payload.readyForDefault).toBe(false);
    expect(response.payload.sanctionsReview).toMatchObject({
      scoringReady: true,
      pending: 0,
      approvedSnapshot: { coverageComplete: true, approvedCount: 90, rejectedCount: 4 },
    });
  });
});
