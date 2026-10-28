import { describe, expect, it, vi } from 'vitest';
import { fetchSearchCase, markUnevaluatedCases } from './evaluateSearchRelevance.js';

describe('search relevance monitor request handling', () => {
  it('turns a timed-out request into an explicit failed case instead of aborting the report', async () => {
    const testCase = { id: 'timeout-case', query: 'unknown entity typo' };
    const request = vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));

    const result = await fetchSearchCase('https://example.test', testCase, 25_000, request as typeof fetch);

    expect(request).toHaveBeenCalledWith(
      'https://example.test/api/search?q=unknown%20entity%20typo',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toMatchObject({
      testCase,
      responseOk: false,
      status: null,
      json: {},
    });
    expect(result.error).toContain('aborted');
  });

  it('retains successful responses for the streamed partial report', async () => {
    const testCase = { id: 'fast-case', query: 'coinbase' };
    const request = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ results: [{ firm: 'Coinbase Europe Limited' }], pagination: { total: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    const result = await fetchSearchCase('https://example.test', testCase, 25_000, request as typeof fetch);

    expect(result).toMatchObject({
      testCase,
      responseOk: true,
      status: 200,
      json: { results: [{ firm: 'Coinbase Europe Limited' }] },
      error: null,
    });
  });

  it('counts unstarted cases in category denominators and marks required cases failed', () => {
    const cases = [
      { id: 'not-run', category: 'typo_firm', query: 'barclays bnak' },
      { id: 'not-run-warning', category: 'typo_firm', query: 'unknown query', mustPass: false },
    ];
    const categoryStats = new Map([['typo_firm', {
      total: 2,
      passed: 0,
      failedIds: [],
      notEvaluatedIds: ['not-run', 'not-run-warning'],
    }]]);
    const failures: string[] = [];
    const warnings: string[] = [];

    markUnevaluatedCases(cases, categoryStats, failures, warnings);

    expect(failures).toEqual(['not-run']);
    expect(warnings).toEqual(['not-run-warning']);
    expect(categoryStats.get('typo_firm')).toEqual({
      total: 2,
      passed: 0,
      failedIds: ['not-run'],
      notEvaluatedIds: ['not-run', 'not-run-warning'],
    });
  });
});
