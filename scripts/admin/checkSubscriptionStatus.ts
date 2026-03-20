import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

async function main() {
  console.log('📊 Subscription System Status\n');

  try {
    // Alert subscriptions
    const alertStats = await sql`
      SELECT
        status,
        email_verified,
        COUNT(*) as count
      FROM alert_subscriptions
      GROUP BY status, email_verified
      ORDER BY status, email_verified
    `;

    console.log('🔔 Alert Subscriptions:');
    alertStats.forEach(s => {
      console.log(`   ${s.status} (verified: ${s.email_verified}): ${s.count}`);
    });

    // List all subscriptions
    const allAlerts = await sql`
      SELECT
        email,
        status,
        email_verified,
        created_at,
        verification_expires_at,
        min_amount
      FROM alert_subscriptions
      ORDER BY created_at DESC
    `;

    console.log(`\n📋 All Alert Subscriptions (${allAlerts.length} total):`);
    allAlerts.forEach((s, i) => {
      const isTest = s.email.includes('@memaconsultants.com');
      const expired = s.verification_expires_at && new Date(s.verification_expires_at) < new Date();
      const createdDate = new Date(s.created_at).toLocaleDateString('en-GB');

      console.log(`   ${i + 1}. ${s.email}${isTest ? ' (TEST)' : ''}`);
      console.log(`      Status: ${s.status}, Verified: ${s.email_verified}${expired ? ' (EXPIRED TOKEN)' : ''}`);
      console.log(`      Created: ${createdDate}, Min Amount: ${s.min_amount ? `£${s.min_amount.toLocaleString()}` : 'None'}`);
    });

    // Digest subscriptions
    const digestCount = await sql`
      SELECT COUNT(*) as count FROM digest_subscriptions
    `;

    console.log(`\n📧 Digest Subscriptions: ${digestCount[0].count}`);

    // Watchlist
    const watchlistCount = await sql`
      SELECT COUNT(*) as count FROM firm_watchlist
    `;

    console.log(`👁️  Watchlist Entries: ${watchlistCount[0].count}`);

    // Notification log
    const notificationStats = await sql`
      SELECT
        notification_type,
        COUNT(*) as count
      FROM notification_log
      GROUP BY notification_type
      ORDER BY notification_type
    `;

    console.log(`\n📮 Notification Log:`);
    notificationStats.forEach(s => {
      console.log(`   ${s.notification_type}: ${s.count}`);
    });

    // Check for GitHub Actions runs (from notification_log)
    const recentNotifications = await sql`
      SELECT
        notification_type,
        created_at,
        subject
      FROM notification_log
      ORDER BY created_at DESC
      LIMIT 10
    `;

    console.log(`\n🕐 Recent Notifications (last 10):`);
    if (recentNotifications.length === 0) {
      console.log('   (None)');
    } else {
      recentNotifications.forEach((n, i) => {
        const date = new Date(n.created_at).toLocaleString('en-GB');
        console.log(`   ${i + 1}. [${n.notification_type}] ${date}`);
        console.log(`      ${n.subject}`);
      });
    }

    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error checking status:', error);
    await sql.end();
    process.exit(1);
  }
}

main();
