import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../server/db.js";

/**
 * Public, date-only feed: the latest successful (non-quarantined) scheduled collection per
 * regulator, from scraper_runs. Used by regulator pages to say "Last verified <date>".
 * Exposes no run URLs, errors or counts.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const sql = getSqlClient();
    const rows = (await sql`
      SELECT upper(regulator) AS regulator, MAX(COALESCE(finished_at, started_at)) AS last_success_at
      FROM scraper_runs
      WHERE status = 'success' AND quality_status <> 'quarantined'
      GROUP BY upper(regulator)
    `) as Array<{ regulator: string; last_success_at: string | Date | null }>;
    const data: Record<string, string> = {};
    for (const row of rows) {
      if (row.last_success_at) data[row.regulator] = new Date(row.last_success_at).toISOString();
    }
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("regulator-source-status failed:", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ success: false, error: "Source status unavailable" });
  }
}
