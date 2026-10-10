import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

vi.mock('../../db.js', () => ({ getSqlClient: () => Object.assign(async () => [], { end: async () => undefined }) }));

import * as T from './index.js';
import * as F from './fixtures.js';
import { previews } from './allPreviews.js';

const root = process.cwd();
const B = 'https://regactions.com';

describe('every email link on regactions.com is routable', () => {
  const rewrites = (JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8')).rewrites as Array<{ source: string }>)
    .map((r) => r.source)
    .filter((s) => !s.includes('(?!'));
  const rewriteRegexes = rewrites.map((s) => new RegExp(`^${s.replace(/:[A-Za-z]+/g, '[^/]+')}$`));

  it('each href path is an /api/ route, a vercel.json SPA rewrite, or a real public file', async () => {
    const bad: string[] = [];
    for (const p of previews) {
      const built = await p.build();
      for (const m of built.html.matchAll(/href="(https:\/\/regactions\.com[^"]*)"/g)) {
        const url = new URL(m[1].replace(/&amp;/g, '&'));
        const pathname = url.pathname;
        const ok =
          pathname === '/' ||
          pathname.startsWith('/api/') ||
          rewriteRegexes.some((re) => re.test(pathname)) ||
          existsSync(path.join(root, 'public', pathname));
        if (!ok) bad.push(`${p.file}: ${pathname}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });
});

describe('list emails stay under the Gmail clip limit and keep their unsubscribe link', () => {
  const longSummary = 'The firm failed to maintain adequate systems and controls over client money and reporting. '.repeat(12);
  const many = Array.from({ length: 60 }, (_, i) => ({
    firm: `Fixture Firm ${i + 1} Ltd`, regulator: 'FCA', amount: i % 3 ? 250_000 + i : null, date: '2026-10-08',
    breachType: 'Misleading financial promotions', noticeUrl: `${B}/notice/${i}`, summary: longSummary,
  }));
  const unsub = `${B}/api/alerts/unsubscribe/tok`;
  const wrap = (f: { html: string; text: string }, subject: string) => T.consolidatedDigestEmail([{ subject, text_body: f.text, html_body: f.html }], { now: F.FIXTURE_NOW });

  const cases: Array<[string, () => { html: string }]> = [
    ['60 fine alerts', () => wrap(T.fineAlertFragment({ fines: many, unsubscribeUrl: unsub }), 'RegActions Alert: 60 new enforcement actions')],
    ['60 watchlist matches', () => wrap(T.watchlistAlertFragment({ firmName: 'Fixture', fines: many, unsubscribeUrl: unsub }), 'Watchlist Alert')],
    ['60 country changes', () => wrap(T.countryChangesFragment({ events: many.map((m) => ({ date: m.date, kindLabel: 'Sanctions', title: `${m.firm} ${longSummary}` })), totalFresh: 60, unsubscribeUrl: unsub }), 'Country changes')],
    ['60 maintenance rows', () => wrap(T.maintenanceReportFragment({ analyzed: 60, autoFixed: 0, needsHuman: 60, generatedAt: 'now', trends: many.map((m) => ({ regulator: m.firm, consecutiveFailures: 3, isNewToday: false, isRecovering: false })), issues: many.map((m) => ({ regulator: m.firm, fixAttempted: false, fixSuccess: false, issue: 'Issue', suggestedFix: longSummary })) }), 'Maintenance')],
  ];
  it.each(cases)('%s renders under 90KB', (_n, build) => {
    const { html } = build();
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(90_000);
  });
  it('keeps the unsubscribe link and a "+N more" link on the capped fine lists', () => {
    for (const build of [cases[0][1], cases[1][1]]) {
      const { html } = build();
      expect(html).toContain(`href="${unsub}"`);
      expect(html).toContain('+50 more on RegActions');
      expect((html.match(/Fixture Firm \d+ Ltd/g) ?? []).length).toBeLessThanOrEqual(10);
    }
  });
  it('truncates long summaries on a word boundary with an ellipsis', () => {
    const { html } = cases[0][1]();
    expect(html).toContain('…');
    expect(html).not.toContain(longSummary.trim());
  });
});

describe('fine alert edge cases', () => {
  it('uses action-type wording, not "fined £0k", for trivial amounts', async () => {
    const { alertEmail } = await import('../email.js');
    const r = alertEmail('Northgate Securities Inc.', 0.1, 'Share suspension', '2026-10-07', `${B}/n`, 't');
    expect(r.subject).not.toMatch(/fined|£0k/);
    expect(r.subject).toContain('Northgate Securities Inc.: Share suspension');
    expect(r.html + r.text).not.toContain('£0k');
  });
  it('drops the notice link entirely when the URL is not http(s)', () => {
    const frag = T.fineAlertFragment({ fines: [{ firm: 'X', regulator: 'FCA', amount: 5000, date: '2026-10-05', noticeUrl: 'javascript:alert(1)' }], unsubscribeUrl: `${B}/u` });
    expect(frag.html).not.toMatch(/final notice/i);
    expect(frag.text).not.toMatch(/final notice/i);
    const single = T.singleFineAlertEmail({ kind: 'alert', firmName: 'X', amount: 5000, breachType: null, date: '2026-10-05', noticeUrl: 'ftp://x', unsubscribeUrl: `${B}/u` });
    expect(single.html).not.toMatch(/final notice/i);
  });
  it('watchlist digests title each fine with the fined firm and show the watched name as context', () => {
    const frag = T.watchlistAlertFragment({ firmName: 'Harrow', fines: [{ firm: 'Harrowgate Capital Partners Ltd', regulator: 'FCA', amount: 5000, date: '2026-10-05' }], unsubscribeUrl: `${B}/u` });
    expect(frag.html).toContain('Matched your watchlist: Harrow');
    expect(frag.html).toContain('Harrowgate Capital Partners Ltd');
  });
});
