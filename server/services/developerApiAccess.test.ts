import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SqlClient } from "../db.js";
import {
  ANONYMOUS_MINUTE_LIMIT,
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

describe("the website lane is metered, not exempt", () => {
  const browserish = () => request({ host: "regactions.com", "sec-fetch-site": "same-origin" });

  it("serves an unregistered same-origin request but counts it", async () => {
    process.env.API_USAGE_HASH_SALT = "test-salt";
    const sql = sqlClient(3, 40);
    const { res, headers } = response();
    const access = await authoriseDeveloperApiRequest(browserish(), res, "/api/test", { sql });
    expect(access).toMatchObject({ mode: "anonymous" });
    expect(headers.get("RateLimit-Limit")).toBe(String(ANONYMOUS_MINUTE_LIMIT));
    expect(headers.get("RateLimit-Remaining")).toBe(String(ANONYMOUS_MINUTE_LIMIT - 3));
    // The spoofable header used to buy an unlimited exemption. It now buys the
    // browsing allowance, and the request is recorded like any other.
    const queries = (sql as unknown as { mock: { calls: string[][] } }).mock.calls.map((call) => call[0]);
    expect(queries.some((q) => q.includes("developer_api_anonymous_buckets"))).toBe(true);
    expect(queries.some((q) => q.includes("developer_api_usage_events"))).toBe(true);
  });

  it("refuses the same-origin lane past its allowance", async () => {
    process.env.API_USAGE_HASH_SALT = "test-salt";
    const { res, state, headers } = response();
    const access = await authoriseDeveloperApiRequest(
      browserish(), res, "/api/test", { sql: sqlClient(ANONYMOUS_MINUTE_LIMIT + 1, 5) },
    );
    expect(access).toBeNull();
    expect(state.status).toBe(429);
    expect(state.body).toMatchObject({ error: "rate_limit_exceeded" });
    expect(headers.get("Retry-After")).toBeTruthy();
  });

  it("keeps serving, uncounted, when the metering store or its salt is missing", async () => {
    // A misconfigured or unreachable counter is a deployment problem. Refusing
    // here would fail every page on the site, which is worse than the metering
    // gap it would be protecting.
    delete process.env.API_USAGE_HASH_SALT;
    const { res, state } = response();
    const access = await authoriseDeveloperApiRequest(browserish(), res, "/api/test", { sql: sqlClient() });
    expect(access).toMatchObject({ mode: "anonymous" });
    expect(state.status).toBeUndefined();

    process.env.API_USAGE_HASH_SALT = "test-salt";
    const broken = (() => { throw new Error("counter unavailable"); }) as unknown as SqlClient;
    const second = response();
    const stillServed = await authoriseDeveloperApiRequest(browserish(), second.res, "/api/test", { sql: broken });
    expect(stillServed).toMatchObject({ mode: "anonymous" });
  });

  it("still prefers a supplied key over the anonymous lane", async () => {
    process.env.API_USAGE_HASH_SALT = "test-salt";
    const { res } = response();
    const access = await authoriseDeveloperApiRequest(
      request({ host: "regactions.com", "sec-fetch-site": "same-origin", "x-api-key": "ra_live_example" }),
      res, "/api/test", { sql: sqlClient(2, 9) },
    );
    expect(access).toMatchObject({ mode: "registered", apiKeyId: 7 });
  });
});
