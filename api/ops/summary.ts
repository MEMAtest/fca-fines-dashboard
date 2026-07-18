import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isOpsRequestAuthorised } from "../../server/services/opsAuth.js";
import { loadOpsSummary } from "../../server/services/opsSummary.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!isOpsRequestAuthorised(req)) return res.status(401).json({ error: "Unauthorised" });
  try {
    return res.status(200).json(await loadOpsSummary());
  } catch (error) {
    console.error("Operations summary failed", error instanceof Error ? error.message : error);
    return res.status(503).json({ error: "Operations summary is unavailable" });
  }
}
