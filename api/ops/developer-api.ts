import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isOpsRequestAuthorised } from "../../server/services/opsAuth.js";
import { loadDeveloperApiOperations } from "../../server/services/developerApiOperations.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!isOpsRequestAuthorised(req)) return res.status(401).json({ error: "Unauthorised" });
  try {
    const days = Number(Array.isArray(req.query?.days) ? req.query.days[0] : req.query?.days) || 7;
    return res.status(200).json(await loadDeveloperApiOperations(undefined, days));
  } catch (error) {
    console.error("Developer API operations failed", error instanceof Error ? error.message : error);
    return res.status(503).json({ error: "Developer API operations are unavailable" });
  }
}
