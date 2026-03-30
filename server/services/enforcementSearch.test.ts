import { describe, expect, it } from 'vitest';
import {
  buildFallbackSnippet,
  normalizeCountryCode,
  normalizeSearchQuery,
  prepareEnforcementSearch,
  stripSnippetHtml,
} from './enforcementSearch.js';

describe('enforcementSearch helpers', () => {
  it('normalizes whitespace in search queries', () => {
    expect(normalizeSearchQuery('  AML   transaction   monitoring  ')).toBe(
      'AML transaction monitoring',
    );
  });

  it('expands common acronyms into additional search terms', () => {
    const prepared = prepareEnforcementSearch('AML failures');

    expect(prepared.searchTerms).toContain('aml');
    expect(prepared.searchTerms).toContain('anti money laundering');
    expect(prepared.searchQuery).toBe('aml failures');
    expect(prepared.searchPatterns).toContain('%anti money laundering%');
    expect(prepared.searchPatterns).toContain('%anti%money%laundering%');
    expect(prepared.minimumTokenMatches).toBe(1);
  });

  it('removes low-signal enforcement words from the focused search query', () => {
    const prepared = prepareEnforcementSearch(
      'Goldman Sachs enforcement',
    );

    expect(prepared.searchQuery).toBe('goldman sachs');
    expect(prepared.phrasePattern).toBe('%goldman sachs%');
    expect(prepared.meaningfulTerms).toEqual(['goldman', 'sachs']);
    expect(prepared.minimumTokenMatches).toBe(1);
    expect(prepared.searchPatterns).toEqual(
      expect.arrayContaining([
        '%goldman%',
        '%sachs%',
        '%goldman sachs%',
      ]),
    );
  });

  it('adds focused theme expansions for weak monitoring and cft queries', () => {
    const transactionPrepared = prepareEnforcementSearch('transaction monitoring');
    const cftPrepared = prepareEnforcementSearch('counter terrorist financing');

    expect(transactionPrepared.searchPatterns).toEqual(
      expect.arrayContaining([
        '%transaction monitoring%',
        '%monitoring controls%',
        '%suspicious activity reporting%',
      ]),
    );
    expect(cftPrepared.searchPatterns).toEqual(
      expect.arrayContaining([
        '%counter terrorist financing%',
        '%anti money laundering and counter terrorist financing%',
        '%aml%',
        '%customer due diligence%',
      ]),
    );
  });

  it('expands smcr into the full supervisory phrase', () => {
    const prepared = prepareEnforcementSearch('SMCR');

    expect(prepared.searchQuery).toBe('senior managers and certification regime');
    expect(prepared.searchTerms).toEqual(
      expect.arrayContaining([
        'smcr',
        'senior managers and certification regime',
        'certification regime',
        'conduct rules',
        'approved person',
        'controlled function',
      ]),
    );
  });

  it('extracts regulator and country hints from short query tokens', () => {
    const prepared = prepareEnforcementSearch('SEBI UAE AML');

    expect(prepared.regulatorHints).toContain('SEBI');
    expect(prepared.countryHints).toContain('AE');
  });

  it('marks stopword-only queries as low-signal', () => {
    const prepared = prepareEnforcementSearch('the and of');

    expect(prepared.hasSearchIntent).toBe(false);
    expect(prepared.searchQuery).toBe('');
    expect(prepared.minimumTokenMatches).toBe(0);
  });

  it('normalizes country names and codes to country codes', () => {
    expect(normalizeCountryCode('Germany')).toBe('DE');
    expect(normalizeCountryCode('de')).toBe('DE');
    expect(normalizeCountryCode('UAE')).toBe('AE');
    expect(normalizeCountryCode('nonsense')).toBeNull();
    expect(normalizeCountryCode('')).toBeNull();
  });

  it('builds bounded fallback snippets when highlights are unavailable', () => {
    expect(buildFallbackSnippet('Short summary', null)).toBe('Short summary');
    expect(
      buildFallbackSnippet(null, 'Breach type only'),
    ).toBe('Breach type only');
    expect(
      buildFallbackSnippet('x'.repeat(240), null),
    ).toHaveLength(220);
  });

  it('strips snippet html before rendering', () => {
    expect(stripSnippetHtml('<b>AML</b> <i>failures</i>')).toBe('AML failures');
  });
});
