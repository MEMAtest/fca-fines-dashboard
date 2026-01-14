import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.NEON_FCA_FINES_URL!);

async function runMigration() {
  console.log('🚀 Running notification tables migration...\n');

  // Table 1: Alert Subscriptions
  console.log('Creating alert_subscriptions table...');
  await sql`
    CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      email_verified BOOLEAN DEFAULT FALSE,
      verification_token TEXT UNIQUE,
      verification_expires_at TIMESTAMPTZ,
      min_amount NUMERIC(18,2),
      breach_types TEXT[],
      frequency TEXT DEFAULT 'immediate' CHECK (frequency IN ('immediate', 'daily', 'weekly')),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'unsubscribed')),
      unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
      last_notified_at TIMESTAMPTZ,
      last_notified_fine_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log('✅ alert_subscriptions created\n');

  // Table 2: Firm Watchlist
  console.log('Creating firm_watchlist table...');
  await sql`
    CREATE TABLE IF NOT EXISTS firm_watchlist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      email_verified BOOLEAN DEFAULT FALSE,
      verification_token TEXT UNIQUE,
      verification_expires_at TIMESTAMPTZ,
      firm_name TEXT NOT NULL,
      firm_name_normalized TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'unsubscribed')),
      unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
      last_notified_at TIMESTAMPTZ,
      last_notified_fine_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(email, firm_name_normalized)
    )
  `;
  console.log('✅ firm_watchlist created\n');

  // Table 3: Digest Subscriptions
  console.log('Creating digest_subscriptions table...');
  await sql`
    CREATE TABLE IF NOT EXISTS digest_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      email_verified BOOLEAN DEFAULT FALSE,
      verification_token TEXT UNIQUE,
      verification_expires_at TIMESTAMPTZ,
      frequency TEXT DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'monthly')),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'unsubscribed')),
      unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
      last_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log('✅ digest_subscriptions created\n');

  // Table 4: Notification Log
  console.log('Creating notification_log table...');
  await sql`
    CREATE TABLE IF NOT EXISTS notification_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      notification_type TEXT NOT NULL CHECK (notification_type IN ('alert', 'watchlist', 'digest', 'verification')),
      subject TEXT,
      fine_ids UUID[],
      status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
      ses_message_id TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log('✅ notification_log created\n');

  // Create indexes
  console.log('Creating indexes...');

  // Alert subscription indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_alert_subs_email ON alert_subscriptions(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_alert_subs_status ON alert_subscriptions(status)`;

  // Watchlist indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_watchlist_email ON firm_watchlist(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_watchlist_firm ON firm_watchlist(firm_name_normalized)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_watchlist_status ON firm_watchlist(status)`;

  // Digest indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_digest_email ON digest_subscriptions(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_digest_status ON digest_subscriptions(status)`;

  // Notification log indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_notif_log_email ON notification_log(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notif_log_type ON notification_log(notification_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notif_log_created ON notification_log(created_at DESC)`;

  console.log('✅ All indexes created\n');

  // Verify tables
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('alert_subscriptions', 'firm_watchlist', 'digest_subscriptions', 'notification_log')
    ORDER BY table_name
  `;

  console.log('📊 Verification - Tables created:');
  tables.forEach(t => console.log(`   - ${t.table_name}`));
  console.log('\n🎉 Migration complete!');
}

runMigration().catch(console.error);
