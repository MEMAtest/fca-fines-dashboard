import { describe, expect, it } from 'vitest';
import { developmentTitle } from './common.js';

describe('developmentTitle', () => {
  it('headlines real penalties as fines', () => {
    expect(developmentTitle('Acme Ltd', 'AML', 4_800_000)).toBe('Acme Ltd fined £4.8m');
    expect(developmentTitle('Acme Ltd', 'AML', '350000')).toBe('Acme Ltd fined £350k');
  });
  it('never headlines trivial or missing amounts as a fine (SFC share suspension recorded as £0.10)', () => {
    expect(developmentTitle('Northgate Securities Inc.', 'Share suspension', 0.1)).toBe('Northgate Securities Inc.: Share suspension');
    expect(developmentTitle('Northgate Securities Inc.', '', '0.10')).toBe('Northgate Securities Inc.: enforcement action');
    expect(developmentTitle('Acme', 'Licence withdrawal', null)).toBe('Acme: Licence withdrawal');
    expect(developmentTitle('', '', null)).toBe('Regulatory development');
  });
});
