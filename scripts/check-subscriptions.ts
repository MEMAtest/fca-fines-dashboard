/**
 * Check Subscription System Status
 * Quick diagnostic script to see current subscription state
 */

import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=') ? 'require' : undefined
});

async function main() {
  console.log('🔍 Checking subscription system status...\n');

  try {
    // Alert subscriptions
    const alerts = await sql`
      SELECT
        status,
        email_verified,
        COUNT(*) as count
      FROM alert_subscriptions
      GROUP BY status, email_verified
      ORDER BY status, email_verified
    `;

    console.log('📬 Alert Subscriptions:');
    console.table(alerts);

    // Recent subscriptions
    const recent = await sql`
      SELECT
        email,
        status,
        email_verified,
        frequency,
        created_at,
        verification_expires_at,
        CASE
          WHEN verification_expires_at < NOW() THEN 'EXPIRED'
          ELSE 'VALID'
        END as token_status
      FROM alert_subscriptions
      ORDER BY created_at DESC
      LIMIT 10
    `;

    console.log('\n📋 Recent Subscriptions (last 10):');
    console.table(recent.map(r => ({
      email: r.email,
      status: r.status,
      verified: r.email_verified,
      frequency: r.frequency,
      created: r.created_at?.toISOString().split('T')[0],
      token: r.token_status
    })));

    // Notification log
    const logs = await sql`
      SELECT
        notification_type,
        COUNT(*) as count,
        COUNT(DISTINCT email) as unique_emails
      FROM notification_log
      GROUP BY notification_type
      ORDER BY notification_type
    `;

    console.log('\n📨 Notification Log:');
    console.table(logs);

    // Recent notifications
    const recentNotifications = await sql`
      SELECT
        email,
        notification_type,
        created_at,
        status
      FROM notification_log
      ORDER BY created_at DESC
      LIMIT 5
    `;

    console.log('\n📮 Recent Notifications (last 5):');
    console.table(recentNotifications.map(n => ({
      email: n.email,
      type: n.notification_type,
      sent: n.created_at?.toISOString().split('T')[0],
      status: n.status
    })));

    // Check for expired pending subscriptions
    const expired = await sql`
      SELECT COUNT(*) as count
      FROM alert_subscriptions
      WHERE status = 'pending'
      AND verification_expires_at < NOW()
    `;

    console.log(`\n⚠️  Expired pending subscriptions: ${expired[0].count}`);

    await sql.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await sql.end();
    process.exit(1);
  }
}

main();
