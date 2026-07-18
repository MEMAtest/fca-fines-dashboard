import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import {
  ensureBoardPackLeadTable,
  markBoardPackNotificationFailed,
  notifyBoardPackLead,
} from "../../server/services/boardPackLeads.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBoardPackLeadId(value: unknown) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error("leadId must be a valid UUID");
  }
  return value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expected = process.env.BOARD_PACK_RETRY_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return res.status(401).json({ error: "Unauthorised" });
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let requestedLeadId: string | null;
  try {
    requestedLeadId = parseBoardPackLeadId(req.query.leadId);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid leadId" });
  }

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
       AND ($1::uuid IS NULL OR id = $1::uuid)
     ORDER BY notification_next_attempt_at ASC NULLS FIRST, created_at ASC
     LIMIT 25`,
    [requestedLeadId],
  );
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const results: Array<{ leadId: string; status: string; messageId: string | null }> = [];
  for (const row of pending) {
    const leadId = String(row.id);
    try {
      const result = await notifyBoardPackLead(leadId);
      if (result.status === "sent" || result.status === "already_sent") sent += 1;
      else skipped += 1;
      results.push({ leadId, status: result.status, messageId: result.messageId });
    } catch (error) {
      failed += 1;
      await markBoardPackNotificationFailed(leadId, error);
      results.push({ leadId, status: "failed", messageId: null });
    }
  }
  if (requestedLeadId && pending.length === 0) {
    const [existing] = await sql(
      `SELECT id::text, notification_status, notification_message_id
       FROM board_pack_leads WHERE id = $1::uuid LIMIT 1`,
      [requestedLeadId],
    );
    if (!existing) return res.status(404).json({ error: "Board Pack lead not found" });
    return res.status(409).json({
      error: "Board Pack lead is not due for delivery",
      leadId: requestedLeadId,
      status: existing.notification_status,
      messageId: existing.notification_message_id ?? null,
    });
  }
  return res.status(failed ? 207 : 200).json({ processed: pending.length, sent, failed, skipped, results });
}
