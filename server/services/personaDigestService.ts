/**
 * Persona Digest Service
 *
 * Builds and sends persona-targeted regulatory digest emails.
 * Each persona type gets one digest build, sent to all its subscribers.
 * Per-persona dedup ensures subscribers don't get duplicate items.
 */

import { getSqlClient } from '../db.js';
import { getPersona, buildFirmProfileFromPersona, type FirmPersona } from './firmPersonas.js';
import {
  ensureDigestSubscriberTables,
  getAllActivePersonas,
  getSubscribersByPersona,
  getPersonaSendHistory,
  markPersonaItemsSent,
} from './digestSubscribers.js';
import { personaDigestEmail, type DigestBriefingSummary, type DigestItem } from './personaDigestEmail.js';
import { scoreAndRankRows, type EnforcementRow } from './personaScoring.js';
import { generateEnforcementBriefing } from './enforcementBriefingAgent.js';
import { sendEmail } from './email.js';

const sql = getSqlClient();

const DEDUP_WINDOW_DAYS = 45;

interface PersonaDigestResult {
  personaId: string;
  personaName: string;
  subscriberCount: number;
  itemCount: number;
  sent: number;
  failed: number;
  hasPdf: boolean;
}

interface SendAllResult {
  results: PersonaDigestResult[];
  totalSent: number;
  totalFailed: number;
  timestamp: string;
}

export async function loadRecentEnforcementRows(): Promise<EnforcementRow[]> {
  // Canonical evidence view. `currency` is the currency the regulator published in;
  // amount_gbp is the sterling equivalent used for ranking and display.
  const rows = await sql(`
    SELECT
      firm_individual AS firm_name,
      regulator,
      date_issued,
      amount_gbp,
      amount_original,
      currency,
      breach_type,
      summary,
      source_url,
      notice_url,
      firm_category,
      canonical_case_id AS content_hash
    FROM (
      -- Rank within each regulator first so a high-volume register (BCB files
      -- 50-170 decisions a month) cannot crowd every other regulator out of the
      -- row cap.
      SELECT *, ROW_NUMBER() OVER (PARTITION BY regulator ORDER BY date_issued DESC) AS regulator_rank
      FROM all_regulatory_fines_canonical
      WHERE date_issued > NOW() - INTERVAL '30 days'
    ) AS recent
    WHERE regulator_rank <= 25
    ORDER BY date_issued DESC
    LIMIT 400
  `, []);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return rows.map((row) => ({
    firm_name: String(row.firm_name ?? ''),
    regulator: String(row.regulator ?? ''),
    date_issued: String(row.date_issued instanceof Date ? row.date_issued.toISOString() : row.date_issued),
    amount: num(row.amount_gbp),
    amount_gbp: num(row.amount_gbp),
    amount_original: num(row.amount_original),
    currency: String(row.currency ?? 'GBP').toUpperCase(),
    breach_type: String(row.breach_type ?? ''),
    summary: String(row.summary ?? ''),
    source_url: (row.source_url as string) || null,
    notice_url: (row.notice_url as string) || null,
    firm_category: String(row.firm_category ?? ''),
    content_hash: String(row.content_hash ?? ''),
  }));
}

/**
 * Build a persona-specific digest payload from recent enforcement/regulatory data.
 * Ranking, sector gating, English summaries and link choice live in personaScoring.
 */
async function buildPersonaDigest(persona: FirmPersona): Promise<DigestItem[]> {
  const profile = buildFirmProfileFromPersona(persona);
  const rows = await loadRecentEnforcementRows();
  return scoreAndRankRows(rows, profile, { minScore: 10, maxPerAuthority: 10, maxTotal: 20 });
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function buildWeeklyEnforcementBriefing(personaId: string): Promise<DigestBriefingSummary | null> {
  try {
    const result = await generateEnforcementBriefing({
      personaId,
      dateFrom: daysAgoIso(7),
      dateTo: new Date().toISOString().slice(0, 10),
      currency: 'GBP',
      limit: 30,
    });

    if (result.stats.totalActions === 0) return null;

    const dateTo = new Date().toISOString().slice(0, 10);
    return {
      scope: { totalActions: result.stats.totalActions, dateFrom: daysAgoIso(7), dateTo },
      executiveSummary: result.briefing.executiveSummary,
      keyThemes: result.briefing.keyThemes.slice(0, 3).map((theme) => ({
        title: theme.title,
        narrative: theme.narrative,
        implication: theme.implication,
      })),
      confidence: result.briefing.confidence,
      fallbackUsed: result.fallbackUsed,
    };
  } catch (error) {
    console.warn(`Weekly enforcement briefing failed for ${personaId}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Apply per-persona dedup — remove items already sent to this persona.
 */
async function deduplicateForPersona(
  personaId: string,
  items: DigestItem[],
  identifiers: string[],
): Promise<{ items: DigestItem[]; identifiers: string[] }> {
  const alreadySent = await getPersonaSendHistory(personaId, DEDUP_WINDOW_DAYS);

  const filtered: DigestItem[] = [];
  const filteredIds: string[] = [];

  for (let i = 0; i < items.length; i++) {
    if (!alreadySent.has(identifiers[i])) {
      filtered.push(items[i]);
      filteredIds.push(identifiers[i]);
    }
  }

  return { items: filtered, identifiers: filteredIds };
}

/**
 * Send a single digest to one email address.
 */
async function sendDigestToRecipient(
  to: string,
  emailContent: { subject: string; html: string; text: string },
): Promise<void> {
  // Sent directly, not via email_digest_outbox: the outbox only dispatches at
  // 07:00 London and holds weekly items until the next Monday, then wraps them
  // in the consolidated "RegActions daily digest", so persona digests arrived
  // a week late and without their own layout.
  await sendEmail({ to, ...emailContent });
}

/**
 * Build and send digests for ALL active personas.
 */
export async function sendAllPersonaDigests(): Promise<SendAllResult> {
  await ensureDigestSubscriberTables();

  const activePersonas = await getAllActivePersonas();
  const results: PersonaDigestResult[] = [];
  let totalSent = 0;
  let totalFailed = 0;

  for (const { persona_id, subscriber_count } of activePersonas) {
    const persona = getPersona(persona_id);
    if (!persona) {
      console.warn(`Unknown persona: ${persona_id}, skipping`);
      continue;
    }

    const result: PersonaDigestResult = {
      personaId: persona_id,
      personaName: persona.name,
      subscriberCount: subscriber_count,
      itemCount: 0,
      sent: 0,
      failed: 0,
      hasPdf: false,
    };

    try {
      // 1. Build digest for this persona
      const allItems = await buildPersonaDigest(persona);
      const identifiers = allItems.map(item =>
        item.identifier || `${item.authority}-${item.title}`.slice(0, 200),
      );

      // 2. Apply per-persona dedup
      const { items, identifiers: newIds } = await deduplicateForPersona(persona_id, allItems, identifiers);
      result.itemCount = items.length;

      if (items.length === 0) {
        console.log(`No new items for persona ${persona_id}, skipping`);
        results.push(result);
        continue;
      }

      // 3. Get subscribers and send
      const subscribers = await getSubscribersByPersona(persona_id);
      const briefing = await buildWeeklyEnforcementBriefing(persona_id);

      for (const subscriber of subscribers) {
        try {
          const emailContent = personaDigestEmail({
            personaName: persona.name,
            personaId: persona_id,
            items,
            unsubscribeToken: subscriber.unsubscribe_token,
            firmName: subscriber.firm_name || undefined,
            hasPdfAttachment: false,
            briefing,
          });

          await sendDigestToRecipient(subscriber.email, emailContent);

          result.sent++;
          totalSent++;
        } catch (error) {
          console.error(`Failed to send to ${subscriber.email}:`, error instanceof Error ? error.message : String(error));
          result.failed++;
          totalFailed++;
        }
      }

      // 4. Record sent items for dedup — only if someone actually got them,
      // otherwise a failed week hides these items from the next send.
      if (result.sent > 0) {
        await markPersonaItemsSent(persona_id, newIds);
      }
    } catch (error) {
      console.error(`Digest build failed for persona ${persona_id}:`, error);
      result.failed = subscriber_count;
      totalFailed += subscriber_count;
    }

    results.push(result);
  }

  return {
    results,
    totalSent,
    totalFailed,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build the digest a persona would receive this week, without sending it.
 */
export async function renderPersonaDigest(personaId: string): Promise<{
  itemCount: number;
  email: { subject: string; html: string; text: string } | null;
  error?: string;
}> {
  const persona = getPersona(personaId);
  if (!persona) {
    return { itemCount: 0, email: null, error: `Unknown persona: ${personaId}` };
  }

  const items = await buildPersonaDigest(persona);
  if (items.length === 0) {
    return { itemCount: 0, email: null, error: 'No items found for this persona' };
  }

  const email = personaDigestEmail({
    personaName: persona.name,
    personaId,
    items,
    unsubscribeToken: 'test-token-preview',
    firmName: 'Test Firm',
    hasPdfAttachment: false,
    briefing: await buildWeeklyEnforcementBriefing(personaId),
  });
  return { itemCount: items.length, email };
}

/**
 * Send a test digest for a single persona to a specific email.
 */
export async function sendTestDigest(personaId: string, testEmail: string): Promise<{
  success: boolean;
  itemCount: number;
  error?: string;
}> {
  await ensureDigestSubscriberTables();

  try {
    const { itemCount, email, error } = await renderPersonaDigest(personaId);
    if (!email) {
      return { success: false, itemCount, error };
    }

    await sendDigestToRecipient(testEmail, email);

    return { success: true, itemCount };
  } catch (error) {
    return {
      success: false,
      itemCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
