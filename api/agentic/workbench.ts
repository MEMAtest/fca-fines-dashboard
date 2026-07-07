import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  enforceAgenticRateLimit,
  hashClientKey,
  recordAgenticRequest,
} from '../../server/services/enforcementBriefingAgent.js';
import {
  runAgenticWorkbench,
  type AgenticWorkbenchInput,
} from '../../server/services/agenticDataLayer.js';

export const config = {
  maxDuration: 60,
};

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

function getClientKey(req: VercelRequest) {
  const ip = getRequestIp(req);
  const userAgent = headerValue(req.headers['user-agent']).slice(0, 200) || 'unknown-agent';
  return hashClientKey(`${ip}|${userAgent}`);
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

  try {
    await enforceAgenticRateLimit(clientKey, 'agentic-workbench');
    const result = await runAgenticWorkbench((req.body || {}) as AgenticWorkbenchInput);

    await recordAgenticRequest({
      clientKey,
      route: 'agentic-workbench',
      status: 'success',
      latencyMs: Date.now() - startedAt,
      fallbackUsed: false,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agentic workbench failed';
    const isRateLimit = message.toLowerCase().includes('rate limit');

    await recordAgenticRequest({
      clientKey,
      route: 'agentic-workbench',
      status: 'error',
      latencyMs: Date.now() - startedAt,
      fallbackUsed: false,
      errorMessage: message,
    });

    return res.status(isRateLimit ? 429 : 400).json({
      success: false,
      error: message,
    });
  }
}
