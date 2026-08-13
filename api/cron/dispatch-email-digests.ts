import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import { dispatchEmailDigests, isDigestDispatchWindow } from "../../server/services/emailDigestDispatch.js";

export { isDigestDispatchWindow };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return res.status(401).json({ error: "Unauthorised" });

  const now = new Date();
  if (!isDigestDispatchWindow(now)) return res.status(202).json({ skipped: true, reason: "Outside 07:00 Europe/London dispatch window" });

  try {
    const result = await dispatchEmailDigests({ sql: getSqlClient(), now });
    return res.status(result.results.some((item) => !item.sent) ? 502 : 200).json(result);
  } catch (error) {
    console.error("Digest dispatch failed", error);
    return res.status(503).json({ error: error instanceof Error ? error.message : "Digest dispatch failed" });
  }
}
