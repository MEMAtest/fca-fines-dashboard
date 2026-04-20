import { PUBLIC_REGULATOR_NAV_ITEMS } from '../../src/data/regulatorCoverage.js';

const ACRONYM_EXPANSIONS: Record<string, string[]> = {
  aml: ['anti money laundering'],
  cdd: ['customer due diligence', 'know your customer', 'source of funds'],
  kyc: ['know your customer', 'customer due diligence', 'source of wealth'],
  sar: ['suspicious activity reporting', 'suspicious transaction reporting'],
  smcr: [
    'senior managers and certification regime',
    'senior managers regime',
    'certification regime',
    'conduct rules',
    'approved person',
    'controlled function',
  ],
  cft: [
    'counter terrorist financing',
    'anti money laundering and counter terrorist financing',
    'aml cft',
  ],
  ctf: [
    'counter terrorist financing',
    'anti money laundering and counter terrorist financing',
    'aml cft',
  ],
};

const COUNTRY_ALIASES: Record<string, string> = {
  austrian: 'AT',
  belgian: 'BE',
  canadian: 'CA',
  czech: 'CZ',
  danish: 'DK',
  dutch: 'NL',
  finnish: 'FI',
  french: 'FR',
  german: 'DE',
  irish: 'IE',
  italian: 'IT',
  japanese: 'JP',
  maltese: 'MT',
  norwegian: 'NO',
  portuguese: 'PT',
  singaporean: 'SG',
  spanish: 'ES',
  swedish: 'SE',
  swiss: 'CH',
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

const BASE_FUZZY_SEARCH_PHRASES = unique([
  ...PUBLIC_REGULATOR_NAV_ITEMS.flatMap((coverage) => [
    coverage.code,
    coverage.fullName,
    coverage.country,
  ]),
  ...Object.keys(ACRONYM_EXPANSIONS),
  ...Object.values(ACRONYM_EXPANSIONS).flat(),
  'anti money laundering',
  'financial crime',
  'transaction monitoring',
  'customer due diligence',
  'know your customer',
  'source of funds',
  'source of wealth',
  'suspicious activity reporting',
  'counter terrorist financing',
  'sanctions compliance',
  'market abuse',
  'market manipulation',
  'insider trading',
  'governance',
  'accountability',
  'board oversight',
  'books and records',
  'record keeping',
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
  categoryHints: string[];
  hasSearchIntent: boolean;
}

export interface FuzzySearchResolution {
  correctedTerms: string[];
  correctedQuery: string;
  corrections: Array<{ from: string; to: string }>;
  changed: boolean;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function computeEditDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost,
      );
    }
  }

  return matrix[left.length][right.length];
}

function tokenizeFuzzyPhrase(value: string) {
  return unique(
    normalizeSearchQuery(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3 && !LOW_SIGNAL_SEARCH_TOKENS.has(token)),
  );
}

function buildPhraseTokenSets(candidatePhrases: string[]) {
  return candidatePhrases.map((phrase) => ({
    phrase,
    tokens: new Set(tokenizeFuzzyPhrase(phrase)),
  }));
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
  const hasSmcrIntent =
    tokens.includes('smcr')
    || (tokens.includes('senior') && tokens.includes('managers'))
    || (tokens.includes('conduct') && tokens.includes('rules'));
  const hasCftIntent =
    tokens.includes('cft')
    || tokens.includes('ctf')
    || (
      tokens.includes('terrorist')
      && (tokens.includes('financing') || tokens.includes('finance'))
    );
  const hasCryptoIntent =
    tokens.includes('crypto')
    || tokens.includes('cryptoasset')
    || tokens.includes('cryptoassets')
    || tokens.includes('cryptocurrency')
    || tokens.includes('cryptocurrencies')
    || (
      (tokens.includes('virtual') || tokens.includes('digital'))
      && (tokens.includes('asset') || tokens.includes('assets'))
    );

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
    tokens.includes('customer')
    && (tokens.includes('diligence') || tokens.includes('onboarding'))
  ) {
    expanded.push(
      'customer due diligence',
      'know your customer',
      'source of funds',
      'source of wealth',
    );
  }

  if (
    tokens.includes('suspicious')
    && (tokens.includes('activity') || tokens.includes('transaction'))
  ) {
    expanded.push(
      'suspicious activity reporting',
      'suspicious transaction reporting',
      'suspicious activity review',
    );
  }

  if (hasSmcrIntent) {
    expanded.push(
      'smcr',
      'senior managers and certification regime',
      'conduct rules',
      'approved person',
      'controlled function',
      'senior management',
      'manager accountability',
      'governance',
      'board oversight',
      'committee oversight',
      'management information',
    );
  }

  if (hasCftIntent) {
    expanded.push(
      'counter terrorist financing',
      'counter-terrorist financing',
      'terrorist financing',
      'counter terrorist financing controls',
      'countering the financing of terrorism',
      'anti money laundering and counter terrorist financing',
      'anti money laundering and countering the financing of terrorism',
      'aml cft',
      'aml',
      'anti money laundering',
      'customer due diligence',
      'sanctions compliance',
    );
  }

  if (hasCryptoIntent) {
    expanded.push(
      'crypto asset',
      'crypto assets',
      'cryptoasset',
      'cryptoassets',
      'cryptocurrency',
      'cryptocurrencies',
      'virtual asset',
      'virtual assets',
      'digital asset',
      'digital assets',
      'virtual asset service provider',
      'virtual asset service providers',
      'vasp',
      'digital token',
      'digital tokens',
    );
  }

  if (tokens.includes('compliance')) {
    expanded.push(
      'systems and controls',
      'controls failures',
      'control failures',
      'compliance controls',
      'policies and procedures',
      'internal controls',
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

  if (tokens.includes('governance') || tokens.includes('accountability')) {
    expanded.push(
      'governance',
      'accountability',
      'board oversight',
      'committee oversight',
      'management information',
      'senior management',
    );
  }

  if (
    tokens.includes('books')
    && (tokens.includes('records') || tokens.includes('recordkeeping'))
  ) {
    expanded.push('books and records', 'record keeping', 'recordkeeping');
  }

  return unique(expanded);
}

function deriveCategoryHints(tokens: string[], themePhrases: string[]) {
  const haystack = new Set([...tokens, ...themePhrases]);
  const categoryHints = new Set<string>();

  const push = (...categories: string[]) => {
    categories.forEach((category) => categoryHints.add(category));
  };

  if (
    haystack.has('aml')
    || haystack.has('anti money laundering')
    || haystack.has('transaction monitoring')
    || haystack.has('customer due diligence')
    || haystack.has('know your customer')
    || haystack.has('suspicious activity reporting')
  ) {
    push('AML', 'FINANCIAL_CRIME', 'SYSTEMS_AND_CONTROLS', 'CONTROLS');
  }

  if (
    haystack.has('crypto')
    || haystack.has('crypto asset')
    || haystack.has('crypto assets')
    || haystack.has('cryptoasset')
    || haystack.has('cryptoassets')
    || haystack.has('cryptocurrency')
    || haystack.has('virtual asset')
    || haystack.has('virtual assets')
    || haystack.has('digital asset')
    || haystack.has('digital assets')
    || haystack.has('virtual asset service provider')
    || haystack.has('vasp')
  ) {
    push('AML', 'FINANCIAL_CRIME', 'CRYPTO', 'VASP');
  }

  if (
    haystack.has('counter terrorist financing')
    || haystack.has('terrorist financing')
    || haystack.has('anti money laundering and counter terrorist financing')
    || haystack.has('sanctions compliance')
  ) {
    push('AML', 'CFT', 'CTF', 'SANCTIONS', 'SYSTEMS_AND_CONTROLS');
  }

  if (
    haystack.has('compliance')
    || haystack.has('systems and controls')
    || haystack.has('compliance controls')
    || haystack.has('control failures')
    || haystack.has('controls failures')
    || haystack.has('internal controls')
  ) {
    push('SYSTEMS_AND_CONTROLS', 'CONTROLS', 'GOVERNANCE');
  }

  if (
    haystack.has('smcr')
    || haystack.has('governance')
    || haystack.has('accountability')
    || haystack.has('board oversight')
    || haystack.has('senior managers and certification regime')
  ) {
    push('GOVERNANCE', 'SMCR', 'CONDUCT', 'SYSTEMS_AND_CONTROLS');
  }

  if (
    haystack.has('market abuse')
    || haystack.has('market manipulation')
    || haystack.has('insider trading')
  ) {
    push('MARKET_ABUSE', 'INSIDER_DEALING', 'TRADING', 'SURVEILLANCE');
  }

  if (
    haystack.has('books and records')
    || haystack.has('record keeping')
    || haystack.has('recordkeeping')
  ) {
    push('DISCLOSURE', 'REPORTING', 'BOOKS_AND_RECORDS');
  }

  return Array.from(categoryHints);
}

export function expandSearchTerms(tokens: string[]) {
  return unique(
    tokens.flatMap((token) => [token, ...(ACRONYM_EXPANSIONS[token] ?? [])]),
  );
}

export function buildFuzzySearchVocabulary(candidatePhrases: string[]) {
  return unique([
    ...BASE_FUZZY_SEARCH_PHRASES.flatMap((phrase) => tokenizeFuzzyPhrase(phrase)),
    ...candidatePhrases.flatMap((phrase) => tokenizeFuzzyPhrase(phrase)),
  ]);
}

export function resolveFuzzySearchTerms(
  terms: string[],
  candidatePhrases: string[],
): FuzzySearchResolution {
  const vocabulary = buildFuzzySearchVocabulary(candidatePhrases);
  const phraseTokenSets = buildPhraseTokenSets(candidatePhrases);
  if (terms.length === 0 || vocabulary.length === 0) {
    return {
      correctedTerms: terms,
      correctedQuery: terms.join(' '),
      corrections: [],
      changed: false,
    };
  }

  const exactVocabulary = new Set(vocabulary);
  type CandidateMatch = {
    value: string;
    editDistance: number;
    lengthDelta: number;
    phraseContextScore: number;
  };

  const corrections: Array<{ from: string; to: string }> = [];
  const correctedTerms = terms.map((term) => {
    if (
      term.length < 4
      || exactVocabulary.has(term)
      || COMMON_STOPWORDS.has(term)
      || LOW_SIGNAL_SEARCH_TOKENS.has(term)
    ) {
      return term;
    }

    const maxEditDistance = term.length >= 8 ? 2 : 1;
    const contextTerms = new Set(
      terms.filter((candidateTerm) => candidateTerm !== term && candidateTerm.length >= 3),
    );
    let acceptedCandidate: CandidateMatch | null = null;

    for (const candidate of vocabulary) {
      const editDistance = computeEditDistance(term, candidate);
      const lengthDelta = Math.abs(candidate.length - term.length);
      const phraseContextScore = phraseTokenSets.reduce((score, entry) => {
        if (!entry.tokens.has(candidate)) {
          return score;
        }

        for (const contextTerm of contextTerms) {
          if (entry.tokens.has(contextTerm)) {
            return score + 1;
          }
        }

        return score;
      }, 0);
      if (
        candidate === term
        || candidate[0] !== term[0]
        || candidate[candidate.length - 1] !== term[term.length - 1]
        || lengthDelta > 2
        || editDistance > maxEditDistance
        || (contextTerms.size > 0 && phraseContextScore === 0)
      ) {
        continue;
      }

      if (
        !acceptedCandidate
        || phraseContextScore > acceptedCandidate.phraseContextScore
        || (
          phraseContextScore === acceptedCandidate.phraseContextScore
          && editDistance < acceptedCandidate.editDistance
        )
        || (
          phraseContextScore === acceptedCandidate.phraseContextScore
          && editDistance === acceptedCandidate.editDistance
          && lengthDelta < acceptedCandidate.lengthDelta
        )
      ) {
        acceptedCandidate = {
          value: candidate,
          editDistance,
          lengthDelta,
          phraseContextScore,
        };
      }
    }

    if (!acceptedCandidate) {
      return term;
    }

    corrections.push({ from: term, to: acceptedCandidate.value });
    return acceptedCandidate.value;
  });

  return {
    correctedTerms,
    correctedQuery: correctedTerms.join(' ').trim(),
    corrections,
    changed: corrections.length > 0,
  };
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
  const categoryHints = deriveCategoryHints(baseTokens, themePhrases);

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
    categoryHints,
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
