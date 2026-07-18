import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildOpsSessionCookie,
  clearOpsSessionCookie,
  createOpsSession,
  verifyOpsSecret,
} from "../../server/services/opsAuth.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearOpsSessionCookie());
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.OPS_DASHBOARD_SECRET?.trim() || "";
  if (!secret) return res.status(503).json({ error: "Operations access is not configured" });
  const submitted = (req.body as { secret?: unknown } | undefined)?.secret;
  if (!verifyOpsSecret(submitted, secret)) return res.status(401).json({ error: "Access denied" });
  res.setHeader("Set-Cookie", buildOpsSessionCookie(createOpsSession(secret)));
  return res.status(204).end();
}
