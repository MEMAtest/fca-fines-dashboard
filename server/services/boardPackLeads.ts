import { Resend } from "resend";
import { z } from "zod";
import { getSqlClient, type SqlClient } from "../db.js";

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

const MAX_NOTIFICATION_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [5, 15, 60, 240] as const;

const profileSchema = z.object({
  firmName: z.string().trim().min(2).max(160),
  archetypeId: z.string().trim().min(2).max(80),
  boardFocus: z.string().trim().min(2).max(80),
  priorityRegulators: z.array(z.string().trim().max(20)).max(5),
  focusRegions: z.array(z.string().trim().max(80)).max(8),
  priorityThemeIds: z.array(z.string().trim().max(100)).max(5),
});

export const boardPackLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).refine(
    (value) => !PERSONAL_EMAIL_DOMAINS.has(value.split("@")[1]?.toLowerCase() ?? ""),
    "Please use a work email address",
  ),
  organisation: z.string().trim().min(2).max(180),
  consent: z.literal(true),
  marketingConsent: z.boolean().default(false),
  website: z.string().max(0).optional().default(""),
  idempotencyKey: z.string().uuid(),
  generatedAt: z.string().datetime(),
  profile: profileSchema,
});

export type BoardPackLeadInput = z.infer<typeof boardPackLeadSchema>;

interface BoardPackLeadRow extends Record<string, unknown> {
  id: string;
  idempotency_key: string;
  name: string;
  work_email: string;
  organisation: string;
  consent_at: string | Date;
  marketing_consent: boolean;
  profile: BoardPackLeadInput["profile"];
  notification_status: "pending" | "processing" | "sent" | "failed";
  notification_attempts: number;
  notification_message_id?: string | null;
}

export interface BoardPackNotificationPayload {
  from: string;
  to: string[];
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}

interface BoardPackNotificationDependencies {
  sql?: SqlClient;
  now?: () => Date;
  sendEmail?: (
    payload: BoardPackNotificationPayload,
    options: { idempotencyKey: string },
  ) => Promise<{ id: string | null }>;
}

export type BoardPackNotificationResult = {
  status: "sent" | "already_sent" | "skipped";
  messageId: string | null;
};

export async function ensureBoardPackLeadTable() {
  const sql = getSqlClient();
  await sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await sql(`
    CREATE TABLE IF NOT EXISTS board_pack_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key uuid NOT NULL UNIQUE,
      name text NOT NULL,
      work_email text NOT NULL,
      organisation text NOT NULL,
      consent_given boolean NOT NULL DEFAULT false,
      consent_at timestamptz NOT NULL,
      marketing_consent boolean NOT NULL DEFAULT false,
      profile jsonb NOT NULL,
      generated_at timestamptz NOT NULL,
      ip_address text,
      user_agent text,
      notification_status text NOT NULL DEFAULT 'pending'
        CHECK (notification_status IN ('pending', 'processing', 'sent', 'failed')),
      notification_attempts integer NOT NULL DEFAULT 0,
      notification_error text,
      notification_last_attempt_at timestamptz,
      notification_next_attempt_at timestamptz DEFAULT now(),
      notification_message_id text,
      notified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await sql(`ALTER TABLE board_pack_leads ADD COLUMN IF NOT EXISTS notification_last_attempt_at timestamptz`);
  await sql(`ALTER TABLE board_pack_leads ADD COLUMN IF NOT EXISTS notification_next_attempt_at timestamptz`);
  await sql(`ALTER TABLE board_pack_leads ADD COLUMN IF NOT EXISTS notification_message_id text`);
  await sql(`CREATE INDEX IF NOT EXISTS board_pack_leads_email_created_idx ON board_pack_leads (lower(work_email), created_at DESC)`);
  await sql(`CREATE INDEX IF NOT EXISTS board_pack_leads_notification_idx ON board_pack_leads (notification_status, created_at)`);
  await sql(`CREATE INDEX IF NOT EXISTS board_pack_leads_notification_due_idx ON board_pack_leads (notification_next_attempt_at, created_at) WHERE notification_status = 'pending'`);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function getBoardPackRetryDelayMinutes(completedAttempts: number) {
  const index = Math.max(0, Math.min(completedAttempts - 1, RETRY_DELAYS_MINUTES.length - 1));
  return RETRY_DELAYS_MINUTES[index];
}

export function buildBoardPackNotification(row: BoardPackLeadRow) {
  const to = process.env.BOARD_PACK_LEAD_TO?.trim() || "contact@memaconsultants.com";
  const from = process.env.BOARD_PACK_LEAD_FROM?.trim() || "RegActions <alerts@memaconsultants.com>";
  const profile = row.profile;
  const subject = `RegActions board pack lead: ${row.organisation}`;
  const text = [
    "A visitor downloaded a RegActions Board Pack.",
    "",
    `Name: ${row.name}`,
    `Work email: ${row.work_email}`,
    `Organisation: ${row.organisation}`,
    `Profile: ${profile.firmName}`,
    `Firm type: ${profile.archetypeId}`,
    `Committee lens: ${profile.boardFocus}`,
    `Regulators: ${profile.priorityRegulators.join(", ")}`,
    `Themes: ${profile.priorityThemeIds.join(", ")}`,
    `Consent recorded: ${new Date(row.consent_at).toISOString()}`,
    `Marketing follow-up consent: ${row.marketing_consent ? "Yes" : "No"}`,
  ].join("\n");

  return {
    idempotencyKey: `board-pack-lead/${row.idempotency_key}`,
    payload: {
      from,
      to: [to],
      replyTo: row.work_email,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;color:#102536"><h1 style="font-size:22px">New RegActions board pack lead</h1><p>A visitor downloaded a public Board Pack. Marketing follow-up consent: <strong>${row.marketing_consent ? "Yes" : "No"}</strong>.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Name</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(String(row.name))}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Work email</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(String(row.work_email))}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Organisation</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(String(row.organisation))}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #ddd"><strong>Firm profile</strong></td><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(profile.firmName)} (${escapeHtml(profile.archetypeId)})</td></tr><tr><td style="padding:8px"><strong>Scope</strong></td><td style="padding:8px">${escapeHtml(profile.priorityRegulators.join(", "))}<br/>${escapeHtml(profile.priorityThemeIds.join(", "))}</td></tr></table><p style="font-size:12px;color:#64748b">Privacy acknowledgement was captured at ${escapeHtml(new Date(row.consent_at).toISOString())}.</p></div>`,
    } satisfies BoardPackNotificationPayload,
  };
}

async function defaultSendEmail(
  payload: BoardPackNotificationPayload,
  options: { idempotencyKey: string },
) {
  if (!process.env.RESEND_API_KEY?.trim()) throw new Error("RESEND_API_KEY is not configured");
  const resend = new Resend(process.env.RESEND_API_KEY.trim());
  const result = await resend.emails.send(payload, options);
  if (result.error) throw new Error(result.error.message);
  return { id: result.data?.id ?? null };
}

async function claimBoardPackLead(leadId: string, sql: SqlClient) {
  const claimed = await sql(
    `UPDATE board_pack_leads
     SET notification_status = 'processing', notification_last_attempt_at = now(), updated_at = now()
     WHERE id = $1
       AND notification_status = 'pending'
       AND COALESCE(notification_next_attempt_at, now()) <= now()
     RETURNING *`,
    [leadId],
  );
  if (claimed[0]) return claimed[0] as BoardPackLeadRow;

  const existing = await sql(
    `SELECT notification_status, notification_message_id FROM board_pack_leads WHERE id = $1 LIMIT 1`,
    [leadId],
  );
  return existing[0] as BoardPackLeadRow | undefined;
}

export async function notifyBoardPackLead(
  leadId: string,
  dependencies: BoardPackNotificationDependencies = {},
): Promise<BoardPackNotificationResult> {
  const sql = dependencies.sql ?? getSqlClient();
  const row = await claimBoardPackLead(leadId, sql);
  if (!row) throw new Error("Board pack lead not found");
  if (row.notification_status === "sent") {
    return { status: "already_sent", messageId: row.notification_message_id ?? null };
  }
  if (row.notification_status !== "processing") {
    return { status: "skipped", messageId: row.notification_message_id ?? null };
  }

  const notification = buildBoardPackNotification(row);
  const delivery = await (dependencies.sendEmail ?? defaultSendEmail)(
    notification.payload,
    { idempotencyKey: notification.idempotencyKey },
  );
  await sql(
    `UPDATE board_pack_leads
     SET notification_status = 'sent',
         notification_attempts = notification_attempts + 1,
         notification_error = NULL,
         notification_next_attempt_at = NULL,
         notification_message_id = $2,
         notified_at = now(),
         updated_at = now()
     WHERE id = $1 AND notification_status = 'processing'`,
    [leadId, delivery.id],
  );
  return { status: "sent", messageId: delivery.id };
}

export async function markBoardPackNotificationFailed(
  leadId: string,
  error: unknown,
  dependencies: Pick<BoardPackNotificationDependencies, "sql" | "now"> = {},
) {
  const sql = dependencies.sql ?? getSqlClient();
  const rows = await sql(
    `SELECT notification_attempts, notification_status FROM board_pack_leads WHERE id = $1 LIMIT 1`,
    [leadId],
  );
  if (!rows[0] || rows[0].notification_status === "sent") return;

  const completedAttempts = Number(rows[0].notification_attempts ?? 0) + 1;
  const terminal = completedAttempts >= MAX_NOTIFICATION_ATTEMPTS;
  const now = dependencies.now?.() ?? new Date();
  const nextAttemptAt = terminal
    ? null
    : new Date(now.getTime() + getBoardPackRetryDelayMinutes(completedAttempts) * 60_000).toISOString();
  const message = error instanceof Error ? error.message : "Notification failed";

  await sql(
    `UPDATE board_pack_leads
     SET notification_status = $2,
         notification_attempts = $3,
         notification_error = $4,
         notification_last_attempt_at = COALESCE(notification_last_attempt_at, now()),
         notification_next_attempt_at = $5,
         updated_at = now()
     WHERE id = $1 AND notification_status <> 'sent'`,
    [
      leadId,
      terminal ? "failed" : "pending",
      completedAttempts,
      message.slice(0, 1000),
      nextAttemptAt,
    ],
  );
}
