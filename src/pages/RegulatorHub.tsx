import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  TrendingUp,
  Calendar,
  Building2,
  ExternalLink,
} from "lucide-react";
import {
  getRegulatorCoverage,
  isValidRegulatorCode,
} from "../data/regulatorCoverage.js";
import { DataCoverageNotice } from "../components/DataCoverageNotice.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import { useSEO, injectStructuredData } from "../hooks/useSEO.js";
import "../styles/regulator-hub.css";
import "../styles/regulator-hub-sources.css";

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number, currency: "GBP" | "EUR"): string {
  const numeric = toNumber(value);
  const symbol = currency === "GBP" ? "£" : "€";
  if (numeric >= 1_000_000_000) {
    return `${symbol}${(numeric / 1_000_000_000).toFixed(2)}B`;
  }
  if (numeric >= 1_000_000) {
    return `${symbol}${(numeric / 1_000_000).toFixed(2)}M`;
  }
  if (numeric >= 1_000) {
    return `${symbol}${(numeric / 1_000).toFixed(0)}K`;
  }
  return `${symbol}${numeric.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

export function RegulatorHub() {
  const { regulatorCode } = useParams<{ regulatorCode: string }>();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState<"GBP" | "EUR">("GBP");

  // Validate regulator code
  const normalizedCode = regulatorCode?.toUpperCase();
  const isValid = normalizedCode && isValidRegulatorCode(normalizedCode);

  useEffect(() => {
    if (!isValid) {
      // Invalid regulator code - redirect to 404
      navigate("/404", { replace: true });
    }
  }, [isValid, navigate]);

  const coverage = normalizedCode ? getRegulatorCoverage(normalizedCode) : null;

  useEffect(() => {
    if (coverage) {
      setCurrency(coverage.defaultCurrency);
    }
  }, [coverage?.code, coverage?.defaultCurrency]);

  // Fetch data for this regulator
  const { fines, loading, error } = useUnifiedData({
    regulator: normalizedCode || "FCA",
    country: "All",
    year: 0,
    currency,
  });

  if (!isValid || !coverage) {
    return null; // Will redirect in useEffect
  }

  // SEO metadata
  const metaTitle = `${coverage.code} Fines Database | ${coverage.fullName} Enforcement Actions`;
  const metaDescription = `Track all ${coverage.fullName} (${coverage.code}) fines and enforcement actions. ${coverage.count} penalties from ${coverage.years}. Complete database with stats, trends, and analysis.`;
  const canonicalPath = `/regulators/${coverage.code.toLowerCase()}`;
  const keywords = `${coverage.code} fines, ${coverage.fullName}, regulatory enforcement, financial penalties, ${coverage.country}, compliance data, ${coverage.code} enforcement`;

  useSEO({
    title: metaTitle,
    description: metaDescription,
    keywords,
    canonicalPath,
    ogTitle: metaTitle,
    ogDescription: metaDescription,
    ogType: "website",
    ogImage: `https://fcafines.memaconsultants.com/og/${coverage.code.toLowerCase()}-hub.png`,
  });

  // Inject JSON-LD structured data
  useEffect(() => {
    const cleanupDataset = injectStructuredData({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${coverage.code} Fines Database`,
      description: `${coverage.fullName} enforcement actions and financial penalties from ${coverage.years}`,
      url: `https://fcafines.memaconsultants.com${canonicalPath}`,
      keywords: [
        `${coverage.code} fines`,
        coverage.fullName,
        "regulatory enforcement",
        "financial penalties",
        coverage.country,
        "compliance database",
      ],
      temporalCoverage: coverage.years,
      spatialCoverage: {
        "@type": "Place",
        name: coverage.country,
      },
      creator: {
        "@type": "Organization",
        name: "MEMA Consultants",
        url: "https://memaconsultants.com",
      },
      variableMeasured: [
        {
          "@type": "PropertyValue",
          name: "Fine Amount",
          unitText: coverage.defaultCurrency,
        },
        { "@type": "PropertyValue", name: "Enforcement Date" },
        { "@type": "PropertyValue", name: "Breach Category" },
        { "@type": "PropertyValue", name: "Firm/Individual Name" },
      ],
      distribution: {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `https://fcafines.memaconsultants.com/api/unified/search?regulator=${coverage.code}`,
      },
    });

    return cleanupDataset;
  }, [coverage, canonicalPath]);

  // Calculate regulator-specific stats
  const amounts = fines
    .map((fine) => toNumber(fine.amount))
    .filter((amount) => amount > 0);
  const totalFines = fines.length;
  const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0);
  const largestFine = amounts.length > 0 ? Math.max(...amounts) : 0;
  const averageFine = amounts.length > 0 ? totalAmount / amounts.length : 0;

  // Get top 10 fines
  const topFines = [...fines]
    .sort((a, b) => toNumber(b.amount) - toNumber(a.amount))
    .slice(0, 10);

  // Get breach category breakdown
  const breachCounts = fines.reduce(
    (acc, fine) => {
      const category = fine.breach_type || "Unknown";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const topBreaches = Object.entries(breachCounts)
    .map(([category, count]) => [category, count] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Get year distribution
  const yearCounts = fines.reduce(
    (acc, fine) => {
      const year = fine.year_issued;
      if (year && !isNaN(year)) {
        acc[year] = (acc[year] || 0) + 1;
      }
      return acc;
    },
    {} as Record<number, number>,
  );

  const yearData = Object.entries(yearCounts)
    .map(([year, count]) => ({
      year: parseInt(year, 10),
      count: Number(count),
    }))
    .sort((a, b) => a.year - b.year);

  return (
    <div className="regulator-hub">
      {/* Header */}
      <div className="regulator-hub__header">
        <Link to="/dashboard" className="regulator-hub__back">
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>

        <div className="regulator-hub__title-row">
          <div>
            <div className="regulator-hub__flag">{coverage.flag}</div>
            <h1 className="regulator-hub__title">{coverage.fullName}</h1>
            <p className="regulator-hub__subtitle">
              {coverage.country} • {coverage.code}
            </p>
          </div>

          <div className="regulator-hub__currency-toggle">
            <label htmlFor="currency-select">Currency</label>
            <select
              id="currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "GBP" | "EUR")}
              className="regulator-hub__currency-select"
            >
              <option value="GBP">£ GBP</option>
              <option value="EUR">€ EUR</option>
            </select>
          </div>
        </div>
      </div>

      {/* Data Coverage Notice */}
      <DataCoverageNotice coverage={coverage} />

      {/* Official sources */}
      {coverage.officialSources.length > 0 && (
        <section
          className="regulator-hub-sources"
          aria-labelledby="official-sources-title"
        >
          <div className="regulator-hub-sources__header">
            <p className="regulator-hub-sources__eyebrow">Official sources</p>
            <h2
              id="official-sources-title"
              className="regulator-hub-sources__title"
            >
              Go to {coverage.code}&apos;s own enforcement pages
            </h2>
            <p className="regulator-hub-sources__intro">
              Use these curated regulator-level sources when you want to verify
              published sanctions, decisions, or official register entries
              directly at the source.
            </p>
          </div>

          <div className="regulator-hub-sources__grid">
            {coverage.officialSources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="regulator-hub-sources__card"
              >
                <div className="regulator-hub-sources__card-copy">
                  <span className="regulator-hub-sources__card-label">
                    {source.label}
                  </span>
                  <span className="regulator-hub-sources__card-description">
                    {source.description}
                  </span>
                </div>
                <ExternalLink
                  size={18}
                  className="regulator-hub-sources__card-icon"
                />
              </a>
            ))}
          </div>

          <p className="regulator-hub-sources__footnote">
            These are curated regulator-level entry points. Case-level source
            links may vary while non-FCA source coverage continues to be
            deepened.
          </p>
        </section>
      )}

      {/* Loading/Error States */}
      {loading && (
        <div className="regulator-hub__loading">
          <p>Loading {coverage.name} enforcement data...</p>
        </div>
      )}

      {error && (
        <div className="regulator-hub__error">
          <p>Error loading data: {error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Stats Grid */}
          <div className="regulator-hub__stats-grid">
            <div className="regulator-hub__stat-card">
              <div className="regulator-hub__stat-icon">
                <TrendingUp size={20} />
              </div>
              <div className="regulator-hub__stat-content">
                <div className="regulator-hub__stat-value">
                  {formatCurrency(totalAmount, currency)}
                </div>
                <div className="regulator-hub__stat-label">Total Fines</div>
              </div>
            </div>

            <div className="regulator-hub__stat-card">
              <div className="regulator-hub__stat-icon">
                <Calendar size={20} />
              </div>
              <div className="regulator-hub__stat-content">
                <div className="regulator-hub__stat-value">{totalFines}</div>
                <div className="regulator-hub__stat-label">
                  Enforcement Actions
                </div>
              </div>
            </div>

            <div className="regulator-hub__stat-card">
              <div className="regulator-hub__stat-icon">
                <Building2 size={20} />
              </div>
              <div className="regulator-hub__stat-content">
                <div className="regulator-hub__stat-value">
                  {formatCurrency(largestFine, currency)}
                </div>
                <div className="regulator-hub__stat-label">Largest Fine</div>
              </div>
            </div>

            <div className="regulator-hub__stat-card">
              <div className="regulator-hub__stat-icon">
                <TrendingUp size={20} />
              </div>
              <div className="regulator-hub__stat-content">
                <div className="regulator-hub__stat-value">
                  {formatCurrency(averageFine, currency)}
                </div>
                <div className="regulator-hub__stat-label">Average Fine</div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          {yearData.length > 0 && (
            <div className="regulator-hub__section">
              <h2 className="regulator-hub__section-title">
                Enforcement Timeline
              </h2>
              <div className="regulator-hub__timeline">
                {yearData.map(({ year, count }) => {
                  const maxCount = Math.max(...yearData.map((d) => d.count));
                  const heightPercent = (count / maxCount) * 100;

                  return (
                    <div key={year} className="regulator-hub__timeline-bar">
                      <div
                        className="regulator-hub__timeline-bar-fill"
                        style={{ height: `${heightPercent}%` }}
                      />
                      <div className="regulator-hub__timeline-year">{year}</div>
                      <div className="regulator-hub__timeline-count">
                        {count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Breaches */}
          {topBreaches.length > 0 && (
            <div className="regulator-hub__section">
              <h2 className="regulator-hub__section-title">
                Top Breach Categories
              </h2>
              <div className="regulator-hub__breach-grid">
                {topBreaches.map(([category, count]) => (
                  <div key={category} className="regulator-hub__breach-card">
                    <div className="regulator-hub__breach-category">
                      {category}
                    </div>
                    <div className="regulator-hub__breach-count">
                      {count} fines
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top 10 Fines */}
          {topFines.length > 0 && (
            <div className="regulator-hub__section">
              <h2 className="regulator-hub__section-title">Largest Fines</h2>
              <div className="regulator-hub__fines-table">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Firm</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Breach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topFines.map((fine, index) => (
                      <tr key={fine.id || index}>
                        <td className="regulator-hub__rank">#{index + 1}</td>
                        <td className="regulator-hub__firm">
                          {fine.firm_individual}
                        </td>
                        <td className="regulator-hub__amount">
                          {formatCurrency(fine.amount || 0, currency)}
                        </td>
                        <td className="regulator-hub__date">
                          {new Date(fine.date_issued).toLocaleDateString(
                            "en-GB",
                          )}
                        </td>
                        <td className="regulator-hub__breach">
                          {fine.breach_type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CTA to Dashboard */}
          <div className="regulator-hub__cta">
            <p>Open a dedicated analytics workspace for {coverage.fullName}</p>
            <Link
              to={`/regulators/${coverage.code.toLowerCase()}/dashboard`}
              className="regulator-hub__cta-button"
            >
              Open {coverage.code} Dashboard
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
