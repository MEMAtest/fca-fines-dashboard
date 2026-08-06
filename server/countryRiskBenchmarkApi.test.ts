import { describe, expect, it, vi } from "vitest";
import handler from "../api/country-risk/benchmark.js";

function responseDouble() {
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    payload: undefined as unknown,
    setHeader: vi.fn((name: string, value: string) => { response.headers[name] = value; }),
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((payload: unknown) => { response.payload = payload; return response; }),
    end: vi.fn(() => response),
  };
  return response;
}

describe("country-risk public benchmark API", () => {
  it("publishes the 30-country directional comparison and its limitations", () => {
    const response = responseDouble();
    handler({ method: "GET" } as never, response as never);
    const payload = response.payload as {
      limitations: string[];
      report: { sampleSize: number; regActionsCoverage: number; changedSinceObservation: unknown[] };
    };

    expect(response.statusCode).toBe(200);
    expect(payload.report.sampleSize).toBe(30);
    expect(payload.report.regActionsCoverage).toBeGreaterThanOrEqual(213);
    expect(payload.report.changedSinceObservation).toEqual([]);
    expect(payload.limitations.join(" ")).toContain("not public");
    expect(payload.limitations.join(" ")).toContain("jurisdiction-by-jurisdiction");
  });
});
