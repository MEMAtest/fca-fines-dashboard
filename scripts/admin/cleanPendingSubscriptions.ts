/**
 * Clean Up Expired Pending Subscriptions
 *
 * This script removes pending subscriptions that have expired verification tokens.
 * Focuses on test subscriptions (@memaconsultants.com) with expired tokens from Phase 2.
 */

import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL?.trim() || '', {
  ssl: process.env.DATABASE_URL?.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : false
});

interface PendingSubscription {
  id: string;
  email: string;
  created_at: string;
  verification_expires_at: string;
  min_amount: number | null;
  frequency: string;
}

async function main() {
  console.log('🧹 Cleaning up expired pending subscriptions...\n');

  try {
    // Find all pending subscriptions with expired tokens
    const expiredPending = await sql`
      SELECT
        id,
        email,
        created_at,
        verification_expires_at,
        min_amount,
        frequency
      FROM alert_subscriptions
      WHERE status = 'pending'
        AND email_verified = FALSE
        AND verification_expires_at < NOW()
      ORDER BY created_at DESC
    ` as PendingSubscription[];

    console.log(`Found ${expiredPending.length} expired pending subscriptions:\n`);

    if (expiredPending.length === 0) {
      console.log('✅ No expired subscriptions to clean up');
      await sql.end();
      return;
    }

    // Show what will be deleted
    console.log('📋 Expired Subscriptions:');
    expiredPending.forEach((sub, i) => {
      const createdDate = new Date(sub.created_at).toLocaleDateString('en-GB');
      const expiredDate = new Date(sub.verification_expires_at).toLocaleDateString('en-GB');
      const isTestEmail = sub.email.includes('@memaconsultants.com');

      console.log(`   ${i + 1}. ${sub.email}${isTestEmail ? ' (TEST)' : ''}`);
      console.log(`      Created: ${createdDate}, Expired: ${expiredDate}`);
      console.log(`      Criteria: ${sub.min_amount ? `£${(sub.min_amount / 1000000).toFixed(1)}m+` : 'All fines'}, ${sub.frequency}`);
    });

    // Ask for confirmation (in production, add interactive prompt)
    const testEmailCount = expiredPending.filter(s => s.email.includes('@memaconsultants.com')).length;
    const externalEmailCount = expiredPending.length - testEmailCount;

    console.log(`\n📊 Summary:`);
    console.log(`   Test emails (@memaconsultants.com): ${testEmailCount}`);
    console.log(`   External emails: ${externalEmailCount}`);

    // Dry run mode check
    const dryRun = process.argv.includes('--dry-run');

    if (dryRun) {
      console.log('\n🔍 DRY RUN - No subscriptions will be deleted');
      await sql.end();
      return;
    }

    // Delete expired subscriptions
    console.log('\n🗑️  Deleting expired subscriptions...');

    const ids = expiredPending.map(s => s.id);
    const deleted = await sql`
      DELETE FROM alert_subscriptions
      WHERE id = ANY(${ids})
      RETURNING id, email
    `;

    console.log(`✅ Deleted ${deleted.length} expired subscriptions`);

    // Also clean up expired digest subscriptions
    const expiredDigests = await sql`
      DELETE FROM digest_subscriptions
      WHERE status = 'pending'
        AND email_verified = FALSE
        AND verification_expires_at < NOW()
      RETURNING id, email
    `;

    if (expiredDigests.length > 0) {
      console.log(`✅ Also deleted ${expiredDigests.length} expired digest subscriptions`);
    }

    // Also clean up expired watchlist entries
    const expiredWatchlist = await sql`
      DELETE FROM firm_watchlist
      WHERE status = 'pending'
        AND email_verified = FALSE
        AND verification_expires_at < NOW()
      RETURNING id, email, firm_name
    `;

    if (expiredWatchlist.length > 0) {
      console.log(`✅ Also deleted ${expiredWatchlist.length} expired watchlist entries`);
    }

    // Show final state
    const remainingPending = await sql`
      SELECT COUNT(*) as count FROM alert_subscriptions
      WHERE status = 'pending'
    `;

    const activeSubscriptions = await sql`
      SELECT COUNT(*) as count FROM alert_subscriptions
      WHERE status = 'active'
    `;

    console.log(`\n📈 Final State:`);
    console.log(`   Active subscriptions: ${activeSubscriptions[0].count}`);
    console.log(`   Remaining pending: ${remainingPending[0].count}`);

    console.log('\n✅ Cleanup complete!');

    await sql.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    await sql.end();
    process.exit(1);
  }
}

// Run cleanup
console.log('Usage: npx tsx scripts/admin/cleanPendingSubscriptions.ts [--dry-run]\n');
main();
