import type { VercelRequest, VercelResponse } from '@vercel/node';
import { recordPageview } from '../server/services/analytics.js';

function sanitizePath(input: unknown): string {
  let raw = typeof input === 'string' ? input : String(input ?? '');
  raw = raw.trim();
  if (!raw) return '/';

  // If we accidentally receive a full URL, keep only the path component.
  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      raw = '/';
    }
  }

  // Strip query/hash to avoid persisting PII.
  raw = raw.split('?')[0]?.split('#')[0] ?? '/';
  if (!raw.startsWith('/')) raw = `/${raw}`;

  // Remove control characters and collapse multiple slashes.
  raw = raw.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\/{2,}/g, '/');

  // Keep paths bounded in size.
  if (raw.length > 2048) raw = raw.slice(0, 2048);

  return raw || '/';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const path = sanitizePath(req.query?.path as string);
    const userAgent = req.headers['user-agent'] || '';
    await recordPageview(path, Array.isArray(userAgent) ? userAgent[0] : userAgent);
    res.status(204).end();
  } catch (error) {
    console.error('Pageview logging failed', error);
    res.status(500).json({ success: false, error: 'Unable to log pageview' });
  }
}
