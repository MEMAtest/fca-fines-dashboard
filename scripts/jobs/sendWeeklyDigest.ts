/**
 * Send Weekly/Monthly Digest
 *
 * This script runs on schedule to send digest emails:
 * - Weekly: Every Monday at 9am
 * - Monthly: 1st of each month at 9am
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
  final_notice_url: string;
}

interface DigestSubscription {
  id: string;
  email: string;
  frequency: string;
  last_sent_at: string | null;
  unsubscribe_token: string;
}

async function main() {
  const frequency = process.argv[2] || 'weekly';

  if (!['weekly', 'monthly'].includes(frequency)) {
    console.error('Usage: sendWeeklyDigest.ts [weekly|monthly]');
    process.exit(1);
  }

  console.log(`Starting ${frequency} digest processing...`);

  try {
    // Get the date range based on frequency
    const interval = frequency === 'weekly' ? '7 days' : '30 days';

    // Get fines from the period
    const fines = await sql`
      SELECT id, firm_individual, amount, date_issued, breach_type, final_notice_url
      FROM fca_fines
      WHERE date_issued >= NOW() - INTERVAL '${interval}'
      ORDER BY amount DESC
    ` as Fine[];

    console.log(`Found ${fines.length} fines in the last ${interval}`);

    if (fines.length === 0) {
      console.log('No fines to report in digest');
      return;
    }

    // Get active digest subscriptions
    const subscriptions = await sql`
      SELECT id, email, frequency, last_sent_at, unsubscribe_token
      FROM digest_subscriptions
      WHERE status = 'active'
      AND email_verified = TRUE
      AND frequency = ${frequency}
    ` as DigestSubscription[];

    console.log(`Processing ${subscriptions.length} ${frequency} digest subscriptions`);

    // Calculate summary stats
    const totalAmount = fines.reduce((sum, f) => sum + f.amount, 0);
    const avgAmount = fines.length ? totalAmount / fines.length : 0;
    const topFines = fines.slice(0, 5);

    for (const subscription of subscriptions) {
      try {
        await sendDigestEmail(subscription, fines, topFines, totalAmount, avgAmount, frequency);

        // Update last sent timestamp
        await sql`
          UPDATE digest_subscriptions
          SET last_sent_at = NOW()
          WHERE id = ${subscription.id}
        `;

        // Log notification
        await sql`
          INSERT INTO notification_log (email, notification_type, fine_ids, subject)
          VALUES (
            ${subscription.email},
            'digest',
            ${fines.slice(0, 10).map(f => f.id)},
            ${`${frequency.charAt(0).toUpperCase() + frequency.slice(1)} FCA Fines Digest`}
          )
        `;

        console.log(`Sent ${frequency} digest to ${subscription.email}`);
      } catch (error) {
        console.error(`Failed to send digest to ${subscription.email}:`, error);
      }
    }

    console.log('Digest processing completed');
  } catch (error) {
    console.error('Digest processing failed:', error);
    process.exit(1);
  }
}

async function sendDigestEmail(
  subscription: DigestSubscription,
  allFines: Fine[],
  topFines: Fine[],
  totalAmount: number,
  avgAmount: number,
  frequency: string
) {
  const unsubscribeUrl = `${BASE_URL}/api/digest/unsubscribe/${subscription.unsubscribe_token}`;
  const periodLabel = frequency === 'weekly' ? 'This Week' : 'This Month';

  const topFinesList = topFines.map((fine, index) => `
    <tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
        <span style="display: inline-block; width: 24px; height: 24px; background: ${index === 0 ? '#0FA294' : '#e5e7eb'}; color: ${index === 0 ? 'white' : '#6b7280'}; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; margin-right: 12px;">${index + 1}</span>
        ${fine.firm_individual}
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #0FA294;">
        £${fine.amount.toLocaleString('en-GB')}
      </td>
    </tr>
  `).join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 16px; }
    .logo { font-size: 20px; font-weight: bold; color: #0FA294; margin-bottom: 8px; }
    .period { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 24px 0; }
    .stats-grid { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat-box { flex: 1; background: linear-gradient(135deg, rgba(15, 162, 148, 0.1), rgba(99, 102, 241, 0.1)); border-radius: 12px; padding: 16px; text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #0FA294; }
    .stat-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
    .table { width: 100%; border-collapse: collapse; }
    .table th { text-align: left; padding: 12px 16px; background: #f9fafb; font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 12px; }
    .footer a { color: #9ca3af; }
    .button { display: inline-block; background: #0FA294; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <div class="period">${periodLabel}'s Summary</div>
      <h1>${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Digest</h1>

      <div style="display: flex; gap: 16px; margin-bottom: 24px;">
        <div style="flex: 1; background: linear-gradient(135deg, rgba(15, 162, 148, 0.1), rgba(99, 102, 241, 0.1)); border-radius: 12px; padding: 16px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #0FA294;">${allFines.length}</div>
          <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Fines</div>
        </div>
        <div style="flex: 1; background: linear-gradient(135deg, rgba(15, 162, 148, 0.1), rgba(99, 102, 241, 0.1)); border-radius: 12px; padding: 16px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #0FA294;">£${(totalAmount / 1_000_000).toFixed(1)}m</div>
          <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Total</div>
        </div>
        <div style="flex: 1; background: linear-gradient(135deg, rgba(15, 162, 148, 0.1), rgba(99, 102, 241, 0.1)); border-radius: 12px; padding: 16px; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #0FA294;">£${(avgAmount / 1_000_000).toFixed(1)}m</div>
          <div style="font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Average</div>
        </div>
      </div>

      <h3 style="margin: 0 0 16px 0; color: #374151;">Top 5 Fines</h3>
      <table class="table">
        <thead>
          <tr>
            <th>Firm</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${topFinesList}
        </tbody>
      </table>

      <div style="text-align: center; margin-top: 24px;">
        <a href="${BASE_URL}/dashboard" class="button">View Full Dashboard</a>
      </div>
    </div>

    <div class="footer">
      <p>You're subscribed to the ${frequency} FCA Fines Digest.</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe</a> · FCA Fines Dashboard by MEMA Consultants</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} FCA Fines Digest

${periodLabel}'s Summary:
- ${allFines.length} fines issued
- £${(totalAmount / 1_000_000).toFixed(1)}m total
- £${(avgAmount / 1_000_000).toFixed(1)}m average

Top 5 Fines:
${topFines.map((f, i) => `${i + 1}. ${f.firm_individual} - £${f.amount.toLocaleString('en-GB')}`).join('\n')}

View full dashboard: ${BASE_URL}/dashboard

Unsubscribe: ${unsubscribeUrl}`;

  await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [subscription.email] },
    Message: {
      Subject: { Data: `${periodLabel}: ${allFines.length} FCA Fines, £${(totalAmount / 1_000_000).toFixed(1)}m Total` },
      Body: {
        Html: { Data: htmlContent },
        Text: { Data: textContent },
      },
    },
  }));
}

main().catch(console.error);
