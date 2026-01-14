import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sql = neon(process.env.NEON_FCA_FINES_URL!);

const ses = new SESClient({
  region: process.env.AWS_SES_REGION || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'alerts@memaconsultants.com';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://fcafines.memaconsultants.com';

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
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

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

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 16px 0; }
    p { margin: 0 0 16px 0; color: #4b5563; }
    .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 24px 0; }
    .firm-name { background: #dbeafe; color: #1e40af; padding: 8px 16px; border-radius: 8px; display: inline-block; font-weight: 600; margin: 16px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <h1>Verify your firm watchlist</h1>
      <p>You've requested to watch a firm for new FCA fines. Click the button below to confirm.</p>
      <div class="firm-name">${firmName.trim()}</div>
      <p>You'll be notified whenever this firm receives a new fine from the FCA.</p>
      <a href="${verifyUrl}" class="button">Verify & Start Watching</a>
      <p style="font-size: 14px; color: #6b7280;">This link expires in 24 hours.</p>
    </div>
    <div class="footer">
      <p>FCA Fines Dashboard · Powered by MEMA Consultants</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: `Verify your watchlist: ${firmName.trim()}`, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlContent, Charset: 'UTF-8' },
          Text: { Data: `Verify your firm watchlist\n\nYou've requested to watch "${firmName.trim()}" for new FCA fines.\n\nClick here to verify: ${verifyUrl}\n\nThis link expires in 24 hours.`, Charset: 'UTF-8' },
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
