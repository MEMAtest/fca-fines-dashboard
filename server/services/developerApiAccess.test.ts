import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SqlClient } from "../db.js";
import {
  allowWebsiteDataRequest,
  authoriseDeveloperApiRequest,
  hashDeveloperApiKey,
  looksLikeFirstPartyBrowserRequest,
  readDeveloperApiKey,
} from "./developerApiAccess.js";

function request(headers: Record<string, string> = {}): VercelRequest {
  return { method: "GET", headers, socket: { remoteAddress: "192.0.2.10" } } as unknown as VercelRequest;
}

function response() {
  const headers = new Map<string, string>();
  const state: { status?: number; body?: unknown } = {};
  const res = {
    setHeader(name: string, value: string) { headers.set(name, value); return res; },
    status(status: number) { state.status = status; return res; },
    json(body: unknown) { state.body = body; return res; },
  } as unknown as VercelResponse;
  return { res, headers, state };
}

function sqlClient(minuteCount = 1, dayCount = 1): SqlClient {
  const sql = vi.fn(async (query: string) => {
    if (query.includes("FROM developer_api_keys")) {
      return [{
        api_key_id: 7,
        client_id: 11,
        key_status: "active",
        client_status: "active",
        minute_limit: 60,
        daily_limit: 10_000,
        expires_at: "2027-03-09T00:00:00.000Z",
      }];
    }
    if (query.includes("WITH increments")) return [{ minute_count: minuteCount, day_count: dayCount }];
    return [];
  }) as unknown as SqlClient;
  sql.end = vi.fn(async () => undefined);
  return sql;
}

describe("developer API access", () => {
  it("recognises the shape of a same-origin browser call, and claims nothing more", () => {
    expect(looksLikeFirstPartyBrowserRequest(request({ host: "regactions.com", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(looksLikeFirstPartyBrowserRequest(request({ host: "regactions.com", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(looksLikeFirstPartyBrowserRequest(request({ host: "example.com", "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("reads either supported key header and hashes without retaining the secret", () => {
    expect(readDeveloperApiKey(request({ "x-api-key": "ra_live_example" }))).toBe("ra_live_example");
    expect(readDeveloperApiKey(request({ authorization: "Bearer ra_live_bearer" }))).toBe("ra_live_bearer");
    expect(hashDeveloperApiKey("ra_live_example")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDeveloperApiKey("ra_live_example")).not.toContain("ra_live_example");
  });

  it("rejects an unregistered external request", async () => {
    const { res, state } = response();
    const access = await authoriseDeveloperApiRequest(request({ host: "regactions.com" }), res, "/api/test");
    expect(access).toBeNull();
    expect(state.status).toBe(401);
    expect(state.body).toMatchObject({ error: "registration_required" });
  });

  it("meters a registered request and exposes remaining limits", async () => {
    const sql = sqlClient(3, 21);
    const { res, headers } = response();
    const access = await authoriseDeveloperApiRequest(
      request({ host: "regactions.com", "x-api-key": "ra_live_example" }),
      res,
      "/api/test",
      { sql, now: new Date("2026-09-09T10:00:12.000Z") },
    );
    expect(access).toMatchObject({ mode: "registered", apiKeyId: 7, clientId: 11, minuteRemaining: 57, dailyRemaining: 9979 });
    expect(headers.get("RateLimit-Remaining")).toBe("57");
    expect(headers.get("X-RateLimit-Daily-Remaining")).toBe("9979");
    expect(sql).toHaveBeenCalledWith(expect.stringContaining("developer_api_usage_events"), expect.any(Array));
  });

  it("returns 429 after the registered minute allowance", async () => {
    const { res, state, headers } = response();
    const access = await authoriseDeveloperApiRequest(
      request({ host: "regactions.com", "x-api-key": "ra_live_example" }),
      res,
      "/api/test",
      { sql: sqlClient(61, 61), now: new Date("2026-09-09T10:00:12.000Z") },
    );
    expect(access).toBeNull();
    expect(state.status).toBe(429);
    expect(state.body).toMatchObject({ error: "rate_limit_exceeded" });
    expect(headers.get("Retry-After")).toBe("48");
  });
});

describe("the website lane is explicit and separate from the registered API", () => {
  const browserish = () => request({ host: "regactions.com", "sec-fetch-site": "same-origin" });

  it("does not let forged browser headers unlock a registered endpoint", async () => {
    const sql = sqlClient();
    const { res, state } = response();
    const access = await authoriseDeveloperApiRequest(browserish(), res, "/api/test", { sql });
    expect(access).toBeNull();
    expect(state.status).toBe(401);
    expect(state.body).toMatchObject({ error: "registration_required" });
    expect((sql as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  it("serves an explicitly marked website route without querying anything", async () => {
    // Metering this path exhausted the connection pool under ordinary parallel
    // load: /fines alone fans out six paged searches, and eight concurrent page
    // loads produced eleven 500s. The site's own calls must not depend on the
    // metering store being reachable, or on it having a spare connection.
    const sql = sqlClient();
    const { res, state } = response();
    const req = browserish();
    allowWebsiteDataRequest(req);
    const access = await authoriseDeveloperApiRequest(req, res, "/api/test", { sql });
    expect(access).toMatchObject({ mode: "public-site" });
    expect(state.status).toBeUndefined();
    expect((sql as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  it("still prefers a supplied key over the website lane", async () => {
    const { res } = response();
    const req = request({ host: "regactions.com", "sec-fetch-site": "same-origin", "x-api-key": "ra_live_example" });
    allowWebsiteDataRequest(req);
    const access = await authoriseDeveloperApiRequest(
      req, res, "/api/test", { sql: sqlClient(2, 9) },
    );
    expect(access).toMatchObject({ mode: "registered", apiKeyId: 7 });
  });

  it("still refuses a request that does not look like the website", async () => {
    const { res, state } = response();
    const req = request({ host: "regactions.com", "sec-fetch-site": "cross-site" });
    allowWebsiteDataRequest(req);
    const access = await authoriseDeveloperApiRequest(req, res, "/api/test", { sql: sqlClient() });
    expect(access).toBeNull();
    expect(state.status).toBe(401);
  });
});
