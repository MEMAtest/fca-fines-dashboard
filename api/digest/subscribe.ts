import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSqlClient } from '../../server/db.js';
import { randomUUID } from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { digestVerificationEmail } from '../../server/services/emailTemplates/account.js';

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
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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

  const built = digestVerificationEmail({ verifyUrl, frequency, recipient: email });

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
}
