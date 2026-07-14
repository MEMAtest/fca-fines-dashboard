import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import {
  boardPackLeadSchema,
  ensureBoardPackLeadTable,
  markBoardPackNotificationFailed,
  notifyBoardPackLead,
} from "../../server/services/boardPackLeads.js";

function getIp(req: VercelRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (typeof req.body?.website === "string" && req.body.website.trim()) {
    return res.status(201).json({ persisted: true, notificationStatus: "ignored" });
  }

  const parsed = boardPackLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || "Invalid board pack request",
    });
  }

  try {
    await ensureBoardPackLeadTable();
    const sql = getSqlClient();
    const input = parsed.data;
    const ip = getIp(req);

    const existing = await sql(
      `SELECT id, notification_status FROM board_pack_leads WHERE idempotency_key = $1 LIMIT 1`,
      [input.idempotencyKey],
    );
    if (existing[0]) {
      return res.status(200).json({
        persisted: true,
        leadId: existing[0].id,
        notificationStatus: existing[0].notification_status,
        duplicate: true,
      });
    }

    const recent = await sql(
      `SELECT COUNT(*)::int AS count
       FROM board_pack_leads
       WHERE created_at > now() - interval '1 hour'
         AND (lower(work_email) = lower($1) OR ($2::text IS NOT NULL AND ip_address = $2))`,
      [input.email, ip],
    );
    if (Number(recent[0]?.count ?? 0) >= 5) {
      return res.status(429).json({ error: "Too many download requests. Please try again later." });
    }

    const inserted = await sql(
      `INSERT INTO board_pack_leads
        (idempotency_key, name, work_email, organisation, consent_given, consent_at, marketing_consent, profile, generated_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, true, now(), $5, $6::jsonb, $7, $8, $9)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.idempotencyKey,
        input.name,
        input.email.toLowerCase(),
        input.organisation,
        input.marketingConsent,
        JSON.stringify(input.profile),
        input.generatedAt,
        ip,
        req.headers["user-agent"]?.slice(0, 500) ?? null,
      ],
    );
    const leadId = String(inserted[0]?.id ?? "");
    if (!leadId) {
      return res.status(409).json({ error: "This download request is already being processed." });
    }

    let notificationStatus = "sent";
    try {
      await notifyBoardPackLead(leadId);
    } catch (error) {
      notificationStatus = "pending";
      await markBoardPackNotificationFailed(leadId, error);
      console.error("Board pack lead notification queued:", error instanceof Error ? error.message : error);
    }

    return res.status(201).json({
      persisted: true,
      leadId,
      notificationStatus,
    });
  } catch (error) {
    console.error("Board pack lead error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "We could not record the download request. Please try again." });
  }
}
