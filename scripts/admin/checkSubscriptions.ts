#!/usr/bin/env tsx
/**
 * Check Subscription System Status
 *
 * Queries database to show current subscription statistics
 */

import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL?.trim() || '';
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('sslmode=') ? { rejectUnauthorized: false } : false
});

async function main() {
  console.log('📊 FCA Fines Subscription System Status\n');

  try {
    // Alert subscriptions by status
    console.log('=== Alert Subscriptions ===');
    const alertsByStatus = await sql`
      SELECT status, email_verified, COUNT(*) as count
      FROM alert_subscriptions
      GROUP BY status, email_verified
      ORDER BY status, email_verified
    `;
    console.table(alertsByStatus);

    // Total alert subscriptions
    const totalAlerts = await sql`SELECT COUNT(*) as count FROM alert_subscriptions`;
    console.log(`Total alert subscriptions: ${totalAlerts[0].count}\n`);

    // Watchlist subscriptions
    console.log('=== Watchlist Subscriptions ===');
    const watchlistCount = await sql`SELECT COUNT(*) as count FROM firm_watchlist`;
    console.log(`Total watchlist entries: ${watchlistCount[0].count}\n`);

    // Digest subscriptions
    console.log('=== Digest Subscriptions ===');
    const digestsByFreq = await sql`
      SELECT frequency, status, COUNT(*) as count
      FROM digest_subscriptions
      GROUP BY frequency, status
      ORDER BY frequency, status
    `;
    if (digestsByFreq.length > 0) {
      console.table(digestsByFreq);
    } else {
      console.log('No digest subscriptions\n');
    }

    // Notification log summary
    console.log('=== Notification Log (Last 30 days) ===');
    const notificationStats = await sql`
      SELECT
        notification_type,
        COUNT(*) as count,
        MAX(created_at) as last_sent
      FROM notification_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY notification_type
      ORDER BY notification_type
    `;
    if (notificationStats.length > 0) {
      console.table(notificationStats);
    } else {
      console.log('No notifications sent in last 30 days\n');
    }

    // All notification log
    const allNotifications = await sql`
      SELECT notification_type, COUNT(*) as total
      FROM notification_log
      GROUP BY notification_type
      ORDER BY notification_type
    `;
    console.log('\n=== All-Time Notification Stats ===');
    console.table(allNotifications);

    // Recent alert subscriptions (with details)
    console.log('\n=== Recent Alert Subscriptions ===');
    const recentAlerts = await sql`
      SELECT
        email,
        status,
        email_verified,
        frequency,
        created_at::date as subscribed,
        verification_expires_at::timestamp as expires
      FROM alert_subscriptions
      ORDER BY created_at DESC
      LIMIT 10
    `;
    console.table(recentAlerts);

    // Expired verifications
    const expiredCount = await sql`
      SELECT COUNT(*) as count
      FROM alert_subscriptions
      WHERE status = 'pending'
      AND email_verified = FALSE
      AND verification_expires_at < NOW()
    `;
    console.log(`\n⚠️  Expired pending verifications: ${expiredCount[0].count}`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
