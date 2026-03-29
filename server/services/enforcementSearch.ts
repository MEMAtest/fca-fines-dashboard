import { PUBLIC_REGULATOR_NAV_ITEMS } from '../../src/data/regulatorCoverage.js';

const ACRONYM_EXPANSIONS: Record<string, string[]> = {
  aml: ['anti money laundering'],
  smcr: ['senior managers regime'],
  cft: ['counter terrorist financing'],
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

export interface PreparedEnforcementSearch {
  normalizedQuery: string;
  phrasePattern: string;
  searchPatterns: string[];
  searchTerms: string[];
  minimumTokenMatches: number;
  regulatorHints: string[];
  countryHints: string[];
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

  const uppercase = trimmed.toUpperCase();
  if (
    PUBLIC_REGULATOR_NAV_ITEMS.some(
      (coverage) => coverage.countryCode === uppercase,
    )
  ) {
    return uppercase;
  }

  return COUNTRY_NAME_TO_CODE.get(trimmed.toLowerCase()) ?? uppercase;
}

export function prepareEnforcementSearch(query: string): PreparedEnforcementSearch {
  const normalizedQuery = normalizeSearchQuery(query);
  const rawTokens = unique(
    normalizedQuery
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 2),
  );
  const baseTokens = rawTokens.filter((token) => token.length >= 3);
  const expandedTerms = expandSearchTerms(baseTokens);
  const tokenPhrases = unique([
    ...expandedTerms,
    ...baseTokens
      .slice(0, -1)
      .map((token, index) => `${token} ${baseTokens[index + 1]}`),
  ]);
  const searchPatterns = unique([
    ...toLikePatterns(normalizedQuery),
    ...tokenPhrases.flatMap((term) => toLikePatterns(term)),
  ]);

  return {
    normalizedQuery,
    phrasePattern: `%${normalizedQuery}%`,
    searchPatterns,
    searchTerms: unique([...rawTokens, ...expandedTerms]),
    minimumTokenMatches: baseTokens.length > 1 ? 2 : 1,
    regulatorHints: unique(
      rawTokens
        .map((token) => REGULATOR_CODE_TO_MATCH.get(token))
        .filter((token): token is string => Boolean(token)),
    ),
    countryHints: unique(
      rawTokens
        .map((token) => {
          if (COUNTRY_ALIASES[token]) {
            return COUNTRY_ALIASES[token];
          }

          return normalizeCountryCode(token);
        })
        .filter((token): token is string => Boolean(token)),
    ),
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
