import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSqlClient } from '../../server/db.js';
import { randomUUID } from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { watchlistVerificationEmail } from '../../server/services/emailTemplates/account.js';

const sql = getSqlClient();

const ses = new SESClient({
  region: process.env.AWS_SES_REGION?.trim() || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL?.trim() || 'alerts@memaconsultants.com';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://regactions.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, firmName } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    if (!firmName || firmName.trim().length === 0) {
      return res.status(400).json({ error: 'Firm name is required' });
    }

    const firmNameNormalized = firmName.trim().toLowerCase();

    // Check for existing watchlist entry
    const existing = await sql`
      SELECT id, status FROM firm_watchlist
      WHERE email = ${email}
      AND firm_name_normalized = ${firmNameNormalized}
    `;

    if (existing.length > 0) {
      if (existing[0].status === 'active') {
        return res.status(400).json({ error: 'You are already watching this firm' });
      }
      // Reactivate if previously unsubscribed
      if (existing[0].status === 'unsubscribed') {
        const verificationToken = randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await sql`
          UPDATE firm_watchlist
          SET
            status = 'pending',
            email_verified = FALSE,
            verification_token = ${verificationToken},
            verification_expires_at = ${expiresAt.toISOString()}
          WHERE id = ${existing[0].id}
        `;

        // Send verification email (reuse code below)
      }
    }

    // Generate tokens
    const verificationToken = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create watchlist entry
    if (existing.length === 0) {
      await sql`
        INSERT INTO firm_watchlist (
          email, firm_name, firm_name_normalized,
          verification_token, verification_expires_at
        ) VALUES (
          ${email},
          ${firmName.trim()},
          ${firmNameNormalized},
          ${verificationToken},
          ${expiresAt.toISOString()}
        )
      `;
    }

    // Send verification email
    const verifyUrl = `${BASE_URL}/api/watchlist/verify/${verificationToken}`;

    const built = watchlistVerificationEmail({ verifyUrl, firmName, recipient: email });

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: built.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: built.html, Charset: 'UTF-8' },
          Text: { Data: built.text, Charset: 'UTF-8' },
        },
      },
    }));

    // Log notification
    await sql`
      INSERT INTO notification_log (email, notification_type, subject)
      VALUES (${email}, 'verification', ${'Watchlist verification: ' + firmName.trim()})
    `;

    return res.status(200).json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  } catch (error) {
    console.error('Watchlist add error:', error);
    return res.status(500).json({ error: 'Failed to add to watchlist' });
  }
}
