import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDailySummary } from '../server/services/analytics.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function sendEmail(subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.DAILY_DIGEST_TO?.trim();
  const from = process.env.DAILY_DIGEST_FROM?.trim() || 'alerts@fca-fines.local';

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

export function isDailyDigestAuthorised(
  authorization: string | string[] | undefined,
  cronSecret: string | undefined,
) {
  const expected = cronSecret?.trim();
  const suppliedHeader = Array.isArray(authorization) ? authorization[0] : authorization;
  const match = suppliedHeader?.match(/^Bearer\s+(.+)$/i);
  const supplied = match?.[1]?.trim();

  if (!expected || !supplied) return false;

  const expectedBytes = Buffer.from(expected, 'utf8');
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!isDailyDigestAuthorised(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const summary = await getDailySummary(since);

    const lines = [
      `RegActions – Daily Summary (last 24h)`,
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

    await sendEmail('RegActions – daily summary', lines.join('\n'));
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Daily digest failed', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to send digest' });
  }
}
