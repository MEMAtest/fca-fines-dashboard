/**
 * Contact, lead, developer-API and operations emails. Internal recipients, so
 * these use the compact footer (no legal disclaimer, no Contact link).
 */
import {
  type Block,
  type DetailRow,
  buttons,
  detailsTable,
  eyebrow,
  headline,
  kpiTiles,
  lede,
  messageBox,
  paragraph,
  pill,
  renderEmailDocument,
  renderEmailFragment,
  sectionHeading,
  siteUrl,
  smallPrint,
  storyList,
  type Tone,
} from '../emailKit/index.js';
import type { BuiltEmail } from './account.js';
import { links } from './common.js';

const internalFooter = { variant: 'internal' as const };

// ------------------------------------------------------------------ contact

export const CONTACT_REASON_LABELS: Record<string, string> = {
  demo: 'Request a Demo',
  inquiry: 'General Inquiry',
  partnership: 'Partnership Opportunity',
  support: 'Technical Support',
  other: 'Other',
};

export function contactNotificationEmail(input: {
  name: string;
  email: string;
  company?: string | null;
  reason: string;
  message: string;
  receivedAt?: Date;
  now?: Date;
}): BuiltEmail {
  const reasonLabel = CONTACT_REASON_LABELS[input.reason] || input.reason;
  const subject = `RegActions Contact: ${reasonLabel} from ${input.name}`;
  const received = (input.receivedAt ?? input.now)?.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/London' });
  const blocks: Block[] = [
    eyebrow(['Account communication', 'Contact form']),
    headline('New Contact Form Submission'),
    ...detailsTable([
      { label: 'Name', value: input.name },
      { label: 'Email', value: { label: input.email.trim(), href: `mailto:${input.email.trim()}` } },
      { label: 'Company', value: input.company || undefined },
      { label: 'Reason', value: reasonLabel },
      { label: 'Received', value: received },
    ]),
    messageBox(input.message, 'Message'),
    smallPrint('Submitted via RegActions contact form'),
  ];
  const doc = renderEmailDocument({ title: subject, label: 'Contact', date: input.now, blocks, footer: internalFooter });
  return { subject, ...doc };
}

// --------------------------------------------------------------- board pack

export function boardPackLeadEmail(input: {
  subject: string;
  name: string;
  workEmail: string;
  organisation: string;
  profile: { firmName: string; archetypeId: string; boardFocus: string; priorityRegulators: string[]; priorityThemeIds: string[] };
  consentAt: Date | string;
  marketingConsent: boolean;
  now?: Date;
}): BuiltEmail {
  const p = input.profile;
  const consentIso = new Date(input.consentAt).toISOString();
  const blocks: Block[] = [
    eyebrow(['Account communication', 'Board Pack']),
    headline('New RegActions board pack lead'),
    lede('A visitor downloaded a public Board Pack.'),
    ...detailsTable([
      { label: 'Name', value: input.name },
      { label: 'Work email', value: { label: input.workEmail, href: `mailto:${input.workEmail}` } },
      { label: 'Organisation', value: input.organisation },
      { label: 'Firm profile', value: `${p.firmName} (${p.archetypeId})` },
      { label: 'Committee lens', value: p.boardFocus },
      { label: 'Regulators', value: p.priorityRegulators.join(', ') || undefined },
      { label: 'Themes', value: p.priorityThemeIds.join(', ') || undefined },
      { label: 'Marketing follow-up consent', value: { pill: input.marketingConsent ? 'Yes' : 'No', tone: input.marketingConsent ? 'low' : 'neutral' } },
    ], { title: 'Key details' }),
    smallPrint(`Privacy acknowledgement was captured at ${consentIso}.`),
  ];
  const doc = renderEmailDocument({ title: input.subject, label: 'Board Pack Lead', date: input.now, blocks, footer: internalFooter });
  return { subject: input.subject, ...doc };
}

// ------------------------------------------------------------ developer API

export function developerApplicationEmail(input: {
  applicationId: number;
  organisationName: string;
  contactName: string;
  contactEmail: string;
  requestedTermMonths: number;
  expectedDailyRequests?: number | null;
  intendedUse: string;
  now?: Date;
}): BuiltEmail {
  const subject = `RegActions API application #${input.applicationId}: ${input.organisationName}`;
  const blocks: Block[] = [
    eyebrow(['Account communication', 'Developer API']),
    headline(`New RegActions API application #${input.applicationId}`),
    ...detailsTable([
      { label: 'Organisation', value: input.organisationName },
      { label: 'Contact', value: `${input.contactName} <${input.contactEmail}>` },
      { label: 'Requested term', value: `${input.requestedTermMonths} months` },
      { label: 'Expected daily requests', value: input.expectedDailyRequests ?? 'not supplied' },
    ]),
    messageBox(input.intendedUse, 'Intended use'),
  ];
  const doc = renderEmailDocument({ title: subject, label: 'Developer API', date: input.now, blocks, footer: internalFooter });
  return { subject, ...doc };
}

export function developerOperatorEmail(input: { subject: string; title: string; lines: string[]; now?: Date }): BuiltEmail {
  const blocks: Block[] = [
    eyebrow(['Workflow notification', 'Developer API']),
    headline(input.title),
    ...input.lines.map((l) => paragraph(l)),
    ...buttons([{ label: 'Open the protected operations dashboard', href: links.ops() }]),
  ];
  const doc = renderEmailDocument({ title: input.subject, label: 'Developer API', date: input.now, blocks, footer: internalFooter });
  return { subject: input.subject, html: doc.html, text: [input.title, '', ...input.lines, '', `Open ${links.ops()} for the protected usage record.`].join('\n') };
}

// --------------------------------------------------------------- operations

const STATUS_TONE: Record<string, Tone> = { healthy: 'low', ok: 'low', warning: 'medium', degraded: 'medium', critical: 'high', error: 'high' };

/** Chrome-less ops alert (queued into the consolidated digest). */
export function opsAlertFragment(input: {
  headline: string;
  status: string;
  checkedAt: string;
  sections: Array<{ name: string; status: string }>;
}): { html: string; text: string } {
  return renderEmailFragment([
    eyebrow(['Operations']),
    lede(input.headline),
    ...detailsTable([
      { label: 'Overall status', value: { pill: input.status, tone: STATUS_TONE[input.status] ?? 'neutral' } },
      { label: 'Checked', value: input.checkedAt },
      ...input.sections.map((s) => ({ label: s.name, value: { pill: s.status, tone: STATUS_TONE[s.status] ?? 'neutral' } as DetailRow['value'] })),
    ]),
    ...buttons([{ label: 'Open the protected operations dashboard', href: links.ops() }]),
  ]);
}

export function maintenanceReportFragment(input: {
  analyzed: number;
  autoFixed: number;
  needsHuman: number;
  trends: Array<{ regulator: string; consecutiveFailures: number; isNewToday: boolean; isRecovering: boolean }>;
  issues: Array<{ regulator: string; fixAttempted: boolean; fixSuccess: boolean; issue: string | null; suggestedFix: string | null }>;
  generatedAt: string;
}): { html: string; text: string } {
  const trendStories = input.trends.map((t) => ({
    chips: [{ label: t.regulator }],
    title: `${t.consecutiveFailures} consecutive ${t.consecutiveFailures === 1 ? 'failure' : 'failures'}`,
    summary: t.isNewToday ? 'New today' : t.isRecovering ? 'Recovering' : 'Ongoing',
  }));
  const issueStories = input.issues.map((i) => ({
    chips: [
      { label: i.regulator },
      { label: i.fixSuccess ? 'Auto-fixed' : i.fixAttempted ? 'Fix failed' : 'Needs human', tone: (i.fixSuccess ? 'low' : i.fixAttempted ? 'high' : 'medium') as Tone },
    ],
    title: i.issue || 'Unknown',
    summary: i.suggestedFix || undefined,
  }));
  return renderEmailFragment([
    eyebrow(['Scraper maintenance agent']),
    ...kpiTiles([
      { value: input.analyzed, label: 'Analyzed' },
      { value: input.autoFixed, label: 'Auto-Fixed' },
      { value: input.needsHuman, label: 'Needs Human' },
    ]),
    ...(trendStories.length ? storyList(trendStories, { title: 'Failure Trends (7 days)' }) : [paragraph('No failure trends detected.')]),
    ...(issueStories.length ? storyList(issueStories, { title: 'Issues Analyzed' }) : [paragraph('No new issues to analyze.')]),
    smallPrint(`Scraper Maintenance Agent · RegActions · ${input.generatedAt} UTC`),
  ]);
}

// ----------------------------------------------------------- article review

export function articleReviewEmail(input: {
  subject: string;
  title: string;
  excerpt: string;
  slug: string;
  wordCount: number;
  track: string;
  generatedAt: string;
  score: number;
  scoreLabel: string;
  requiredPassed: number;
  requiredTotal: number;
  softPassed: number;
  softTotal: number;
  checks: Array<{ name: string; passed: boolean; weight: string; message: string }>;
  workflowUrl: string;
  now?: Date;
}): BuiltEmail {
  const tone: Tone = input.score >= 90 ? 'low' : input.score >= 70 ? 'medium' : 'high';
  const blocks: Block[] = [
    eyebrow(['Workflow notification', 'AI Article Review']),
    headline(input.title),
    lede(input.excerpt),
    ...detailsTable([
      { label: 'Quality Score', value: { pill: `${input.score}/100 — ${input.scoreLabel}`, tone } },
      { label: 'Track', value: input.track },
      { label: 'Word Count', value: `${input.wordCount} words` },
      { label: 'Generated', value: input.generatedAt },
      { label: 'Slug', value: input.slug },
    ]),
    ...storyList(
      input.checks.map((c) => ({
        chips: [
          { label: c.passed ? 'Pass' : 'Fail', tone: (c.passed ? 'low' : 'high') as Tone },
          { label: c.weight === 'required' ? 'Required' : 'Soft', tone: 'neutral' as Tone },
        ],
        title: c.name,
        summary: c.message,
      })),
      { title: `Quality Gate Results (${input.requiredPassed}/${input.requiredTotal} required, ${input.softPassed}/${input.softTotal} soft)` },
    ),
    sectionHeading('Actions'),
    paragraph('The Editorial Engine will run regulatory, copy, visual and Head Editorial Agent review before the Publisher Agent can publish. Use the workflow only to inspect or retry the automated chain.'),
    ...buttons([{ label: 'Open editorial workflow', href: input.workflowUrl }]),
    smallPrint(`Workflow slug: ${input.slug}. This is an automated review notification from RegActions AI Blog Pipeline. Draft saved at scripts/data/drafts/${input.slug}.json`),
  ];
  const doc = renderEmailDocument({ title: input.subject, label: 'Blog Review', date: input.now, blocks, footer: internalFooter });
  return { subject: input.subject, ...doc };
}

// ------------------------------------------------------------ daily summary

export function dailySummaryEmail(input: {
  subject: string;
  pageviews: number;
  topPaths: Array<{ path: string; hits: number }>;
  latestNotice: { firm: string; amountText: string; date: string } | null;
  now?: Date;
}): { html: string } {
  const blocks: Block[] = [
    eyebrow(['Daily summary', 'Last 24 hours']),
    headline('RegActions – Daily Summary'),
    ...kpiTiles([{ value: input.pageviews, label: 'Pageviews' }]),
    ...(input.topPaths.length
      ? storyList(input.topPaths.map((p) => ({ title: p.path, summary: `${p.hits} ${p.hits === 1 ? 'hit' : 'hits'}` })), { title: 'Top paths' })
      : [sectionHeading('Top paths'), paragraph('None')]),
    sectionHeading('Latest notice (last 24h)'),
    paragraph(input.latestNotice ? `${input.latestNotice.firm} · ${input.latestNotice.amountText} · ${input.latestNotice.date}` : 'None detected'),
  ];
  const doc = renderEmailDocument({ title: input.subject, label: 'Daily Summary', date: input.now, blocks, footer: internalFooter });
  return { html: doc.html };
}

export { pill, siteUrl };
