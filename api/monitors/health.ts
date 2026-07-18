import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";

export interface MonitorDeliveryHealthInput {
  verificationOverdue: number;
  activeWithoutBaseline: number;
  recentFailures: number;
  mailConfigured: boolean;
}

export function evaluateMonitorDeliveryHealth(input: MonitorDeliveryHealthInput) {
  const reasons: string[] = [];
  if (!input.mailConfigured) reasons.push("AWS SES delivery is not configured");
  if (input.verificationOverdue > 0) {
    reasons.push(`${input.verificationOverdue} verification deliver${input.verificationOverdue === 1 ? "y is" : "ies are"} overdue`);
  }
  if (input.activeWithoutBaseline > 0) {
    reasons.push(`${input.activeWithoutBaseline} active monitor${input.activeWithoutBaseline === 1 ? " has" : "s have"} no evidence baseline`);
  }
  if (input.recentFailures > 0) {
    reasons.push(`${input.recentFailures} monitor delivery failure${input.recentFailures === 1 ? " was" : "s were"} recorded in the last 24 hours`);
  }
  return { healthy: reasons.length === 0, reasons };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return res.status(401).json({ error: "Unauthorised" });

  try {
    const sql = getSqlClient();
    const [status] = await sql(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_verification,
        COUNT(*) FILTER (
          WHERE status = 'pending'
            AND created_at < now() - interval '15 minutes'
        )::int AS verification_overdue,
        COUNT(*) FILTER (
          WHERE status = 'active' AND baseline_established_at IS NULL
        )::int AS active_without_baseline,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (
          WHERE last_delivery_status IN ('verification_failed', 'notification_failed', 'smoke_failed')
            AND updated_at >= now() - interval '24 hours'
        )::int AS recent_failures,
        COUNT(*) FILTER (
          WHERE last_delivery_status IN ('verification_sent', 'notification_sent', 'smoke_sent')
            AND updated_at >= now() - interval '24 hours'
        )::int AS sent_last_24_hours
      FROM public.monitor_profiles
    `);
    const configuration = {
      database: true,
      ses: Boolean(process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()),
      sender: Boolean(process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com"),
    };
    const evaluation = evaluateMonitorDeliveryHealth({
      verificationOverdue: Number(status?.verification_overdue ?? 0),
      activeWithoutBaseline: Number(status?.active_without_baseline ?? 0),
      recentFailures: Number(status?.recent_failures ?? 0),
      mailConfigured: configuration.ses,
    });
    return res.status(evaluation.healthy ? 200 : 503).json({ ...evaluation, delivery: status, configuration });
  } catch (error) {
    console.error("Monitor health check failed:", error instanceof Error ? error.message : error);
    return res.status(503).json({ healthy: false, error: "Monitor delivery health check failed" });
  }
}
