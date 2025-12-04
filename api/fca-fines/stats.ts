import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStats } from '../../server/services/fcaFines.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const requestedYear = Number((req.query?.year as string) ?? new Date().getFullYear());
    const year = requestedYear === 0 ? 0 : requestedYear;
    const data = await getStats(year);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel stats endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
}
