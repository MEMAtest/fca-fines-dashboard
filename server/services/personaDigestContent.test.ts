import { describe, expect, it } from 'vitest';
import { buildDigestItemCopy } from './personaDigestContent.js';

describe('buildDigestItemCopy', () => {
  it('does not turn a share suspension into a fine from a stray parsed amount', () => {
    const copy = buildDigestItemCopy({
      firm: 'dealings in Silver Grant International Holdings Group Limited shares',
      authority: 'SFC',
      amountOriginal: 1,
      currency: 'HKD',
      breach: 'SFC suspends dealings in Silver Grant shares',
      summary: 'The SFC directed the exchange to suspend dealings in the shares.',
    });

    expect(copy.title).toBe('SFC action: dealings in Silver Grant International Holdings Group Limited shares');
    expect(copy.title).not.toContain('fined');
  });

  it('uses an original-currency amount only when the evidence describes a penalty', () => {
    const copy = buildDigestItemCopy({
      firm: 'Example Limited',
      authority: 'SFC',
      amountOriginal: 7_000_000,
      currency: 'HKD',
      breach: 'Anti-money laundering control failures',
      summary: 'The SFC reprimanded and fined Example Limited HKD 7 million.',
    });

    expect(copy.title).toContain('fined');
    expect(copy.title).toMatch(/HK\$7m/i);
    expect(copy.title).not.toContain('£');
  });

  it('replaces a title-only Final Notice with an honest explanatory summary', () => {
    const copy = buildDigestItemCopy({
      firm: 'Joseph Molloy',
      authority: 'FCA',
      amountOriginal: null,
      currency: 'GBP',
      breach: 'FCA enforcement action',
      summary: 'Final Notice 2026: Joseph Molloy',
    });

    expect(copy.title).toBe('FCA action: Joseph Molloy');
    expect(copy.summary).toBe('FCA published an enforcement action concerning Joseph Molloy. Open the official source for the findings and outcome.');
  });
});
