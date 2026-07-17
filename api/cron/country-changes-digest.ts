/**
 * Vercel Cron: Country-Risk Changes Digest
 *
 * Runs weekly (Monday 09:00 UTC) and emails a digest of the latest country-risk
 * changes to every active `country-changes` subscriber. Reuses the SAME derived
 * event feed as the /countries/changes page and changes.xml (buildCountryChanges),
 * so there is one source of truth and nothing is fabricated.
 *
 * Dedup: each subscriber carries `last_changes_date`. Only events newer than
 * that date are sent, and the column is advanced to the newest event date after
 * a successful send. The double-opt-in flow is preserved end-to-end — this cron
 * only ever emails rows that are already `status = 'active'` (verified). The
 * fines alert path is untouched.
 *
 * Cron schedule: 0 9 * * 1
  *
 * Delivery is AT-LEAST-ONCE: the SES send and the last_changes_date advance
 * are separate statements, so a crash between them re-sends the same digest
 * on the next weekly run. Accepted for a weekly cadence.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getSqlClient } from "../../server/db.js";
import { buildCountryChanges, CHANGE_KIND_LABELS } from "../../src/data/countryChanges.js";

const sql = getSqlClient();

const ses = new SESClient({
  region: process.env.AWS_SES_REGION?.trim() || "eu-west-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || "",
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL?.trim() || "alerts@memaconsultants.com";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://regactions.com";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface CountryChangesSub {
  id: string;
  email: string;
  unsubscribe_token: string;
  last_changes_date: string | Date | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const events = buildCountryChanges();
    const newestDate = events[0]?.date ?? null;

    const subs = (await sql`
      SELECT id, email, unsubscribe_token, last_changes_date
      FROM alert_subscriptions
      WHERE topic = 'country-changes' AND status = 'active'
    `) as unknown as CountryChangesSub[];

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const sub of subs) {
      const since = sub.last_changes_date
        ? new Date(sub.last_changes_date).toISOString().slice(0, 10)
        : null;
      // Only events strictly newer than the last digest date.
      const fresh = since ? events.filter((e) => e.date > since) : events;
      if (fresh.length === 0) {
        skipped++;
        continue;
      }

      const top = fresh.slice(0, 25);
      const unsubUrl = `${BASE_URL}/api/alerts/unsubscribe/${sub.unsubscribe_token}`;
      const rowsHtml = top
        .map(
          (e) =>
            `<tr><td style="padding:6px 8px;color:#64748b;white-space:nowrap;">${escapeHtml(
              e.date,
            )}</td><td style="padding:6px 8px;"><strong>${escapeHtml(
              CHANGE_KIND_LABELS[e.kind],
            )}:</strong> ${escapeHtml(e.title)}</td></tr>`,
        )
        .join("");
      const htmlContent = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;background:#f3f4f6;margin:0;padding:0;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:12px;padding:32px;">
      <div style="font-size:22px;font-weight:bold;color:#1d4ed8;margin-bottom:16px;">RegActions</div>
      <h1 style="font-size:20px;color:#111827;margin:0 0 12px;">Country-risk changes this week</h1>
      <p style="color:#4b5563;margin:0 0 16px;">${fresh.length} change${fresh.length === 1 ? "" : "s"} since your last digest, derived from FATF plenaries, sanctions snapshots, the EU tax list and framework reviews.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${rowsHtml}</table>
      <p style="margin:20px 0 0;"><a href="${BASE_URL}/countries/changes" style="color:#1d4ed8;">See all changes on RegActions</a></p>
    </div>
    <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px;">
      <p>RegActions · <a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe</a></p>
    </div>
  </div>
</body></html>`.trim();

      const textContent = `Country-risk changes this week\n\n${top
        .map((e) => `${e.date}: ${CHANGE_KIND_LABELS[e.kind]}: ${e.title}`)
        .join("\n")}\n\nSee all: ${BASE_URL}/countries/changes\nUnsubscribe: ${unsubUrl}`;

      try {
        await ses.send(
          new SendEmailCommand({
            Source: FROM_EMAIL,
            Destination: { ToAddresses: [sub.email] },
            Message: {
              Subject: {
                Data: `RegActions: ${fresh.length} country-risk change${fresh.length === 1 ? "" : "s"} this week`,
                Charset: "UTF-8",
              },
              Body: {
                Html: { Data: htmlContent, Charset: "UTF-8" },
                Text: { Data: textContent, Charset: "UTF-8" },
              },
            },
          }),
        );

        await sql`
          UPDATE alert_subscriptions
          SET last_changes_date = ${newestDate}, last_notified_at = NOW()
          WHERE id = ${sub.id}
        `;
        await sql`
          INSERT INTO notification_log (email, notification_type, subject)
          VALUES (${sub.email}, 'digest', 'Country-risk changes digest')
        `;
        sent++;
      } catch (sendError) {
        console.error("Country-changes digest send failed:", sub.email, sendError);
        failed++;
      }
    }

    return res.status(200).json({
      success: true,
      subscribers: subs.length,
      sent,
      skipped,
      failed,
      newestDate,
    });
  } catch (error) {
    console.error("Country-changes digest cron failed:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
