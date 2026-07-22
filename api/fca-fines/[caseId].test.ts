import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  getFcaFineCaseById: vi.fn(),
}));

vi.mock("../../server/services/fcaFineCases.js", () => ({
  getFcaFineCaseById: serviceMocks.getFcaFineCaseById,
  isValidFcaFineCaseId: (value: unknown) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
}));

import handler, { parseFcaFineCaseId } from "./[caseId].js";

const caseId = "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0";

function mockRequest(method: string, query: Record<string, unknown> = {}): VercelRequest {
  return { method, query } as unknown as VercelRequest;
}

function mockResponse() {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.end.mockReturnValue(response);
  return response as unknown as VercelResponse & {
    setHeader: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

describe("FCA fine case endpoint", () => {
  beforeEach(() => {
    serviceMocks.getFcaFineCaseById.mockReset();
  });

  it("normalises valid case IDs and rejects malformed input", () => {
    expect(parseFcaFineCaseId(caseId.toUpperCase())).toBe(caseId);
    expect(parseFcaFineCaseId("../bad")).toBeNull();
    expect(parseFcaFineCaseId([caseId])).toBeNull();
  });

  it("answers preflight requests without querying the service", async () => {
    const res = mockResponse();
    await handler(mockRequest("OPTIONS"), res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(serviceMocks.getFcaFineCaseById).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods and malformed IDs", async () => {
    const methodRes = mockResponse();
    await handler(mockRequest("POST", { caseId }), methodRes);
    expect(methodRes.status).toHaveBeenCalledWith(405);

    const idRes = mockResponse();
    await handler(mockRequest("GET", { caseId: "bad" }), idRes);
    expect(idRes.status).toHaveBeenCalledWith(400);
    expect(serviceMocks.getFcaFineCaseById).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown trusted FCA monetary case", async () => {
    serviceMocks.getFcaFineCaseById.mockResolvedValue(null);
    const res = mockResponse();
    await handler(mockRequest("GET", { caseId }), res);

    expect(serviceMocks.getFcaFineCaseById).toHaveBeenCalledWith(caseId);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "FCA fine case not found",
    });
  });

  it("returns a public case record with cache headers", async () => {
    const record = { caseId, canonicalPath: `/fca-fines/2026/example/${caseId}` };
    serviceMocks.getFcaFineCaseById.mockResolvedValue(record);
    const res = mockResponse();
    await handler(mockRequest("GET", { caseId: caseId.toUpperCase() }), res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: record });
  });

  it("does not expose internal failures", async () => {
    serviceMocks.getFcaFineCaseById.mockRejectedValue(new Error("database secret"));
    const res = mockResponse();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handler(mockRequest("GET", { caseId }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Failed to fetch FCA fine case",
    });
    errorSpy.mockRestore();
  });
});
