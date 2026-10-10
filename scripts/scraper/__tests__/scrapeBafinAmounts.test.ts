import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractReferencedAmount, extractSanctionAmount, isStatutoryCapMention } from '../scrapeBafin.js';

const headline = 'Die Finanzaufsicht Bafin hat am 1. Oktober 2026 eine Geldbuße in Höhe von 1,2 Millionen Euro gegen die VW AG festgesetzt. Sie hatte gegen die Marktmissbrauchsverordnung verstoßen.';
const body = `${headline} Die Bafin kann dies mit einer Geldbuße ahnden. Diese beträgt maximal 2,5 Millionen Euro oder bis zu zwei Prozent des Gesamtumsatzes.`;

describe('BaFin amount extraction', () => {
  it('does not take the statutory maximum as the fine (VW AG was recorded as EUR 2.5m instead of EUR 1.2m)', () => {
    expect(extractSanctionAmount([body])).toBe(1_200_000);
    expect(extractSanctionAmount([headline, body])).toBe(1_200_000);
  });

  it.each([
    ['Die Geldbuße beträgt 250.000 Euro.', 250_000],
    ['Das Bußgeld beträgt insgesamt 1,2 Millionen Euro.', 1_200_000],
    ['Die Bafin hat eine Geldbuße in Höhe von 500.000 Euro oder 2 Prozent des Umsatzes festgesetzt.', 500_000],
    ['Die Bafin hat gegen die X Bank ein Bußgeld in Höhe von 178.500 Euro festgesetzt.', 178_500],
    ['Das Bundesamt für Justiz hat ein Ordnungsgeld in Höhe von 50.000 Euro festgesetzt.', 50_000],
  ])('keeps an imposed amount: %s', (text, expected) => {
    expect(extractSanctionAmount([text])).toBe(expected);
  });

  it.each([
    'Die Geldbuße beträgt maximal 2,5 Millionen Euro.',
    'Das Bußgeld beträgt höchstens 5 Millionen Euro.',
    'Die Geldbuße kann bis zu 10 Millionen Euro betragen.',
    'Der Höchstbetrag der Geldbuße: 1 Million Euro.',
  ])('ignores a statutory ceiling: %s', (text) => {
    expect(extractSanctionAmount([text])).toBeNull();
  });

  it('flags ceilings only after explicit ceiling words', () => {
    const t = 'Diese beträgt maximal 2,5 Millionen Euro';
    expect(isStatutoryCapMention(t, t.indexOf('2,5'), 3)).toBe(true);
    const u = 'Die Geldbuße beträgt 250.000 Euro';
    expect(isStatutoryCapMention(u, u.indexOf('250'), 7)).toBe(false);
  });

  it('keeps the identity amount unchanged so content_hash stays stable (changing it would duplicate rows)', () => {
    // Legacy behaviour: the identity amount is the max euro amount in the first text that has any,
    // statutory ceiling included. It feeds content_hash; the repair relies on this staying put.
    expect(extractReferencedAmount([body])).toBe(2_500_000);
    expect(extractReferencedAmount([headline])).toBe(1_200_000);
  });

  it('matches stored amounts for real stored BaFin summaries; only statutory-cap rows (EUR 2.5m) differ', () => {
    const rows = JSON.parse(readFileSync(path.resolve(process.cwd(), 'scripts/scraper/__tests__/bafinRealSummaries.fixture.json'), 'utf8')) as Array<{ firm: string; summary: string; meta: string; stored: number }>;
    expect(rows.length).toBeGreaterThan(40);
    for (const r of rows) {
      const next = extractSanctionAmount([r.meta, r.summary]);
      if (r.stored === 2_500_000 && next !== null && next < 2_500_000) continue; // the repaired cap rows
      expect(next, `${r.firm}: ${r.summary.slice(0, 80)}`).toBe(r.stored);
    }
  });
});
