import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const mocks = vi.hoisted(() => ({ authorised: vi.fn(), load: vi.fn() }));
vi.mock("../../server/services/opsAuth.js", () => ({ isOpsRequestAuthorised: mocks.authorised }));
vi.mock("../../server/services/developerApiOperations.js", () => ({ loadDeveloperApiOperations: mocks.load }));
import handler from "./developer-api.js";

function response() {
  const state: { status?: number; body?: unknown } = {};
  const headers = new Map<string, string>();
  const res = {
    setHeader(name: string, value: string) { headers.set(name, value); return res; },
    status(value: number) { state.status = value; return res; },
    json(value: unknown) { state.body = value; return res; },
  } as unknown as VercelResponse;
  return { res, state, headers };
}

describe("protected developer API operations endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not disclose records without an operations session", async () => {
    mocks.authorised.mockReturnValue(false);
    const { res, state, headers } = response();
    await handler({ method: "GET", query: {} } as VercelRequest, res);
    expect(state.status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns the bounded protected view to an authorised operator", async () => {
    mocks.authorised.mockReturnValue(true);
    mocks.load.mockResolvedValue({ days: 7, metrics: { accepted_requests: 3 } });
    const { res, state } = response();
    await handler({ method: "GET", query: { days: "7" } } as unknown as VercelRequest, res);
    expect(state.status).toBe(200);
    expect(state.body).toMatchObject({ days: 7 });
    expect(mocks.load).toHaveBeenCalledWith(undefined, 7);
  });
});
