import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { oldInline } from './__fixtures__/oldWordingInline.js';
import * as T from './index.js';
import * as F from './fixtures.js';
import { verificationEmail, alertEmail, watchlistAlertEmail, weeklyDigestEmail } from '../email.js';
import { personaDigestEmail } from '../personaDigestEmail.js';
import { buildConsolidatedDigest } from '../emailDigest.js';
import { buildMonitorSmokeMessage } from '../../../api/cron/process-monitors.js';
import { buildOpsAlertMessage } from '../opsAlerts.js';
import { buildMaintenanceEmailReport } from '../maintenanceAgent.js';
import { buildBoardPackNotification } from '../boardPackLeads.js';

/**
 * Wording parity: every fact and link that the OLD (origin/main a072223)
 * templates showed must still be present in the NEW kit-based templates,
 * unless it is explicitly allowlisted below WITH A REASON.
 */

const B = 'https://regactions.com';
type Allow = Array<[RegExp, string]>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9£%]/g, '');
function haystack(html: string) {
  const visible = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&rsaquo;/g, '');
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  return { text: norm(visible), hrefs };
}

// Button/link labels moved to sentence case; the comparison is case-insensitive, so no per-label allowlist is needed.
const GENERIC: Allow = [
  [/^(RegActions|regactions\.com|RegCanary)$/i, 'wordmark is now the header/footer lockup; bare domain footer replaced by footer links'],
  [/^Unsubscribe$|^Stop watching this firm$/, 'present as a footer link; checked via hrefs'],
];

const ALLOW: Record<string, Allow> = {
  'alert.single': [[/^View on Dashboard|^Unsubscribe/, 'link text kept; arrow glyph handled by normalisation']],
  'weekly.direct': [[/^5 Oct - 12 Oct 2026$/, 'period shown in long date form'], [/^(Firm|Breach Type)$/, 'table headers replaced by story rows (firm title, regulator chip, amount and breach summary)']],
  'verification.alert': [[/^Fines of £1.0m or more$/, 'caller-supplied free-text details; shown in the Subscription row']],
  'persona.digest': [
    [/^Regulatory Intelligence for Financial Services$/, 'RegCanary tagline replaced by the RegActions tagline'],
    [/RegCanary|regcanary\.com/i, 'RegCanary branding on a RegActions email replaced with RegActions (owner request)'],
    [/^\(deterministic fallback\)$/i, 'internal label removed from reader-facing output'],
    [/relevant to your sector this week/, 'list covers the last 30 days, not "this week"; lede now states the real window'],
    [/^Track enforcement actions across 30\+ global regulators\. Full analysis and trend data on RegCanary\.$/, 'RegCanary -> RegActions'],
  ],
  'persona.digest.plain': [[/^Regulatory Intelligence for Financial Services$/, 'RegCanary tagline replaced by the RegActions tagline'], [/RegCanary|regcanary\.com/i, 'RegCanary -> RegActions'], [/relevant to your sector this week/, 'real 30-day window stated']],
  'consolidated.empty': [[/No operational or enforcement updates require attention/, 'all-clear must not assert absence of issues; now says nothing was queued']],
  maintenance: [[/^Scraper Maintenance Agent$/, 'item title is the numbered heading; eyebrow shows the category'], [/^(Status|Suggested Fix)$/, 'table headers replaced by story rows with status chips'], [/^Scraper Maintenance Agent · RegActions$/, 'moved into the footer line']],
  'ops.critical': [[/./, 'ops alert is now a fragment inside the consolidated digest']],
  'ops.recovery': [[/./, 'ops alert is now a fragment inside the consolidated digest']],
  'boardpack.lead': [[/^(Profile|Firm type): /, 'merged into the "Firm profile" row'], [/^A visitor downloaded a public Board Pack\./, 'lede keeps the sentence; consent is its own row'], [/^Scope$/, 'split into Regulators and Themes rows']],
  'alert.queued': [[/^New RegActions Alert$/, 'item title is the numbered heading in the digest; eyebrow shows the category only'], [/\d\d\/\d\d\/\d{4}/, 'dates shown in long form (8 October 2026)'], [/\/dashboard/, '/dashboard is a permanent redirect to /fines; link the canonical page']],
  'watchlist.queued': [[/\d\d\/\d\d\/\d{4}/, 'dates shown in long form'], [/\/dashboard/, '/dashboard redirects to /fines']],
  'digest.queued': [[/^This Week's Summary$|^Weekly Digest$/, 'item title is the numbered heading ("This Week: ..."); eyebrow shows the category'], [/\/dashboard/, '/dashboard redirects to /fines'], [/^Firm \/ regulator$|^Amount$/, 'table headers replaced by story rows with regulator chip'], [/^Top 5 Actions$/, 'heading now counts what is listed (Top N)']],
  'country.changes': [[/^RegActions$/, 'RegActions prefix stripped from item titles inside a RegActions email'], [/^(FATF listing|Sanctions|Risk score): /, 'change kind is now a chip beside the title']],
  'verify.digest': [[/^weekly Digest$/, 'capitalised to "Weekly Digest" (CSS did this before)']],
  'verify.watchlist': [],
  contact: [],
  'developer.application': [],
};
const LINK_ALLOW: Record<string, Array<[RegExp, string]>> = {
  'alert.single': [[/\/dashboard$/, '/dashboard redirects to /fines']],
  'watchlist.single': [[/\/dashboard$/, '/dashboard redirects to /fines']],
  'weekly.direct': [[/\/dashboard$/, '/dashboard redirects to /fines']],
  'persona.digest': [[/regcanary\.com/, 'RegCanary -> RegActions']],
  'persona.digest.plain': [[/regcanary\.com/, 'RegCanary -> RegActions']],
  'alert.queued': [[/^New RegActions Alert$/, 'item title is the numbered heading in the digest; eyebrow shows the category only'], [/\/dashboard$/, '/dashboard redirects to /fines']],
  'watchlist.queued': [[/\/dashboard$/, '/dashboard redirects to /fines']],
  'digest.queued': [[/^This Week's Summary$|^Weekly Digest$/, 'item title is the numbered heading ("This Week: ..."); eyebrow shows the category'], [/\/dashboard$/, '/dashboard redirects to /fines']],
  'consolidated.items': [],
  'ops.critical': [[/./, 'fragment']],
  'ops.recovery': [[/./, 'fragment']],
};

const a = F.alertFine;
const fragmentDoc = (f: { html: string; text: string }, subject = 'Item') =>
  T.consolidatedDigestEmail([{ subject, text_body: f.text, html_body: f.html }], { now: F.FIXTURE_NOW });

async function renderAll(): Promise<Record<string, { html: string }>> {
  const brief = await buildMaintenanceEmailReport(F.maintenanceResult as never);
  const bp = buildBoardPackNotification(F.boardPackLead as never).payload;
  const ops = (action: 'critical' | 'recovery', status: 'critical' | 'healthy') => buildOpsAlertMessage({ ...F.opsSummary, status } as never, action);
  return {
    'verification.alert': verificationEmail('alert', 'tok-verify-1', 'Fines of £1.0m or more'),
    'verification.watchlist': verificationEmail('watchlist', 'tok-verify-2'),
    'verification.digest': verificationEmail('digest', 'tok-verify-3'),
    'alert.single': alertEmail(a.firmName, a.amount, a.breachType, a.date, a.noticeUrl, a.unsubscribeToken),
    'watchlist.single': watchlistAlertEmail(a.firmName, a.amount, null, a.date, a.noticeUrl, 'tok-watch-9'),
    'weekly.direct': weeklyDigestEmail(F.digestFines, 1_815_000, '2026-10-05', '2026-10-12', 'tok-digest-4'),
    'persona.digest': personaDigestEmail({ personaName: 'Payments & Fintech', personaId: 'payments_fintech', items: F.personaItems, unsubscribeToken: 'tok-persona-7', firmName: 'Brightwater Payments plc', briefing: F.personaBriefing }),
    'persona.digest.plain': personaDigestEmail({ personaName: 'Wealth Management', personaId: 'wealth', items: F.personaItems.slice(0, 2), unsubscribeToken: 'tok-persona-8' }),
    'consolidated.items': buildConsolidatedDigest([
      { subject: 'FCA fine alert', text_body: 'Line one\nLine two', html_body: null },
      { subject: 'Monitor result', text_body: 'Body text', html_body: '<p>Fragment <a href="https://regactions.com/search">link</a></p>' },
    ]),
    'consolidated.empty': buildConsolidatedDigest([]),
    'monitor.smoke': buildMonitorSmokeMessage({ label: F.monitorFixture.label }),
    'ops.critical': fragmentDoc(ops('critical', 'critical')),
    'ops.recovery': fragmentDoc(ops('recovery', 'healthy')),
    maintenance: fragmentDoc(brief, brief.subject),
    'boardpack.lead': bp,
    // previously inline templates
    'verify.alert': T.alertVerificationEmail({ verifyUrl: `${B}/api/alerts/verify/tok-v`, topic: 'fines', minAmount: 1_000_000, breachTypes: ['AML', 'Market abuse'], frequency: 'daily' }),
    'verify.alert.resend': T.alertVerificationEmail({ verifyUrl: `${B}/api/alerts/verify/tok-v`, topic: 'fines', minAmount: 1_000_000, breachTypes: ['AML', 'Market abuse'], frequency: 'daily', resend: true }),
    'verify.country': T.alertVerificationEmail({ verifyUrl: `${B}/api/alerts/verify/tok-v`, topic: 'country-changes', frequency: 'weekly' }),
    'verify.digest': T.digestVerificationEmail({ verifyUrl: `${B}/api/digest/verify/tok-v`, frequency: 'weekly' }),
    'verify.watchlist': T.watchlistVerificationEmail({ verifyUrl: `${B}/api/watchlist/verify/tok-v`, firmName: 'Harrowgate Capital Partners Ltd' }),
    'verify.monitor': T.monitorVerificationEmail({ verifyUrl: `${B}/api/monitors/verify/tok-v`, label: F.monitorFixture.label, frequency: 'weekly' }),
    'monitor.results': fragmentDoc(T.monitorResultsFragment({ label: 'UK payments safeguarding', newCount: 3, rows: [{ firm: 'Brightwater Payments plc', regulator: 'FCA', date: '2026-10-09', breachType: 'Safeguarding failures' }, { firm: 'Alder Mutual Society', regulator: 'PRA', date: '2026-10-06', breachType: null }], scopeUrl: `${B}/search?q=safeguarding`, manageUrl: `${B}/monitor?token=abc` }), '3 new results: UK payments safeguarding'),
    'country.changes': fragmentDoc(T.countryChangesFragment({ events: F.countryEvents.map((e) => ({ date: e.date, kindLabel: e.kind === 'fatf' ? 'FATF listing' : e.kind === 'sanctions' ? 'Sanctions' : 'Risk score', title: e.title })), totalFresh: 3, unsubscribeUrl: `${B}/api/alerts/unsubscribe/tok` }), 'RegActions: 3 country-risk changes this week'),
    'alert.queued': fragmentDoc(T.fineAlertFragment({ fines: F.fineLines, unsubscribeUrl: `${B}/api/alerts/unsubscribe/tok` }), 'RegActions Alert: 2 new enforcement actions'),
    'watchlist.queued': fragmentDoc(T.watchlistAlertFragment({ firmName: 'Harrowgate Capital Partners Ltd', fines: F.fineLines.slice(0, 1), unsubscribeUrl: `${B}/api/watchlist/unsubscribe/tok` }), 'Watchlist Alert: Harrowgate Capital Partners Ltd enforcement action'),
    'digest.queued': fragmentDoc(T.periodDigestFragment({ frequency: 'weekly', ...F.periodDigestInput, unsubscribeUrl: `${B}/api/digest/unsubscribe/tok` }), 'This Week: 14 enforcement actions, £9.4m monetary total'),
    contact: T.contactNotificationEmail({ name: 'Jonas Whitfield', email: 'jonas.whitfield@example-firm.co.uk', company: 'Whitfield & Co', reason: 'demo', message: 'We would like a walkthrough of the monitoring features.\nCould you suggest times next week?' }),
    'developer.application': T.developerApplicationEmail({ applicationId: 42, organisationName: 'Lumen Data Labs', contactName: 'Sara Okonkwo', contactEmail: 'sara@lumen-data.example', requestedTermMonths: 6, expectedDailyRequests: 5000, intendedUse: 'Enrich our internal case-management tool with enforcement outcomes.' }),
    'developer.operator': T.developerOperatorEmail({ subject: 'x', title: 'API client rate limited', lines: ['Client Lumen Data Labs exceeded 60 requests per minute.', 'Requests were rejected with HTTP 429.'] }),
  };
}

const oldCaptured = JSON.parse(readFileSync(path.resolve(process.cwd(), 'server/services/emailTemplates/__fixtures__/old-wording.json'), 'utf8')) as Record<string, { lines: string[]; hrefs: string[] }>;
const oldAll: Record<string, { lines: string[]; hrefs: string[] }> = { ...oldCaptured, ...oldInline };

describe('email wording parity (old templates -> kit templates)', () => {
  it('keeps every fact and link, except explicitly allowlisted changes', async () => {
    const rendered = await renderAll();
    const failures: string[] = [];
    for (const [key, old] of Object.entries(oldAll)) {
      const next = rendered[key];
      expect(next, `no new render for ${key}`).toBeTruthy();
      const hay = haystack(next.html);
      const allow = [...GENERIC, ...(ALLOW[key] ?? [])];
      for (const raw of old.lines) {
        for (const fact of raw.split(/ · | \| /).map((x) => x.trim()).filter(Boolean)) {
          if (allow.some(([re]) => re.test(fact))) continue;
          if (!norm(fact)) continue;
          if (!hay.text.includes(norm(fact))) failures.push(`${key}: missing text "${fact}"`);
        }
      }
      const linkAllow = LINK_ALLOW[key] ?? [];
      for (const href of old.hrefs) {
        if (linkAllow.some(([re]) => re.test(href))) continue;
        if (!hay.hrefs.includes(href)) failures.push(`${key}: missing link ${href}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps a plain-text alternative with the links for every template', async () => {
    const rendered = (await renderAll()) as Record<string, { html: string; text?: string }>;
    for (const [key, r] of Object.entries(rendered)) {
      if (!r.text || ['consolidated.empty', 'ops.critical', 'ops.recovery'].includes(key)) continue;
      expect(r.text.length, key).toBeGreaterThan(40);
      expect(r.text, key).not.toMatch(/<\/?(table|tr|td|div|span|p|a|h\d)[ >]/i);
    }
  });
});
