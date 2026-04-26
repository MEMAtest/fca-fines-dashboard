/**
 * Seed Digest Subscribers
 *
 * Seeds the 5 MEMA client firms with placeholder emails.
 * Update with real addresses via admin API or direct DB update.
 *
 * Usage: npx tsx scripts/seed-digest-subscribers.ts
 */

import pg from 'pg';
import crypto from 'node:crypto';

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : undefined,
});

const MEMA_CLIENTS = [
  {
    email: 'contact@firstsentinelwealth.placeholder',
    firmName: 'First Sentinel Wealth',
    personaId: 'wealth_management',
    source: 'mema_client' as const,
  },
  {
    email: 'contact@treehill.placeholder',
    firmName: 'Treehill',
    personaId: 'investment_firm',
    source: 'mema_client' as const,
  },
  {
    email: 'contact@saible.placeholder',
    firmName: 'Saible',
    personaId: 'payments_fintech',
    source: 'mema_client' as const,
  },
  {
    email: 'contact@hri-investments.placeholder',
    firmName: 'HRI Investments',
    personaId: 'investment_firm',
    source: 'mema_client' as const,
  },
  {
    email: 'contact@rasaorigin.placeholder',
    firmName: 'Rasa Origin',
    personaId: 'consumer_credit',
    source: 'mema_client' as const,
  },
];

async function main() {
  console.log('Ensuring digest subscriber tables exist...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS digest_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      firm_name TEXT,
      persona_id TEXT NOT NULL,
      custom_sectors TEXT[] DEFAULT '{}',
      custom_keywords TEXT[] DEFAULT '{}',
      enabled BOOLEAN DEFAULT TRUE,
      source TEXT NOT NULL DEFAULT 'manual',
      unsubscribe_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(email, persona_id)
    );

    CREATE TABLE IF NOT EXISTS digest_send_history (
      id SERIAL PRIMARY KEY,
      persona_id TEXT NOT NULL,
      update_identifier TEXT NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(persona_id, update_identifier)
    );

    CREATE INDEX IF NOT EXISTS idx_digest_subscribers_persona ON digest_subscribers(persona_id) WHERE enabled = TRUE;
    CREATE INDEX IF NOT EXISTS idx_digest_subscribers_token ON digest_subscribers(unsubscribe_token);
    CREATE INDEX IF NOT EXISTS idx_digest_send_history_persona ON digest_send_history(persona_id, sent_at);
  `);

  console.log('Tables ready.');
  console.log('');
  console.log('Seeding MEMA client firms...');

  let added = 0;
  let updated = 0;

  for (const client of MEMA_CLIENTS) {
    const token = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO digest_subscribers (email, firm_name, persona_id, source, unsubscribe_token)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email, persona_id)
       DO UPDATE SET
         firm_name = EXCLUDED.firm_name,
         source = EXCLUDED.source,
         enabled = TRUE,
         updated_at = NOW()
       RETURNING (xmax = 0) AS is_insert`,
      [client.email, client.firmName, client.personaId, client.source, token],
    );

    if (result.rows[0]?.is_insert) {
      console.log(`  + Added: ${client.firmName} (${client.personaId})`);
      added++;
    } else {
      console.log(`  ~ Updated: ${client.firmName} (${client.personaId})`);
      updated++;
    }
  }

  console.log('');
  console.log(`Done: ${added} added, ${updated} updated`);
  console.log('');
  console.log('NOTE: These use placeholder emails. Update with real addresses:');
  console.log("  UPDATE digest_subscribers SET email = 'real@email.com' WHERE firm_name = 'First Sentinel Wealth';");

  await pool.end();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
