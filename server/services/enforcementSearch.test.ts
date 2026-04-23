import { describe, expect, it } from 'vitest';
import {
  buildFallbackSnippet,
  buildFuzzySearchVocabulary,
  normalizeCountryCode,
  normalizeSearchQuery,
  prepareEnforcementSearch,
  resolveFuzzySearchTerms,
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
    expect(cftPrepared.categoryHints).toEqual(
      expect.arrayContaining(['AML', 'CFT', 'SANCTIONS']),
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
    expect(prepared.categoryHints).toEqual(
      expect.arrayContaining(['GOVERNANCE', 'SMCR']),
    );
  });

  it('adds customer due diligence and books-and-records search expansions', () => {
    const diligencePrepared = prepareEnforcementSearch('CDD onboarding failures');
    const booksPrepared = prepareEnforcementSearch('books and records');

    expect(diligencePrepared.searchPatterns).toEqual(
      expect.arrayContaining([
        '%customer due diligence%',
        '%know your customer%',
        '%source of funds%',
      ]),
    );
    expect(booksPrepared.searchPatterns).toEqual(
      expect.arrayContaining([
        '%books and records%',
        '%record keeping%',
      ]),
    );
    expect(booksPrepared.categoryHints).toEqual(
      expect.arrayContaining(['DISCLOSURE', 'REPORTING', 'BOOKS_AND_RECORDS']),
    );
  });

  it('extracts regulator and country hints from short query tokens', () => {
    const prepared = prepareEnforcementSearch('SEBI UAE AML');
    const hongKongPrepared = prepareEnforcementSearch(
      'hong kong counter terrorist financing',
    );

    expect(prepared.regulatorHints).toContain('SEBI');
    expect(prepared.countryHints).toContain('AE');
    expect(hongKongPrepared.countryHints).toContain('HK');
    expect(hongKongPrepared.firmIntentTerms).toEqual([]);
  });

  it('maps country adjectives and crypto intent into richer search terms', () => {
    const prepared = prepareEnforcementSearch('irish crypto aml failures');

    expect(prepared.countryHints).toEqual(['IE']);
    expect(prepared.firmIntentTerms).toEqual([]);
    expect(prepared.searchTerms).toEqual(
      expect.arrayContaining([
        'crypto',
        'virtual asset',
        'crypto asset',
        'cryptocurrency',
        'anti money laundering',
      ]),
    );
    expect(prepared.categoryHints).toEqual(
      expect.arrayContaining(['AML', 'FINANCIAL_CRIME', 'CRYPTO', 'VASP']),
    );
  });

  it('expands compliance-led queries into control-oriented categories', () => {
    const prepared = prepareEnforcementSearch('Germany compliance failures');

    expect(prepared.countryHints).toEqual(['DE']);
    expect(prepared.firmIntentTerms).toEqual([]);
    expect(prepared.searchTerms).toEqual(
      expect.arrayContaining([
        'compliance',
        'systems and controls',
        'control failures',
        'policies and procedures',
      ]),
    );
    expect(prepared.categoryHints).toEqual(
      expect.arrayContaining(['SYSTEMS_AND_CONTROLS', 'CONTROLS', 'GOVERNANCE']),
    );
  });

  it('keeps firm-like tokens separate from theme and geography terms', () => {
    const prepared = prepareEnforcementSearch('barclays fined for aml controls');

    expect(prepared.firmIntentTerms).toEqual(['barclays']);
    expect(prepared.firmIntentQuery).toBe('barclays');
    expect(prepared.isShortFirmLikeQuery).toBe(false);
  });

  it('marks short firm-like queries while preserving legal suffix precision', () => {
    const wisePrepared = prepareEnforcementSearch('wise aml');
    const legalPrepared = prepareEnforcementSearch('Wise Limited');
    const plcPrepared = prepareEnforcementSearch('Barclays Bank plc enforcement');
    const broadPrepared = prepareEnforcementSearch('bank');

    expect(wisePrepared.firmIntentTerms).toEqual(['wise']);
    expect(wisePrepared.firmIntentQuery).toBe('wise');
    expect(wisePrepared.firmIntentQueryWithoutLegalSuffix).toBe('wise');
    expect(wisePrepared.isShortFirmLikeQuery).toBe(true);

    expect(legalPrepared.firmIntentTerms).toEqual(['wise', 'limited']);
    expect(legalPrepared.firmIntentQuery).toBe('wise limited');
    expect(legalPrepared.firmIntentQueryWithoutLegalSuffix).toBe('wise');
    expect(legalPrepared.isShortFirmLikeQuery).toBe(true);

    expect(plcPrepared.firmIntentTerms).toEqual(['barclays', 'bank', 'plc']);
    expect(plcPrepared.firmIntentQuery).toBe('barclays bank plc');
    expect(plcPrepared.firmIntentQueryWithoutLegalSuffix).toBe('barclays bank');
    expect(plcPrepared.isShortFirmLikeQuery).toBe(false);

    expect(broadPrepared.firmIntentTerms).toEqual(['bank']);
    expect(broadPrepared.isShortFirmLikeQuery).toBe(false);
  });

  it('builds a fuzzy vocabulary from static and dynamic search phrases', () => {
    const vocabulary = buildFuzzySearchVocabulary(['Goldman Sachs & Co. LLC']);

    expect(vocabulary).toEqual(
      expect.arrayContaining(['goldman', 'sachs', 'anti', 'laundering']),
    );
  });

  it('corrects typoed search terms against candidate phrases', () => {
    const resolution = resolveFuzzySearchTerms(
      ['goldmn', 'sachs', 'laundring'],
      ['Goldman Sachs & Co. LLC', 'Goldmeier Sachs LLP', 'anti money laundering'],
    );

    expect(resolution.correctedTerms).toEqual(['goldman', 'sachs', 'laundring']);
    expect(resolution.corrections).toEqual([{ from: 'goldmn', to: 'goldman' }]);
    expect(resolution.changed).toBe(true);
  });

  it('prefers typo corrections that share phrase context with other query terms', () => {
    const resolution = resolveFuzzySearchTerms(
      ['goldmn', 'sachs'],
      ['Goldman Sachs & Co. LLC', 'Golden State Finance'],
    );

    expect(resolution.correctedTerms).toEqual(['goldman', 'sachs']);
    expect(resolution.corrections).toEqual([
      { from: 'goldmn', to: 'goldman' },
    ]);
  });

  it('does not force unrelated typo corrections when there is no contextual support', () => {
    const resolution = resolveFuzzySearchTerms(
      ['barclays', 'fined', 'aml', 'controls'],
      ['Barclays Bank plc', 'anti money laundering controls'],
    );

    expect(resolution.correctedTerms).toEqual([
      'barclays',
      'fined',
      'aml',
      'controls',
    ]);
    expect(resolution.corrections).toEqual([]);
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
