import { createHash, randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getSqlClient } from "../../server/db.js";
import { recordProductFunnelEvent } from "../../server/services/productFunnel.js";
import { buildProductFunnelEvent } from "../../src/utils/productAnalyticsContract.js";

const sql = getSqlClient();
const ses = new SESClient({
  region: process.env.AWS_SES_REGION?.trim() || "eu-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || "",
  },
});
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://regactions.com";
const FROM_EMAIL = process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function stableScope(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const scope = value as Record<string, unknown>;
  const path = typeof scope.path === "string" ? scope.path : "";
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 1000) return null;
  return { ...scope, path };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let monitorId: string | null = null;
  try {
    const body = req.body as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 100) : "";
    const frequency = ["daily", "weekly", "monthly"].includes(String(body.frequency)) ? String(body.frequency) : "weekly";
    const scope = stableScope(body.scope);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "A valid email is required" });
    if (!label) return res.status(400).json({ error: "A monitor name is required" });
    if (!scope) return res.status(400).json({ error: "A valid workspace scope is required" });
    if (!process.env.AWS_ACCESS_KEY_ID?.trim() || !process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
      return res.status(503).json({ error: "Monitor email delivery is not configured" });
    }

    const [rate] = await sql`SELECT COUNT(*)::int AS count FROM public.monitor_profiles WHERE email = ${email} AND updated_at > now() - interval '1 hour'`;
    if (Number(rate?.count ?? 0) >= 5) return res.status(429).json({ error: "Too many monitor requests. Try again later." });

    const scopeJson = JSON.stringify(scope);
    const scopeHash = createHash("sha256").update(scopeJson).digest("hex");
    const verificationToken = randomUUID();
    const managementToken = randomUUID();
    const [monitor] = await sql`
      INSERT INTO public.monitor_profiles (
        email, label, scope, scope_hash, frequency, status,
        verification_token, verification_expires_at, management_token, updated_at
      ) VALUES (
        ${email}, ${label}, ${scopeJson}::jsonb, ${scopeHash}, ${frequency}, 'pending',
        ${verificationToken}::uuid, now() + interval '7 days', ${managementToken}::uuid, now()
      )
      ON CONFLICT (email, scope_hash) DO UPDATE SET
        label = EXCLUDED.label,
        scope = EXCLUDED.scope,
        frequency = EXCLUDED.frequency,
        status = 'pending',
        verification_token = EXCLUDED.verification_token,
        verification_expires_at = EXCLUDED.verification_expires_at,
        management_token = EXCLUDED.management_token,
        verification_message_id = NULL,
        verification_sent_at = NULL,
        last_delivery_status = 'none',
        updated_at = now()
      RETURNING id::text
    `;
    monitorId = String(monitor.id);

    const verifyUrl = `${BASE_URL}/api/monitors/verify/${verificationToken}`;
    const safeLabel = escapeHtml(label);
    try {
      const delivery = await ses.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: `Verify your RegActions monitor: ${label}`, Charset: "UTF-8" },
          Body: {
            Html: { Data: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h1>Verify your RegActions monitor</h1><p><strong>${safeLabel}</strong> will check this evidence scope ${escapeHtml(frequency)}.</p><p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#087f58;color:#fff;text-decoration:none;border-radius:7px">Verify monitor</a></p><p>This link expires in seven days. No account is required.</p></div>`, Charset: "UTF-8" },
            Text: { Data: `Verify your RegActions monitor: ${label}\n\n${verifyUrl}\n\nFrequency: ${frequency}`, Charset: "UTF-8" },
          },
        },
      }));
      await sql`
        UPDATE public.monitor_profiles
        SET verification_message_id = ${delivery.MessageId ?? null},
            verification_sent_at = now(),
            last_delivery_status = 'verification_sent',
            last_error = NULL,
            updated_at = now()
        WHERE id = ${monitorId}::uuid
      `;
      await sql`
        INSERT INTO public.monitor_delivery_log (
          monitor_id, delivery_kind, delivery_status, provider, message_id
        ) VALUES (
          ${monitorId}::uuid, 'verification', 'sent', 'ses', ${delivery.MessageId ?? null}
        )
      `;
      const funnelEvent = buildProductFunnelEvent("monitor_submitted", {
        surface: "monitor_modal",
        frequency,
      }, randomUUID());
      if (funnelEvent) void recordProductFunnelEvent(funnelEvent, sql).catch(() => undefined);
      return res.status(200).json({ success: true, message: "Verification email sent" });
    } catch (deliveryError) {
      const message = deliveryError instanceof Error ? deliveryError.message : String(deliveryError);
      await sql`
        UPDATE public.monitor_profiles
        SET last_delivery_status = 'verification_failed',
            last_error = ${message.slice(0, 1000)},
            updated_at = now()
        WHERE id = ${monitorId}::uuid
      `;
      await sql`
        INSERT INTO public.monitor_delivery_log (
          monitor_id, delivery_kind, delivery_status, provider, error_message
        ) VALUES (
          ${monitorId}::uuid, 'verification', 'failed', 'ses', ${message.slice(0, 1000)}
        )
      `;
      throw deliveryError;
    }
  } catch (error) {
    console.error("Monitor subscribe error", error);
    return res.status(500).json({ error: "Unable to create the monitor" });
  }
}
