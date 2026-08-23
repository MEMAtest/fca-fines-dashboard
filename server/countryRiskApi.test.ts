import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import countryHandler from "../api/country-risk/[iso2].js";
import listHandler from "../api/country-risk/list.js";
import sourcesHandler from "../api/country-risk/sources/status.js";

vi.mock("./db.js", () => ({
  getSqlClient: () => {
    throw new Error("test database unavailable");
  },
}));

async function invoke(handler: (req: VercelRequest, res: VercelResponse) => unknown, query: Record<string, string> = {}) {
  let code = 200;
  let payload: unknown;
  const req = { method: "GET", query } as unknown as VercelRequest;
  const res = {
    setHeader: () => undefined,
    status(value: number) { code = value; return this; },
    json(value: unknown) { payload = value; return this; },
  } as unknown as VercelResponse;
  await handler(req, res);
  return { code, payload: payload as any };
}

describe("country-risk public API contract", () => {
  it("returns complete country evidence and non-binding floor explanations for Iraq", async () => {
    const response = await invoke(countryHandler, { iso2: "IQ", methodology: "v2" });
    expect(response.code).toBe(200);
    expect(response.payload.result).toMatchObject({ score: 6, status: "complete" });
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
    expect(response.payload.sources).toContainEqual(expect.objectContaining({ id: "fatf-lists", scored: true }));
    expect(response.payload.sources).toContainEqual(expect.objectContaining({ id: "sanctions-regimes", scored: true }));
  });

  it("publishes the BVI provisionally and applies the FATF floor instead of treating missing governance as low risk", async () => {
    const response = await invoke(countryHandler, { iso2: "VG", methodology: "2.0.0" });
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

  it("defaults to the active v3 methodology", async () => {
    const response = await invoke(countryHandler, { iso2: "GB" });
    expect(response.code).toBe(200);
    expect(response.payload.methodologyVersion).toBe("3.1.0");
    expect(response.payload.result).toEqual(expect.objectContaining({
      status: expect.stringMatching(/complete|provisional|insufficient-data/),
      pillars: expect.objectContaining({
        effectiveness: expect.any(Object),
        safeguards: expect.any(Object),
        governance: expect.any(Object),
      }),
      beneficialOwnership: expect.any(Object),
      overlays: expect.any(Object),
    }));
    expect(response.payload.result).not.toHaveProperty("floors");
    expect(response.payload.sources).toContainEqual(expect.objectContaining({ id: "fatf-lists", scored: false }));
    expect(response.payload.sources).toContainEqual(expect.objectContaining({ id: "sanctions-regimes", scored: false }));
    expect(response.payload.sources).toContainEqual(expect.objectContaining({ id: "fatf-assessments", scored: true }));
    expect(response.payload.sources).toContainEqual(expect.objectContaining({ id: "world-bank-wgi", scored: true }));
  });

  it("exposes the FATF required-action distinction", async () => {
    const iran = (await invoke(countryHandler, { iso2: "IR", methodology: "v2" })).payload;
    const myanmar = (await invoke(countryHandler, { iso2: "MM", methodology: "v2" })).payload;
    expect(iran.evidence.aml.listing.requiredAction).toBe("countermeasures");
    expect(iran.surface.fatfAction.action).toBe("countermeasures");
    expect(myanmar.evidence.aml.listing.requiredAction).toBe("enhanced-due-diligence");
    expect(myanmar.surface.fatfAction.action).toBe("enhanced-due-diligence");
    expect(myanmar.surface.freshness.find((item: any) => item.id === "fatf-assessment"))
      .toMatchObject({ assessmentDate: expect.any(String), ratingsDate: expect.any(String) });
  });

  it("adds Russia suspension context without changing the compatibility-critical result", async () => {
    const response = await invoke(countryHandler, { iso2: "ru", methodology: "v2" });
    expect(response.code).toBe(200);
    expect(response.payload.result).toMatchObject({ score: 6, band: "high" });
    expect(response.payload.surface.contextualSignals).toContainEqual(expect.objectContaining({
      id: "fatf-membership",
      state: "suspended",
    }));
    expect(response.payload.surface.note).toContain("do not change");
  });

  it("reports the complete sanctions snapshot but fails closed when operational history is unavailable", async () => {
    const response = await invoke(sourcesHandler);
    expect(response.code).toBe(200);
    expect(response.payload.readyForDefault).toBe(false);
    expect(response.payload.sourceHealth).toMatchObject({
      status: "critical",
      readyForScoring: false,
    });
    expect(response.payload.sourceHealth.issues).toContainEqual(expect.objectContaining({
      code: "database-unavailable",
    }));
    expect(response.payload.sanctionsReview).toMatchObject({
      scoringReady: true,
      pending: 0,
      expectedCoverageCells: 856,
      approvedSnapshot: { coverageComplete: true, approvedCount: 107, rejectedCount: 10 },
    });
  });

  it("uses the same explicit snapshot and operational readiness semantics on list and source-status APIs", async () => {
    const [list, status] = await Promise.all([invoke(listHandler), invoke(sourcesHandler)]);
    expect(list.code).toBe(200);
    expect(list.payload.readyForDefault).toBe(list.payload.snapshotReady && list.payload.sourcesCurrent);
    expect(status.payload.readyForDefault).toBe(status.payload.snapshotReady && status.payload.sourcesCurrent);
    expect(list.payload.sourcesCurrent).toBe(status.payload.sourcesCurrent);
    expect(list.payload.sourcesCurrent).toBe(false);
    expect(status.payload.sourceHealth).toMatchObject({ readyForScoring: false });
    expect(list.payload.sources).toContainEqual(expect.objectContaining({ id: "fatf-lists", scored: false }));
    expect(list.payload.sources).toContainEqual(expect.objectContaining({ id: "sanctions-regimes", scored: false }));
    expect(status.payload.sources).toContainEqual(expect.objectContaining({ id: "fatf-lists", scored: false }));
    expect(status.payload.sources).toContainEqual(expect.objectContaining({ id: "sanctions-regimes", scored: false }));
    const historical = await invoke(listHandler, { methodology: "v2" });
    expect(historical.code).toBe(200);
    expect(historical.payload.sources).toContainEqual(expect.objectContaining({ id: "fatf-lists", scored: true }));
    expect(historical.payload.sources).toContainEqual(expect.objectContaining({ id: "sanctions-regimes", scored: true }));
  });
});
