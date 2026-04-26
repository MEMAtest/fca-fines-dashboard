/**
 * Admin API for Digest Subscriber Management
 *
 * Routes:
 * GET    /api/digest-subscribers               — list all subscribers (optional ?persona=X filter)
 * GET    /api/digest-subscribers?action=personas — list active personas with counts
 * POST   /api/digest-subscribers                — add subscriber(s)
 * POST   /api/digest-subscribers?action=bulk    — bulk add prospect list
 * POST   /api/digest-subscribers?action=test    — send test digest
 * DELETE /api/digest-subscribers?email=X        — unsubscribe
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ensureDigestSubscriberTables,
  getAllSubscribers,
  getAllActivePersonas,
  upsertSubscriber,
  bulkAddSubscribers,
  disableSubscriber,
} from '../server/services/digestSubscribers.js';
import { sendTestDigest } from '../server/services/personaDigestService.js';
import { getAllPersonaIds } from '../server/services/firmPersonas.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Basic auth check — require CRON_SECRET or admin key
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET?.trim();
  const adminKey = process.env.ADMIN_API_KEY?.trim();

  const authorized = (cronSecret && authHeader === `Bearer ${cronSecret}`)
    || (adminKey && authHeader === `Bearer ${adminKey}`);

  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized. Provide Bearer token in Authorization header.' });
  }

  try {
    await ensureDigestSubscriberTables();

    if (req.method === 'GET') {
      return handleGet(req, res);
    }

    if (req.method === 'POST') {
      return handlePost(req, res);
    }

    if (req.method === 'DELETE') {
      return handleDelete(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Digest subscribers API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  if (action === 'personas') {
    const personas = await getAllActivePersonas();
    const allPersonaIds = getAllPersonaIds();
    return res.status(200).json({
      activePersonas: personas,
      availablePersonas: allPersonaIds,
    });
  }

  const personaFilter = req.query.persona as string | undefined;
  const subscribers = await getAllSubscribers(personaFilter);
  return res.status(200).json({
    count: subscribers.length,
    subscribers,
  });
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const body = req.body || {};

  if (action === 'bulk') {
    // Bulk add subscribers
    const subscribers = body.subscribers as Array<{
      email: string;
      firmName?: string;
      personaId: string;
      source?: 'mema_client' | 'prospect' | 'manual';
    }>;

    if (!Array.isArray(subscribers) || subscribers.length === 0) {
      return res.status(400).json({ error: 'subscribers array is required' });
    }

    const added = await bulkAddSubscribers(subscribers);
    return res.status(200).json({ added, total: subscribers.length });
  }

  if (action === 'test') {
    // Send test digest
    const { personaId, email } = body;
    if (!personaId || !email) {
      return res.status(400).json({ error: 'personaId and email are required' });
    }

    const result = await sendTestDigest(personaId, email);
    return res.status(result.success ? 200 : 400).json(result);
  }

  // Add single subscriber
  const { email, firmName, personaId, source, customSectors, customKeywords } = body;

  if (!email || !personaId) {
    return res.status(400).json({ error: 'email and personaId are required' });
  }

  const subscriber = await upsertSubscriber({
    email,
    firmName,
    personaId,
    source,
    customSectors,
    customKeywords,
  });

  return res.status(201).json(subscriber);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const email = req.query.email as string;
  if (!email) {
    return res.status(400).json({ error: 'email query parameter is required' });
  }

  const disabled = await disableSubscriber(email);
  return res.status(200).json({ disabled, email });
}
