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
import { getSqlClient } from "../../server/db.js";
import { enqueueDigestItem } from "../../server/services/emailDigest.js";
import { countryChangesFragment } from "../../server/services/emailTemplates/alerts.js";
import { buildCountryChanges, currentMethodologyChangeEvents, CHANGE_KIND_LABELS } from "../../src/data/countryChanges.js";

const sql = getSqlClient();

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://regactions.com";

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
    // Keep the migration/rebaseline guard at the delivery boundary as well as
    // in scoreDeltaEvents, so a stale cached event can never mass-mail users.
    const events = currentMethodologyChangeEvents(buildCountryChanges());
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
      const fragment = countryChangesFragment({
        events: top.map((e) => ({ date: e.date, kindLabel: CHANGE_KIND_LABELS[e.kind], title: e.title })),
        totalFresh: fresh.length,
        unsubscribeUrl: unsubUrl,
      });
      const htmlContent = fragment.html;
      const textContent = `Country-risk changes this week\n\n${fragment.text}`;

      try {
        await enqueueDigestItem(sql, {
          recipient: sub.email,
          audience: "customer",
          cadence: "weekly",
          category: "country-risk-changes",
          fingerprint: `${sub.id}:${newestDate}`,
          subject: `RegActions: ${fresh.length} country-risk change${fresh.length === 1 ? "" : "s"} this week`,
          html: htmlContent,
          text: textContent,
        });

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
