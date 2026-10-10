/**
 * Article Review Email — Editorial Engine notification
 *
 * Sends a review email to the admin when an AI article is generated.
 * The independent agent review chain and Head Editorial Agent control approval.
 *
 * Uses AWS SES (same pattern as server/services/email.ts).
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { QualityReport } from './articleQuality.js';
import { articleReviewEmail } from '../../server/services/emailTemplates/internal.js';

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

  const scoreLabel = qualityReport.score >= 90 ? 'High Quality' : qualityReport.score >= 70 ? 'Acceptable' : 'Needs Review';

  const approveUrl = `https://github.com/${REPO}/actions/workflows/approve-article.yml`;

  const subject = `[RegActions Blog] AI Article Draft: ${title}`;

  const { html } = articleReviewEmail({
    subject,
    title,
    excerpt,
    slug,
    wordCount,
    track,
    generatedAt,
    score: qualityReport.score,
    scoreLabel,
    requiredPassed: qualityReport.requiredPassed,
    requiredTotal: qualityReport.requiredTotal,
    softPassed: qualityReport.softPassed,
    softTotal: qualityReport.softTotal,
    checks: qualityReport.checks.map((c) => ({ name: c.name, passed: c.passed, weight: c.weight, message: c.message })),
    workflowUrl: approveUrl,
  });

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

Editorial workflow: ${approveUrl} (slug "${slug}")
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
