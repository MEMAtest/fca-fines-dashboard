import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBreachDetailsBySlug } from '../../server/services/hubs.js';

const CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400';

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

    const limitPenalties = Math.min(Number((req.query?.limitPenalties as string) ?? '10'), 50);
    const limitFirms = Math.min(Number((req.query?.limitFirms as string) ?? '10'), 50);

    const data = await getBreachDetailsBySlug(slug, limitPenalties, limitFirms);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Breach not found' });
    }

    res.setHeader('Cache-Control', CACHE_CONTROL);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel breach endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch breach details' });
  }
}

