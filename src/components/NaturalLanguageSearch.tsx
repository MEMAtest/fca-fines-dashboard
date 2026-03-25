/**
 * Natural Language Search Component - Phase 6A
 *
 * Full-text search across all enforcement actions with:
 * - Semantic search queries (e.g., "AML transaction monitoring failures")
 * - Relevance-ranked results with snippets
 * - Advanced filters (regulator, country, year, amount)
 * - Highlighted search terms in results
 */

import { useState, useEffect } from 'react';
import { Search, Filter, X, TrendingUp, Calendar, DollarSign, Globe } from 'lucide-react';
import { PUBLIC_REGULATOR_NAV_ITEMS } from '../data/regulatorCoverage';

interface SearchResult {
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

interface SearchResponse {
  query: string;
  results: SearchResult[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    pages: number;
    currentPage: number;
  };
  filters: {
    query: string;
    regulator: string | null;
    country: string | null;
    year: number | null;
    minAmount: number | null;
    maxAmount: number | null;
    currency: string;
    minRelevance: number;
  };
  searchTerms: string[];
  metadata: {
    searchMethod: string;
    indexType: string;
    language: string;
    weights: Record<string, string>;
  };
}

export function NaturalLanguageSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<SearchResponse['pagination'] | null>(null);
  const [searchTerms, setSearchTerms] = useState<string[]>([]);

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRegulator, setSelectedRegulator] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [currency, setCurrency] = useState<'GBP' | 'EUR'>('GBP');
  const [currentPage, setCurrentPage] = useState(1);

  // Suggested queries
  const suggestedQueries = [
    'AML transaction monitoring failures',
    'market manipulation insider trading',
    'Goldman Sachs enforcement',
    'compliance failures Germany',
    'SMCR senior managers regime',
    'client money segregation',
    'financial crime controls',
    'market abuse regulation'
  ];

  // Get unique countries from regulators
  const countries = Array.from(new Set(PUBLIC_REGULATOR_NAV_ITEMS.map(r => r.country))).sort();

  // Get years (2010-2026)
  const years = Array.from({ length: 17 }, (_, i) => 2026 - i);

  const performSearch = async (page: number = 1) => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        currency,
        limit: '20',
        offset: String((page - 1) * 20)
      });

      if (selectedRegulator) params.append('regulator', selectedRegulator);
      if (selectedCountry) params.append('country', selectedCountry);
      if (selectedYear) params.append('year', selectedYear);
      if (minAmount) params.append('minAmount', minAmount);
      if (maxAmount) params.append('maxAmount', maxAmount);

      const response = await fetch(`/api/search?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Search failed');
      }

      const data: SearchResponse = await response.json();
      setResults(data.results);
      setPagination(data.pagination);
      setSearchTerms(data.searchTerms || []);
      setCurrentPage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setResults([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    performSearch(1);
  };

  const handleSuggestedQuery = (suggested: string) => {
    setQuery(suggested);
    setCurrentPage(1);
    // Auto-search when clicking suggested query
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }, 100);
  };

  const clearFilters = () => {
    setSelectedRegulator('');
    setSelectedCountry('');
    setSelectedYear('');
    setMinAmount('');
    setMaxAmount('');
  };

  const formatAmount = (amount: number, curr: 'GBP' | 'EUR') => {
    const symbol = curr === 'GBP' ? '£' : '€';
    if (amount >= 1_000_000) {
      return `${symbol}${(amount / 1_000_000).toFixed(2)}M`;
    } else if (amount >= 1_000) {
      return `${symbol}${(amount / 1_000).toFixed(0)}K`;
    } else {
      return `${symbol}${amount.toFixed(0)}`;
    }
  };

  const getRelevanceColor = (relevance: string) => {
    const score = parseFloat(relevance);
    if (score >= 0.15) return 'text-green-600 bg-green-50';
    if (score >= 0.10) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="natural-language-search">
      {/* Search Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Natural Language Search</h1>
          <p className="text-blue-100 mb-6">
            Search across {PUBLIC_REGULATOR_NAV_ITEMS.length} regulators using natural language queries
          </p>

          {/* Search Form */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., 'AML transaction monitoring failures' or 'Goldman Sachs enforcement actions'"
                className="w-full pl-12 pr-32 py-4 rounded-lg text-gray-900 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-md font-medium transition-colors"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>

          {/* Suggested Queries */}
          <div className="mt-4">
            <p className="text-sm text-blue-100 mb-2">Suggested queries:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQueries.slice(0, 4).map((suggested, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestedQuery(suggested)}
                  className="text-sm px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded-full transition-colors"
                >
                  {suggested}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="mt-4 flex items-center gap-2 text-sm text-blue-100 hover:text-white transition-colors"
          >
            <Filter size={16} />
            {showFilters ? 'Hide Filters' : 'Show Advanced Filters'}
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="bg-gray-50 border-b border-gray-200 py-6 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Regulator Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Globe size={14} className="inline mr-1" />
                  Regulator
                </label>
                <select
                  value={selectedRegulator}
                  onChange={(e) => setSelectedRegulator(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Regulators</option>
                  {PUBLIC_REGULATOR_NAV_ITEMS.map((reg) => (
                    <option key={reg.code} value={reg.code}>
                      {reg.flag} {reg.code} - {reg.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Country Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Globe size={14} className="inline mr-1" />
                  Country
                </label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Countries</option>
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar size={14} className="inline mr-1" />
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Years</option>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Min Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <DollarSign size={14} className="inline mr-1" />
                  Min Amount ({currency})
                </label>
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Max Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <DollarSign size={14} className="inline mr-1" />
                  Max Amount ({currency})
                </label>
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="No limit"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrency('GBP')}
                    className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                      currency === 'GBP'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    GBP (£)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency('EUR')}
                    className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                      currency === 'EUR'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    EUR (€)
                  </button>
                </div>
              </div>
            </div>

            {/* Clear Filters */}
            {(selectedRegulator || selectedCountry || selectedYear || minAmount || maxAmount) && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <X size={14} />
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Section */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
            <strong className="font-medium">Error:</strong> {error}
          </div>
        )}

        {/* Results Header */}
        {pagination && !loading && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Found {pagination.total.toLocaleString()} results for "{query}"
            </h2>
            {searchTerms.length > 0 && (
              <p className="text-sm text-gray-600">
                Search terms: {searchTerms.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <div className="space-y-6">
            {results.map((result) => (
              <div
                key={result.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {result.firm}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <span className="font-medium">{result.regulator}</span>
                      <span>•</span>
                      <span>{result.countryName}</span>
                      <span>•</span>
                      <span>{new Date(result.dateIssued).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>

                  {/* Relevance Score */}
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${getRelevanceColor(result.relevance)}`}>
                    <TrendingUp size={12} className="inline mr-1" />
                    {(parseFloat(result.relevance) * 100).toFixed(1)}% match
                  </div>
                </div>

                {/* Breach Type & Amount */}
                <div className="flex items-center gap-4 mb-3">
                  {result.breachType && (
                    <span className="inline-block px-3 py-1 bg-red-50 text-red-700 text-sm font-medium rounded-full">
                      {result.breachType}
                    </span>
                  )}
                  <span className="text-lg font-bold text-gray-900">
                    {formatAmount(currency === 'EUR' ? result.amountEur : result.amountGbp, currency)}
                  </span>
                </div>

                {/* Snippet (highlighted excerpt) */}
                {result.snippet && (
                  <div
                    className="text-sm text-gray-700 mb-3 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  {result.noticeUrl && (
                    <a
                      href={result.noticeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      View Notice →
                    </a>
                  )}
                  {result.sourceUrl && result.sourceUrl !== result.noticeUrl && (
                    <a
                      href={result.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      Source →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="mt-8 flex justify-center items-center gap-2">
            <button
              onClick={() => performSearch(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>

            <span className="px-4 py-2 text-gray-700">
              Page {currentPage} of {pagination.pages}
            </span>

            <button
              onClick={() => performSearch(currentPage + 1)}
              disabled={!pagination.hasMore || loading}
              className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && query && !error && (
          <div className="text-center py-12">
            <Search size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-600 mb-4">
              Try adjusting your search terms or filters
            </p>
            <button
              onClick={clearFilters}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}

        {/* Initial State (before first search) */}
        {!loading && !query && results.length === 0 && (
          <div className="text-center py-12">
            <Search size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Start searching enforcement actions
            </h3>
            <p className="text-gray-600 mb-6">
              Use natural language to find relevant cases across all regulators
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
              {suggestedQueries.map((suggested, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestedQuery(suggested)}
                  className="px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left text-sm text-gray-700 transition-colors"
                >
                  <Search size={14} className="inline mr-2 text-gray-400" />
                  {suggested}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
