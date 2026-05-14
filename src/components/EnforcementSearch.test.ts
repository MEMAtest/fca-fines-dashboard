import { describe, expect, it } from 'vitest';
import { parseSearchParams, buildSearchParams } from './EnforcementSearch.js';

describe('parseSearchParams', () => {
  it('parses a full URL search string', () => {
    const params = new URLSearchParams('q=AML&regulator=SEC&country=US&year=2025&minAmount=1000&maxAmount=50000&currency=EUR&page=3');
    const result = parseSearchParams(params);
    expect(result).toEqual({
      query: 'AML',
      regulator: 'SEC',
      country: 'US',
      year: '2025',
      minAmount: '1000',
      maxAmount: '50000',
      currency: 'EUR',
      page: 3,
    });
  });

  it('returns defaults for empty params', () => {
    const result = parseSearchParams(new URLSearchParams());
    expect(result).toEqual({
      query: '',
      regulator: '',
      country: '',
      year: '',
      minAmount: '',
      maxAmount: '',
      currency: 'GBP',
      page: 1,
    });
  });

  it('clamps invalid page to 1', () => {
    expect(parseSearchParams(new URLSearchParams('page=-5')).page).toBe(1);
    expect(parseSearchParams(new URLSearchParams('page=0')).page).toBe(1);
    expect(parseSearchParams(new URLSearchParams('page=abc')).page).toBe(1);
  });

  it('defaults currency to GBP when not EUR', () => {
    expect(parseSearchParams(new URLSearchParams('currency=USD')).currency).toBe('GBP');
    expect(parseSearchParams(new URLSearchParams('currency=EUR')).currency).toBe('EUR');
  });

  it('trims query whitespace', () => {
    expect(parseSearchParams(new URLSearchParams('q=  AML  ')).query).toBe('AML');
  });
});

describe('buildSearchParams', () => {
  it('only includes non-default values', () => {
    const params = buildSearchParams({
      query: 'AML', regulator: '', country: '', year: '',
      minAmount: '', maxAmount: '', currency: 'GBP', page: 1,
    });
    expect(params.toString()).toBe('q=AML');
  });

  it('includes page when > 1', () => {
    const params = buildSearchParams({
      query: 'AML', regulator: '', country: '', year: '',
      minAmount: '', maxAmount: '', currency: 'GBP', page: 3,
    });
    expect(params.get('page')).toBe('3');
  });

  it('includes currency only when EUR', () => {
    const params = buildSearchParams({
      query: 'test', regulator: '', country: '', year: '',
      minAmount: '', maxAmount: '', currency: 'EUR', page: 1,
    });
    expect(params.get('currency')).toBe('EUR');
  });
});
