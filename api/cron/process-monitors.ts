import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getSqlClient, type SqlClient } from "../../server/db.js";

interface MonitorRow extends Record<string, unknown> {
  id: string;
  email: string;
  label: string;
  scope: { path?: string } | string;
  frequency: "daily" | "weekly" | "monthly";
  management_token: string;
  last_run_at: string | null;
}

interface MonitorResultRow extends Record<string, unknown> {
  canonical_case_id: string;
  regulator: string;
  firm_individual: string;
  date_issued: string;
  breach_type: string | null;
  created_at: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://regactions.com";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export function buildMonitorScopeQuery(path: string, lastRunAt: string | null) {
  const url = new URL(path, BASE_URL);
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  };
  const csv = (name: string) => (url.searchParams.get(name) || "").split(",").map((value) => value.trim()).filter(Boolean);
  const routeRegulator = url.pathname.match(/^\/regulators\/([^/]+)/)?.[1]?.toUpperCase();
  const regulators = [...new Set([
    ...(routeRegulator ? [routeRegulator] : []),
    ...csv("regulator"),
    ...csv("regulators"),
  ].filter((value) => value && value !== "All"))];
  const years = [...new Set([...csv("year"), ...csv("years")].map(Number).filter(Number.isFinite))];
  const themes = [...new Set([...csv("theme"), ...csv("themes"), ...csv("breachCategory")].filter((value) => value !== "All"))];

  if (regulators.length) add("regulator = ANY(?::text[])", regulators);
  if (years.length) add("year_issued = ANY(?::int[])", years);
  if (themes.length) add(`EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(
      COALESCE(CASE WHEN jsonb_typeof(breach_categories) = 'string' THEN (breach_categories #>> '{}')::jsonb ELSE breach_categories END, '[]'::jsonb)
    ) AS category(value) WHERE category.value = ANY(?::text[])
  )`, themes);

  const scalarFilters: Array<[string, string, (value: string) => unknown]> = [
    ["country", "country_code = ?", String],
    ["sector", "COALESCE(firm_category, 'Sector not recorded') = ?", String],
    ["minAmount", "trusted_amount_gbp >= ?", Number],
    ["maxAmount", "trusted_amount_gbp <= ?", Number],
  ];
  for (const [name, condition, transform] of scalarFilters) {
    const raw = url.searchParams.get(name);
    if (raw && raw !== "All") {
      const value = transform(raw);
      if (typeof value !== "number" || Number.isFinite(value)) add(condition, value);
    }
  }

  const query = url.searchParams.get("q")?.trim();
  if (query) {
    values.push(`%${query}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(firm_individual ILIKE ${parameter} OR summary ILIKE ${parameter} OR breach_type ILIKE ${parameter} OR regulator ILIKE ${parameter})`);
  }

  const baseWhere = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  let newWhere = baseWhere;
  const newValues = [...values];
  if (lastRunAt) {
    newValues.push(lastRunAt);
    newWhere += `${newWhere ? " AND" : "WHERE"} created_at > $${newValues.length}::timestamptz`;
  }
  return { baseWhere, values, newWhere, newValues };
}

async function loadMonitorResults(sql: SqlClient, monitor: MonitorRow) {
  const scope = typeof monitor.scope === "string" ? JSON.parse(monitor.scope) : monitor.scope;
  const path = typeof scope?.path === "string" ? scope.path : "/search";
  const query = buildMonitorScopeQuery(path, monitor.last_run_at);
  const [total] = await sql(
    `SELECT COUNT(*)::int AS count FROM public.all_regulatory_fines_trusted ${query.baseWhere}`,
    query.values,
  );
  const rows = monitor.last_run_at
    ? await sql(
      `SELECT public_case_id AS canonical_case_id, regulator, firm_individual, date_issued::text, breach_type, created_at::text
       FROM public.all_regulatory_fines_trusted ${query.newWhere}
       ORDER BY created_at DESC, date_issued DESC LIMIT 10`,
      query.newValues,
    ) as MonitorResultRow[]
    : [];
  const [newCount] = monitor.last_run_at
    ? await sql(
      `SELECT COUNT(*)::int AS count FROM public.all_regulatory_fines_trusted ${query.newWhere}`,
      query.newValues,
    )
    : [{ count: 0 }];
  return { path, total: Number(total?.count ?? 0), newCount: Number(newCount?.count ?? 0), rows };
}

async function sendMonitorEmail(ses: SESClient, monitor: MonitorRow, results: Awaited<ReturnType<typeof loadMonitorResults>>) {
  const manageUrl = `${BASE_URL}/monitor?token=${encodeURIComponent(monitor.management_token)}`;
  const scopeUrl = `${BASE_URL}${results.path}`;
  const rows = results.rows.map((row) => `<li style="margin:0 0 10px"><strong>${escapeHtml(row.firm_individual)}</strong><br/>${escapeHtml(row.regulator)} · ${escapeHtml(row.date_issued)} · ${escapeHtml(row.breach_type || "Theme not recorded")}</li>`).join("");
  const delivery = await ses.send(new SendEmailCommand({
    Source: process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com",
    Destination: { ToAddresses: [monitor.email] },
    Message: {
      Subject: { Data: `${results.newCount} new result${results.newCount === 1 ? "" : "s"}: ${monitor.label}`, Charset: "UTF-8" },
      Body: {
        Html: { Data: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#102536"><h1>${escapeHtml(monitor.label)}</h1><p>RegActions found <strong>${results.newCount} new enforcement result${results.newCount === 1 ? "" : "s"}</strong> in your verified evidence scope.</p><ul>${rows}</ul><p><a href="${scopeUrl}">Open the saved evidence scope</a></p><p style="font-size:12px;color:#64748b"><a href="${manageUrl}">Pause, change or unsubscribe from this monitor</a></p></div>`, Charset: "UTF-8" },
        Text: { Data: `${monitor.label}\n\n${results.newCount} new enforcement results.\n\nOpen scope: ${scopeUrl}\nManage monitor: ${manageUrl}`, Charset: "UTF-8" },
      },
    },
  }));
  return delivery.MessageId ?? null;
}

export function buildMonitorSmokeMessage(monitor: Pick<MonitorRow, "label">) {
  return {
    subject: `RegActions monitor delivery test: ${monitor.label}`,
    text: `RegActions monitor delivery test\n\nEmail delivery is configured for ${monitor.label}. This test does not report a new enforcement case or alter the monitor baseline.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#102536"><h1>RegActions monitor delivery test</h1><p>Email delivery is configured for <strong>${escapeHtml(monitor.label)}</strong>.</p><p>This operational test does not report a new enforcement case or alter the monitor baseline.</p></div>`,
  };
}

async function sendMonitorSmokeEmail(ses: SESClient, monitor: MonitorRow) {
  const message = buildMonitorSmokeMessage(monitor);
  const delivery = await ses.send(new SendEmailCommand({
    Source: process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com",
    Destination: { ToAddresses: [monitor.email] },
    Message: {
      Subject: { Data: message.subject, Charset: "UTF-8" },
      Body: {
        Html: { Data: message.html, Charset: "UTF-8" },
        Text: { Data: message.text, Charset: "UTF-8" },
      },
    },
  }));
  return delivery.MessageId ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return res.status(401).json({ error: "Unauthorised" });
  if (!process.env.AWS_ACCESS_KEY_ID?.trim() || !process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    return res.status(503).json({ error: "Monitor email delivery is not configured" });
  }

  const sql = getSqlClient();
  const ses = new SESClient({
    region: process.env.AWS_SES_REGION?.trim() || "eu-west-2",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim(),
    },
  });
  const mode = req.query.mode === "smoke" ? "smoke" : "process";
  const monitorId = typeof req.query.monitorId === "string" ? req.query.monitorId : "";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (mode === "smoke") {
    if (!uuidPattern.test(monitorId)) {
      return res.status(400).json({ error: "A valid monitorId is required for smoke delivery" });
    }
    const [monitor] = await sql(
      `SELECT id::text, email, label, scope, frequency, management_token::text, last_run_at::text
       FROM public.monitor_profiles WHERE id = $1::uuid AND status = 'active' LIMIT 1`,
      [monitorId],
    ) as MonitorRow[];
    if (!monitor) return res.status(404).json({ error: "Active monitor not found" });
    try {
      const messageId = await sendMonitorSmokeEmail(ses, monitor);
      await sql(
        `UPDATE public.monitor_profiles SET last_delivery_status = 'smoke_sent', last_error = NULL, updated_at = now()
         WHERE id = $1::uuid`,
        [monitor.id],
      );
      await sql(
        `INSERT INTO public.monitor_delivery_log (
           monitor_id, delivery_kind, delivery_status, provider, message_id
         ) VALUES ($1::uuid, 'smoke', 'sent', 'ses', $2)`,
        [monitor.id, messageId],
      );
      return res.status(200).json({ processed: 1, smokeSent: true, messageId });
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await sql(
        `UPDATE public.monitor_profiles SET last_delivery_status = 'smoke_failed', last_error = $2, updated_at = now()
         WHERE id = $1::uuid`,
        [monitor.id, message],
      );
      await sql(
        `INSERT INTO public.monitor_delivery_log (
           monitor_id, delivery_kind, delivery_status, provider, error_message
         ) VALUES ($1::uuid, 'smoke', 'failed', 'ses', $2)`,
        [monitor.id, message],
      );
      return res.status(502).json({ processed: 1, smokeSent: false, error: "Monitor smoke delivery failed" });
    }
  }

  const monitors = await sql(
    `SELECT id::text, email, label, scope, frequency, management_token::text, last_run_at::text
     FROM public.monitor_profiles
     WHERE status = 'active'
       AND (last_run_at IS NULL
         OR (frequency = 'daily' AND last_run_at <= now() - interval '1 day')
         OR (frequency = 'weekly' AND last_run_at <= now() - interval '7 days')
         OR (frequency = 'monthly' AND last_run_at <= now() - interval '1 month'))
     ORDER BY last_run_at ASC NULLS FIRST LIMIT 100`,
  ) as MonitorRow[];

  let notified = 0;
  let failed = 0;
  for (const monitor of monitors) {
    try {
      const results = await loadMonitorResults(sql, monitor);
      let messageId: string | null = null;
      if (monitor.last_run_at && results.newCount > 0) {
        await sql(
          `UPDATE public.monitor_profiles
           SET last_notification_attempt_at = now(), notification_attempts = notification_attempts + 1, updated_at = now()
           WHERE id = $1::uuid`,
          [monitor.id],
        );
        messageId = await sendMonitorEmail(ses, monitor, results);
        await sql(
          `INSERT INTO public.monitor_delivery_log (
             monitor_id, delivery_kind, delivery_status, provider, message_id
           ) VALUES ($1::uuid, 'notification', 'sent', 'ses', $2)`,
          [monitor.id, messageId],
        );
        notified += 1;
      }
      await sql(
        `UPDATE public.monitor_profiles SET last_run_at = now(), last_result_count = $2, new_item_count = $3,
         last_notified_at = CASE WHEN $3::int > 0 AND $4::boolean THEN now() ELSE last_notified_at END,
         baseline_established_at = CASE WHEN $5::boolean THEN COALESCE(baseline_established_at, now()) ELSE baseline_established_at END,
         last_notification_message_id = CASE WHEN $4::boolean THEN $6 ELSE last_notification_message_id END,
         last_delivery_status = CASE
           WHEN $4::boolean THEN 'notification_sent'
           WHEN $5::boolean THEN 'baseline_set'
           ELSE last_delivery_status
         END,
         last_error = NULL, updated_at = now() WHERE id = $1::uuid`,
        [
          monitor.id,
          results.total,
          results.newCount,
          Boolean(monitor.last_run_at && results.newCount > 0),
          !monitor.last_run_at,
          messageId,
        ],
      );
    } catch (error) {
      failed += 1;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await sql(
        `UPDATE public.monitor_profiles
         SET last_delivery_status = 'notification_failed', last_error = $2, updated_at = now()
         WHERE id = $1::uuid`,
        [monitor.id, message],
      );
      await sql(
        `INSERT INTO public.monitor_delivery_log (
           monitor_id, delivery_kind, delivery_status, provider, error_message
         ) VALUES ($1::uuid, 'notification', 'failed', 'ses', $2)`,
        [monitor.id, message],
      );
    }
  }
  return res.status(failed ? 207 : 200).json({ processed: monitors.length, notified, failed });
}
