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
    const { email, frequency = 'weekly' } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    if (!['weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'Frequency must be weekly or monthly' });
    }

    // Check for existing subscription
    const existing = await sql`
      SELECT id, status FROM digest_subscriptions
      WHERE email = ${email}
      AND frequency = ${frequency}
    `;

    if (existing.length > 0) {
      if (existing[0].status === 'active') {
        return res.status(400).json({ error: `You already have an active ${frequency} digest subscription` });
      }
      // Reactivate if previously unsubscribed
      if (existing[0].status === 'unsubscribed') {
        const verificationToken = randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await sql`
          UPDATE digest_subscriptions
          SET
            status = 'pending',
            email_verified = FALSE,
            verification_token = ${verificationToken},
            verification_expires_at = ${expiresAt.toISOString()}
          WHERE id = ${existing[0].id}
        `;

        // Send verification email
        await sendVerificationEmail(email, frequency, verificationToken);

        return res.status(200).json({
          success: true,
          message: 'Verification email sent. Please check your inbox.',
        });
      }
    }

    // Generate tokens
    const verificationToken = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create subscription
    await sql`
      INSERT INTO digest_subscriptions (
        email, frequency,
        verification_token, verification_expires_at
      ) VALUES (
        ${email},
        ${frequency},
        ${verificationToken},
        ${expiresAt.toISOString()}
      )
    `;

    // Send verification email
    await sendVerificationEmail(email, frequency, verificationToken);

    // Log notification
    await sql`
      INSERT INTO notification_log (email, notification_type, subject)
      VALUES (${email}, 'verification', ${`${frequency} digest verification`})
    `;

    return res.status(200).json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  } catch (error) {
    console.error('Digest subscribe error:', error);
    return res.status(500).json({ error: 'Failed to create subscription' });
  }
}

async function sendVerificationEmail(email: string, frequency: string, token: string) {
  const verifyUrl = `${BASE_URL}/api/digest/verify/${token}`;

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
    .frequency { background: #dbeafe; color: #1e40af; padding: 8px 16px; border-radius: 8px; display: inline-block; font-weight: 600; margin: 16px 0; text-transform: capitalize; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <h1>Verify your digest subscription</h1>
      <p>You've requested to receive our FCA fines digest. Click the button below to confirm.</p>
      <div class="frequency">${frequency} Digest</div>
      <p>You'll receive a summary of all new FCA fines ${frequency === 'weekly' ? 'every Monday' : 'on the 1st of each month'}.</p>
      <a href="${verifyUrl}" class="button">Verify & Subscribe</a>
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
      Subject: { Data: `Verify your ${frequency} FCA Fines Digest` },
      Body: {
        Html: { Data: htmlContent },
        Text: { Data: `Verify your ${frequency} digest subscription\n\nClick here to verify: ${verifyUrl}\n\nYou'll receive summaries ${frequency === 'weekly' ? 'every Monday' : 'on the 1st of each month'}.\n\nThis link expires in 24 hours.` },
      },
    },
  }));
}
