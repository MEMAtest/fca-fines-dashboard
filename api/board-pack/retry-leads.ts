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
  // A process can die after claiming a row but before recording the result.
  // Reclaim stale work; the Resend idempotency key prevents a duplicate email.
  await sql(
    `UPDATE board_pack_leads
     SET notification_status = 'pending', notification_next_attempt_at = now(), updated_at = now()
     WHERE notification_status = 'processing'
       AND notification_last_attempt_at < now() - interval '15 minutes'`,
  );
  const pending = await sql(
    `SELECT id FROM board_pack_leads
     WHERE notification_status = 'pending'
       AND notification_attempts < 5
       AND COALESCE(notification_next_attempt_at, now()) <= now()
     ORDER BY notification_next_attempt_at ASC NULLS FIRST, created_at ASC
     LIMIT 25`,
  );
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of pending) {
    const leadId = String(row.id);
    try {
      const result = await notifyBoardPackLead(leadId);
      if (result.status === "sent" || result.status === "already_sent") sent += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      await markBoardPackNotificationFailed(leadId, error);
    }
  }
  return res.status(200).json({ processed: pending.length, sent, failed, skipped });
}
