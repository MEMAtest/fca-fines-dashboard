import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDailySummary } from '../server/services/analytics.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function sendEmail(subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DAILY_DIGEST_TO;
  const from = process.env.DAILY_DIGEST_FROM || 'alerts@fca-fines.local';

  if (!apiKey || !to) {
    throw new Error('Missing RESEND_API_KEY or DAILY_DIGEST_TO');
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend failed: ${response.status} ${body}`);
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const summary = await getDailySummary(since);

    const lines = [
      `FCA Fines Dashboard – Daily Summary (last 24h)`,
      ``,
      `Pageviews: ${summary.totalPageviews}`,
      `Top paths:`,
      ...(summary.topPaths.length
        ? summary.topPaths.map((p) => `- ${p.path} (${p.hits})`)
        : ['- None']),
      ``,
      `Latest notice (last 24h):`,
      summary.latestNotice
        ? `- ${summary.latestNotice.firm} · ${formatCurrency(summary.latestNotice.amount)} · ${summary.latestNotice.date}`
        : '- None detected',
    ];

    await sendEmail('FCA Fines – daily summary', lines.join('\n'));
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Daily digest failed', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to send digest' });
  }
}
