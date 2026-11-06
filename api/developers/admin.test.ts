import { afterEach, describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "./admin.js";

function run(headers: Record<string, string> = {}) {
  const out: { status?: number; body?: unknown } = {};
  const res = { setHeader() { return res; }, status(s: number) { out.status = s; return res; }, json(b: unknown) { out.body = b; return res; } } as unknown as VercelResponse;
  return handler({ method: "GET", headers, query: {} } as unknown as VercelRequest, res).then(() => out);
}

describe("developer admin route", () => {
  afterEach(() => { delete process.env.ADMIN_API_KEY; });
  it("fails closed with 503 while ADMIN_API_KEY is unset, even with a bearer", async () => {
    expect((await run({ authorization: "Bearer anything" })).status).toBe(503);
  });
  it("rejects a wrong or missing bearer with 401 once configured", async () => {
    process.env.ADMIN_API_KEY = "secret-admin";
    expect((await run()).status).toBe(401);
    expect((await run({ authorization: "Bearer nope" })).status).toBe(401);
  });
});
