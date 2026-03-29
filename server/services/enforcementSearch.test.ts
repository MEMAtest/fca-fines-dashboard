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
    expect(prepared.searchPatterns).toContain('%anti money laundering%');
    expect(prepared.searchPatterns).toContain('%anti%money%laundering%');
    expect(prepared.minimumTokenMatches).toBe(2);
  });

  it('builds phrase and token patterns for hybrid matching', () => {
    const prepared = prepareEnforcementSearch(
      'Goldman Sachs enforcement',
    );

    expect(prepared.phrasePattern).toBe('%Goldman Sachs enforcement%');
    expect(prepared.searchPatterns).toEqual(
      expect.arrayContaining([
        '%goldman sachs enforcement%',
        '%goldman%',
        '%sachs%',
        '%goldman sachs%',
      ]),
    );
  });

  it('extracts regulator and country hints from short query tokens', () => {
    const prepared = prepareEnforcementSearch('SEBI UAE AML');

    expect(prepared.regulatorHints).toContain('SEBI');
    expect(prepared.countryHints).toContain('AE');
  });

  it('normalizes country names and codes to country codes', () => {
    expect(normalizeCountryCode('Germany')).toBe('DE');
    expect(normalizeCountryCode('de')).toBe('DE');
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
