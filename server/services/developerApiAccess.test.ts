import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SqlClient } from "../db.js";
import { issueSiteToken, SITE_TOKEN_COOKIE, SITE_TOKEN_TTL_SECONDS } from "./siteToken.js";
import {
  allowWebsiteDataRequest,
  authoriseDeveloperApiRequest,
  hashDeveloperApiKey,
  retryAfterSeconds,
  readDeveloperApiKey,
} from "./developerApiAccess.js";

const VALID_KEY = "ra_live_" + "a".repeat(43);

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
  it("reads either supported key header and hashes without retaining the secret", () => {
    expect(readDeveloperApiKey(request({ "x-api-key": VALID_KEY }))).toBe(VALID_KEY);
    expect(readDeveloperApiKey(request({ authorization: "Bearer ra_live_bearer" }))).toBe("ra_live_bearer");
    expect(hashDeveloperApiKey(VALID_KEY)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDeveloperApiKey(VALID_KEY)).not.toContain(VALID_KEY);
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
      request({ host: "regactions.com", "x-api-key": VALID_KEY }),
      res,
      "/api/test",
      { sql, now: new Date("2026-09-09T10:00:12.000Z") },
    );
    expect(access).toMatchObject({ mode: "registered", apiKeyId: 7, clientId: 11, minuteRemaining: 57, dailyRemaining: 9979 });
    expect(headers.get("RateLimit-Remaining")).toBe("57");
    expect(headers.get("X-RateLimit-Daily-Remaining")).toBe("9979");
    expect(sql).toHaveBeenCalledWith(expect.stringContaining("developer_api_usage_events"), expect.any(Array));
    expect(sql).toHaveBeenCalledWith(expect.stringContaining("developer_api_operator_notifications"), expect.arrayContaining(["first_use", "7"]));
  });

  it("returns 429 after the registered minute allowance", async () => {
    const { res, state, headers } = response();
    const sql = sqlClient(61, 61);
    const access = await authoriseDeveloperApiRequest(
      request({ host: "regactions.com", "x-api-key": VALID_KEY }),
      res,
      "/api/test",
      { sql, now: new Date("2026-09-09T10:00:12.000Z") },
    );
    expect(access).toBeNull();
    expect(state.status).toBe(429);
    expect(state.body).toMatchObject({ error: "rate_limit_exceeded" });
    expect(headers.get("Retry-After")).toBe("48");
    expect(sql).toHaveBeenCalledWith(expect.stringContaining("developer_api_operator_notifications"), expect.arrayContaining(["rate_limited", "7:2026-09-09T10"]));
  });
});

describe("the website lane needs a signed token, never a forgeable header", () => {
  const SECRET = "test-cron-secret";
  const forged = (extra: Record<string, string> = {}) =>
    request({ host: "regactions.com", "sec-fetch-site": "same-origin", ...extra });
  const withSecret = async (fn: () => Promise<void>) => {
    const before = process.env.CRON_SECRET;
    process.env.CRON_SECRET = SECRET;
    try { await fn(); } finally { if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before; }
  };
  const website = (req: VercelRequest) => { allowWebsiteDataRequest(req); return req; };

  it("a forged Sec-Fetch-Site/Host with no token gets 401 and touches no database", async () => {
    await withSecret(async () => {
      const sql = sqlClient();
      const { res, state } = response();
      const access = await authoriseDeveloperApiRequest(website(forged()), res, "/api/site/x", { sql });
      expect(access).toBeNull();
      expect(state.status).toBe(401);
      expect((sql as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
    });
  });

  it("an expired or tampered token gets 401", async () => {
    await withSecret(async () => {
      const issued = issueSiteToken(new Date(Date.now() - 3 * SITE_TOKEN_TTL_SECONDS * 1000))!;
      const fresh = issueSiteToken()!;
      const tampered = fresh.slice(0, -2) + (fresh.endsWith("AA") ? "BB" : "AA");
      const wrongFamily = fresh.replace(".site.", ".admin.");
      for (const token of [issued, tampered, wrongFamily, "garbage"]) {
        const { res, state } = response();
        const access = await authoriseDeveloperApiRequest(
          website(forged({ cookie: `${SITE_TOKEN_COOKIE}=${token}` })), res, "/api/site/x", { sql: sqlClient() });
        expect(access).toBeNull();
        expect(state.status).toBe(401);
      }
    });
  });

  it("the real page flow (token cookie from /api/site/token) gets through", async () => {
    await withSecret(async () => {
      const sql = sqlClient();
      const { res, state } = response();
      const access = await authoriseDeveloperApiRequest(
        website(request({ cookie: `other=1; ${SITE_TOKEN_COOKIE}=${issueSiteToken()}` })), res, "/api/site/x", { sql });
      expect(access).toMatchObject({ mode: "public-site" });
      expect(state.status).toBeUndefined();
    });
  });

  it("fails closed when the server secret is missing", async () => {
    const before = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect(issueSiteToken()).toBeNull();
      const { res, state } = response();
      const access = await authoriseDeveloperApiRequest(
        website(forged({ cookie: `${SITE_TOKEN_COOKIE}=v1.site.9999999999.x` })), res, "/api/site/x", { sql: sqlClient() });
      expect(access).toBeNull();
      expect(state.status).toBe(401);
    } finally { if (before !== undefined) process.env.CRON_SECRET = before; }
  });

  it("a forged header does not unlock a registered (non-site) endpoint", async () => {
    const { res, state } = response();
    expect(await authoriseDeveloperApiRequest(forged(), res, "/api/test", { sql: sqlClient() })).toBeNull();
    expect(state.body).toMatchObject({ error: "registration_required" });
  });

  it("still prefers a supplied key over the website lane", async () => {
    const { res } = response();
    const req = website(request({ host: "regactions.com", "x-api-key": VALID_KEY }));
    const access = await authoriseDeveloperApiRequest(req, res, "/api/test", { sql: sqlClient(2, 9) });
    expect(access).toMatchObject({ mode: "registered", apiKeyId: 7 });
  });
});

describe("malformed keys are rejected before the database", () => {
  it.each([
    ["wrong prefix", "sk-" + "a".repeat(43)],
    ["too short", "ra_live_abc"],
    ["too long", "ra_live_" + "a".repeat(44)],
    ["bad characters", "ra_live_" + "a".repeat(42) + "!"],
    ["20 KB", "ra_live_" + "a".repeat(20_000)],
  ])("%s gets 401 with no query, hash or usage row", async (_n, key) => {
    const sql = sqlClient();
    const { res, state } = response();
    const access = await authoriseDeveloperApiRequest(request({ "x-api-key": key }), res, "/api/x", { sql });
    expect(access).toBeNull();
    expect(state.status).toBe(401);
    expect(state.body).toMatchObject({ error: "invalid_api_key" });
    expect((sql as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });
});

describe("Retry-After", () => {
  it("daily limit waits until the next UTC midnight", () => {
    expect(retryAfterSeconds(new Date("2026-11-06T23:00:00Z"), false, true)).toBe(3600);
  });
  it("minute limit waits for the minute to roll", () => {
    expect(retryAfterSeconds(new Date("2026-11-06T10:00:20Z"), true, false)).toBe(40);
  });
  it("both limits send the larger wait", () => {
    expect(retryAfterSeconds(new Date("2026-11-06T23:59:30Z"), true, true)).toBe(30);
    expect(retryAfterSeconds(new Date("2026-11-06T12:00:30Z"), true, true)).toBe(43_170);
  });
});

describe("developer API headers and provenance", () => {
  it("reads X-RegActions-Key ahead of the legacy header", () => {
    expect(readDeveloperApiKey(request({ "x-regactions-key": "ra_live_new", "x-api-key": "old" }))).toBe("ra_live_new");
  });
  it("adds attribution to JSON bodies and headers on an allowed key", async () => {
    const { res, headers, state } = response();
    const access = await authoriseDeveloperApiRequest(request({ "x-regactions-key": VALID_KEY }), res, "/api/x", { sql: sqlClient() });
    expect(access?.mode).toBe("registered");
    res.status(200).json({ ok: true });
    expect(headers.get("X-RegActions-Attribution")).toMatch(/RegActions/);
    expect((state.body as { attribution: { licence: string } }).attribution.licence).toBe("CC BY-NC 4.0");
  });
  it("returns 429 with Retry-After once the daily quota is exceeded", async () => {
    const { res, headers, state } = response();
    const access = await authoriseDeveloperApiRequest(request({ authorization: `Bearer ${VALID_KEY}` }), res, "/api/x", { sql: sqlClient(1, 10_001) });
    expect(access).toBeNull();
    expect(state.status).toBe(429);
    expect(Number(headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(headers.get("Retry-After"))).toBeLessThanOrEqual(86_400);
  });
});
