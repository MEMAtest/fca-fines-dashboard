import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getSqlClient } from "../../server/db.js";
import { buildOpsAlertMessage, buildOpsFingerprint, decideOpsAlert } from "../../server/services/opsAlerts.js";
import { loadOpsSummary, type OpsStatus } from "../../server/services/opsSummary.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return res.status(401).json({ error: "Unauthorised" });

  const sql = getSqlClient();
  try {
    const summary = await loadOpsSummary(sql);
    const fingerprint = buildOpsFingerprint(summary);
    const [state] = await sql(`
      SELECT last_status, last_fingerprint, last_alerted_at
      FROM public.ops_alert_state WHERE singleton = true
    `);
    const decision = decideOpsAlert({
      lastStatus: (state?.last_status || "healthy") as OpsStatus,
      lastFingerprint: state?.last_fingerprint ? String(state.last_fingerprint) : null,
      lastAlertedAt: state?.last_alerted_at ? String(state.last_alerted_at) : null,
    }, summary.status, fingerprint);

    if (decision.action === "skip") {
      await sql(
        `INSERT INTO public.ops_alert_state (
           singleton, last_status, last_fingerprint, last_checked_at, last_delivery_status, last_error, updated_at
         ) VALUES (true, $1, $2, now(), 'skipped', NULL, now())
         ON CONFLICT (singleton) DO UPDATE SET
           last_status = EXCLUDED.last_status,
           last_fingerprint = EXCLUDED.last_fingerprint,
           last_checked_at = now(),
           last_delivery_status = 'skipped',
           last_error = NULL,
           updated_at = now()`,
        [summary.status, fingerprint],
      );
      return res.status(200).json({ checked: true, status: summary.status, alert: "skipped", reason: decision.reason });
    }

    const recipient = process.env.OPS_ALERT_EMAIL?.trim() || "";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim() || "";
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim() || "";
    if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient) || !accessKeyId || !secretAccessKey) {
      await sql(
        `UPDATE public.ops_alert_state SET
           last_status = $1, last_fingerprint = $2, last_checked_at = now(),
           last_delivery_status = 'failed', last_error = 'Operations alert delivery is not configured', updated_at = now()
         WHERE singleton = true`,
        [summary.status, fingerprint],
      );
      return res.status(503).json({ checked: true, status: summary.status, alert: "failed", error: "Operations alert delivery is not configured" });
    }

    const message = buildOpsAlertMessage(summary, decision.action);
    const ses = new SESClient({
      region: process.env.AWS_SES_REGION?.trim() || "eu-west-2",
      credentials: { accessKeyId, secretAccessKey },
    });
    try {
      const delivery = await ses.send(new SendEmailCommand({
        Source: process.env.OPS_ALERT_FROM?.trim() || process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com",
        Destination: { ToAddresses: [recipient] },
        Message: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: message.text, Charset: "UTF-8" },
            Html: { Data: message.html, Charset: "UTF-8" },
          },
        },
      }));
      await sql(
        `INSERT INTO public.ops_alert_state (
           singleton, last_status, last_fingerprint, last_alerted_at, last_checked_at,
           last_recovered_at, last_delivery_status, last_message_id, last_error, updated_at
         ) VALUES (
           true, $1, $2, now(), now(), CASE WHEN $3 = 'recovery' THEN now() ELSE NULL END,
           'sent', $4, NULL, now()
         ) ON CONFLICT (singleton) DO UPDATE SET
           last_status = EXCLUDED.last_status,
           last_fingerprint = EXCLUDED.last_fingerprint,
           last_alerted_at = now(),
           last_checked_at = now(),
           last_recovered_at = CASE WHEN $3 = 'recovery' THEN now() ELSE ops_alert_state.last_recovered_at END,
           last_delivery_status = 'sent',
           last_message_id = EXCLUDED.last_message_id,
           last_error = NULL,
           updated_at = now()`,
        [summary.status, fingerprint, decision.action, delivery.MessageId ?? null],
      );
      return res.status(200).json({ checked: true, status: summary.status, alert: decision.action, messageId: delivery.MessageId ?? null });
    } catch (error) {
      await sql(
        `UPDATE public.ops_alert_state SET last_status = $1, last_fingerprint = $2,
         last_checked_at = now(), last_delivery_status = 'failed', last_error = $3, updated_at = now()
         WHERE singleton = true`,
        [summary.status, fingerprint, (error instanceof Error ? error.message : String(error)).slice(0, 1000)],
      );
      return res.status(502).json({ checked: true, status: summary.status, alert: "failed", error: "Operations alert delivery failed" });
    }
  } catch (error) {
    console.error("Operations health cron failed", error instanceof Error ? error.message : error);
    return res.status(503).json({ checked: false, error: "Operations health check failed" });
  }
}
