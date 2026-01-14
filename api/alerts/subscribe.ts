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
    const { email, minAmount, breachTypes, frequency = 'immediate' } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Check for existing subscription
    const minAmountValue = minAmount ? Number(minAmount) : null;
    const existing = minAmountValue
      ? await sql`
          SELECT id, status FROM alert_subscriptions
          WHERE email = ${email} AND min_amount = ${minAmountValue}
        `
      : await sql`
          SELECT id, status FROM alert_subscriptions
          WHERE email = ${email} AND min_amount IS NULL
        `;

    if (existing.length > 0 && existing[0].status === 'active') {
      return res.status(400).json({ error: 'You already have an active subscription with these criteria' });
    }

    // Generate tokens
    const verificationToken = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create subscription - handle array type explicitly
    const breachTypesArray = breachTypes?.length ? `{${breachTypes.join(',')}}` : null;

    const [subscription] = await sql`
      INSERT INTO alert_subscriptions (
        email, min_amount, breach_types, frequency,
        verification_token, verification_expires_at
      ) VALUES (
        ${email},
        ${minAmountValue},
        ${breachTypesArray}::text[],
        ${frequency},
        ${verificationToken},
        ${expiresAt.toISOString()}
      )
      RETURNING id, unsubscribe_token
    `;

    // Send verification email
    const verifyUrl = `${BASE_URL}/api/alerts/verify/${verificationToken}`;

    const minAmountText = minAmount
      ? `Fines of £${(minAmount / 1000000).toFixed(1)}m or more`
      : 'All fines';
    const breachText = breachTypes?.length
      ? `Breach types: ${breachTypes.join(', ')}`
      : 'All breach types';

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
    .details { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .footer { text-align: center; margin-top: 32px; color: #9ca3af; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <h1>Verify your alert subscription</h1>
      <p>You've requested to receive FCA fine alerts. Click the button below to confirm your email address.</p>
      <div class="details">
        <strong>Your alert criteria:</strong><br>
        ${minAmountText}<br>
        ${breachText}<br>
        Frequency: ${frequency}
      </div>
      <a href="${verifyUrl}" class="button">Verify Email Address</a>
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
        Subject: { Data: 'Verify your FCA Fine Alert subscription' },
        Body: {
          Html: { Data: htmlContent },
          Text: { Data: `Verify your FCA Fine Alert subscription\n\nClick here to verify: ${verifyUrl}\n\nYour criteria:\n${minAmountText}\n${breachText}\nFrequency: ${frequency}` },
        },
      },
    }));

    // Log notification
    await sql`
      INSERT INTO notification_log (email, notification_type, subject)
      VALUES (${email}, 'verification', 'Alert subscription verification')
    `;

    return res.status(200).json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  } catch (error) {
    console.error('Alert subscribe error:', error);
    return res.status(500).json({ error: 'Failed to create subscription' });
  }
}
