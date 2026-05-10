/**
 * Article Review Email — Human-in-the-Loop Gate
 *
 * Sends a review email to the admin when an AI article is generated.
 * Admin must approve via GitHub Actions workflow_dispatch before publishing.
 *
 * Uses AWS SES (same pattern as server/services/email.ts).
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { QualityReport } from './articleQuality.js';

const ses = new SESClient({
  region: process.env.AWS_SES_REGION?.trim() || 'eu-west-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim() || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim() || '',
  },
});

const FROM_EMAIL = process.env.SES_FROM_EMAIL?.trim() || 'alerts@memaconsultants.com';
const REVIEW_EMAIL = process.env.BLOG_REVIEW_EMAIL?.trim() || '';
const REPO = 'MEMAtest/fca-fines-dashboard';

interface ReviewEmailParams {
  title: string;
  slug: string;
  excerpt: string;
  wordCount: number;
  qualityReport: QualityReport;
  track: string;
  generatedAt: string;
}

/**
 * Send article review notification email to admin.
 */
export async function sendArticleReviewEmail(params: ReviewEmailParams): Promise<string | null> {
  if (!REVIEW_EMAIL) {
    console.warn('BLOG_REVIEW_EMAIL not set — skipping review email');
    return null;
  }

  const { title, slug, excerpt, wordCount, qualityReport, track, generatedAt } = params;

  const scoreColor = qualityReport.score >= 90 ? '#22c55e' : qualityReport.score >= 70 ? '#f59e0b' : '#ef4444';
  const scoreLabel = qualityReport.score >= 90 ? 'High Quality' : qualityReport.score >= 70 ? 'Acceptable' : 'Needs Review';

  const approveUrl = `https://github.com/${REPO}/actions/workflows/approve-article.yml`;

  const checksTable = qualityReport.checks.map(check => {
    const icon = check.passed ? '✅' : '❌';
    const weight = check.weight === 'required' ? 'Required' : 'Soft';
    return `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${icon}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${check.name}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${weight}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${check.message}</td>
    </tr>`;
  }).join('\n');

  const subject = `[RegActions Blog] AI Article Draft: ${title}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 700px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .logo { font-size: 20px; font-weight: bold; color: #3b82f6; margin-bottom: 24px; }
    h1 { color: #111827; font-size: 20px; margin: 0 0 8px 0; }
    h2 { color: #374151; font-size: 16px; margin: 24px 0 12px 0; }
    p { margin: 0 0 12px 0; color: #4b5563; font-size: 14px; }
    .meta { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .meta-label { font-weight: 600; color: #374151; }
    .score-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; color: white; font-weight: 600; font-size: 14px; }
    .button { display: inline-block; background: #3b82f6; color: white !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin: 16px 8px 16px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
    th { text-align: left; padding: 8px 12px; background: #f3f4f6; border-bottom: 2px solid #d1d5db; }
    .excerpt { font-style: italic; color: #6b7280; border-left: 3px solid #3b82f6; padding-left: 12px; margin: 12px 0; }
    .footer { text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">RegActions Blog — AI Article Review</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="excerpt">${escapeHtml(excerpt)}</p>

      <div class="meta">
        <div class="meta-row">
          <span class="meta-label">Quality Score:</span>
          <span class="score-badge" style="background:${scoreColor}">${qualityReport.score}/100 — ${scoreLabel}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Track:</span>
          <span>${track}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Word Count:</span>
          <span>${wordCount} words</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Generated:</span>
          <span>${generatedAt}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Slug:</span>
          <span><code>${slug}</code></span>
        </div>
      </div>

      <h2>Quality Gate Results (${qualityReport.requiredPassed}/${qualityReport.requiredTotal} required, ${qualityReport.softPassed}/${qualityReport.softTotal} soft)</h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Check</th>
            <th>Type</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          ${checksTable}
        </tbody>
      </table>

      <h2>Actions</h2>
      <p>To approve and publish this article, trigger the approval workflow on GitHub:</p>
      <a href="${approveUrl}" class="button">Approve & Publish on GitHub</a>
      <p style="font-size:12px;color:#9ca3af;">Use slug: <code>${slug}</code> when triggering the workflow.</p>

      <div class="footer">
        <p>This is an automated review notification from RegActions AI Blog Pipeline.<br>
        Draft saved at <code>scripts/data/drafts/${slug}.json</code></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `RegActions Blog — AI Article Review

Title: ${title}
Excerpt: ${excerpt}
Quality Score: ${qualityReport.score}/100 (${scoreLabel})
Track: ${track}
Word Count: ${wordCount}
Slug: ${slug}
Generated: ${generatedAt}

Quality Checks:
${qualityReport.checks.map(c => `  ${c.passed ? 'PASS' : 'FAIL'} [${c.weight}] ${c.name}: ${c.message}`).join('\n')}

To approve: Go to ${approveUrl} and trigger with slug "${slug}"
`;

  try {
    const command = new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [REVIEW_EMAIL] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    });

    const response = await ses.send(command);
    console.log(`  Review email sent to ${REVIEW_EMAIL} (MessageId: ${response.MessageId})`);
    return response.MessageId || null;
  } catch (error) {
    console.error('Failed to send review email:', error);
    return null;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
