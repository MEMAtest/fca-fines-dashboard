import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listFines } from '../../server/services/fcaFines.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const year = Number((req.query?.year as string) ?? '0');
    const limit = Math.min(Number((req.query?.limit as string) ?? '500'), 5000);
    const data = await listFines(year, limit);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel list endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch fines' });
  }
}
