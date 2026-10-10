import type { SqlClient } from "../db.js";
import { consolidatedDigestEmail } from "./emailTemplates/digests.js";

export type DigestCadence = "daily" | "weekly" | "monthly";

export interface DigestItemInput {
  recipient: string;
  audience: "internal" | "customer";
  cadence: DigestCadence;
  category: string;
  fingerprint: string;
  subject: string;
  text: string;
  html?: string | null;
  attachmentName?: string | null;
  attachmentContentType?: string | null;
  attachmentBase64?: string | null;
  eligibleLocalDate?: string;
}

export function londonDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function londonHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now));
}

export function cadenceIsDue(cadence: DigestCadence, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "2-digit",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (cadence === "weekly") return weekday === "Mon";
  if (cadence === "monthly") return day === 1;
  return true;
}

export async function enqueueDigestItem(sql: SqlClient, input: DigestItemInput) {
  const recipient = input.recipient.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(recipient)) throw new Error("A valid digest recipient is required");
  const rows = await sql(
    `INSERT INTO public.email_digest_outbox (
       recipient, audience, cadence, category, fingerprint, subject,
       text_body, html_body, attachment_name, attachment_content_type,
       attachment_base64, eligible_local_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date)
     ON CONFLICT (recipient, cadence, category, fingerprint, eligible_local_date)
     DO UPDATE SET subject = EXCLUDED.subject, text_body = EXCLUDED.text_body,
       html_body = EXCLUDED.html_body, attachment_name = EXCLUDED.attachment_name,
       attachment_content_type = EXCLUDED.attachment_content_type,
       attachment_base64 = EXCLUDED.attachment_base64, updated_at = now()
     RETURNING id, status`,
    [recipient, input.audience, input.cadence, input.category, input.fingerprint,
      input.subject, input.text, input.html ?? null, input.attachmentName ?? null,
      input.attachmentContentType ?? null, input.attachmentBase64 ?? null,
      input.eligibleLocalDate ?? londonDate()],
  );
  return rows[0];
}

export function buildConsolidatedDigest(
  items: Array<{ subject: string; text_body: string; html_body: string | null }>,
  options: { internal?: boolean; recipient?: string | null } = {},
) {
  return consolidatedDigestEmail(items, options);
}
