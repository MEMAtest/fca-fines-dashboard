/**
 * Unsubscribe Endpoint for Persona Digest
 *
 * GET /api/unsubscribe?token=xxx — renders confirmation page
 * POST /api/unsubscribe — processes unsubscribe
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { disableByToken, getSubscriberByToken } from '../server/services/digestSubscribers.js';
import { COLORS, FONT_SANS, FONT_SERIF, GOOGLE_FONTS_URL, TAGLINE, logoUrl, siteUrl } from '../server/services/emailKit/index.js';

const BASE_URL = siteUrl();

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
         <button type="submit">
           Yes, Unsubscribe Me
         </button>
       </form>
       <p class="note" style="margin-top: 16px;">You can re-subscribe at any time by contacting your account manager.</p>`,
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
         <p class="note" style="margin-top: 16px;">You will no longer receive these emails. If this was a mistake, contact your account manager to re-subscribe.</p>`,
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
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)} — RegActions</title>
  <link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
  <style>
    body { font-family: ${FONT_SANS}; line-height: 1.6; color: ${COLORS.ink}; margin: 0; padding: 0; background-color: #EEF1F4; }
    .container { max-width: 520px; margin: 56px auto; padding: 0 16px; }
    .card { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 32px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand img { width: 36px; height: 36px; display: block; }
    .wordmark { font-family: ${FONT_SERIF}; font-weight: 700; font-size: 28px; line-height: 1; }
    .tagline { font-size: 9px; letter-spacing: 2px; color: ${COLORS.slate}; margin-top: 3px; }
    .rule { height: 1px; background: ${COLORS.gold}; margin: 18px 0 24px; }
    h1 { font-family: ${FONT_SERIF}; color: ${COLORS.midnight}; font-size: 26px; line-height: 1.25; margin: 0 0 14px 0; }
    p { color: #334155; }
    a { color: ${COLORS.teal}; }
    button { background: ${COLORS.teal}; color: #fff; border: 0; padding: 12px 22px; border-radius: 6px; font: 600 15px ${FONT_SANS}; cursor: pointer; }
    .note { color: ${COLORS.slate}; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="brand">
        <img src="${logoUrl('ink')}" width="36" height="36" alt="RegActions">
        <div><div class="wordmark"><span style="color:${COLORS.midnight}">Reg</span><span style="color:${COLORS.gold}">Actions</span></div><div class="tagline">${TAGLINE}</div></div>
      </div>
      <div class="rule"></div>
      <h1>${escapeHtml(title)}</h1>
      ${body}
      <p style="margin-top: 28px;"><a href="${siteUrl()}">&larr; Back to RegActions</a></p>
    </div>
  </div>
</body>
</html>`.trim();
}
