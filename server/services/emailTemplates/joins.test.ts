import { describe, expect, it } from 'vitest';
import * as T from './index.js';
import * as F from './fixtures.js';
import { weeklyDigestEmail, alertEmail } from '../email.js';
import { personaDigestEmail } from '../personaDigestEmail.js';

const visible = (html: string) => html.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('missing fields never leak into joined text', () => {
  const B = 'https://regactions.com';
  const sparse = [
    { firm: 'No Breach Co', regulator: 'FCA', amount: 95_000, breachType: null },
    { firm: 'No Amount Co', regulator: 'FCA', amount: null, breachType: undefined },
  ];
  const outputs: Array<[string, { html: string; text: string }]> = [
    ['weekly.direct', weeklyDigestEmail([{ firm: 'Calder & Finch', amount: 95_000, breachType: null, date: '2026-10-05' }], 95_000, '2026-10-05', '2026-10-12', 't')],
    ['period digest', T.periodDigestFragment({ frequency: 'weekly', totalActions: 2, totalAmount: 95_000, monetaryActions: 1, top: sparse, unsubscribeUrl: `${B}/u` })],
    ['fine alert', T.fineAlertFragment({ fines: [{ firm: 'X', regulator: 'FCA', amount: null, date: '2026-10-05', breachType: null, noticeUrl: null }], unsubscribeUrl: `${B}/u` })],
    ['alert single', alertEmail('X', 95_000, null, '2026-10-05', `${B}/n`, 't')],
    ['persona', personaDigestEmail({ personaName: 'P', personaId: 'p', unsubscribeToken: 't', items: [{ title: 'T', authority: '', date: '', summary: '' }] })],
    ['monitor results', T.monitorResultsFragment({ label: 'L', newCount: 1, rows: [{ firm: 'F', regulator: 'FCA', date: '2026-10-05', breachType: null }], scopeUrl: `${B}/s`, manageUrl: `${B}/m` })],
  ];
  it.each(outputs)('%s has no dangling separators or placeholder words', (_name, out) => {
    for (const text of [visible(out.html), out.text]) {
      expect(text).not.toMatch(/·\s*-(\s|$)|·\s*(undefined|null|NaN)\b|\b(undefined|null|NaN)\b/);
      expect(text).not.toMatch(/·\s*$|^\s*·/m);
    }
  });
  it('shows the amount on its own when the breach type is missing', () => {
    const { html } = weeklyDigestEmail([{ firm: 'Calder & Finch', amount: 95_000, breachType: null, date: '2026-10-05' }], 95_000, '2026-10-05', '2026-10-12', 't');
    expect(visible(html)).toContain('£95k');
    expect(visible(html)).not.toContain('£95k ·');
  });
  it('renders a summary lede only when the record has one', () => {
    const base = ['X Ltd', 95_000, 'AML', '2026-10-05', `${B}/n`, 't'] as const;
    expect(visible(alertEmail(...base, undefined, 'Summary from the notice.').html)).toContain('Summary from the notice.');
    expect(visible(alertEmail(...base).html)).not.toMatch(/Summary from/);
  });
});
void F;
