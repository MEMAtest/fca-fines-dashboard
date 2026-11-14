import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../server/db.js";
import { classifyRunFailure, type RegulatorRunStatus } from "../src/data/sourceFreshness.js";

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
      WITH recent AS (
        SELECT upper(regulator) AS regulator, status, quality_status, started_at, finished_at, error_message,
               ROW_NUMBER() OVER (PARTITION BY upper(regulator) ORDER BY started_at DESC) AS rn
        FROM scraper_runs
        WHERE status IN ('success', 'error')
      )
      SELECT r.regulator,
             (SELECT MAX(COALESCE(s.finished_at, s.started_at)) FROM recent s
                WHERE s.regulator = r.regulator AND s.status = 'success' AND s.quality_status <> 'quarantined') AS last_success_at,
             r.status AS latest_status,
             r.error_message AS latest_error
      FROM recent r WHERE r.rn = 1
    `) as Array<{ regulator: string; last_success_at: string | Date | null; latest_status: string; latest_error: string | null }>;
    const data: Record<string, RegulatorRunStatus> = {};
    for (const row of rows) {
      data[row.regulator] = {
        lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
        latestStatus: row.latest_status,
        failureClass: row.latest_status === "success" ? null : classifyRunFailure(row.latest_error),
      };
    }
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("regulator-source-status failed:", error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ success: false, error: "Source status unavailable" });
  }
}
