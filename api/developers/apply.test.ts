import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));

vi.mock("../../server/db.js", () => ({
  getSqlClient: () => sql,
}));

import handler from "./apply.js";

function response() {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader(name: string, value: string) { state.headers[name] = value; return res; },
    status(code: number) { state.status = code; return res; },
    json(body: unknown) { state.body = body; return res; },
  } as unknown as VercelResponse;
  return { res, state };
}

function request(body: Record<string, unknown>, method = "POST") {
  return {
    method,
    body,
    headers: { "x-forwarded-for": "192.0.2.20" },
    socket: { remoteAddress: "192.0.2.20" },
  } as unknown as VercelRequest;
}

const validApplication = {
  organisationName: "Example Compliance Ltd",
  contactName: "Alex Example",
  contactEmail: "alex@example.test",
  intendedUse: "Internal client-risk assessments with retained source citations.",
  expectedDailyRequests: 100,
  requestedTermMonths: 6,
  termsAccepted: true,
  website: "",
};

describe("developer API applications", () => {
  beforeEach(() => {
    sql.mockReset();
    delete process.env.API_USAGE_HASH_SALT;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  it("accepts a valid six-month application without issuing a key", async () => {
    sql.mockResolvedValueOnce([{ id: 42 }]);
    const { res, state } = response();
    await handler(request(validApplication), res);
    expect(state.status).toBe(201);
    expect(state.body).toMatchObject({
      success: true,
      applicationId: 42,
      status: "pending",
      message: expect.stringContaining("No API key has been issued"),
    });
    expect(sql).toHaveBeenCalledWith(expect.stringContaining("developer_api_applications"), expect.arrayContaining([6]));
  });

  it("rejects incomplete, unaccepted or bot-filled applications before database access", async () => {
    const { res, state } = response();
    await handler(request({ ...validApplication, termsAccepted: false, website: "bot.example" }), res);
    expect(state.status).toBe(400);
    expect(state.body).toMatchObject({ error: "invalid_application" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("limits repeated applications when a network fingerprint is available", async () => {
    process.env.API_USAGE_HASH_SALT = "test-only-salt";
    sql.mockResolvedValueOnce([{ count: 5 }]);
    const { res, state } = response();
    await handler(request(validApplication), res);
    expect(state.status).toBe(429);
    expect(state.headers["Retry-After"]).toBe("86400");
    expect(state.body).toMatchObject({ error: "application_limit_exceeded" });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("allows POST only", async () => {
    const { res, state } = response();
    await handler(request({}, "GET"), res);
    expect(state.status).toBe(405);
    expect(state.headers.Allow).toBe("POST");
    expect(sql).not.toHaveBeenCalled();
  });
});
