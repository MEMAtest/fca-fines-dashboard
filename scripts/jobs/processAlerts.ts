/**
 * Process Alert Notifications
 *
 * This script runs daily (after the FCA scraper) to:
 * 1. Find new enforcement actions since last notification
 * 2. Match them against active alert subscriptions
 * 3. Send notification emails via AWS SES
 */

import postgres from 'postgres';
import { fineAlertFragment, watchlistAlertFragment } from '../../server/services/emailTemplates/alerts.js';

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://regactions.com';

interface Fine {
  id: string;
  regulator: string;
  regulator_full_name: string;
  firm_individual: string;
  amount: number | null;
  date_issued: string;
  breach_type: string;
  breach_categories: string[];
  final_notice_url: string;
}

interface AlertSubscription {
  id: string;
  email: string;
  min_amount: number | null;
  breach_types: string[] | null;
  frequency: string;
  last_notified_at: string | null;
  unsubscribe_token: string;
}

interface WatchlistEntry {
  id: string;
  email: string;
  firm_name: string;
  firm_name_normalized: string;
  last_notified_at: string | null;
  unsubscribe_token: string;
}

function toFineLine(fine: Fine) {
  return {
    firm: fine.firm_individual,
    regulator: fine.regulator,
    amount: fine.amount,
    date: fine.date_issued,
    breachType: fine.breach_type,
    noticeUrl: fine.final_notice_url,
  };
}

async function main() {
  console.log('Starting alert processing...');

  try {
    // Get actions from the last 24 hours (created recently AND issued recently)
    // This prevents alerts for historical data being backfilled
    const recentFines = await sql`
      SELECT
        id,
        regulator,
        regulator_full_name,
        firm_individual,
        amount_gbp AS amount,
        date_issued,
        breach_type,
        breach_categories,
        notice_url AS final_notice_url
      FROM all_regulatory_fines_canonical
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND date_issued >= NOW() - INTERVAL '90 days'
      ORDER BY date_issued DESC
    ` as Fine[];

    console.log(`Found ${recentFines.length} recent enforcement actions`);

    if (recentFines.length === 0) {
      console.log('No new enforcement actions to process');
      return;
    }

    // Process immediate alerts
    await processImmediateAlerts(recentFines);

    // Process watchlist alerts
    await processWatchlistAlerts(recentFines);

    console.log('Alert processing completed');
    await sql.end();
  } catch (error) {
    console.error('Alert processing failed:', error);
    await sql.end();
    process.exit(1);
  }
}

async function processImmediateAlerts(fines: Fine[]) {
  // Legacy "immediate" subscriptions now enter the daily London-time digest.
  const subscriptions = await sql`
    SELECT id, email, min_amount, breach_types, frequency,
           last_notified_at, unsubscribe_token
    FROM alert_subscriptions
    WHERE status = 'active'
    AND email_verified = TRUE
    AND frequency = 'immediate'
  ` as AlertSubscription[];

  console.log(`Processing ${subscriptions.length} immediate alert subscriptions`);

  for (const subscription of subscriptions) {
    try {
      // Filter actions matching this subscription's criteria
      const matchingFines = fines.filter(fine => {
        // Check minimum amount
        if (subscription.min_amount && (fine.amount === null || fine.amount < subscription.min_amount)) {
          return false;
        }

        // Check breach types
        if (subscription.breach_types && subscription.breach_types.length > 0) {
          const fineCategories = fine.breach_categories || [];
          const hasMatch = subscription.breach_types.some(type =>
            fineCategories.some(cat => cat?.toLowerCase().includes(type.toLowerCase()))
          );
          if (!hasMatch) return false;
        }

        return true;
      });

      if (matchingFines.length === 0) {
        continue;
      }

      // Check if we already notified about these fines
      const fineIds = matchingFines.map(f => f.id);
      const existingNotifications = await sql`
        SELECT fine_ids FROM notification_log
        WHERE email = ${subscription.email}
        AND notification_type = 'alert'
        AND created_at >= NOW() - INTERVAL '24 hours'
      `;

      const alreadyNotified = new Set<string>();
      existingNotifications.forEach(n => {
        (n.fine_ids || []).forEach((id: string) => alreadyNotified.add(id));
      });

      const newFines = matchingFines.filter(f => !alreadyNotified.has(f.id));

      if (newFines.length === 0) {
        continue;
      }

      // Send alert email
      await sendAlertEmail(subscription, newFines);

      // Log notification
      await sql`
        INSERT INTO notification_log (email, notification_type, fine_ids, subject)
        VALUES (
          ${subscription.email},
          'alert',
          ${newFines.map(f => f.id)},
          ${'RegActions Alert: ' + newFines.length + ' new enforcement actions'}
        )
      `;

      // Update last notified timestamp
      await sql`
        UPDATE alert_subscriptions
        SET last_notified_at = NOW()
        WHERE id = ${subscription.id}
      `;

      console.log(`Queued daily alert for ${subscription.email} with ${newFines.length} enforcement actions`);
    } catch (error) {
      console.error(`Failed to process subscription ${subscription.id}:`, error);
    }
  }
}

async function processWatchlistAlerts(fines: Fine[]) {
  // Get active watchlist entries
  const watchlistEntries = await sql`
    SELECT id, email, firm_name, firm_name_normalized,
           last_notified_at, unsubscribe_token
    FROM firm_watchlist
    WHERE status = 'active'
    AND email_verified = TRUE
  ` as WatchlistEntry[];

  console.log(`Processing ${watchlistEntries.length} watchlist entries`);

  for (const entry of watchlistEntries) {
    try {
      // Find fines matching this firm
      const matchingFines = fines.filter(fine => {
        const firmNormalized = fine.firm_individual.toLowerCase().trim();
        const watchNormalized = entry.firm_name_normalized;

        // Check if firm name matches (partial match)
        if (!firmNormalized.includes(watchNormalized) && !watchNormalized.includes(firmNormalized)) {
          return false;
        }

        // Always notify for watchlist matches (no threshold in current schema)
        return true;
      });

      if (matchingFines.length === 0) {
        continue;
      }

      // Check if already notified
      const fineIds = matchingFines.map(f => f.id);
      const existingNotifications = await sql`
        SELECT fine_ids FROM notification_log
        WHERE email = ${entry.email}
        AND notification_type = 'watchlist'
        AND created_at >= NOW() - INTERVAL '24 hours'
      `;

      const alreadyNotified = new Set<string>();
      existingNotifications.forEach(n => {
        (n.fine_ids || []).forEach((id: string) => alreadyNotified.add(id));
      });

      const newFines = matchingFines.filter(f => !alreadyNotified.has(f.id));

      if (newFines.length === 0) {
        continue;
      }

      // Send watchlist alert
      await sendWatchlistEmail(entry, newFines);

      // Log notification
      await sql`
        INSERT INTO notification_log (email, notification_type, fine_ids, subject)
        VALUES (
          ${entry.email},
          'watchlist',
          ${newFines.map(f => f.id)},
          ${'Watchlist Alert: ' + entry.firm_name}
        )
      `;

      // Update last notified
      await sql`
        UPDATE firm_watchlist
        SET last_notified_at = NOW()
        WHERE id = ${entry.id}
      `;

      console.log(`Queued daily watchlist alert for ${entry.email} for ${entry.firm_name}`);
    } catch (error) {
      console.error(`Failed to process watchlist entry ${entry.id}:`, error);
    }
  }
}

async function sendAlertEmail(subscription: AlertSubscription, fines: Fine[]) {
  const unsubscribeUrl = `${BASE_URL}/api/alerts/unsubscribe/${subscription.unsubscribe_token}`;

  const fragment = fineAlertFragment({ fines: fines.map(toFineLine), unsubscribeUrl });
  const htmlContent = fragment.html;
  const textContent = `New RegActions Alert\n\n${fragment.text}`;

  await sql`
    INSERT INTO public.email_digest_outbox (
      recipient, audience, cadence, category, fingerprint, subject,
      text_body, html_body, eligible_local_date
    ) VALUES (
      ${subscription.email.toLowerCase()}, 'customer', 'daily', 'enforcement-alert',
      ${fines.map((fine) => fine.id).sort().join(':')},
      ${`RegActions Alert: ${fines.length} new enforcement action${fines.length !== 1 ? 's' : ''}`},
      ${textContent}, ${htmlContent},
      (now() AT TIME ZONE 'Europe/London')::date
    ) ON CONFLICT (recipient, cadence, category, fingerprint, eligible_local_date)
      DO NOTHING
  `;
}

async function sendWatchlistEmail(entry: WatchlistEntry, fines: Fine[]) {
  const unsubscribeUrl = `${BASE_URL}/api/watchlist/unsubscribe/${entry.unsubscribe_token}`;

  const fragment = watchlistAlertFragment({ firmName: entry.firm_name, fines: fines.map(toFineLine), unsubscribeUrl });
  const htmlContent = fragment.html;

  const totalAmount = fines.reduce((sum, f) => sum + (f.amount ?? 0), 0);
  const hasMonetaryAction = fines.some((fine) => fine.amount !== null);

  const subject = hasMonetaryAction
    ? `Watchlist Alert: ${entry.firm_name} enforcement action, £${totalAmount.toLocaleString('en-GB')}`
    : `Watchlist Alert: ${entry.firm_name} enforcement action`;
  const textContent = `Watchlist Alert: ${entry.firm_name}\n\n${fragment.text}`;
  await sql`
    INSERT INTO public.email_digest_outbox (
      recipient, audience, cadence, category, fingerprint, subject,
      text_body, html_body, eligible_local_date
    ) VALUES (
      ${entry.email.toLowerCase()}, 'customer', 'daily', 'firm-watchlist',
      ${`${entry.id}:${fines.map((fine) => fine.id).sort().join(':')}`},
      ${subject}, ${textContent}, ${htmlContent},
      (now() AT TIME ZONE 'Europe/London')::date
    ) ON CONFLICT (recipient, cadence, category, fingerprint, eligible_local_date)
      DO NOTHING
  `;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
