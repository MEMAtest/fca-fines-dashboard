/**
 * Vercel Cron: Persona Digest Sender
 *
 * Runs weekly (Monday 10:30 UTC) to send persona-targeted
 * regulatory digest emails to all active subscribers.
 *
 * Cron schedule: 30 10 * * 1
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendAllPersonaDigests } from '../../server/services/personaDigestService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret — fail closed when CRON_SECRET is not set
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.authorization;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting persona digest send...');
    const result = await sendAllPersonaDigests();

    console.log(`Persona digests complete: ${result.totalSent} sent, ${result.totalFailed} failed`);

    return res.status(200).json({
      success: true,
      totalSent: result.totalSent,
      totalFailed: result.totalFailed,
      personas: result.results.map(r => ({
        personaId: r.personaId,
        personaName: r.personaName,
        subscribers: r.subscriberCount,
        items: r.itemCount,
        sent: r.sent,
        failed: r.failed,
        hasPdf: r.hasPdf,
      })),
      timestamp: result.timestamp,
    });
  } catch (error) {
    console.error('Persona digest cron failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
