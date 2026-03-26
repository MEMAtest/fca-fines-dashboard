import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../../server/db.js";

const sql = getSqlClient();
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://fcafines.memaconsultants.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    return res.redirect(`${BASE_URL}?error=invalid_token`);
  }

  try {
    // Find and verify the subscription
    const [subscription] = (await sql`
      SELECT id, email, frequency, verification_expires_at
      FROM digest_subscriptions
      WHERE verification_token = ${token}
      AND status = 'pending'
    `) as Array<{
      id: string | number;
      email: string;
      frequency: string;
      verification_expires_at: string | Date | null;
    }>;

    if (!subscription) {
      return res.redirect(`${BASE_URL}?error=invalid_or_expired_token`);
    }

    // Check if token has expired
    const verificationExpiresAt = subscription.verification_expires_at
      ? new Date(subscription.verification_expires_at)
      : null;
    if (!verificationExpiresAt || verificationExpiresAt < new Date()) {
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

    // Redirect to success page (avoid leaking PII in query params)
    return res.redirect(`${BASE_URL}?verified=digest`);
  } catch (error) {
    console.error("Digest verify error:", error);
    return res.redirect(`${BASE_URL}?error=verification_failed`);
  }
}
