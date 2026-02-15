import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listTopFirms } from '../../server/services/hubs.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = Math.min(Number((req.query?.limit as string) ?? '100'), 1000);
    const data = await listTopFirms(limit);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel firms endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch firms' });
  }
}

