import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import { buildOpsAlertMessage, buildOpsFingerprint, decideOpsAlert } from "../../server/services/opsAlerts.js";
import { loadOpsSummary, type OpsStatus } from "../../server/services/opsSummary.js";
import { enqueueDigestItem } from "../../server/services/emailDigest.js";

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
    if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
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
    try {
      const queued = await enqueueDigestItem(sql, {
        recipient,
        audience: "internal",
        cadence: "daily",
        category: `ops-${decision.action}`,
        fingerprint,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      await sql(
        `INSERT INTO public.ops_alert_state (
           singleton, last_status, last_fingerprint, last_alerted_at, last_checked_at,
           last_recovered_at, last_delivery_status, last_message_id, last_error, updated_at
         ) VALUES (
           true, $1, $2, now(), now(), CASE WHEN $3 = 'recovery' THEN now() ELSE NULL END,
           'queued', $4, NULL, now()
         ) ON CONFLICT (singleton) DO UPDATE SET
           last_status = EXCLUDED.last_status,
           last_fingerprint = EXCLUDED.last_fingerprint,
           last_alerted_at = now(),
           last_checked_at = now(),
           last_recovered_at = CASE WHEN $3 = 'recovery' THEN now() ELSE ops_alert_state.last_recovered_at END,
           last_delivery_status = 'queued',
           last_message_id = EXCLUDED.last_message_id,
           last_error = NULL,
           updated_at = now()`,
        [summary.status, fingerprint, decision.action, queued?.id ?? null],
      );
      return res.status(200).json({ checked: true, status: summary.status, alert: decision.action, queued: true });
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
