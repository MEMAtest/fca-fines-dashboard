import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  enforceAgenticRateLimit,
  generateEnforcementBriefing,
  hashClientKey,
  recordAgenticRequest,
  type EnforcementBriefingFilters,
} from '../../server/services/enforcementBriefingAgent.js';

export const config = {
  maxDuration: 60,
};

function getClientKey(req: VercelRequest) {
  const ip = getRequestIp(req);
  const userAgent = headerValue(req.headers['user-agent']).slice(0, 200) || 'unknown-agent';
  return hashClientKey(`${ip}|${userAgent}`);
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function getRequestIp(req: VercelRequest) {
  const realIp = headerValue(req.headers['x-real-ip']).trim();
  const forwardedFor = headerValue(req.headers['x-forwarded-for'])
    .split(',')[0]
    ?.trim();
  return realIp || forwardedFor || req.socket.remoteAddress || 'unknown';
}

function allowedOrigins() {
  return new Set(
    [
      'https://regactions.com',
      'https://www.regactions.com',
      process.env.NEXT_PUBLIC_BASE_URL,
      ...(process.env.AGENTIC_ALLOWED_ORIGINS || '').split(','),
    ]
      .map((origin) => origin?.trim().replace(/\/$/, ''))
      .filter(Boolean) as string[],
  );
}

function isLocalOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin = headerValue(req.headers.origin).replace(/\/$/, '');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!origin) return true;
  if (allowedOrigins().has(origin) || (process.env.NODE_ENV !== 'production' && isLocalOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    return true;
  }

  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(corsAllowed ? 200 : 403).end();
  }

  if (!corsAllowed) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const startedAt = Date.now();
  const clientKey = getClientKey(req);
  let fallbackUsed = false;

  try {
    await enforceAgenticRateLimit(clientKey);

    const filters = (req.body || {}) as EnforcementBriefingFilters;
    const result = await generateEnforcementBriefing(filters);
    fallbackUsed = result.fallbackUsed;

    await recordAgenticRequest({
      clientKey,
      status: 'success',
      filterHash: result.evidenceHash,
      latencyMs: Date.now() - startedAt,
      fallbackUsed,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Briefing generation failed';
    const isRateLimit = message.toLowerCase().includes('rate limit');

    await recordAgenticRequest({
      clientKey,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      fallbackUsed,
      errorMessage: message,
    });

    return res.status(isRateLimit ? 429 : 400).json({
      success: false,
      error: message,
    });
  }
}
