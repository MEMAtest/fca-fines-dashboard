/**
 * Digest recipient guard.
 *
 * The persona digest list was seeded with `contact@<firm>.placeholder`
 * addresses. Nothing stopped the weekly cron mailing them, which bounces
 * through SES and marks the week's items as "sent" for real recipients.
 * Every send path filters through this check.
 */

// Reserved / non-routable TLDs (RFC 2606, RFC 6761) plus our seed marker.
const UNDELIVERABLE_TLDS = new Set([
  'placeholder',
  'example',
  'test',
  'invalid',
  'localhost',
  'local',
]);

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isDeliverableDigestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(trimmed)) return false;

  const domain = trimmed.slice(trimmed.lastIndexOf('@') + 1);
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (UNDELIVERABLE_TLDS.has(tld)) return false;
  if (domain === 'example.com' || domain === 'example.org' || domain === 'example.net') return false;

  return true;
}
