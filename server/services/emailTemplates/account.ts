/**
 * Account / subscription-verification emails (Account & Security layout).
 */
import {
  type DetailRow,
  button,
  detailsTable,
  eyebrow,
  headline,
  lede,
  paragraph,
  renderEmailDocument,
  smallPrint,
  siteUrl,
} from '../emailKit/index.js';
import { capitalise } from './common.js';

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export interface VerificationInput {
  subject: string;
  /** Eyebrow second part, e.g. "Alerts". */
  area: string;
  heading: string;
  intro: string;
  detailsTitle?: string;
  details?: DetailRow[];
  /** Extra sentence shown under the details (only when real). */
  detailNote?: string;
  buttonLabel: string;
  verifyUrl: string;
  expiry: string;
  ignoreNote?: string;
  recipient?: string | null;
  label?: string;
  now?: Date;
}

export function verificationDocument(input: VerificationInput): BuiltEmail {
  const blocks = [
    eyebrow(['Account', input.area]),
    headline(input.heading),
    lede(input.intro),
    ...(input.details ? detailsTable(input.details, { title: input.detailsTitle }) : []),
    ...(input.detailNote ? [paragraph(input.detailNote)] : []),
    ...button({ label: input.buttonLabel, href: input.verifyUrl }, { top: 8, bottom: 14 }),
    smallPrint(input.expiry),
    ...(input.ignoreNote ? [smallPrint(input.ignoreNote)] : []),
  ];
  const { html, text } = renderEmailDocument({
    title: input.subject,
    preheader: input.intro,
    label: input.label ?? 'Account',
    date: input.now,
    blocks,
    footer: { recipient: input.recipient },
  });
  return { subject: input.subject, html, text };
}

const typeLabels = {
  alert: 'RegActions Alerts',
  watchlist: 'Firm Watchlist',
  digest: 'Weekly Digest',
} as const;

/** Generic verification (previously the unused-but-exported email.ts template). */
export function genericVerificationEmail(
  type: keyof typeof typeLabels,
  token: string,
  details?: string,
  recipient?: string,
): BuiltEmail {
  const path = type === 'alert' ? 'alerts' : type;
  return verificationDocument({
    subject: `Verify your ${typeLabels[type]} subscription`,
    area: typeLabels[type],
    heading: 'Verify your subscription',
    intro: `You've requested to subscribe to ${typeLabels[type]}. Click the button below to confirm your email address and activate your subscription.`,
    details: details ? [{ label: 'Subscription', value: details }] : undefined,
    buttonLabel: 'Verify email address',
    verifyUrl: `${siteUrl()}/api/${path}/verify/${token}`,
    expiry: 'This link will expire in 24 hours.',
    ignoreNote: "If you didn't request this subscription, you can safely ignore this email.",
    recipient,
  });
}

export interface AlertVerificationInput {
  verifyUrl: string;
  topic: 'fines' | 'country-changes';
  /** Minimum fine in GBP, if the subscriber set one. */
  minAmount?: number | string | null;
  breachTypes?: string[] | null;
  frequency: string;
  resend?: boolean;
  recipient?: string | null;
  now?: Date;
}

export function alertVerificationEmail(input: AlertVerificationInput): BuiltEmail {
  const country = input.topic === 'country-changes';
  const heading = country ? 'Verify your country-risk changes subscription' : 'Verify your alert subscription';
  const intro = input.resend
    ? 'You requested to resend your verification email. Click the button below to confirm your email address.'
    : country
      ? "You've requested a weekly digest of country-risk changes (FATF listings, sanctions, EU tax list and score moves). Click the button below to confirm your email address."
      : "You've requested to receive regulatory fine alerts. Click the button below to confirm your email address.";
  const minAmountText = input.minAmount
    ? `Fines of £${(Number(input.minAmount) / 1_000_000).toFixed(1)}m or more`
    : 'All fines';
  const breachText = input.breachTypes?.length ? input.breachTypes.join(', ') : 'All breach types';
  const details: DetailRow[] = country
    ? [
        { label: 'Digest', value: 'Country-risk changes' },
        { label: 'Frequency', value: 'Weekly' },
      ]
    : [
        { label: 'Fines', value: minAmountText },
        { label: 'Breach types', value: breachText },
        { label: 'Frequency', value: capitalise(input.frequency) },
      ];
  return verificationDocument({
    subject: country ? 'Verify your RegActions country-risk changes subscription' : 'Verify your RegActions alert subscription',
    area: country ? 'Country-risk changes' : 'Alerts',
    heading,
    intro,
    detailsTitle: country ? 'Your digest' : 'Your alert criteria',
    details,
    buttonLabel: 'Verify email address',
    verifyUrl: input.verifyUrl,
    expiry: 'This link expires in 7 days.',
    recipient: input.recipient,
    now: input.now,
  });
}

export function digestVerificationEmail(input: {
  verifyUrl: string;
  frequency: string;
  recipient?: string | null;
  now?: Date;
}): BuiltEmail {
  const cadence = input.frequency === 'weekly' ? 'every Monday' : 'on the 1st of each month';
  return verificationDocument({
    subject: `Verify your ${input.frequency} RegActions Digest`,
    area: 'Digest',
    heading: 'Verify your digest subscription',
    intro: "You've requested to receive the RegActions digest. Click the button below to confirm.",
    details: [{ label: 'Digest', value: `${input.frequency.charAt(0).toUpperCase()}${input.frequency.slice(1)} Digest` }],
    detailNote: `You'll receive a summary of new tracked enforcement actions ${cadence}.`,
    buttonLabel: 'Verify & subscribe',
    verifyUrl: input.verifyUrl,
    expiry: 'This link expires in 7 days.',
    recipient: input.recipient,
    now: input.now,
  });
}

export function watchlistVerificationEmail(input: {
  verifyUrl: string;
  firmName: string;
  recipient?: string | null;
  now?: Date;
}): BuiltEmail {
  const firm = input.firmName.trim();
  return verificationDocument({
    subject: `Verify your watchlist: ${firm}`,
    area: 'Watchlist',
    heading: 'Verify your firm watchlist',
    intro: "You've requested to watch a firm for new regulatory enforcement actions. Click the button below to confirm.",
    details: [{ label: 'Firm', value: firm }],
    detailNote: "You'll be notified whenever this firm receives a new tracked enforcement action.",
    buttonLabel: 'Verify & start watching',
    verifyUrl: input.verifyUrl,
    expiry: 'This link expires in 7 days.',
    recipient: input.recipient,
    now: input.now,
  });
}

export function monitorVerificationEmail(input: {
  verifyUrl: string;
  label: string;
  frequency: string;
  recipient?: string | null;
  now?: Date;
}): BuiltEmail {
  return verificationDocument({
    subject: `Verify your RegActions monitor: ${input.label}`,
    area: 'Monitor',
    label: 'Monitor',
    heading: 'Verify your RegActions monitor',
    intro: `${input.label} will check this evidence scope ${input.frequency}.`,
    buttonLabel: 'Verify monitor',
    verifyUrl: input.verifyUrl,
    expiry: 'This link expires in seven days. No account is required.',
    recipient: input.recipient,
    now: input.now,
  });
}

