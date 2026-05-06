/**
 * Unsubscribe Endpoint for Persona Digest
 *
 * GET /api/unsubscribe?token=xxx — renders confirmation page
 * POST /api/unsubscribe — processes unsubscribe
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { disableByToken, getSubscriberByToken } from '../server/services/digestSubscribers.js';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'https://regactions.com';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = (req.query.token as string || '').trim();

  if (!token) {
    return res.status(400).json({ error: 'Missing unsubscribe token' });
  }

  if (req.method === 'GET') {
    // Render confirmation page
    const subscriber = await getSubscriberByToken(token);

    if (!subscriber) {
      return res.status(200).send(renderPage(
        'Subscription Not Found',
        'This unsubscribe link is invalid or has already been used.',
      ));
    }

    if (!subscriber.enabled) {
      return res.status(200).send(renderPage(
        'Already Unsubscribed',
        `${escapeHtml(subscriber.email)} has already been unsubscribed from ${escapeHtml(subscriber.persona_id)} digest alerts.`,
      ));
    }

    return res.status(200).send(renderPage(
      'Confirm Unsubscribe',
      `<p>Are you sure you want to unsubscribe <strong>${escapeHtml(subscriber.email)}</strong> from <strong>${escapeHtml(subscriber.persona_id)}</strong> digest alerts?</p>
       <form method="POST" action="${BASE_URL}/api/unsubscribe?token=${escapeHtml(token)}">
         <button type="submit" style="background: #dc2626; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; font-weight: 600;">
           Yes, Unsubscribe Me
         </button>
       </form>
       <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">You can re-subscribe at any time by contacting your account manager.</p>`,
    ));
  }

  if (req.method === 'POST') {
    try {
      const result = await disableByToken(token);

      if (!result) {
        return res.status(200).send(renderPage(
          'Already Unsubscribed',
          'This subscription has already been cancelled.',
        ));
      }

      return res.status(200).send(renderPage(
        'Unsubscribed Successfully',
        `<p><strong>${escapeHtml(result.email)}</strong> has been unsubscribed from <strong>${escapeHtml(result.persona_id)}</strong> digest alerts.</p>
         <p style="color: #6b7280; margin-top: 16px;">You will no longer receive these emails. If this was a mistake, contact your account manager to re-subscribe.</p>`,
      ));
    } catch (error) {
      console.error('Unsubscribe error:', error);
      return res.status(500).send(renderPage(
        'Error',
        'Something went wrong. Please try again later.',
      ));
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function renderPage(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — RegCanary</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 500px; margin: 80px auto; padding: 0 20px; }
    .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
    .logo { font-size: 24px; font-weight: bold; color: #0FA77D; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 24px; margin: 0 0 16px 0; }
    p { color: #4b5563; }
    a { color: #0FA77D; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">RegCanary</div>
      <h1>${escapeHtml(title)}</h1>
      ${body}
      <p style="margin-top: 32px;"><a href="https://regcanary.com">← Back to RegCanary</a></p>
    </div>
  </div>
</body>
</html>`.trim();
}
