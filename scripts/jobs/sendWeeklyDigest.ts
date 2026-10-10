/**
 * Send Weekly/Monthly Digest
 *
 * This script runs on schedule to send digest emails:
 * - Weekly: Every Monday at 9am
 * - Monthly: 1st of each month at 9am
 */

import postgres from 'postgres';
import { periodDigestFragment } from '../../server/services/emailTemplates/alerts.js';
import { resolveConnectionString } from '../lib/dbTarget.js';

const sql = postgres(resolveConnectionString()?.trim() || '', {
  ssl: resolveConnectionString()?.includes('sslmode=') ? 'require' : undefined
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
    const days = frequency === 'weekly' ? 7 : 30;

    // Get enforcement actions from the period
    const fines = await sql`
      SELECT
        id,
        regulator,
        regulator_full_name,
        firm_individual,
        amount_gbp AS amount,
        date_issued,
        breach_type,
        notice_url AS final_notice_url
      FROM all_regulatory_fines_canonical
      WHERE date_issued >= NOW() - make_interval(days => ${days})
      ORDER BY amount_gbp DESC NULLS LAST, date_issued DESC
    ` as Fine[];

    console.log(`Found ${fines.length} enforcement actions in the last ${days} days`);

    if (fines.length === 0) {
      console.log('No enforcement actions to report in digest');
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
    const monetaryFines = fines.filter((fine) => fine.amount !== null);
    const totalAmount = monetaryFines.reduce((sum, f) => sum + (f.amount ?? 0), 0);
    const avgAmount = monetaryFines.length ? totalAmount / monetaryFines.length : 0;
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
            ${`${frequency.charAt(0).toUpperCase() + frequency.slice(1)} RegActions Digest`}
          )
        `;

        console.log(`Queued ${frequency} digest for ${subscription.email}`);
      } catch (error) {
        console.error(`Failed to send digest to ${subscription.email}:`, error);
      }
    }

    console.log('Digest processing completed');
    await sql.end();
  } catch (error) {
    console.error('Digest processing failed:', error);
    await sql.end();
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

  const monetaryActions = allFines.filter((fine) => fine.amount !== null).length;
  const fragment = periodDigestFragment({
    frequency: frequency as 'weekly' | 'monthly',
    totalActions: allFines.length,
    totalAmount,
    monetaryActions,
    top: topFines.map((f) => ({ firm: f.firm_individual, regulator: f.regulator, amount: f.amount, breachType: f.breach_type })),
    unsubscribeUrl,
  });
  const htmlContent = fragment.html;
  const textContent = `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} RegActions Digest\n\n${periodLabel}'s Summary\n\n${fragment.text}`;

  await sql`
    INSERT INTO public.email_digest_outbox (
      recipient, audience, cadence, category, fingerprint, subject,
      text_body, html_body, eligible_local_date
    ) VALUES (
      ${subscription.email.toLowerCase()}, 'customer', ${frequency}, 'enforcement-digest',
      ${`${frequency}:${allFines.map((fine) => fine.id).sort().join(':')}`},
      ${`${periodLabel}: ${allFines.length} enforcement actions, £${(totalAmount / 1_000_000).toFixed(1)}m monetary total`},
      ${textContent}, ${htmlContent},
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
