import { describe, expect, it } from 'vitest';
import { prepareEnforcementSearch } from './enforcementSearch.js';
import { buildSearchAnalyticsRecord } from './searchAnalytics.js';

describe('searchAnalytics helpers', () => {
  it('builds bounded analytics records without user identifiers', () => {
    const prepared = prepareEnforcementSearch('irish crypto aml failures');
    const record = buildSearchAnalyticsRecord({
      query: 'irish crypto aml failures',
      prepared,
      fuzzyResolution: null,
      filters: {
        regulator: null,
        country: 'IE',
        year: null,
        minAmount: null,
        maxAmount: null,
        currency: 'GBP',
      },
      results: [
        { firm: 'Coinbase Europe Limited', regulator: 'CBI' },
        { firm: 'Coinbase Europe Limited', regulator: 'CBI' },
        { firm: 'Bank of Ireland', regulator: 'CBI' },
      ],
      totalCount: 343,
      latencyMs: 148.3,
      lowSignal: false,
    });

    expect(record.queryText).toBe('irish crypto aml failures');
    expect(record.queryNormalized).toBe('irish crypto aml failures');
    expect(record.queryHash).toHaveLength(64);
    expect(record.firmIntentTermCount).toBe(0);
    expect(record.countryHintCount).toBe(1);
    expect(record.zeroResult).toBe(false);
    expect(record.topFirms).toEqual([
      'Coinbase Europe Limited',
      'Bank of Ireland',
    ]);
    expect(record.topRegulators).toEqual(['CBI']);
    expect(record.latencyMs).toBe(148);
  });
});
