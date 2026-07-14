import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import {
  ensureBoardPackLeadTable,
  markBoardPackNotificationFailed,
  notifyBoardPackLead,
} from "../../server/services/boardPackLeads.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.BOARD_PACK_RETRY_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return res.status(401).json({ error: "Unauthorised" });
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  await ensureBoardPackLeadTable();
  const sql = getSqlClient();
  const pending = await sql(
    `SELECT id FROM board_pack_leads
     WHERE notification_status = 'pending' AND notification_attempts < 5
     ORDER BY created_at ASC LIMIT 25`,
  );
  let sent = 0;
  let failed = 0;
  for (const row of pending) {
    const leadId = String(row.id);
    try {
      await notifyBoardPackLead(leadId);
      sent += 1;
    } catch (error) {
      failed += 1;
      await markBoardPackNotificationFailed(leadId, error);
    }
  }
  return res.status(200).json({ processed: pending.length, sent, failed });
}
