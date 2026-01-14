/**
 * Process Alert Notifications
 *
 * This script runs daily (after the FCA scraper) to:
 * 1. Find new fines since last notification
 * 2. Match them against active alert subscriptions
 * 3. Send notification emails via AWS SES
 */

import { neon } from '@neondatabase/serverless';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sql = neon(process.env.NEON_FCA_FINES_URL!);

const ses = new SESClient({
  region: process.env.AWS_SES_REGION || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'alerts@memaconsultants.com';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://fcafines.memaconsultants.com';

interface Fine {
  id: string;
  firm_individual: string;
  amount: number;
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
  notify_threshold: number | null;
  last_notified_at: string | null;
  unsubscribe_token: string;
}

async function main() {
  console.log('Starting alert processing...');

  try {
    // Get fines from the last 24 hours
    const recentFines = await sql`
      SELECT id, firm_individual, amount, date_issued, breach_type,
             breach_categories, final_notice_url
      FROM fca_fines
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY date_issued DESC
    ` as Fine[];

    console.log(`Found ${recentFines.length} recent fines`);

    if (recentFines.length === 0) {
      console.log('No new fines to process');
      return;
    }

    // Process immediate alerts
    await processImmediateAlerts(recentFines);

    // Process watchlist alerts
    await processWatchlistAlerts(recentFines);

    console.log('Alert processing completed');
  } catch (error) {
    console.error('Alert processing failed:', error);
    process.exit(1);
  }
}

async function processImmediateAlerts(fines: Fine[]) {
  // Get active immediate alert subscriptions
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
      // Filter fines matching this subscription's criteria
      const matchingFines = fines.filter(fine => {
        // Check minimum amount
        if (subscription.min_amount && fine.amount < subscription.min_amount) {
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
        AND sent_at >= NOW() - INTERVAL '24 hours'
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
          ${'FCA Fine Alert: ' + newFines.length + ' new fines'}
        )
      `;

      // Update last notified timestamp
      await sql`
        UPDATE alert_subscriptions
        SET last_notified_at = NOW()
        WHERE id = ${subscription.id}
      `;

      console.log(`Sent alert to ${subscription.email} for ${newFines.length} fines`);
    } catch (error) {
      console.error(`Failed to process subscription ${subscription.id}:`, error);
    }
  }
}

async function processWatchlistAlerts(fines: Fine[]) {
  // Get active watchlist entries
  const watchlistEntries = await sql`
    SELECT id, email, firm_name, firm_name_normalized,
           notify_threshold, last_notified_at, unsubscribe_token
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

        // Check threshold if set
        if (entry.notify_threshold && fine.amount < entry.notify_threshold) {
          return false;
        }

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
        AND sent_at >= NOW() - INTERVAL '24 hours'
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

      console.log(`Sent watchlist alert to ${entry.email} for ${entry.firm_name}`);
    } catch (error) {
      console.error(`Failed to process watchlist entry ${entry.id}:`, error);
    }
  }
}

async function sendAlertEmail(subscription: AlertSubscription, fines: Fine[]) {
  const unsubscribeUrl = `${BASE_URL}/api/alerts/unsubscribe/${subscription.unsubscribe_token}`;

  const finesList = fines.map(fine => `
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin: 12px 0;">
      <div style="font-weight: 600; color: #1f2937;">${fine.firm_individual}</div>
      <div style="color: #0FA294; font-size: 1.25rem; font-weight: 700; margin: 8px 0;">
        £${fine.amount.toLocaleString('en-GB')}
      </div>
      <div style="color: #6b7280; font-size: 0.875rem;">
        ${fine.breach_type || 'Regulatory breach'} · ${new Date(fine.date_issued).toLocaleDateString('en-GB')}
      </div>
      ${fine.final_notice_url ? `
        <a href="${fine.final_notice_url}" style="display: inline-block; margin-top: 8px; color: #0FA294; text-decoration: none; font-size: 0.875rem;">
          View Final Notice →
        </a>
      ` : ''}
    </div>
  `).join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 20px; font-weight: bold; color: #0FA294; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 8px 0; }
    .subtitle { color: #6b7280; margin: 0 0 24px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 12px; }
    .footer a { color: #9ca3af; }
    .button { display: inline-block; background: #0FA294; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <h1>New FCA Fines Alert</h1>
      <p class="subtitle">${fines.length} new fine${fines.length !== 1 ? 's' : ''} matching your criteria</p>
      ${finesList}
      <a href="${BASE_URL}/dashboard" class="button">View Dashboard</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you subscribed to FCA fine alerts.</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe</a> · FCA Fines Dashboard by MEMA Consultants</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `New FCA Fines Alert

${fines.length} new fine${fines.length !== 1 ? 's' : ''} matching your criteria:

${fines.map(fine => `${fine.firm_individual} - £${fine.amount.toLocaleString('en-GB')}
${fine.breach_type || 'Regulatory breach'} · ${new Date(fine.date_issued).toLocaleDateString('en-GB')}
${fine.final_notice_url || ''}`).join('\n\n')}

View Dashboard: ${BASE_URL}/dashboard

Unsubscribe: ${unsubscribeUrl}`;

  await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [subscription.email] },
    Message: {
      Subject: { Data: `FCA Alert: ${fines.length} new fine${fines.length !== 1 ? 's' : ''} detected` },
      Body: {
        Html: { Data: htmlContent },
        Text: { Data: textContent },
      },
    },
  }));
}

async function sendWatchlistEmail(entry: WatchlistEntry, fines: Fine[]) {
  const unsubscribeUrl = `${BASE_URL}/api/watchlist/unsubscribe/${entry.unsubscribe_token}`;

  const finesList = fines.map(fine => `
    <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin: 12px 0; border-left: 4px solid #f59e0b;">
      <div style="color: #0FA294; font-size: 1.5rem; font-weight: 700; margin-bottom: 8px;">
        £${fine.amount.toLocaleString('en-GB')}
      </div>
      <div style="color: #6b7280; font-size: 0.875rem;">
        ${fine.breach_type || 'Regulatory breach'} · ${new Date(fine.date_issued).toLocaleDateString('en-GB')}
      </div>
      ${fine.final_notice_url ? `
        <a href="${fine.final_notice_url}" style="display: inline-block; margin-top: 8px; color: #0FA294; text-decoration: none; font-size: 0.875rem;">
          View Final Notice →
        </a>
      ` : ''}
    </div>
  `).join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 20px; font-weight: bold; color: #0FA294; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 8px 0; }
    .firm-badge { background: #dbeafe; color: #1e40af; padding: 8px 16px; border-radius: 8px; display: inline-block; font-weight: 600; margin: 16px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 12px; }
    .footer a { color: #9ca3af; }
    .button { display: inline-block; background: #0FA294; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <h1>Watchlist Alert</h1>
      <p>A firm you're watching has received a new FCA fine.</p>
      <div class="firm-badge">${entry.firm_name}</div>
      ${finesList}
      <a href="${BASE_URL}/dashboard" class="button">View Full Details</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you're watching "${entry.firm_name}".</p>
      <p><a href="${unsubscribeUrl}">Stop watching this firm</a> · FCA Fines Dashboard by MEMA Consultants</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const totalAmount = fines.reduce((sum, f) => sum + f.amount, 0);

  await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [entry.email] },
    Message: {
      Subject: { Data: `Watchlist Alert: ${entry.firm_name} fined £${totalAmount.toLocaleString('en-GB')}` },
      Body: {
        Html: { Data: htmlContent },
        Text: { Data: `Watchlist Alert: ${entry.firm_name}\n\nA firm you're watching has received a new FCA fine.\n\nFines:\n${fines.map(f => `£${f.amount.toLocaleString('en-GB')} - ${f.breach_type}`).join('\n')}\n\nView details: ${BASE_URL}/dashboard\n\nStop watching: ${unsubscribeUrl}` },
      },
    },
  }));
}

main().catch(console.error);
