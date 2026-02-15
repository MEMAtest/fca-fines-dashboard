import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirmDetailsBySlug } from '../../server/services/hubs.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const slug = String((req.query?.slug as string) ?? '').trim();
    if (!slug) {
      return res.status(400).json({ success: false, error: 'Missing slug' });
    }
    const limit = Math.min(Number((req.query?.limit as string) ?? '200'), 5000);

    const data = await getFirmDetailsBySlug(slug, limit);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Firm not found' });
    }
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel firm endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch firm details' });
  }
}

