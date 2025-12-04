import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getNotifications } from '../../server/services/fcaFines';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const data = await getNotifications(6);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Vercel notifications endpoint error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
}
