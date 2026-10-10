/**
 * Every email template rendered with fictional fixture data. Shared by the
 * preview script and the tests (href routing, size limits).
 */
import { renderEmailDocument } from '../emailKit/index.js';
import * as T from './index.js';
import * as F from './fixtures.js';
import { verificationEmail, alertEmail, watchlistAlertEmail, weeklyDigestEmail } from '../email.js';
import { personaDigestEmail } from '../personaDigestEmail.js';
import { buildMonitorSmokeMessage } from '../../../api/cron/process-monitors.js';
import { buildOpsAlertMessage } from '../opsAlerts.js';
import { buildBoardPackNotification } from '../boardPackLeads.js';
import { buildMaintenanceEmailReport } from '../maintenanceAgent.js';

const now = F.FIXTURE_NOW;
const BASE = 'https://regactions.com';

type Built = { subject: string; html: string; text: string };
export const previews: Array<{ file: string; name: string; group: string; build: () => Built | Promise<Built> }> = [];
const add = (group: string, file: string, name: string, build: () => Built | Promise<Built>) => previews.push({ group, file, name, build });

const wrapFragment = (subject: string, f: { html: string; text: string }, internal = false): Built => ({
  ...T.consolidatedDigestEmail([{ subject, text_body: f.text, html_body: f.html }], { internal, recipient: 'ops@example-firm.co.uk', now }),
});

add('Alerts', 'alert-single', 'Regulatory alert (single fine)', () => alertEmail(F.alertFine.firmName, F.alertFine.amount, F.alertFine.breachType, F.alertFine.date, F.alertFine.noticeUrl, 'tok-1', 'compliance@example-firm.co.uk', 'The FCA found that Harrowgate approved financial promotions that were unclear, unfair or misleading.'));
add('Alerts', 'alert-watchlist-single', 'Watchlist alert (single fine)', () => watchlistAlertEmail(F.alertFine.firmName, F.alertFine.amount, null, F.alertFine.date, F.alertFine.noticeUrl, 'tok-2'));
add('Alerts', 'alert-queued', 'Daily alert (queued, in digest)', () => wrapFragment('RegActions Alert: 2 new enforcement actions', T.fineAlertFragment({ fines: F.fineLines, unsubscribeUrl: `${BASE}/api/alerts/unsubscribe/tok` })));
add('Alerts', 'watchlist-queued', 'Watchlist alert (queued, in digest)', () => wrapFragment('Watchlist Alert: Harrowgate Capital Partners Ltd enforcement action', T.watchlistAlertFragment({ firmName: 'Harrowgate Capital Partners Ltd', fines: F.fineLines.slice(0, 1), unsubscribeUrl: `${BASE}/api/watchlist/unsubscribe/tok` })));
add('Digests', 'persona-digest', 'Persona weekly briefing', () => personaDigestEmail({ personaName: 'Payments & Fintech', personaId: 'payments_fintech', items: F.personaItems, unsubscribeToken: 'tok-p', firmName: 'Brightwater Payments plc', briefing: { ...F.personaBriefing, scope: { totalActions: 5, dateFrom: '2026-10-05', dateTo: '2026-10-12' } }, now }));
add('Digests', 'persona-digest-fallback', 'Persona briefing (fallback themes, 12 items)', () => personaDigestEmail({ personaName: 'Wealth Management', personaId: 'wealth', items: Array.from({ length: 12 }, (_, i) => ({ ...F.personaItems[i % 4], title: `${F.personaItems[i % 4].title} (${i + 1})` })), unsubscribeToken: 'tok-w', briefing: { ...F.personaBriefing, fallbackUsed: true, scope: { totalActions: 2, dateFrom: '2026-10-05', dateTo: '2026-10-12' } }, now }));
add('Digests', 'weekly-direct', 'Weekly digest (direct document)', () => weeklyDigestEmail(F.digestFines, 1_815_000, '2026-10-05', '2026-10-12', 'tok-3', 'investor@example-firm.co.uk'));
add('Digests', 'weekly-queued', 'Weekly digest (queued, in digest)', () => wrapFragment('This Week: 14 enforcement actions, £9.4m monetary total', T.periodDigestFragment({ frequency: 'weekly', ...F.periodDigestInput, unsubscribeUrl: `${BASE}/api/digest/unsubscribe/tok` })));
add('Digests', 'country-changes', 'Country-risk changes (queued)', () => wrapFragment('RegActions: 3 country-risk changes this week', T.countryChangesFragment({ events: F.countryEvents.map((e) => ({ date: e.date, kindLabel: e.kind === 'fatf' ? 'FATF listing' : e.kind === 'sanctions' ? 'Sanctions' : 'Risk score', title: e.title })), totalFresh: 3, unsubscribeUrl: `${BASE}/api/alerts/unsubscribe/tok` })));
add('Digests', 'consolidated-empty', 'Daily all-clear (internal)', () => T.consolidatedDigestEmail([], { internal: true, now }));
add('Monitors', 'monitor-results', 'Monitor results (queued)', () => wrapFragment('3 new results: UK payments safeguarding', T.monitorResultsFragment({ label: 'UK payments safeguarding', newCount: 3, rows: [{ firm: 'Brightwater Payments plc', regulator: 'FCA', date: '2026-10-09', breachType: 'Safeguarding failures' }, { firm: 'Alder Mutual Society', regulator: 'PRA', date: '2026-10-06', breachType: null }], scopeUrl: `${BASE}/search?q=safeguarding`, manageUrl: `${BASE}/monitor?token=abc` })));
add('Monitors', 'monitor-verify', 'Monitor verification', () => T.monitorVerificationEmail({ verifyUrl: `${BASE}/api/monitors/verify/abc`, label: F.monitorFixture.label, frequency: 'weekly', recipient: F.monitorFixture.email, now }));
add('Monitors', 'monitor-smoke', 'Monitor delivery test', () => buildMonitorSmokeMessage({ label: 'UK payments safeguarding' }));
add('Account', 'verify-alert', 'Alert verification', () => T.alertVerificationEmail({ verifyUrl: `${BASE}/api/alerts/verify/abc`, topic: 'fines', minAmount: 1_000_000, breachTypes: ['AML', 'Market abuse'], frequency: 'daily', recipient: 'compliance@example-firm.co.uk', now }));
add('Account', 'verify-alert-country', 'Country-risk verification', () => T.alertVerificationEmail({ verifyUrl: `${BASE}/api/alerts/verify/abc`, topic: 'country-changes', frequency: 'weekly', recipient: 'compliance@example-firm.co.uk', now }));
add('Account', 'verify-digest', 'Digest verification', () => T.digestVerificationEmail({ verifyUrl: `${BASE}/api/digest/verify/abc`, frequency: 'weekly', recipient: 'a-rather-long-address.for-testing.wrapping@example-firm-with-long-domain.co.uk', now }));
add('Account', 'verify-watchlist', 'Watchlist verification', () => T.watchlistVerificationEmail({ verifyUrl: `${BASE}/api/watchlist/verify/abc`, firmName: 'Harrowgate Capital Partners Ltd', now }));
add('Account', 'verify-generic', 'Generic verification', () => verificationEmail('alert', 'tok', 'Fines of £1.0m or more'));
add('Internal', 'contact', 'Contact form notification', () => T.contactNotificationEmail({ name: 'Jonas Whitfield', email: 'jonas.whitfield@example-firm.co.uk', company: 'Whitfield & Co', reason: 'demo', message: 'We would like a walkthrough of the monitoring features.\nCould you suggest times next week?', now }));
add('Internal', 'board-pack-lead', 'Board pack lead', () => { const p = buildBoardPackNotification(F.boardPackLead as never).payload; return { subject: p.subject, html: p.html, text: p.text }; });
add('Internal', 'developer-application', 'Developer API application', () => T.developerApplicationEmail({ applicationId: 42, organisationName: 'Lumen Data Labs', contactName: 'Sara Okonkwo', contactEmail: 'sara@lumen-data.example', requestedTermMonths: 6, expectedDailyRequests: 5000, intendedUse: 'Enrich our internal case-management tool with enforcement outcomes.', now }));
add('Internal', 'developer-operator', 'Developer API operator alert', () => T.developerOperatorEmail({ subject: 'API client rate limited', title: 'API client rate limited', lines: ['Client Lumen Data Labs exceeded 60 requests per minute.', 'Requests were rejected with HTTP 429.'], now }));
add('Internal', 'ops-alert', 'Operations alert (queued)', () => { const m = buildOpsAlertMessage(F.opsSummary, 'critical'); return wrapFragment(m.subject, { html: m.html, text: m.text }, true); });
add('Internal', 'maintenance', 'Scraper maintenance report (queued)', async () => { const r = await buildMaintenanceEmailReport(F.maintenanceResult as never); return wrapFragment(r.subject, { html: r.html, text: r.text }, true); });
add('Internal', 'article-review', 'Article review', () => T.articleReviewEmail({ subject: '[RegActions Blog] AI Article Draft: Safeguarding enforcement trends', title: 'Safeguarding enforcement trends', excerpt: 'How recent FCA actions reframe client-money controls.', slug: 'safeguarding-enforcement-trends', wordCount: 1420, track: 'Enforcement analysis', generatedAt: '2026-10-12 06:00 UTC', score: 84, scoreLabel: 'Acceptable', requiredPassed: 9, requiredTotal: 10, softPassed: 6, softTotal: 8, checks: [{ name: 'Sources cited', passed: true, weight: 'required', message: '12 sources' }, { name: 'No unsupported claims', passed: false, weight: 'required', message: '2 claims lack a source' }], workflowUrl: 'https://github.com/MEMAtest/fca-fines-dashboard/actions/workflows/approve-article.yml', now }));
add('Internal', 'daily-summary', 'Daily summary', () => { const d = T.dailySummaryEmail({ subject: 'RegActions – daily summary', pageviews: 1284, topPaths: [{ path: '/fines', hits: 310 }, { path: '/countries/changes', hits: 144 }], latestNotice: { firm: 'Harrowgate Capital Partners Ltd', amountText: '£1,240,000', date: '2026-10-08' }, now }); return { subject: 'RegActions – daily summary', html: d.html, text: '' }; });
void renderEmailDocument;

