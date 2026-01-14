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
    // Find and verify the subscription
    const [subscription] = await sql`
      SELECT id, email, frequency, verification_expires_at
      FROM digest_subscriptions
      WHERE verification_token = ${token}
      AND status = 'pending'
    `;

    if (!subscription) {
      return res.redirect(`${BASE_URL}?error=invalid_or_expired_token`);
    }

    // Check if token has expired
    if (new Date(subscription.verification_expires_at) < new Date()) {
      return res.redirect(`${BASE_URL}?error=token_expired`);
    }

    // Activate the subscription
    await sql`
      UPDATE digest_subscriptions
      SET
        email_verified = TRUE,
        status = 'active',
        verification_token = NULL,
        verification_expires_at = NULL
      WHERE id = ${subscription.id}
    `;

    // Redirect to success page
    return res.redirect(`${BASE_URL}?verified=digest&email=${encodeURIComponent(subscription.email)}&frequency=${subscription.frequency}`);
  } catch (error) {
    console.error('Digest verify error:', error);
    return res.redirect(`${BASE_URL}?error=verification_failed`);
  }
}
