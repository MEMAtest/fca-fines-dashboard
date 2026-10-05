import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { SqlClient } from "../db.js";

export type DeveloperApiNotificationKind =
  | "first_use"
  | "rate_limited"
  | "suspended_client"
  | "expired_key"
  | "invalid_key_spike"
  | "weekly_digest";

export interface DeveloperApiNotification {
  kind: DeveloperApiNotificationKind;
  dedupeKey: string;
  subject: string;
  text: string;
  html: string;
  apiKeyId?: number;
  clientId?: number;
  detail?: Record<string, unknown>;
}

interface NotificationDependencies {
  send?: (message: { to: string; subject: string; text: string; html: string }) => Promise<string | null>;
}

export function developerApiOperationsRecipient() {
  return process.env.API_OPERATIONS_EMAIL?.trim()
    || process.env.OPS_ALERT_EMAIL?.trim()
    || process.env.CONTACT_EMAIL?.trim()
    || "contact@memaconsultants.com";
}

async function sendOperatorEmail(message: { to: string; subject: string; text: string; html: string }) {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) throw new Error("AWS SES credentials are not configured");
  const ses = new SESClient({
    region: process.env.AWS_SES_REGION?.trim() || "eu-west-2",
    credentials: { accessKeyId, secretAccessKey },
  });
  const delivery = await ses.send(new SendEmailCommand({
    Source: process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com",
    Destination: { ToAddresses: [message.to] },
    Message: {
      Subject: { Data: message.subject, Charset: "UTF-8" },
      Body: {
        Text: { Data: message.text, Charset: "UTF-8" },
        Html: { Data: message.html, Charset: "UTF-8" },
      },
    },
  }));
  return delivery.MessageId ?? null;
}

/** Claims a durable dedupe record before delivery. Failed deliveries may retry after five minutes. */
export async function notifyDeveloperApiOperator(
  sql: SqlClient,
  notification: DeveloperApiNotification,
  dependencies: NotificationDependencies = {},
) {
  const rows = await sql(
    `INSERT INTO developer_api_operator_notifications
      (notification_kind, dedupe_key, api_key_id, client_id, delivery_status, subject, detail)
     VALUES ($1, $2, $3, $4, 'processing', $5, $6::jsonb)
     ON CONFLICT (notification_kind, dedupe_key) DO UPDATE SET
       delivery_status = 'processing', attempted_at = NOW(), subject = EXCLUDED.subject,
       detail = EXCLUDED.detail, error_message = NULL
     WHERE developer_api_operator_notifications.delivery_status = 'failed'
       AND developer_api_operator_notifications.attempted_at <= NOW() - INTERVAL '5 minutes'
     RETURNING id`,
    [notification.kind, notification.dedupeKey, notification.apiKeyId ?? null,
      notification.clientId ?? null, notification.subject, JSON.stringify(notification.detail ?? {})],
  );
  const notificationId = Number(rows[0]?.id);
  if (!notificationId) return { delivered: false, deduplicated: true } as const;

  try {
    const providerMessageId = await (dependencies.send ?? sendOperatorEmail)({
      to: developerApiOperationsRecipient(),
      subject: notification.subject,
      text: notification.text,
      html: notification.html,
    });
    await sql(
      `UPDATE developer_api_operator_notifications
       SET delivery_status = 'sent', sent_at = NOW(), provider_message_id = $2, error_message = NULL
       WHERE id = $1`,
      [notificationId, providerMessageId],
    );
    return { delivered: true, deduplicated: false, providerMessageId } as const;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    await sql(
      `UPDATE developer_api_operator_notifications
       SET delivery_status = 'failed', error_message = $2
       WHERE id = $1`,
      [notificationId, message],
    );
    console.warn("Developer API operator notification failed", notification.kind, message);
    return { delivered: false, deduplicated: false, error: message } as const;
  }
}

export function escapeDeveloperApiHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;",
  })[character] || character);
}

export function utcHourKey(now: Date) {
  return now.toISOString().slice(0, 13);
}

export function utcDayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}
