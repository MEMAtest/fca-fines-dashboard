import {
  normalizeCountryCode,
  prepareEnforcementSearch,
} from '../server/services/enforcementSearch.js';

export interface MockSearchResult {
  id: string;
  regulator: string;
  regulatorFullName: string;
  countryCode: string;
  countryName: string;
  firm: string;
  firmCategory: string;
  amountOriginal: number;
  currency: string;
  amountGbp: number;
  amountEur: number;
  dateIssued: string;
  year: number;
  month: number;
  breachType: string;
  breachCategories: string[];
  summary: string;
  snippet: string;
  noticeUrl: string;
  sourceUrl: string;
  relevance: string;
  createdAt: string;
}

function createResult(partial: Omit<MockSearchResult, 'snippet' | 'relevance'>) {
  return {
    ...partial,
    snippet: partial.summary,
    relevance: '0.0000',
  } satisfies MockSearchResult;
}

const CORE_RESULTS: MockSearchResult[] = [
  createResult({
    id: 'sec-goldman',
    regulator: 'SEC',
    regulatorFullName: 'U.S. Securities and Exchange Commission',
    countryCode: 'US',
    countryName: 'United States',
    firm: 'Goldman Sachs & Co. LLC',
    firmCategory: 'Firm',
    amountOriginal: 3000000,
    currency: 'USD',
    amountGbp: 2400000,
    amountEur: 2800000,
    dateIssued: '2025-01-10T00:00:00.000Z',
    year: 2025,
    month: 1,
    breachType: 'Books and records enforcement action',
    breachCategories: ['DISCLOSURE', 'ENFORCEMENT'],
    summary:
      'The SEC announced an enforcement action against Goldman Sachs & Co. LLC for supervisory and books and records failures.',
    noticeUrl: 'https://example.com/sec-goldman',
    sourceUrl: 'https://example.com/sec-goldman-source',
    createdAt: '2025-01-10T00:00:00.000Z',
  }),
  createResult({
    id: 'cbi-coinbase',
    regulator: 'CBI',
    regulatorFullName: 'Central Bank of Ireland',
    countryCode: 'IE',
    countryName: 'Ireland',
    firm: 'Coinbase Europe Limited',
    firmCategory: 'Firm',
    amountOriginal: 3398975,
    currency: 'EUR',
    amountGbp: 2900000,
    amountEur: 3398975,
    dateIssued: '2025-11-06T00:00:00.000Z',
    year: 2025,
    month: 11,
    breachType: 'AML compliance failures',
    breachCategories: ['AML', 'SYSTEMS_AND_CONTROLS'],
    summary:
      'Coinbase Europe Limited was fined for AML compliance failures, customer due diligence weaknesses, and transaction monitoring control gaps.',
    noticeUrl: 'https://example.com/cbi-coinbase',
    sourceUrl: 'https://example.com/cbi-coinbase-source',
    createdAt: '2025-11-06T00:00:00.000Z',
  }),
  createResult({
    id: 'fca-barclays',
    regulator: 'FCA',
    regulatorFullName: 'Financial Conduct Authority',
    countryCode: 'GB',
    countryName: 'United Kingdom',
    firm: 'Barclays Bank plc',
    firmCategory: 'Firm',
    amountOriginal: 40000000,
    currency: 'GBP',
    amountGbp: 40000000,
    amountEur: 46500000,
    dateIssued: '2025-07-14T00:00:00.000Z',
    year: 2025,
    month: 7,
    breachType: 'Financial crime controls failures',
    breachCategories: ['FINANCIAL_CRIME', 'SYSTEMS_AND_CONTROLS'],
    summary:
      'Barclays Bank plc was sanctioned for financial crime controls failures and weak governance around high-risk client relationships.',
    noticeUrl: 'https://example.com/fca-barclays',
    sourceUrl: 'https://example.com/fca-barclays-source',
    createdAt: '2025-07-14T00:00:00.000Z',
  }),
  createResult({
    id: 'sec-lpl',
    regulator: 'SEC',
    regulatorFullName: 'U.S. Securities and Exchange Commission',
    countryCode: 'US',
    countryName: 'United States',
    firm: 'LPL Financial LLC',
    firmCategory: 'Firm',
    amountOriginal: 18000000,
    currency: 'USD',
    amountGbp: 14500000,
    amountEur: 16800000,
    dateIssued: '2025-01-17T00:00:00.000Z',
    year: 2025,
    month: 1,
    breachType: 'Anti-money laundering failures',
    breachCategories: ['AML', 'SYSTEMS_AND_CONTROLS'],
    summary:
      'The SEC charged LPL Financial for multiple anti-money laundering failures, including transaction monitoring weaknesses and suspicious activity reporting gaps.',
    noticeUrl: 'https://example.com/sec-lpl',
    sourceUrl: 'https://example.com/sec-lpl-source',
    createdAt: '2025-01-17T00:00:00.000Z',
  }),
  createResult({
    id: 'dfsa-omni',
    regulator: 'DFSA',
    regulatorFullName: 'Dubai Financial Services Authority',
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    firm: 'Omni Exchange Ltd',
    firmCategory: 'Firm',
    amountOriginal: 10000000,
    currency: 'AED',
    amountGbp: 2150000,
    amountEur: 2520000,
    dateIssued: '2025-09-12T00:00:00.000Z',
    year: 2025,
    month: 9,
    breachType: 'AML and sanctions control failures',
    breachCategories: ['AML', 'SANCTIONS'],
    summary:
      'The DFSA imposed a sanction on Omni Exchange Ltd for AML and sanctions control failures in its exchange business.',
    noticeUrl: 'https://example.com/dfsa-omni',
    sourceUrl: 'https://example.com/dfsa-omni-source',
    createdAt: '2025-09-12T00:00:00.000Z',
  }),
  createResult({
    id: 'sebi-streetgains',
    regulator: 'SEBI',
    regulatorFullName: 'Securities and Exchange Board of India',
    countryCode: 'IN',
    countryName: 'India',
    firm: 'Streetgains Research Services',
    firmCategory: 'Firm',
    amountOriginal: 1600000,
    currency: 'INR',
    amountGbp: 15000,
    amountEur: 18000,
    dateIssued: '2026-03-25T00:00:00.000Z',
    year: 2026,
    month: 3,
    breachType: 'Anti money laundering systems failures',
    breachCategories: ['AML', 'SYSTEMS_AND_CONTROLS'],
    summary:
      'SEBI penalised Streetgains Research Services for anti money laundering systems failures and weak client onboarding controls.',
    noticeUrl: 'https://example.com/sebi-streetgains',
    sourceUrl: 'https://example.com/sebi-streetgains-source',
    createdAt: '2026-03-25T00:00:00.000Z',
  }),
  createResult({
    id: 'bafin-market',
    regulator: 'BaFin',
    regulatorFullName: 'Federal Financial Supervisory Authority',
    countryCode: 'DE',
    countryName: 'Germany',
    firm: 'NordWest Broker GmbH',
    firmCategory: 'Firm',
    amountOriginal: 2250000,
    currency: 'EUR',
    amountGbp: 1930000,
    amountEur: 2250000,
    dateIssued: '2025-05-02T00:00:00.000Z',
    year: 2025,
    month: 5,
    breachType: 'Market manipulation and insider trading controls failures',
    breachCategories: ['MARKET_ABUSE', 'INSIDER_DEALING'],
    summary:
      'BaFin published a fine against NordWest Broker GmbH over market manipulation surveillance failures and insider trading controls weaknesses in Germany.',
    noticeUrl: 'https://example.com/bafin-market',
    sourceUrl: 'https://example.com/bafin-market-source',
    createdAt: '2025-05-02T00:00:00.000Z',
  }),
  createResult({
    id: 'cbuae-omda',
    regulator: 'CBUAE',
    regulatorFullName: 'Central Bank of the UAE',
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    firm: 'Omda Exchange',
    firmCategory: 'Firm',
    amountOriginal: 10000000,
    currency: 'AED',
    amountGbp: 2150000,
    amountEur: 2520000,
    dateIssued: '2025-12-23T00:00:00.000Z',
    year: 2025,
    month: 12,
    breachType: 'AML transaction monitoring failures',
    breachCategories: ['AML', 'SYSTEMS_AND_CONTROLS'],
    summary:
      'The Central Bank of the UAE revoked the licence of Omda Exchange and imposed a financial sanction after AML transaction monitoring failures and regulatory breaches.',
    noticeUrl: 'https://example.com/cbuae-omda',
    sourceUrl: 'https://example.com/cbuae-omda-source',
    createdAt: '2025-12-23T00:00:00.000Z',
  }),
];

const PAGINATION_RESULTS = Array.from({ length: 24 }, (_, index) =>
  createResult({
    id: `aml-page-${index + 1}`,
    regulator: index % 2 === 0 ? 'FCA' : 'SEC',
    regulatorFullName:
      index % 2 === 0
        ? 'Financial Conduct Authority'
        : 'U.S. Securities and Exchange Commission',
    countryCode: index % 2 === 0 ? 'GB' : 'US',
    countryName: index % 2 === 0 ? 'United Kingdom' : 'United States',
    firm: `AML Case ${index + 1} Ltd`,
    firmCategory: 'Firm',
    amountOriginal: 1000000 + index * 10000,
    currency: index % 2 === 0 ? 'GBP' : 'USD',
    amountGbp: 1000000 + index * 10000,
    amountEur: 1160000 + index * 10000,
    dateIssued: `2025-02-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`,
    year: 2025,
    month: 2,
    breachType: 'AML control failures',
    breachCategories: ['AML'],
    summary: `AML Case ${index + 1} involved anti money laundering control weaknesses, suspicious activity reporting gaps, and monitoring governance failures.`,
    noticeUrl: `https://example.com/aml-page-${index + 1}`,
    sourceUrl: `https://example.com/aml-page-${index + 1}-source`,
    createdAt: `2025-02-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }),
);

const SEARCH_FIXTURES = [...CORE_RESULTS, ...PAGINATION_RESULTS];

function buildHaystack(result: MockSearchResult) {
  return [
    result.firm,
    result.regulator,
    result.regulatorFullName,
    result.breachType,
    result.summary,
    result.countryName,
  ]
    .join(' ')
    .toLowerCase();
}

function normalizeHaystack(value: string) {
  return value.replace(/[^a-z0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function scoreResult(result: MockSearchResult, query: string) {
  const prepared = prepareEnforcementSearch(query);
  const haystack = normalizeHaystack(buildHaystack(result));
  const normalizedQuery = prepared.normalizedQuery.toLowerCase();
  let score = 0;

  if (result.firm.toLowerCase() === normalizedQuery) {
    score += 300;
  } else if (result.firm.toLowerCase().includes(normalizedQuery)) {
    score += 200;
  }

  if (prepared.regulatorHints.includes(result.regulator)) {
    score += 35;
  }

  if (prepared.countryHints.includes(result.countryCode)) {
    score += 20;
  }

  if (
    result.summary.toLowerCase().includes(normalizedQuery) ||
    result.breachType.toLowerCase().includes(normalizedQuery)
  ) {
    score += 50;
  }

  for (const pattern of prepared.searchPatterns) {
    const fragment = normalizeHaystack(pattern.replaceAll('%', ' '));
    if (fragment && haystack.includes(fragment)) {
      score += 5;
    }
  }

  return score;
}

export function buildMockSearchResponse(params: URLSearchParams) {
  const query = params.get('q')?.trim() ?? '';
  const regulator = params.get('regulator');
  const country = normalizeCountryCode(params.get('country'));
  const year = params.get('year');
  const minAmount = params.get('minAmount');
  const maxAmount = params.get('maxAmount');
  const currency = params.get('currency') === 'EUR' ? 'EUR' : 'GBP';
  const limit = Number.parseInt(params.get('limit') ?? '20', 10) || 20;
  const offset = Number.parseInt(params.get('offset') ?? '0', 10) || 0;
  const prepared = prepareEnforcementSearch(query);

  const matched = SEARCH_FIXTURES
    .filter((result) => {
      if (regulator && result.regulator !== regulator) return false;
      if (country && result.countryCode !== country) return false;
      if (year && result.year !== Number.parseInt(year, 10)) return false;

      const selectedAmount = currency === 'EUR' ? result.amountEur : result.amountGbp;
      if (minAmount && selectedAmount < Number.parseFloat(minAmount)) return false;
      if (maxAmount && selectedAmount > Number.parseFloat(maxAmount)) return false;

      return scoreResult(result, query) >= prepared.minimumTokenMatches * 5;
    })
    .map((result) => ({
      ...result,
      relevance: scoreResult(result, query).toFixed(4),
    }))
    .sort((left, right) => {
      const relevanceDelta =
        Number.parseFloat(right.relevance) - Number.parseFloat(left.relevance);
      if (relevanceDelta !== 0) {
        return relevanceDelta;
      }

      return right.dateIssued.localeCompare(left.dateIssued);
    });

  const pageResults = matched.slice(offset, offset + limit);

  return {
    query,
    results: pageResults,
    pagination: {
      total: matched.length,
      limit,
      offset,
      hasMore: offset + limit < matched.length,
      pages: Math.ceil(matched.length / limit),
      currentPage: Math.floor(offset / limit) + 1,
    },
    filters: {
      query,
      regulator: regulator || null,
      country: country || null,
      year: year ? Number.parseInt(year, 10) : null,
      minAmount: minAmount ? Number.parseFloat(minAmount) : null,
      maxAmount: maxAmount ? Number.parseFloat(maxAmount) : null,
      currency,
    },
    searchTerms: prepared.searchTerms,
    metadata: {
      searchMethod: 'hybrid',
      indexType: 'fixture',
      language: 'english',
      weights: {
        firm: 'exact / phrase firm matches',
        fullText: 'mocked',
        fallback: 'phrase and token fallback matching',
      },
    },
  };
}
