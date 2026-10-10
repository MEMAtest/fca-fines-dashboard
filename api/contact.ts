import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { contactNotificationEmail } from '../server/services/emailTemplates/internal.js';

const ses = new SESClient({
  region: process.env.AWS_SES_REGION?.trim() || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL?.trim() || 'alerts@memaconsultants.com';
const TO_EMAIL = 'contact@memaconsultants.com';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_COMPANY = 200;
const MAX_MESSAGE = 5000;

// Best-effort in-memory rate limiting (per serverless instance).
// Effective for warm instances; cold starts reset state.
const recentSubmissions = new Map<string, number>();

function isDuplicate(email: string, message: string): boolean {
  const key = `${email}:${message.slice(0, 100)}`;
  const now = Date.now();
  const last = recentSubmissions.get(key);
  if (last && now - last < 5 * 60 * 1000) {
    return true;
  }
  recentSubmissions.set(key, now);
  // Clean old entries to prevent unbounded growth
  for (const [k, v] of recentSubmissions) {
    if (now - v > 10 * 60 * 1000) recentSubmissions.delete(k);
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, company, reason, message } = req.body || {};

    // Validate required fields with length limits
    if (!name || typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) {
      return res.status(400).json({ error: `Name is required (max ${MAX_NAME} chars)` });
    }
    if (!email || typeof email !== 'string' || email.length > MAX_EMAIL || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (company && (typeof company !== 'string' || company.length > MAX_COMPANY)) {
      return res.status(400).json({ error: `Company name too long (max ${MAX_COMPANY} chars)` });
    }
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'Reason is required' });
    }
    if (!message || typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: `Message is required (max ${MAX_MESSAGE} chars)` });
    }

    // Rate limit check
    if (isDuplicate(email.trim(), message.trim())) {
      return res.status(429).json({ error: 'Duplicate submission. Please wait a few minutes.' });
    }

    const built = contactNotificationEmail({ name, email, company, reason, message });

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [TO_EMAIL] },
      ReplyToAddresses: [email.trim()],
      Message: {
        Subject: { Data: built.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: built.html, Charset: 'UTF-8' },
          Text: { Data: built.text, Charset: 'UTF-8' },
        },
      },
    }));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
}
