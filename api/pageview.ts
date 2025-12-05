import type { VercelRequest, VercelResponse } from '@vercel/node';
import { recordPageview } from '../server/services/analytics.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = (req.query?.path as string) || '/';
    const userAgent = req.headers['user-agent'] || '';
    await recordPageview(path, Array.isArray(userAgent) ? userAgent[0] : userAgent);
    res.status(204).end();
  } catch (error) {
    console.error('Pageview logging failed', error);
    res.status(500).json({ success: false, error: 'Unable to log pageview' });
  }
}
