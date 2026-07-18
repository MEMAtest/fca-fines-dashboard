import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";

export const OPS_SESSION_COOKIE = "regactions_ops_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createOpsSession(secret: string, now = new Date()) {
  const expiresAt = Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ expiresAt, scope: "ops-read" })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyOpsSession(token: string, secret: string, now = new Date()) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(sign(payload, secret), signature)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { expiresAt?: number; scope?: string };
    return parsed.scope === "ops-read" && Number(parsed.expiresAt) > Math.floor(now.getTime() / 1000);
  } catch {
    return false;
  }
}

export function verifyOpsSecret(candidate: unknown, secret: string) {
  return typeof candidate === "string" && candidate.length > 0 && safeEqual(candidate, secret);
}

function readCookie(header: string | undefined, name: string) {
  if (!header) return "";
  for (const segment of header.split(";")) {
    const [key, ...rest] = segment.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function isOpsRequestAuthorised(req: Pick<VercelRequest, "headers">) {
  const secret = process.env.OPS_DASHBOARD_SECRET?.trim() || "";
  if (!secret) return false;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim() || "";
  if (bearer && verifyOpsSecret(bearer, secret)) return true;
  const token = readCookie(req.headers.cookie, OPS_SESSION_COOKIE);
  return token ? verifyOpsSession(token, secret) : false;
}

export function buildOpsSessionCookie(token: string) {
  return `${OPS_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/api/ops; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearOpsSessionCookie() {
  return `${OPS_SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/ops; Max-Age=0`;
}
