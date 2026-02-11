import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNotifications } from '../../server/services/fcaFines.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const data = await getNotifications(6);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel notifications endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
}
