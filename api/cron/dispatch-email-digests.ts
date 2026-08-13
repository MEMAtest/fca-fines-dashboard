import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESClient, SendEmailCommand, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { getSqlClient } from "../../server/db.js";
import {
  buildConsolidatedDigest,
  cadenceIsDue,
  londonDate,
  londonHour,
  type DigestCadence,
} from "../../server/services/emailDigest.js";

interface PendingItem {
  id: string;
  recipient: string;
  audience: "internal" | "customer";
  cadence: DigestCadence;
  subject: string;
  text_body: string;
  html_body: string | null;
  attachment_name: string | null;
  attachment_content_type: string | null;
  attachment_base64: string | null;
}

export function isDigestDispatchWindow(now = new Date()) {
  return londonHour(now) === 7;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return res.status(401).json({ error: "Unauthorised" });

  const now = new Date();
  if (!isDigestDispatchWindow(now)) return res.status(202).json({ skipped: true, reason: "Outside 07:00 Europe/London dispatch window" });

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim() || "";
  if (!accessKeyId || !secretAccessKey) return res.status(503).json({ error: "Email delivery is not configured" });
  const sql = getSqlClient();
  const localDate = londonDate(now);

  try {
    const pending = await sql(
      `SELECT id, recipient, audience, cadence, subject, text_body, html_body,
         attachment_name, attachment_content_type, attachment_base64
       FROM public.email_digest_outbox
       WHERE status = 'pending' AND eligible_local_date <= $1::date
       ORDER BY recipient, created_at`,
      [localDate],
    ) as unknown as PendingItem[];
    const due = pending.filter((item) => cadenceIsDue(item.cadence, now));
    const internalRecipients = (process.env.INTERNAL_DIGEST_EMAIL || process.env.OPS_ALERT_EMAIL || process.env.ALERT_EMAIL || "")
      .split(",").map((value) => value.trim().toLowerCase()).filter((value) => /^\S+@\S+\.\S+$/.test(value));
    const recipients = new Set([...due.map((item) => item.recipient), ...internalRecipients]);
    const ses = new SESClient({
      region: process.env.AWS_SES_REGION?.trim() || "eu-west-2",
      credentials: { accessKeyId, secretAccessKey },
    });
    const results: Array<{ recipient: string; sent: boolean; items: number }> = [];

    for (const recipient of recipients) {
      const items = due.filter((item) => item.recipient === recipient);
      const internal = internalRecipients.includes(recipient) || items.some((item) => item.audience === "internal");
      if (!internal && items.length === 0) continue;
      const claimed = await sql(
        `INSERT INTO public.email_digest_deliveries (recipient, cadence, local_date, item_count)
         VALUES ($1, 'combined', $2::date, $3)
         ON CONFLICT (recipient, local_date) DO NOTHING
         RETURNING id`,
        [recipient, localDate, items.length],
      );
      if (!claimed[0]) continue;
      const digest = buildConsolidatedDigest(items);
      try {
        const attachments = items.filter((item) => item.attachment_name && item.attachment_base64);
        const delivery = attachments.length
          ? await ses.send(new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(buildRawDigest(recipient, digest, attachments)) } }))
          : await ses.send(new SendEmailCommand({
          Source: process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com",
          Destination: { ToAddresses: [recipient] },
          Message: {
            Subject: { Data: digest.subject, Charset: "UTF-8" },
            Body: { Text: { Data: digest.text, Charset: "UTF-8" }, Html: { Data: digest.html, Charset: "UTF-8" } },
          },
          }));
        await sql(`UPDATE public.email_digest_deliveries SET message_id = $1 WHERE id = $2`, [delivery.MessageId ?? null, claimed[0].id]);
        if (items.length) await sql(`UPDATE public.email_digest_outbox SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])`, [items.map((item) => item.id)]);
        results.push({ recipient, sent: true, items: items.length });
      } catch (error) {
        await sql(`DELETE FROM public.email_digest_deliveries WHERE id = $1`, [claimed[0].id]);
        if (items.length) await sql(`UPDATE public.email_digest_outbox SET attempts = attempts + 1, last_error = $1, updated_at = now() WHERE id = ANY($2::uuid[])`, [(error instanceof Error ? error.message : String(error)).slice(0, 1000), items.map((item) => item.id)]);
        results.push({ recipient, sent: false, items: items.length });
      }
    }
    return res.status(results.some((item) => !item.sent) ? 502 : 200).json({ localDate, results });
  } catch (error) {
    console.error("Digest dispatch failed", error);
    return res.status(503).json({ error: "Digest dispatch failed" });
  }
}

function buildRawDigest(recipient: string, digest: { subject: string; html: string }, attachments: PendingItem[]) {
  const boundary = `regactions_${Date.now()}`;
  const lines = [
    `From: ${process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com"}`,
    `To: ${recipient}`,
    `Subject: ${digest.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "", digest.html,
  ];
  for (const attachment of attachments) {
    lines.push(`--${boundary}`, `Content-Type: ${attachment.attachment_content_type || "application/octet-stream"}; name="${attachment.attachment_name}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${attachment.attachment_name}"`, "", attachment.attachment_base64 || "");
  }
  lines.push(`--${boundary}--`);
  return lines.join("\r\n");
}
