import { describe, expect, it } from 'vitest';
import { setEmailAssetBase, logoUrl, renderEmailDocument, esc, escBreak, kpiTiles, button, eyebrow, headline, detailsTable } from './index.js';
import { personaDigestEmail } from '../personaDigestEmail.js';
import * as F from '../emailTemplates/fixtures.js';

const doc = () => renderEmailDocument({
  title: 'T', label: 'Regulatory Alert', date: F.FIXTURE_NOW,
  blocks: [eyebrow(['A', 'B']), headline('Hello <b>'), ...detailsTable([{ label: 'k', value: 'v' }]), ...button({ label: 'Go', href: 'https://regactions.com/fines' }), ...kpiTiles([{ value: 1, label: 'x' }])],
});

describe('email kit', () => {
  it('uses absolute https regactions.com logo URLs by default', () => {
    setEmailAssetBase(null);
    const html = doc().html;
    const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThanOrEqual(2); // header + footer
    for (const src of srcs) expect(src).toMatch(/^https:\/\/regactions\.com\/email\/regactions-mark(-white)?-96\.png$/);
    expect(logoUrl('white')).toBe('https://regactions.com/email/regactions-mark-white-96.png');
  });

  it('logo images carry dimensions, alt text and no border', () => {
    const imgs = [...doc().html.matchAll(/<img[^>]+>/g)].map((m) => m[0]);
    for (const img of imgs) {
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
      expect(img).toContain('alt="RegActions"');
      expect(img).toContain('display:block');
      expect(img).toContain('border:0');
    }
  });

  it('every rendered persona digest logo is absolute https on regactions.com', () => {
    setEmailAssetBase(null);
    const { html } = personaDigestEmail({ personaName: 'P', personaId: 'p', items: F.personaItems, unsubscribeToken: 't' });
    for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) expect(m[1]).toMatch(/^https:\/\/regactions\.com\/email\//);
  });

  it('applies the render traps', () => {
    const html = doc().html;
    expect(html).toContain('max-width:599px');
    expect(html).not.toMatch(/max-width:\s*600px\)/);
    expect(html).not.toContain('color-scheme: light dark');
    expect(html).not.toContain('table-layout');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('v:roundrect');
    // conditional comments are never nested
    const comments = html.match(/<!--\[if[\s\S]*?<!\[endif\]-->/g) ?? [];
    for (const c of comments) expect(c.slice(4).includes('<!--[if')).toBe(false);
  });

  it('escapes interpolated text and keeps entities intact when inserting <wbr>', () => {
    expect(esc('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
    const out = escBreak('<very.long.address-with-many_separators@example-domain.co.uk>');
    expect(out).toContain('&lt;');
    expect(out).toContain('<wbr>');
    expect(out).not.toMatch(/&<wbr>/);
    expect(doc().html).not.toContain('<b>');
  });

  it('only emits http(s)/mailto hrefs', () => {
    const html = renderEmailDocument({ title: 't', label: 'l', blocks: button({ label: 'x', href: 'javascript:alert(1)' }) }).html;
    expect(html).not.toContain('javascript:');
  });
});

describe('persona digest content honesty', () => {
  const base = { personaName: 'Payments & Fintech', personaId: 'payments_fintech', unsubscribeToken: 't', items: F.personaItems };
  it('never shows the deterministic-fallback label or RegCanary', () => {
    const { html, text } = personaDigestEmail({ ...base, briefing: { ...F.personaBriefing, fallbackUsed: true } });
    expect(html + text).not.toMatch(/deterministic|regcanary/i);
    expect(html).toContain('regactions.com');
  });
  it('omits the themes block without a briefing and never invents a why-this-matters block', () => {
    const { html } = personaDigestEmail(base);
    expect(html).not.toContain('enforcement themes');
    expect(html).not.toMatch(/why this matters|key takeaways|considerations for your firm/i);
  });
  it('KPI tiles count exactly what is listed', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ ...F.personaItems[0], title: `Item ${i}` }));
    const { html } = personaDigestEmail({ ...base, items });
    expect(html).toContain('>11<');
    expect(html).toContain('>8<');
    expect((html.match(/Item \d+/g) ?? []).length).toBe(8);
  });
  it('scopes the theme box to its own window so counts cannot contradict the list', () => {
    const { html } = personaDigestEmail({ ...base, briefing: { ...F.personaBriefing, scope: { totalActions: 2, dateFrom: '2026-10-05', dateTo: '2026-10-12' } } });
    expect(html).toContain('drawn from 2 enforcement actions');
    expect(html).toContain('separate, narrower window');
  });
});

describe('kpi tiles', () => {
  it('stacks on mobile only for 4+ tiles', () => {
    const three = kpiTiles([1, 2, 3].map((v) => ({ value: v, label: 'x' })))[0].html;
    const four = kpiTiles([1, 2, 3, 4].map((v) => ({ value: v, label: 'x' })))[0].html;
    expect(three).toContain('class="kpi-s"');
    expect(three).not.toContain('class="kpi"');
    expect(four).toContain('class="kpi"');
  });
});
