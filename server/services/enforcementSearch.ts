import { PUBLIC_REGULATOR_NAV_ITEMS } from '../../src/data/regulatorCoverage.js';

const ACRONYM_EXPANSIONS: Record<string, string[]> = {
  aml: ['anti money laundering'],
  smcr: [
    'senior managers and certification regime',
    'senior managers regime',
    'certification regime',
  ],
  cft: ['counter terrorist financing'],
  ctf: ['counter terrorist financing'],
};

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'GB',
  us: 'US',
  usa: 'US',
  uae: 'AE',
  eu: 'EU',
};

const COUNTRY_NAME_TO_CODE = new Map(
  PUBLIC_REGULATOR_NAV_ITEMS.map((coverage) => [
    coverage.country.toLowerCase(),
    coverage.countryCode,
  ]),
);

const REGULATOR_CODE_TO_MATCH = new Map(
  PUBLIC_REGULATOR_NAV_ITEMS.map((coverage) => [
    coverage.code.toLowerCase(),
    coverage.code,
  ]),
);

const COMMON_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

const LOW_SIGNAL_SEARCH_TOKENS = new Set([
  'action',
  'actions',
  'case',
  'cases',
  'enforcement',
  'fine',
  'fines',
  'notice',
  'notices',
  'order',
  'orders',
  'penalties',
  'penalty',
  'sanction',
  'sanctions',
]);

export interface PreparedEnforcementSearch {
  normalizedQuery: string;
  searchQuery: string;
  phrasePattern: string;
  searchPatterns: string[];
  searchTerms: string[];
  meaningfulTerms: string[];
  minimumTokenMatches: number;
  regulatorHints: string[];
  countryHints: string[];
  hasSearchIntent: boolean;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function toLikePatterns(term: string) {
  const normalized = term.toLowerCase();
  return unique([
    `%${normalized}%`,
    `%${normalized.replace(/\s+/g, '%')}%`,
  ]);
}

export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, ' ');
}

function buildPhraseWindows(tokens: string[], size: number) {
  if (tokens.length < size) {
    return [];
  }

  return Array.from({ length: tokens.length - size + 1 }, (_, index) =>
    tokens.slice(index, index + size).join(' '),
  );
}

function isMeaningfulToken(token: string) {
  return (
    token.length >= 3 &&
    !COMMON_STOPWORDS.has(token) &&
    !LOW_SIGNAL_SEARCH_TOKENS.has(token)
  );
}

function expandThemePhrases(tokens: string[]) {
  const expanded: string[] = [];

  if (tokens.includes('transaction') && tokens.includes('monitoring')) {
    expanded.push(
      'transaction monitoring',
      'monitoring controls',
      'monitoring failures',
      'anti money laundering',
      'suspicious activity reporting',
    );
  }

  if (
    tokens.includes('terrorist') &&
    (tokens.includes('financing') || tokens.includes('finance'))
  ) {
    expanded.push(
      'counter terrorist financing',
      'counter terrorist financing controls',
      'anti money laundering and counter terrorist financing',
      'aml cft',
    );
  }

  if (tokens.includes('market') && tokens.includes('abuse')) {
    expanded.push(
      'market abuse',
      'market manipulation',
      'insider trading',
    );
  }

  if (tokens.includes('insider') && tokens.includes('trading')) {
    expanded.push(
      'insider trading',
      'market abuse',
      'market manipulation',
    );
  }

  return unique(expanded);
}

export function expandSearchTerms(tokens: string[]) {
  return unique(
    tokens.flatMap((token) => [token, ...(ACRONYM_EXPANSIONS[token] ?? [])]),
  );
}

export function normalizeCountryCode(country: string | null | undefined) {
  if (!country) {
    return null;
  }

  const trimmed = country.trim();
  if (!trimmed) {
    return null;
  }

  const lowercase = trimmed.toLowerCase();
  if (COUNTRY_ALIASES[lowercase]) {
    return COUNTRY_ALIASES[lowercase];
  }

  const uppercase = trimmed.toUpperCase();
  if (
    PUBLIC_REGULATOR_NAV_ITEMS.some(
      (coverage) => coverage.countryCode === uppercase,
    )
  ) {
    return uppercase;
  }

  return COUNTRY_NAME_TO_CODE.get(lowercase) ?? null;
}

export function prepareEnforcementSearch(query: string): PreparedEnforcementSearch {
  const normalizedQuery = normalizeSearchQuery(query);
  const rawTokens = unique(
    normalizedQuery
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 2),
  );
  const meaningfulTokens = rawTokens.filter((token) => isMeaningfulToken(token));
  const baseTokens = meaningfulTokens;
  const expandedTerms = expandSearchTerms(baseTokens);
  const themePhrases = expandThemePhrases(baseTokens);
  const searchQuery =
    (baseTokens.length === 1 ? ACRONYM_EXPANSIONS[baseTokens[0]]?.[0] : null) ??
    baseTokens.join(' ').trim();
  const tokenPhrases = unique([
    ...expandedTerms,
    ...themePhrases,
    ...buildPhraseWindows(baseTokens, 2),
    ...buildPhraseWindows(baseTokens, 3),
  ]);
  const searchPatterns = unique([
    ...(searchQuery ? toLikePatterns(searchQuery) : []),
    ...tokenPhrases.flatMap((term) => toLikePatterns(term)),
    ...baseTokens.flatMap((term) => toLikePatterns(term)),
  ]);
  const minimumTokenMatches =
    meaningfulTokens.length >= 3 ? 2 : meaningfulTokens.length >= 1 ? 1 : 0;
  const regulatorHints = unique(
    rawTokens
      .map((token) => REGULATOR_CODE_TO_MATCH.get(token))
      .filter((token): token is string => Boolean(token)),
  );
  const countryHints = unique(
    rawTokens
      .map((token) => {
        if (COUNTRY_ALIASES[token]) {
          return COUNTRY_ALIASES[token];
        }

        return normalizeCountryCode(token);
      })
      .filter((token): token is string => Boolean(token)),
  );
  const hasSearchIntent =
    meaningfulTokens.length > 0 || regulatorHints.length > 0 || countryHints.length > 0;

  return {
    normalizedQuery,
    searchQuery,
    phrasePattern: searchQuery ? `%${searchQuery}%` : '',
    searchPatterns,
    searchTerms: unique([...rawTokens, ...expandedTerms, ...themePhrases]),
    meaningfulTerms: meaningfulTokens,
    minimumTokenMatches,
    regulatorHints,
    countryHints,
    hasSearchIntent,
  };
}

export function buildFallbackSnippet(summary: string | null, breachType: string | null) {
  const source = summary?.trim() || breachType?.trim() || '';
  return source.length > 220 ? `${source.slice(0, 217)}...` : source;
}

export function stripSnippetHtml(snippet: string | null | undefined) {
  if (!snippet) {
    return '';
  }

  return snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
