import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_FCA_FINES_URL!);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://fcafines.memaconsultants.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.redirect(`${BASE_URL}?error=invalid_token`);
  }

  try {
    // Find and unsubscribe
    const [subscription] = await sql`
      UPDATE digest_subscriptions
      SET status = 'unsubscribed'
      WHERE unsubscribe_token = ${token}
      AND status != 'unsubscribed'
      RETURNING id, email, frequency
    `;

    if (!subscription) {
      return res.redirect(`${BASE_URL}?error=not_found_or_already_unsubscribed`);
    }

    // Redirect to success page
    return res.redirect(`${BASE_URL}?unsubscribed=digest&email=${encodeURIComponent(subscription.email)}&frequency=${subscription.frequency}`);
  } catch (error) {
    console.error('Digest unsubscribe error:', error);
    return res.redirect(`${BASE_URL}?error=unsubscribe_failed`);
  }
}
