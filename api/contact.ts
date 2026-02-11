import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: process.env.AWS_SES_REGION || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'alerts@memaconsultants.com';
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

    const reasonLabels: Record<string, string> = {
      demo: 'Request a Demo',
      inquiry: 'General Inquiry',
      partnership: 'Partnership Opportunity',
      support: 'Technical Support',
      other: 'Other',
    };

    const reasonLabel = reasonLabels[reason] || reason;
    const companyLine = company ? `<tr><td style="padding:8px 12px;font-weight:600;color:#4b5563;">Company</td><td style="padding:8px 12px;">${escapeHtml(company)}</td></tr>` : '';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 20px; font-weight: bold; color: #3b82f6; margin-bottom: 20px; }
    h1 { color: #111827; font-size: 22px; margin: 0 0 16px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .message-box { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px; white-space: pre-wrap; }
    .footer { text-align: center; margin-top: 24px; color: #9ca3af; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">FCA Fines Dashboard</div>
      <h1>New Contact Form Submission</h1>
      <table>
        <tr><td style="padding:8px 12px;font-weight:600;color:#4b5563;">Name</td><td style="padding:8px 12px;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:8px 12px;font-weight:600;color:#4b5563;">Email</td><td style="padding:8px 12px;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        ${companyLine}
        <tr><td style="padding:8px 12px;font-weight:600;color:#4b5563;">Reason</td><td style="padding:8px 12px;">${escapeHtml(reasonLabel)}</td></tr>
      </table>
      <div class="message-box">${escapeHtml(message)}</div>
    </div>
    <div class="footer">
      <p>Submitted via FCA Fines Dashboard contact form</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const textContent = `New contact form submission\n\nName: ${name}\nEmail: ${email}\n${company ? `Company: ${company}\n` : ''}Reason: ${reasonLabel}\n\nMessage:\n${message}`;

    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [TO_EMAIL] },
      ReplyToAddresses: [email.trim()],
      Message: {
        Subject: { Data: `FCA Fines Contact: ${reasonLabel} from ${name}`, Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlContent, Charset: 'UTF-8' },
          Text: { Data: textContent, Charset: 'UTF-8' },
        },
      },
    }));

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
