import { createHash, createHmac } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient, type SqlClient } from "../db.js";

export const DEFAULT_API_MINUTE_LIMIT = 60;
export const DEFAULT_API_DAILY_LIMIT = 10_000;

/**
 * Headroom for a whole network, not for one reader.
 *
 * These count per pseudonymised network, so everyone behind one address shares
 * them: an office, a university or a mobile carrier is a single bucket. The
 * first attempt at this used 30 a minute, which is generous for one person and
 * hopeless for a shared address, and it failed 28 of the production gates from
 * a single CI runner within minutes of going live. Anything that can break a
 * monitoring run from one IP will break a customer behind NAT.
 *
 * The burst limit is the control that matters: it stops sustained automated
 * hammering. The daily figure is deliberately high, because exhausting it locks
 * out an entire network for the rest of the day, which is a far worse failure
 * than the metering gap it would be closing.
 *
 * Note these are not comparable to the registered limits. Those are per key,
 * for one integration; these are per network, for everyone sharing an address.
 */
export const ANONYMOUS_MINUTE_LIMIT = 240;
export const ANONYMOUS_DAILY_LIMIT = 20_000;

export interface DeveloperApiAccess {
  mode: "first-party" | "anonymous" | "registered";
  apiKeyId?: number;
  clientId?: number;
  minuteRemaining?: number;
  dailyRemaining?: number;
}

interface AccessOptions {
  sql?: SqlClient;
  now?: Date;
}

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function hashDeveloperApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function readDeveloperApiKey(req: VercelRequest): string | null {
  const headers = req.headers ?? {};
  const direct = firstHeader(headers["x-api-key"]).trim();
  if (direct) return direct;
  const authorization = firstHeader(headers.authorization).trim();
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || null;
}

/**
 * Whether the request carries the shape a same-origin browser call has.
 *
 * Deliberately not named "isFirstParty": every header here is set by the
 * caller, so this cannot authenticate anything. It is a cheap filter that keeps
 * unrelated traffic out of the anonymous lane, and the lane it admits to is
 * metered rather than trusted.
 */
export function looksLikeFirstPartyBrowserRequest(req: VercelRequest): boolean {
  const headers = req.headers ?? {};
  const host = firstHeader(headers["x-forwarded-host"] || headers.host)
    .split(":")[0]
    .toLowerCase();
  const fetchSite = firstHeader(headers["sec-fetch-site"]).toLowerCase();
  const allowedHost = host === "regactions.com"
    || host === "www.regactions.com"
    || host === "localhost"
    || host === "127.0.0.1"
    || host.endsWith(".vercel.app");
  return allowedHost && fetchSite === "same-origin";
}

export function developerApiNetworkFingerprint(req: VercelRequest): string | null {
  const forwarded = firstHeader((req.headers ?? {})["x-forwarded-for"]).split(",")[0]?.trim();
  const address = forwarded || req.socket?.remoteAddress || "";
  const salt = process.env.API_USAGE_HASH_SALT?.trim();
  return address && salt ? createHmac("sha256", salt).update(address).digest("hex") : null;
}

async function logUsage(
  sql: SqlClient,
  req: VercelRequest,
  route: string,
  outcome: "allowed" | "anonymous" | "rate_limited" | "invalid_key" | "expired_key" | "suspended_client",
  identifiers: { apiKeyId?: number; clientId?: number; keyPrefix?: string } = {},
) {
  await sql(
    `INSERT INTO developer_api_usage_events
      (api_key_id, client_id, key_prefix, request_path, request_method, outcome, network_fingerprint, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      identifiers.apiKeyId ?? null,
      identifiers.clientId ?? null,
      identifiers.keyPrefix ?? null,
      route,
      req.method ?? "GET",
      outcome,
      developerApiNetworkFingerprint(req),
      firstHeader((req.headers ?? {})["user-agent"]).slice(0, 500) || null,
    ],
  );
}

function registrationRequired(res: VercelResponse, code: string, message: string, status = 401) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("WWW-Authenticate", 'ApiKey realm="RegActions Developer API"');
  return res.status(status).json({
    error: code,
    message,
    registrationUrl: "https://regactions.com/developers#access",
  });
}

/**
 * The website's own lane: served without a key, but counted.
 *
 * Everything here is best-effort. The data behind these routes is public and
 * already rendered on the page, so the goal is metering and attribution, not
 * confidentiality, and no failure in the metering path may take the website
 * down with it. A missing salt, an unreachable counter or an unwritable audit
 * row all serve the request uncounted. Registered keys are the opposite: an
 * invalid or over-limit key is never waved through.
 */
async function authoriseAnonymousRequest(
  req: VercelRequest,
  res: VercelResponse,
  route: string,
  resolveSql: () => SqlClient,
  now: Date,
): Promise<DeveloperApiAccess | null> {
  const fingerprint = developerApiNetworkFingerprint(req);
  if (!fingerprint) {
    // Only reachable when API_USAGE_HASH_SALT is unset, which is a deployment
    // misconfiguration rather than a caller problem. Refusing here would fail
    // every page on the site, so it is logged and served.
    console.warn("developer-api: API_USAGE_HASH_SALT is not set; the website lane is unmetered");
    return { mode: "anonymous" };
  }

  let rows: Array<Record<string, unknown>>;
  let sql: SqlClient;
  try {
    sql = resolveSql();
    rows = await sql(
    `WITH increments AS (
       INSERT INTO developer_api_anonymous_buckets (network_fingerprint, window_kind, window_start, request_count)
       VALUES
         ($1, 'minute', date_trunc('minute', $2::timestamptz), 1),
         ($1, 'day', date_trunc('day', $2::timestamptz), 1)
       ON CONFLICT (network_fingerprint, window_kind, window_start)
       DO UPDATE SET request_count = developer_api_anonymous_buckets.request_count + 1
       RETURNING window_kind, request_count
     )
     SELECT
       MAX(CASE WHEN window_kind = 'minute' THEN request_count END) AS minute_count,
       MAX(CASE WHEN window_kind = 'day' THEN request_count END) AS day_count
     FROM increments`,
    [fingerprint, now.toISOString()],
    );
  } catch {
    // Metering is best-effort for this lane and the data behind it is public
    // and already on the page. Failing closed here would take the website down
    // with the metering store, so an unreachable counter serves the request
    // uncounted rather than refusing it. Registered keys still fail closed: an
    // invalid or over-limit key is never waved through on a database error.
    return { mode: "anonymous" };
  }
  const minuteCount = Number(rows[0]?.minute_count ?? 1);
  const dayCount = Number(rows[0]?.day_count ?? 1);
  const minuteRemaining = Math.max(0, ANONYMOUS_MINUTE_LIMIT - minuteCount);
  const dailyRemaining = Math.max(0, ANONYMOUS_DAILY_LIMIT - dayCount);
  const resetSeconds = Math.max(1, 60 - now.getUTCSeconds());
  res.setHeader("RateLimit-Limit", String(ANONYMOUS_MINUTE_LIMIT));
  res.setHeader("RateLimit-Remaining", String(minuteRemaining));
  res.setHeader("RateLimit-Reset", String(resetSeconds));
  res.setHeader("X-RateLimit-Daily-Limit", String(ANONYMOUS_DAILY_LIMIT));
  res.setHeader("X-RateLimit-Daily-Remaining", String(dailyRemaining));

  if (minuteCount > ANONYMOUS_MINUTE_LIMIT || dayCount > ANONYMOUS_DAILY_LIMIT) {
    await logUsage(sql, req, route, "rate_limited");
    res.setHeader("Retry-After", String(minuteCount > ANONYMOUS_MINUTE_LIMIT ? resetSeconds : 86_400));
    res.setHeader("Cache-Control", "no-store");
    res.status(429).json({
      error: "rate_limit_exceeded",
      message: "This request exceeded the unregistered browsing allowance. Register for an API key for programmatic access.",
      registrationUrl: "https://regactions.com/developers#access",
    });
    return null;
  }

  try {
    await logUsage(sql, req, route, "anonymous");
  } catch {
    // Same reasoning: an unwritable audit row must not fail a public page load.
  }
  return { mode: "anonymous", minuteRemaining, dailyRemaining };
}

export async function authoriseDeveloperApiRequest(
  req: VercelRequest,
  res: VercelResponse,
  route: string,
  options: AccessOptions = {},
): Promise<DeveloperApiAccess | null> {
  const now = options.now ?? new Date();
  // Resolved only once a database is actually needed: an unregistered request
  // with no key is refused without opening a connection.
  const resolveSql = () => options.sql ?? getSqlClient();
  const apiKeyPresent = readDeveloperApiKey(req);
  if (!apiKeyPresent && looksLikeFirstPartyBrowserRequest(req)) {
    return authoriseAnonymousRequest(req, res, route, resolveSql, now);
  }

  const apiKey = readDeveloperApiKey(req);
  if (!apiKey) {
    registrationRequired(res, "registration_required", "A registered RegActions API key is required.");
    return null;
  }

  const sql = resolveSql();
  const keyHash = hashDeveloperApiKey(apiKey);
  const keyPrefix = apiKey.slice(0, 16);
  const rows = await sql(
    `SELECT k.id AS api_key_id, k.client_id, k.status AS key_status,
            k.minute_limit, k.daily_limit, k.expires_at,
            c.status AS client_status
       FROM developer_api_keys k
       JOIN developer_api_clients c ON c.id = k.client_id
      WHERE k.key_hash = $1
      LIMIT 1`,
    [keyHash],
  );
  const row = rows[0];
  if (!row) {
    await logUsage(sql, req, route, "invalid_key", { keyPrefix });
    registrationRequired(res, "invalid_api_key", "The supplied RegActions API key is not valid.");
    return null;
  }

  const apiKeyId = Number(row.api_key_id);
  const clientId = Number(row.client_id);
  const identifiers = { apiKeyId, clientId, keyPrefix };
  if (row.client_status !== "active") {
    await logUsage(sql, req, route, "suspended_client", identifiers);
    registrationRequired(res, "client_suspended", "This RegActions API registration is not active.", 403);
    return null;
  }
  const expiresAt = row.expires_at ? new Date(String(row.expires_at)) : null;
  if (row.key_status !== "active" || (expiresAt && expiresAt <= now)) {
    await logUsage(sql, req, route, "expired_key", identifiers);
    registrationRequired(res, "api_key_expired", "This RegActions API key has expired or been revoked.", 403);
    return null;
  }

  const minuteLimit = Number(row.minute_limit) || DEFAULT_API_MINUTE_LIMIT;
  const dailyLimit = Number(row.daily_limit) || DEFAULT_API_DAILY_LIMIT;
  const bucketRows = await sql(
    `WITH increments AS (
       INSERT INTO developer_api_rate_buckets (api_key_id, window_kind, window_start, request_count)
       VALUES
         ($1, 'minute', date_trunc('minute', $2::timestamptz), 1),
         ($1, 'day', date_trunc('day', $2::timestamptz), 1)
       ON CONFLICT (api_key_id, window_kind, window_start)
       DO UPDATE SET request_count = developer_api_rate_buckets.request_count + 1
       RETURNING window_kind, request_count
     )
     SELECT
       MAX(CASE WHEN window_kind = 'minute' THEN request_count END) AS minute_count,
       MAX(CASE WHEN window_kind = 'day' THEN request_count END) AS day_count
     FROM increments`,
    [apiKeyId, now.toISOString()],
  );
  const minuteCount = Number(bucketRows[0]?.minute_count ?? 1);
  const dayCount = Number(bucketRows[0]?.day_count ?? 1);
  const minuteRemaining = Math.max(0, minuteLimit - minuteCount);
  const dailyRemaining = Math.max(0, dailyLimit - dayCount);
  const resetSeconds = Math.max(1, 60 - now.getUTCSeconds());
  res.setHeader("RateLimit-Limit", String(minuteLimit));
  res.setHeader("RateLimit-Remaining", String(minuteRemaining));
  res.setHeader("RateLimit-Reset", String(resetSeconds));
  res.setHeader("X-RateLimit-Daily-Limit", String(dailyLimit));
  res.setHeader("X-RateLimit-Daily-Remaining", String(dailyRemaining));

  if (minuteCount > minuteLimit || dayCount > dailyLimit) {
    await logUsage(sql, req, route, "rate_limited", identifiers);
    res.setHeader("Retry-After", String(minuteCount > minuteLimit ? resetSeconds : 86_400));
    res.setHeader("Cache-Control", "no-store");
    res.status(429).json({
      error: "rate_limit_exceeded",
      message: "The registered API key has exceeded its current request allowance.",
    });
    return null;
  }

  await sql("UPDATE developer_api_keys SET last_used_at = $2 WHERE id = $1", [apiKeyId, now.toISOString()]);
  await logUsage(sql, req, route, "allowed", identifiers);
  return { mode: "registered", apiKeyId, clientId, minuteRemaining, dailyRemaining };
}

export function setDeveloperApiCache(res: VercelResponse, access: DeveloperApiAccess) {
  // Never place a first-party response in a shared cache: a cached website
  // response must not become an unauthenticated external API response.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "X-API-Key, Authorization, Sec-Fetch-Site");
}
