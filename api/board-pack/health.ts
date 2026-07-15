import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import { ensureBoardPackLeadTable } from "../../server/services/boardPackLeads.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const expected = process.env.BOARD_PACK_RETRY_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return res.status(401).json({ error: "Unauthorised" });

  try {
    await ensureBoardPackLeadTable();
    const sql = getSqlClient();
    const [status] = await sql(`
      SELECT
        COUNT(*) FILTER (WHERE notification_status = 'pending')::int AS pending,
        COUNT(*) FILTER (
          WHERE notification_status = 'pending'
            AND COALESCE(notification_next_attempt_at, now()) <= now()
        )::int AS due,
        COUNT(*) FILTER (WHERE notification_status = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE notification_status = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE notification_status = 'sent'
            AND notified_at >= now() - interval '24 hours'
        )::int AS sent_last_24_hours,
        MIN(created_at) FILTER (WHERE notification_status = 'pending') AS oldest_pending_at
      FROM board_pack_leads
    `);

    return res.status(200).json({
      healthy: Number(status?.failed ?? 0) === 0 && Number(status?.processing ?? 0) < 5,
      delivery: status,
      configuration: {
        database: true,
        resend: Boolean(process.env.RESEND_API_KEY?.trim()),
        recipient: Boolean(process.env.BOARD_PACK_LEAD_TO?.trim() || "contact@memaconsultants.com"),
        sender: Boolean(process.env.BOARD_PACK_LEAD_FROM?.trim() || "RegActions <alerts@memaconsultants.com>"),
      },
    });
  } catch (error) {
    console.error("Board Pack health check failed:", error instanceof Error ? error.message : error);
    return res.status(503).json({ healthy: false, error: "Board Pack delivery health check failed" });
  }
}
