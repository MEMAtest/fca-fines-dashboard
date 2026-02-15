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
    // Find and verify the watchlist entry
    const [watchlist] = await sql`
      SELECT id, email, firm_name, verification_expires_at
      FROM firm_watchlist
      WHERE verification_token = ${token}
      AND status = 'pending'
    `;

    if (!watchlist) {
      return res.redirect(`${BASE_URL}?error=invalid_or_expired_token`);
    }

    // Check if token has expired
    if (new Date(watchlist.verification_expires_at) < new Date()) {
      return res.redirect(`${BASE_URL}?error=token_expired`);
    }

    // Activate the watchlist entry
    await sql`
      UPDATE firm_watchlist
      SET
        email_verified = TRUE,
        status = 'active',
        verification_token = NULL,
        verification_expires_at = NULL
      WHERE id = ${watchlist.id}
    `;

    // Redirect to success page (avoid leaking PII in query params)
    return res.redirect(`${BASE_URL}?verified=watchlist`);
  } catch (error) {
    console.error('Watchlist verify error:', error);
    return res.redirect(`${BASE_URL}?error=verification_failed`);
  }
}
