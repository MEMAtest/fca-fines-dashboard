import type { VercelRequest, VercelResponse } from "@vercel/node";
import { issueSiteToken, siteTokenCookie, SITE_TOKEN_TTL_SECONDS } from "../../server/services/siteToken.js";
import { siteRateAllowed } from "../../server/services/siteRateLimit.js";

/** Issues the short-lived website data token as an HttpOnly cookie. Rate limited per client. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const token = issueSiteToken();
  if (!token) return res.status(503).json({ error: "site_token_unavailable" });
  if (!(await siteRateAllowed(req, res, new Date()))) return;
  res.setHeader("Set-Cookie", siteTokenCookie(token));
  return res.status(200).json({ ok: true, expiresIn: SITE_TOKEN_TTL_SECONDS });
}
