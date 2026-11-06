import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient, type SqlClient } from "../db.js";
import { siteClientFingerprint } from "./siteToken.js";

export const SITE_REQUESTS_PER_MINUTE = 120;

/**
 * Per-client limiter for /api/site/*. Fails open on a database error (a limiter
 * outage must not take the public site down) but never when over the limit.
 */
export async function siteRateAllowed(req: VercelRequest, res: VercelResponse, now: Date, sql?: SqlClient): Promise<boolean> {
  const fingerprint = siteClientFingerprint(req);
  if (!fingerprint) return true;
  try {
    const db = sql ?? getSqlClient();
    const rows = await db(
      `INSERT INTO site_api_rate_buckets (fingerprint, window_start, request_count)
       VALUES ($1, date_trunc('minute', $2::timestamptz), 1)
       ON CONFLICT (fingerprint, window_start) DO UPDATE SET request_count = site_api_rate_buckets.request_count + 1
       RETURNING request_count`,
      [fingerprint, now.toISOString()],
    );
    if (Math.random() < 0.01) {
      await db("DELETE FROM site_api_rate_buckets WHERE window_start < NOW() - INTERVAL '1 day'");
    }
    if (Number(rows[0]?.request_count ?? 0) > SITE_REQUESTS_PER_MINUTE) {
      res.setHeader("Retry-After", String(Math.max(1, 60 - now.getUTCSeconds())));
      res.setHeader("Cache-Control", "no-store");
      res.status(429).json({ error: "rate_limit_exceeded", message: "Too many requests from this client. Please slow down or register for API access." });
      return false;
    }
  } catch (error) {
    console.warn("Site rate limiter unavailable", error instanceof Error ? error.message : error);
  }
  return true;
}
