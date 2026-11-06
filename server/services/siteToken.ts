import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";

/**
 * Short-lived signed token for the website's own data calls (/api/site/*).
 *
 * Replaces trusting `Sec-Fetch-Site`/Host, which any client can forge. The
 * HMAC key is derived with HKDF from an existing server-only secret, so no new
 * secret is needed. Fails closed (returns null / throws) when that secret is
 * missing. The token is bound to the "site" path family and expires quickly.
 */
export const SITE_TOKEN_COOKIE = "ra_site";
export const SITE_TOKEN_TTL_SECONDS = 20 * 60;
export const SITE_TOKEN_FAMILY = "site";
const CONTEXT = "regactions-site-token-v1";

function deriveKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return null;
  return Buffer.from(hkdfSync("sha256", secret, "", CONTEXT, 32));
}

function sign(key: Buffer, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function issueSiteToken(now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): string | null {
  const key = deriveKey(env);
  if (!key) return null;
  const expires = Math.floor(now.getTime() / 1000) + SITE_TOKEN_TTL_SECONDS;
  const payload = `v1.${SITE_TOKEN_FAMILY}.${expires}`;
  return `${payload}.${sign(key, payload)}`;
}

export function verifySiteToken(token: string | undefined | null, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): boolean {
  const key = deriveKey(env);
  if (!key || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== SITE_TOKEN_FAMILY) return false;
  const expires = Number(parts[2]);
  if (!Number.isInteger(expires) || expires * 1000 <= now.getTime()) return false;
  const expected = Buffer.from(sign(key, `${parts[0]}.${parts[1]}.${parts[2]}`));
  const given = Buffer.from(parts[3]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function readSiteTokenCookie(req: VercelRequest): string | null {
  const raw = req.headers?.cookie;
  const header = Array.isArray(raw) ? raw.join(";") : raw ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SITE_TOKEN_COOKIE) return rest.join("=") || null;
  }
  return null;
}

export function siteTokenCookie(token: string): string {
  return `${SITE_TOKEN_COOKIE}=${token}; Path=/api/site; Max-Age=${SITE_TOKEN_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

/** Fingerprint for the per-IP site limiter; keyed with the derived key, never stores the address. */
export function siteClientFingerprint(req: VercelRequest, env: NodeJS.ProcessEnv = process.env): string | null {
  const key = deriveKey(env);
  if (!key) return null;
  const fwd = req.headers?.["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd ?? "").split(",")[0]?.trim();
  const address = first || req.socket?.remoteAddress || "";
  return address ? createHmac("sha256", key).update(`ip:${address}`).digest("hex") : null;
}
