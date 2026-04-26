/**
 * Digest Subscriber Management
 *
 * Database methods for managing persona-targeted digest subscribers
 * and per-persona send history for deduplication.
 */

import { getSqlClient } from '../db.js';
import crypto from 'node:crypto';

const sql = getSqlClient();

export interface DigestSubscriber {
  id: number;
  email: string;
  firm_name: string | null;
  persona_id: string;
  custom_sectors: string[];
  custom_keywords: string[];
  enabled: boolean;
  source: 'mema_client' | 'prospect' | 'manual';
  unsubscribe_token: string;
  created_at: string;
  updated_at: string;
}

export interface DigestSendHistoryRow {
  persona_id: string;
  update_identifier: string;
  sent_at: string;
}

/**
 * Auto-create tables on first use. Safe to call multiple times.
 */
export async function ensureDigestSubscriberTables(): Promise<void> {
  await sql(`
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
  `, []);
}

export async function getSubscribersByPersona(personaId: string): Promise<DigestSubscriber[]> {
  const rows = await sql(
    `SELECT * FROM digest_subscribers
     WHERE persona_id = $1 AND enabled = TRUE
     ORDER BY created_at`,
    [personaId],
  );
  return rows as unknown as DigestSubscriber[];
}

export async function getAllActivePersonas(): Promise<Array<{ persona_id: string; subscriber_count: number }>> {
  const rows = await sql(
    `SELECT persona_id, COUNT(*)::int AS subscriber_count
     FROM digest_subscribers
     WHERE enabled = TRUE
     GROUP BY persona_id
     ORDER BY persona_id`,
    [],
  );
  return rows as unknown as Array<{ persona_id: string; subscriber_count: number }>;
}

export async function getAllSubscribers(personaFilter?: string): Promise<DigestSubscriber[]> {
  if (personaFilter) {
    const filtered = await sql(
      'SELECT * FROM digest_subscribers WHERE persona_id = $1 ORDER BY created_at',
      [personaFilter],
    );
    return filtered as unknown as DigestSubscriber[];
  }
  const all = await sql('SELECT * FROM digest_subscribers ORDER BY persona_id, created_at', []);
  return all as unknown as DigestSubscriber[];
}

export async function upsertSubscriber(params: {
  email: string;
  firmName?: string;
  personaId: string;
  source?: 'mema_client' | 'prospect' | 'manual';
  customSectors?: string[];
  customKeywords?: string[];
}): Promise<DigestSubscriber> {
  const token = crypto.randomUUID();
  const rows = await sql(
    `INSERT INTO digest_subscribers (email, firm_name, persona_id, source, custom_sectors, custom_keywords, unsubscribe_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email, persona_id)
     DO UPDATE SET
       firm_name = COALESCE(EXCLUDED.firm_name, digest_subscribers.firm_name),
       source = COALESCE(EXCLUDED.source, digest_subscribers.source),
       custom_sectors = CASE WHEN EXCLUDED.custom_sectors = '{}' THEN digest_subscribers.custom_sectors ELSE EXCLUDED.custom_sectors END,
       custom_keywords = CASE WHEN EXCLUDED.custom_keywords = '{}' THEN digest_subscribers.custom_keywords ELSE EXCLUDED.custom_keywords END,
       enabled = TRUE,
       updated_at = NOW()
     RETURNING *`,
    [
      params.email,
      params.firmName || null,
      params.personaId,
      params.source || 'manual',
      params.customSectors || [],
      params.customKeywords || [],
      token,
    ],
  );
  return rows[0] as unknown as DigestSubscriber;
}

export async function bulkAddSubscribers(subscribers: Array<{
  email: string;
  firmName?: string;
  personaId: string;
  source?: 'mema_client' | 'prospect' | 'manual';
}>): Promise<number> {
  let added = 0;
  for (const sub of subscribers) {
    try {
      await upsertSubscriber(sub);
      added++;
    } catch (error) {
      console.warn(`Failed to add subscriber ${sub.email}:`, error instanceof Error ? error.message : String(error));
    }
  }
  return added;
}

export async function disableSubscriber(email: string): Promise<boolean> {
  const rows = await sql(
    `UPDATE digest_subscribers SET enabled = FALSE, updated_at = NOW()
     WHERE email = $1 AND enabled = TRUE
     RETURNING id`,
    [email],
  );
  return rows.length > 0;
}

export async function disableByToken(unsubscribeToken: string): Promise<{ email: string; persona_id: string } | null> {
  const rows = await sql(
    `UPDATE digest_subscribers SET enabled = FALSE, updated_at = NOW()
     WHERE unsubscribe_token = $1 AND enabled = TRUE
     RETURNING email, persona_id`,
    [unsubscribeToken],
  );
  return rows.length > 0 ? rows[0] as { email: string; persona_id: string } : null;
}

export async function getPersonaSendHistory(personaId: string, windowDays: number): Promise<Set<string>> {
  const rows = await sql(
    `SELECT update_identifier FROM digest_send_history
     WHERE persona_id = $1 AND sent_at > NOW() - INTERVAL '1 day' * $2`,
    [personaId, windowDays],
  );
  return new Set(rows.map(r => r.update_identifier as string));
}

export async function markPersonaItemsSent(personaId: string, identifiers: string[]): Promise<void> {
  if (identifiers.length === 0) return;

  for (const id of identifiers) {
    try {
      await sql(
        `INSERT INTO digest_send_history (persona_id, update_identifier)
         VALUES ($1, $2)
         ON CONFLICT (persona_id, update_identifier) DO NOTHING`,
        [personaId, id],
      );
    } catch {
      // Ignore duplicate inserts
    }
  }
}

export async function getSubscriberByToken(token: string): Promise<DigestSubscriber | null> {
  const rows = await sql(
    'SELECT * FROM digest_subscribers WHERE unsubscribe_token = $1',
    [token],
  );
  return rows.length > 0 ? rows[0] as unknown as DigestSubscriber : null;
}
