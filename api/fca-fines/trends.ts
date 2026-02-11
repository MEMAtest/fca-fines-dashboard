import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTrends } from '../../server/services/fcaFines.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const period = ((req.query?.period as string) || 'month').toLowerCase();
    const limit = Math.min(Number((req.query?.limit as string) ?? '12'), 120);
    const year = Number((req.query?.year as string) ?? '0');
    const data = await getTrends(period, year, limit);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel trends endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trends' });
  }
}
