#!/usr/bin/env tsx
/**
 * Clean Expired Pending Subscriptions
 *
 * Deletes alert, watchlist, and digest subscriptions that:
 * - Have status = 'pending'
 * - Have email_verified = FALSE
 * - Have verification_expires_at < NOW()
 */

import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL?.trim() || '';
const sql = postgres(dbUrl, {
  ssl: dbUrl.includes('sslmode=') ? { rejectUnauthorized: false } : false
});

async function main() {
  console.log('🧹 Cleaning expired pending subscriptions...\n');

  try {
    // Check what will be deleted
    console.log('=== Expired Alert Subscriptions ===');
    const expiredAlerts = await sql`
      SELECT email, created_at::date, verification_expires_at::date
      FROM alert_subscriptions
      WHERE status = 'pending'
      AND email_verified = FALSE
      AND verification_expires_at < NOW()
      ORDER BY created_at DESC
    `;
    console.table(expiredAlerts);
    console.log(`Total expired alerts: ${expiredAlerts.length}\n`);

    console.log('=== Expired Watchlist Entries ===');
    const expiredWatchlist = await sql`
      SELECT email, firm_name, created_at::date
      FROM firm_watchlist
      WHERE status = 'pending'
      AND email_verified = FALSE
      AND verification_expires_at < NOW()
      ORDER BY created_at DESC
    `;
    console.table(expiredWatchlist);
    console.log(`Total expired watchlist entries: ${expiredWatchlist.length}\n`);

    console.log('=== Expired Digest Subscriptions ===');
    const expiredDigests = await sql`
      SELECT email, frequency, created_at::date
      FROM digest_subscriptions
      WHERE status = 'pending'
      AND email_verified = FALSE
      AND verification_expires_at < NOW()
      ORDER BY created_at DESC
    `;
    console.table(expiredDigests);
    console.log(`Total expired digests: ${expiredDigests.length}\n`);

    const totalExpired = expiredAlerts.length + expiredWatchlist.length + expiredDigests.length;

    if (totalExpired === 0) {
      console.log('✅ No expired subscriptions to clean up');
      return;
    }

    // Confirmation
    console.log(`\n⚠️  About to delete ${totalExpired} expired subscriptions`);
    console.log('Continue? (Ctrl+C to cancel, Enter to proceed)');

    // Wait for user confirmation (simulated - in production, this would be interactive)
    // For now, just proceed automatically in script mode
    const autoConfirm = process.env.AUTO_CONFIRM === 'true' || process.argv.includes('--confirm');

    if (!autoConfirm) {
      console.log('\n⚠️  Use --confirm flag or AUTO_CONFIRM=true env var to proceed');
      console.log('Example: npx tsx scripts/admin/cleanExpiredSubscriptions.ts --confirm');
      return;
    }

    // Delete expired subscriptions
    console.log('\n🗑️  Deleting expired subscriptions...');

    const deletedAlerts = await sql`
      DELETE FROM alert_subscriptions
      WHERE status = 'pending'
      AND email_verified = FALSE
      AND verification_expires_at < NOW()
      RETURNING id
    `;

    const deletedWatchlist = await sql`
      DELETE FROM firm_watchlist
      WHERE status = 'pending'
      AND email_verified = FALSE
      AND verification_expires_at < NOW()
      RETURNING id
    `;

    const deletedDigests = await sql`
      DELETE FROM digest_subscriptions
      WHERE status = 'pending'
      AND email_verified = FALSE
      AND verification_expires_at < NOW()
      RETURNING id
    `;

    console.log(`\n✅ Cleanup complete:`);
    console.log(`  - Alert subscriptions deleted: ${deletedAlerts.length}`);
    console.log(`  - Watchlist entries deleted: ${deletedWatchlist.length}`);
    console.log(`  - Digest subscriptions deleted: ${deletedDigests.length}`);
    console.log(`  - Total deleted: ${deletedAlerts.length + deletedWatchlist.length + deletedDigests.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
