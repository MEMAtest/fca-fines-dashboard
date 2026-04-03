/**
 * Enforcement Search Component
 *
 * Hybrid keyword search across all enforcement actions with:
 * - firm, regulator, and breach-theme matching
 * - advanced filters
 * - fallback snippets when highlights are unavailable
 */

import { useState } from "react";
import { Search, Filter, X, Calendar, DollarSign, Globe } from "lucide-react";
import { PUBLIC_REGULATOR_SHELL_ITEMS } from "../data/regulatorShellNav.js";

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

export function EnforcementSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<
    SearchResponse["pagination"] | null
  >(null);

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRegulator, setSelectedRegulator] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [currency, setCurrency] = useState<"GBP" | "EUR">("GBP");
  const [currentPage, setCurrentPage] = useState(1);

  // Suggested queries
  const suggestedQueries = [
    "AML transaction monitoring failures",
    "Goldman Sachs enforcement",
    "Coinbase Europe AML",
    "Barclays financial crime controls",
    "market manipulation insider trading",
    "Germany compliance failures",
    "SEBI anti money laundering",
    "DFSA exchange sanction",
  ];

  // Get unique countries from regulators
  const countries = Array.from(
    new Map(
      PUBLIC_REGULATOR_SHELL_ITEMS.map((regulator) => [
        regulator.countryCode,
        {
          code: regulator.countryCode,
          name: regulator.country,
        },
      ]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));
  const totalTrackedActions = PUBLIC_REGULATOR_SHELL_ITEMS.reduce(
    (sum, regulator) => sum + regulator.count,
    0,
  );
  const hasActiveFilters = Boolean(
    selectedRegulator ||
    selectedCountry ||
    selectedYear ||
    minAmount ||
    maxAmount,
  );

  // Get years (2010-2026)
  const years = Array.from({ length: 17 }, (_, i) => 2026 - i);

  const performSearch = async (nextQuery: string, page: number = 1) => {
    if (!nextQuery.trim()) {
      setError("Please enter a search query");
      return;
    }

    const trimmedQuery = nextQuery.trim();
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: trimmedQuery,
        currency,
        limit: "20",
        offset: String((page - 1) * 20),
      });

      if (selectedRegulator) params.append("regulator", selectedRegulator);
      if (selectedCountry) params.append("country", selectedCountry);
      if (selectedYear) params.append("year", selectedYear);
      if (minAmount) params.append("minAmount", minAmount);
      if (maxAmount) params.append("maxAmount", maxAmount);

      const response = await fetch(`/api/search?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Search failed");
      }

      const data: SearchResponse = await response.json();
      setResults(data.results);
      setPagination(data.pagination);
      setCurrentPage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setResults([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    void performSearch(query, 1);
  };

  const handleSuggestedQuery = (suggested: string) => {
    setQuery(suggested);
    setCurrentPage(1);
    void performSearch(suggested, 1);
  };

  const clearFilters = () => {
    setSelectedRegulator("");
    setSelectedCountry("");
    setSelectedYear("");
    setMinAmount("");
    setMaxAmount("");
  };

  const formatAmount = (amount: number, curr: "GBP" | "EUR") => {
    const symbol = curr === "GBP" ? "£" : "€";
    if (amount >= 1_000_000) {
      return `${symbol}${(amount / 1_000_000).toFixed(2)}M`;
    } else if (amount >= 1_000) {
      return `${symbol}${(amount / 1_000).toFixed(0)}K`;
    } else {
      return `${symbol}${amount.toFixed(0)}`;
    }
  };

  return (
    <div
      className="enforcement-search"
      style={{ background: "#f8f9fa", minHeight: "100vh" }}
    >
      {/* Hero Search Section */}
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          padding: "4rem 1.5rem 3rem",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: "700",
              color: "white",
              marginBottom: "0.75rem",
              letterSpacing: "-0.02em",
            }}
          >
            Enforcement Search
          </h1>
          <p
            style={{
              fontSize: "1.1rem",
              color: "rgba(255,255,255,0.9)",
              marginBottom: "2rem",
            }}
          >
            Search across {PUBLIC_REGULATOR_SHELL_ITEMS.length} regulators and{" "}
            {totalTrackedActions.toLocaleString()} enforcement actions
          </p>

          {/* Search Form */}
          <form onSubmit={handleSubmit}>
            <div
              style={{
                position: "relative",
                marginBottom: "1.5rem",
                width: "100%",
                maxWidth: "100%",
              }}
            >
              <Search
                style={{
                  position: "absolute",
                  left: "1.25rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9ca3af",
                  zIndex: 1,
                }}
                size={22}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search enforcement actions"
                placeholder='Try: "AML failures" or "Goldman Sachs enforcement"'
                style={{
                  width: "100%",
                  padding: "1.25rem 9rem 1.25rem 3.5rem",
                  fontSize: "1.05rem",
                  border: "none",
                  borderRadius: "12px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                  outline: "none",
                  transition: "box-shadow 0.3s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) =>
                  (e.target.style.boxShadow = "0 15px 35px rgba(0,0,0,0.2)")
                }
                onBlur={(e) =>
                  (e.target.style.boxShadow = "0 10px 25px rgba(0,0,0,0.15)")
                }
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                style={{
                  position: "absolute",
                  right: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: loading || !query.trim() ? "#9ca3af" : "#4f46e5",
                  color: "white",
                  padding: "0.875rem 1.75rem",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "0.95rem",
                  fontWeight: "600",
                  cursor: loading || !query.trim() ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) =>
                  !loading &&
                  query.trim() &&
                  (e.currentTarget.style.background = "#4338ca")
                }
                onMouseLeave={(e) =>
                  !loading &&
                  query.trim() &&
                  (e.currentTarget.style.background = "#4f46e5")
                }
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </form>

          {/* Suggested Queries */}
          <div>
            <p
              style={{
                fontSize: "0.875rem",
                color: "rgba(255,255,255,0.85)",
                marginBottom: "0.75rem",
              }}
            >
              Popular searches:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {suggestedQueries.slice(0, 4).map((suggested, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestedQuery(suggested)}
                  style={{
                    fontSize: "0.875rem",
                    padding: "0.5rem 1rem",
                    background: "rgba(255,255,255,0.2)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: "20px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                  }}
                >
                  {suggested}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              marginTop: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.9rem",
              color: "rgba(255,255,255,0.9)",
              background: "none",
              border: "none",
              cursor: "pointer",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "white")}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.9)")
            }
          >
            <Filter size={16} />
            {showFilters ? "Hide Filters" : "Show Filters"}
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div
          style={{
            background: "white",
            borderBottom: "1px solid #e5e7eb",
            padding: "2rem 1.5rem",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>
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
                  aria-label="Filter by regulator"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Regulators</option>
                  {PUBLIC_REGULATOR_SHELL_ITEMS.map((reg) => (
                    <option key={reg.code} value={reg.code}>
                      {reg.code} - {reg.fullName}
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
                  aria-label="Filter by country"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Countries</option>
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
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
                  aria-label="Filter by year"
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
                  aria-label={`Min Amount (${currency})`}
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
                  aria-label={`Max Amount (${currency})`}
                  placeholder="No limit"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrency("GBP")}
                    className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                      currency === "GBP"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    GBP (£)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency("EUR")}
                    className={`flex-1 py-2 rounded-md font-medium transition-colors ${
                      currency === "EUR"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    EUR (€)
                  </button>
                </div>
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
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
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "2.5rem 1.5rem",
        }}
      >
        {/* Error State */}
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: "1.25rem",
              borderRadius: "12px",
              marginBottom: "2rem",
            }}
          >
            <strong style={{ fontWeight: "600" }}>Error:</strong> {error}
          </div>
        )}

        {/* Results Header */}
        {pagination && !loading && (
          <div style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "0.5rem",
              }}
            >
              Found{" "}
              <span style={{ color: "#4f46e5" }}>
                {pagination.total.toLocaleString()}
              </span>{" "}
              results for "<span style={{ fontStyle: "italic" }}>{query}</span>"
            </h2>
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            {results.map((result) => (
              <div
                key={result.id}
                style={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  padding: "1.75rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 8px 20px rgba(0,0,0,0.12)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: "600",
                        color: "#111827",
                        marginBottom: "0.5rem",
                        lineHeight: "1.4",
                      }}
                    >
                      {result.firm}
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        fontSize: "0.875rem",
                        color: "#6b7280",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: "600",
                          color: "#4f46e5",
                          background: "#eef2ff",
                          padding: "0.25rem 0.75rem",
                          borderRadius: "6px",
                        }}
                      >
                        {result.regulator}
                      </span>
                      <span>•</span>
                      <span>{result.countryName}</span>
                      <span>•</span>
                      <span>
                        {new Date(result.dateIssued).toLocaleDateString(
                          "en-GB",
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Breach Type & Amount */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    marginBottom: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  {result.breachType && (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.375rem 0.875rem",
                        background: "#fef2f2",
                        color: "#991b1b",
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: "1px solid #fecaca",
                      }}
                    >
                      {result.breachType}
                    </span>
                  )}
                  {(currency === "EUR" ? result.amountEur : result.amountGbp) >
                    0 && (
                    <span
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: "700",
                        color: "#111827",
                      }}
                    >
                      {formatAmount(
                        currency === "EUR"
                          ? result.amountEur
                          : result.amountGbp,
                        currency,
                      )}
                    </span>
                  )}
                </div>

                {/* Snippet (highlighted excerpt) */}
                {result.snippet && (
                  <div
                    style={{
                      fontSize: "0.9375rem",
                      color: "#374151",
                      marginBottom: "1.25rem",
                      lineHeight: "1.7",
                      padding: "1rem",
                      background: "#f9fafb",
                      borderLeft: "3px solid #4f46e5",
                      borderRadius: "6px",
                    }}
                  >
                    {result.snippet}
                  </div>
                )}

                {/* Actions */}
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  {result.noticeUrl && (
                    <a
                      href={result.noticeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "0.875rem",
                        color: "#4f46e5",
                        fontWeight: "600",
                        textDecoration: "none",
                        transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "#4338ca")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "#4f46e5")
                      }
                    >
                      View Notice →
                    </a>
                  )}
                  {result.sourceUrl &&
                    result.sourceUrl !== result.noticeUrl && (
                      <a
                        href={result.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "0.875rem",
                          color: "#6b7280",
                          textDecoration: "none",
                          transition: "color 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "#111827")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "#6b7280")
                        }
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
          <div
            style={{
              marginTop: "3rem",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <button
              onClick={() => void performSearch(query, currentPage - 1)}
              disabled={currentPage === 1 || loading}
              style={{
                padding: "0.75rem 1.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                background: "white",
                color: currentPage === 1 || loading ? "#9ca3af" : "#374151",
                cursor:
                  currentPage === 1 || loading ? "not-allowed" : "pointer",
                fontWeight: "500",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) =>
                currentPage !== 1 &&
                !loading &&
                (e.currentTarget.style.background = "#f9fafb")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              ← Previous
            </button>

            <span
              style={{
                padding: "0.75rem 1.25rem",
                color: "#374151",
                fontWeight: "500",
              }}
            >
              Page{" "}
              <span style={{ color: "#4f46e5", fontWeight: "600" }}>
                {currentPage}
              </span>{" "}
              of {pagination.pages}
            </span>

            <button
              onClick={() => void performSearch(query, currentPage + 1)}
              disabled={!pagination.hasMore || loading}
              style={{
                padding: "0.75rem 1.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                background: "white",
                color: !pagination.hasMore || loading ? "#9ca3af" : "#374151",
                cursor:
                  !pagination.hasMore || loading ? "not-allowed" : "pointer",
                fontWeight: "500",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) =>
                pagination.hasMore &&
                !loading &&
                (e.currentTarget.style.background = "#f9fafb")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              Next →
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && query && !error && (
          <div style={{ textAlign: "center", padding: "4rem 1.5rem" }}>
            <Search
              size={56}
              style={{ margin: "0 auto 1.5rem", color: "#d1d5db" }}
            />
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "0.75rem",
              }}
            >
              No results found
            </h3>
            <p
              style={{
                fontSize: "1rem",
                color: "#6b7280",
                marginBottom: "1.5rem",
              }}
            >
              Try a broader firm name, regulator, or enforcement theme.
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "#4f46e5",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#4338ca")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#4f46e5")
                }
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Initial State (before first search) */}
        {!loading && !query && results.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
            <div
              style={{
                width: "80px",
                height: "80px",
                margin: "0 auto 2rem",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Search size={40} style={{ color: "white" }} />
            </div>
            <h3
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "#111827",
                marginBottom: "0.75rem",
              }}
            >
              Start searching enforcement actions
            </h3>
            <p
              style={{
                fontSize: "1.1rem",
                color: "#6b7280",
                marginBottom: "3rem",
                maxWidth: "600px",
                margin: "0 auto 3rem",
              }}
            >
              Search by firm name, regulator, or enforcement theme across{" "}
              {PUBLIC_REGULATOR_SHELL_ITEMS.length} regulators
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1rem",
                maxWidth: "800px",
                margin: "0 auto",
              }}
            >
              {suggestedQueries.map((suggested, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestedQuery(suggested)}
                  style={{
                    padding: "1.25rem",
                    background: "white",
                    border: "2px solid #e5e7eb",
                    borderRadius: "12px",
                    textAlign: "left",
                    fontSize: "0.9375rem",
                    color: "#374151",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#4f46e5";
                    e.currentTarget.style.background = "#f8f9ff";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                    e.currentTarget.style.background = "white";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <Search
                    size={18}
                    style={{ color: "#9ca3af", flexShrink: 0 }}
                  />
                  <span>{suggested}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
