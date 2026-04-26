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
import { personaDigestEmail, type DigestItem } from './personaDigestEmail.js';
import { generatePersonaDigestPdf } from './personaDigestPdf.js';
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';

const sql = getSqlClient();

const ses = new SESClient({
  region: process.env.AWS_SES_REGION?.trim() || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL?.trim() || 'alerts@memaconsultants.com';
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

/**
 * Build a persona-specific digest payload from recent enforcement/regulatory data.
 */
async function buildPersonaDigest(persona: FirmPersona): Promise<DigestItem[]> {
  const profile = buildFirmProfileFromPersona(persona);

  // Get recent enforcement data from all_regulatory_fines (materialized view)
  const rows = await sql(`
    SELECT
      firm_name,
      regulator,
      date_issued,
      amount,
      breach_type,
      summary,
      source_url,
      content_hash
    FROM all_regulatory_fines
    WHERE date_issued > NOW() - INTERVAL '30 days'
    ORDER BY date_issued DESC
    LIMIT 200
  `, []);

  // Score and filter items by persona relevance
  const scored: Array<DigestItem & { score: number; identifier: string }> = [];

  for (const row of rows) {
    const regulator = (row.regulator as string) || '';
    const firm = (row.firm_name as string) || '';
    const breach = (row.breach_type as string) || '';
    const summary = (row.summary as string) || '';
    const combinedText = `${firm} ${breach} ${summary}`.toLowerCase();
    const identifier = (row.content_hash as string) || `${regulator}-${firm}-${row.date_issued}`;

    let score = 0;

    // Regulator match (30%)
    if (profile.regulators.some(r => regulator.toUpperCase().includes(r.toUpperCase()))) {
      score += 30;
    }

    // Keyword match (40%)
    const matchedKeywords = profile.keywords.filter(kw => combinedText.includes(kw.toLowerCase()));
    score += Math.min(40, matchedKeywords.length * 10);

    // Apply relevance boosts
    for (const [term, boost] of Object.entries(profile.relevanceBoosts)) {
      if (combinedText.includes(term.toLowerCase())) {
        score *= boost;
      }
    }

    // Minimum relevance threshold
    if (score < 10) continue;

    const amount = row.amount as number;
    const formattedAmount = amount
      ? amount >= 1_000_000
        ? `£${(amount / 1_000_000).toFixed(1)}m`
        : amount >= 1_000
          ? `£${(amount / 1_000).toFixed(0)}k`
          : `£${amount}`
      : '';

    const title = formattedAmount
      ? `${firm} fined ${formattedAmount}`
      : firm || 'Regulatory development';

    scored.push({
      title,
      authority: regulator,
      date: new Date(row.date_issued as string).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      summary: summary || breach || 'See source for details.',
      url: (row.source_url as string) || undefined,
      relevanceScore: Math.round(score),
      score,
      identifier,
    });
  }

  // Sort by relevance score and take top items
  scored.sort((a, b) => b.score - a.score);

  // Balance: max 10 from any single authority
  const byAuthority = new Map<string, number>();
  const balanced: typeof scored = [];

  for (const item of scored) {
    const count = byAuthority.get(item.authority) || 0;
    if (count >= 10) continue;
    byAuthority.set(item.authority, count + 1);
    balanced.push(item);
    if (balanced.length >= 20) break;
  }

  return balanced;
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
 * Send a single digest to one email address with optional PDF attachment.
 */
async function sendDigestToRecipient(
  to: string,
  emailContent: { subject: string; html: string; text: string },
  pdfBuffer?: Buffer,
  pdfFilename?: string,
): Promise<void> {
  if (pdfBuffer && pdfFilename) {
    // Send with PDF attachment using raw MIME
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const rawMessage = [
      `From: ${FROM_EMAIL}`,
      `To: ${to}`,
      `Subject: ${emailContent.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: multipart/alternative; boundary="alt_boundary"',
      '',
      '--alt_boundary',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailContent.text,
      '',
      '--alt_boundary',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailContent.html,
      '',
      '--alt_boundary--',
      '',
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8; name="${pdfFilename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${pdfFilename}"`,
      '',
      pdfBuffer.toString('base64'),
      '',
      `--${boundary}--`,
    ].join('\r\n');

    await ses.send(new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage) },
    }));
  } else {
    // Simple email without attachment
    const { sendEmail } = await import('./email.js');
    await sendEmail({
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }
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

  // Check if this is a monthly run (1st of month) — attach PDF
  const isMonthlyRun = new Date().getDate() <= 7; // First week of month

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

      // 3. Generate PDF for monthly runs
      let pdfBuffer: Buffer | undefined;
      let pdfFilename: string | undefined;

      if (isMonthlyRun) {
        try {
          pdfBuffer = await generatePersonaDigestPdf(persona, items);
          const monthStr = new Date().toISOString().slice(0, 7);
          pdfFilename = `RegCanary-${persona.name.replace(/\s+/g, '-')}-${monthStr}.txt`;
          result.hasPdf = true;
        } catch (error) {
          console.warn(`PDF generation failed for ${persona_id}:`, error instanceof Error ? error.message : String(error));
        }
      }

      // 4. Get subscribers and send
      const subscribers = await getSubscribersByPersona(persona_id);

      for (const subscriber of subscribers) {
        try {
          const emailContent = personaDigestEmail({
            personaName: persona.name,
            personaId: persona_id,
            items,
            unsubscribeToken: subscriber.unsubscribe_token,
            firmName: subscriber.firm_name || undefined,
            hasPdfAttachment: !!pdfBuffer,
          });

          await sendDigestToRecipient(
            subscriber.email,
            emailContent,
            pdfBuffer,
            pdfFilename,
          );

          result.sent++;
          totalSent++;
        } catch (error) {
          console.error(`Failed to send to ${subscriber.email}:`, error instanceof Error ? error.message : String(error));
          result.failed++;
          totalFailed++;
        }
      }

      // 5. Record sent items for dedup
      await markPersonaItemsSent(persona_id, newIds);
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
 * Send a test digest for a single persona to a specific email.
 */
export async function sendTestDigest(personaId: string, testEmail: string): Promise<{
  success: boolean;
  itemCount: number;
  error?: string;
}> {
  await ensureDigestSubscriberTables();

  const persona = getPersona(personaId);
  if (!persona) {
    return { success: false, itemCount: 0, error: `Unknown persona: ${personaId}` };
  }

  try {
    const items = await buildPersonaDigest(persona);

    if (items.length === 0) {
      return { success: false, itemCount: 0, error: 'No items found for this persona' };
    }

    // Generate PDF for test
    let pdfBuffer: Buffer | undefined;
    let pdfFilename: string | undefined;

    try {
      pdfBuffer = await generatePersonaDigestPdf(persona, items);
      const monthStr = new Date().toISOString().slice(0, 7);
      pdfFilename = `RegCanary-${persona.name.replace(/\s+/g, '-')}-${monthStr}-TEST.txt`;
    } catch {
      console.warn('PDF generation failed for test digest');
    }

    const emailContent = personaDigestEmail({
      personaName: persona.name,
      personaId,
      items,
      unsubscribeToken: 'test-token-preview',
      firmName: 'Test Firm',
      hasPdfAttachment: !!pdfBuffer,
    });

    await sendDigestToRecipient(testEmail, emailContent, pdfBuffer, pdfFilename);

    return { success: true, itemCount: items.length };
  } catch (error) {
    return {
      success: false,
      itemCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
