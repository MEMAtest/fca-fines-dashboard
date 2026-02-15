import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listSectors } from '../../server/services/hubs.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await listSectors();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel sectors endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch sectors' });
  }
}

