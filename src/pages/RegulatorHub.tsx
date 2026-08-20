import { useParams, Link, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  getRegulatorCoverage,
  hasPublicRegulatorHub,
} from "../data/regulatorCoverage.js";
import { DataCoverageNotice } from "../components/DataCoverageNotice.js";
import RegulatorMark from "../components/RegulatorMark.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import { useSEO, injectStructuredData } from "../hooks/useSEO.js";
import "../styles/hubs.css";

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

function automationLevelLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase());
}

export function RegulatorHub() {
  const { regulatorCode } = useParams<{ regulatorCode: string }>();
  const [currency, setCurrency] = useState<"GBP" | "EUR">("GBP");

  // Validate regulator code
  const normalizedCode = regulatorCode?.toUpperCase();
  const isValid = normalizedCode && hasPublicRegulatorHub(normalizedCode);

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
    return <Navigate to="/404" replace />;
  }

  // SEO metadata
  const metaTitle = coverage.seoTitle ?? `${coverage.code} Fines Database | ${coverage.fullName} Enforcement Actions`;
  const metaDescription = coverage.seoDescription ?? `Track ${coverage.fullName} (${coverage.code}) fines and enforcement actions from ${coverage.years}. Current totals are loaded from the live evidence view. Complete database with stats, trends, and analysis.`;
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
    ogImage: `https://regactions.com/og/${coverage.code.toLowerCase()}-hub.png`,
  });

  // Inject JSON-LD structured data
  useEffect(() => {
    const cleanupDataset = injectStructuredData({
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${coverage.code} Fines Database`,
      description: `${coverage.fullName} enforcement actions and financial penalties from ${coverage.years}`,
      url: `https://regactions.com${canonicalPath}`,
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
        name: "RegActions",
        url: "https://regactions.com",
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
        contentUrl: `https://regactions.com/api/unified/search?regulator=${coverage.code}`,
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
  const maxYearCount = Math.max(1, ...yearData.map((entry) => entry.count));

  const heroStats = [
    { label: "Total fines", value: formatCurrency(totalAmount, currency), note: `${coverage.years}` },
    { label: "Actions on record", value: totalFines.toLocaleString("en-GB"), note: "Matching current filters" },
    { label: "Largest fine", value: formatCurrency(largestFine, currency), note: "Single action" },
    { label: "Average fine", value: formatCurrency(averageFine, currency), note: "Across disclosed actions" },
  ];

  const healthCards = [
    { label: "Coverage confidence", value: coverage.operationalConfidence === "standard" ? "Standard" : "Directional", note: automationLevelLabel(coverage.automationLevel) },
    { label: "Collection lane", value: coverage.feedContract.cadence === "daily" ? "Daily lane" : "Fragile lane", note: coverage.feedContract.collectionMethod },
    { label: "Coverage status", value: coverage.coverageStatus.replace(/^./, (char) => char.toUpperCase()), note: `${coverage.years} on record` },
    { label: "Stale-after window", value: `${coverage.feedContract.staleAfterDays}d`, note: "Before an operator check is triggered" },
  ];

  return (
    <div className="reg-hub-page">
      <div className="reg-hub-shell">
        <Link to="/regulators" className="reg-hub-back">
          <ArrowLeft size={16} />
          Back to regulator directory
        </Link>

        <section className="reg-hub-hero">
          <div className="reg-hub-hero__copy">
            <div className="reg-hub-hero__identity">
              <RegulatorMark
                regulator={coverage.code}
                label={coverage.fullName}
                country={coverage.country}
                size="large"
                surface="dark"
                decorative
              />
              <span>{coverage.country} · {coverage.sourceType === "sro" ? "Self-regulatory organisation" : "Conduct regulator"}</span>
            </div>
            <h1>{coverage.fullName}</h1>
            <p>
              {coverage.note ?? `${coverage.fullName} enforcement activity in ${coverage.country}, with every action linked to an official source where available.`}
            </p>
            <div className="reg-hub-hero__lane">
              {coverage.feedContract.cadence === "daily" ? "Daily lane" : "Fragile lane"}
              <span />
              {coverage.operationalConfidence === "standard" ? "Standard confidence" : "Directional confidence"}
            </div>
            <div className="reg-hub-hero__currency">
              <label htmlFor="currency-select">Currency</label>
              <select
                id="currency-select"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as "GBP" | "EUR")}
              >
                <option value="GBP">£ GBP</option>
                <option value="EUR">€ EUR</option>
              </select>
            </div>
          </div>
          <div className="reg-hub-hero__stats">
            {heroStats.map((stat) => (
              <div key={stat.label}>
                <span>{stat.label}</span>
                <strong>{loading ? "…" : stat.value}</strong>
                <em>{stat.note}</em>
              </div>
            ))}
          </div>
        </section>

        <DataCoverageNotice
          coverage={coverage}
          recordCount={!loading && !error ? totalFines : undefined}
        />

        <div className="reg-hub-section-head">
          <span>01</span>
          <h2>Explore the full dataset</h2>
          <i />
        </div>
        <div className="reg-hub-cta">
          <div>
            <strong>Explore the full {coverage.code} dataset</strong>
            <p>Filter actions, compare themes and inspect the source evidence in a dedicated analytics workspace.</p>
          </div>
          <Link to={`/regulators/${coverage.code.toLowerCase()}/dashboard`} className="reg-hub-cta__button">
            Open {coverage.code} Dashboard
          </Link>
        </div>

        {loading && <div className="reg-hub-loading">Loading {coverage.name} enforcement data...</div>}
        {error && <div className="reg-hub-error">Error loading data: {error}</div>}

        {coverage.officialSources.length > 0 && (
          <>
            <div className="reg-hub-section-head">
              <span>02</span>
              <h2>Official sources</h2>
              <i />
            </div>
            <section className="reg-hub-sources" aria-labelledby="official-sources-title">
              <p className="reg-hub-sources__eyebrow">Verified entry points</p>
              <h2 id="official-sources-title">
                Verify against {coverage.code}&apos;s own publications
              </h2>
              <p className="reg-hub-sources__intro">
                Open the regulator&apos;s own publication pages to check sanctions, decisions and official records at source.
              </p>
              <div className="reg-hub-sources__grid">
                {coverage.officialSources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="reg-hub-sources__card">
                    <div>
                      <span>{source.label}</span>
                      <small>{source.description}</small>
                    </div>
                    <ExternalLink size={18} />
                  </a>
                ))}
              </div>
              <p className="reg-hub-sources__footnote">
                These links lead to regulator-level entry points. Individual action records provide case-specific source links where available.
              </p>
            </section>
          </>
        )}

        {!loading && !error && (
          <>
            {yearData.length > 0 && (
              <>
                <div className="reg-hub-section-head">
                  <span>03</span>
                  <h2>Enforcement timeline</h2>
                  <i />
                </div>
                <div className="reg-hub-card">
                  <div className="reg-hub-timeline">
                    {yearData.map(({ year, count }) => (
                      <div key={year} className="reg-hub-timeline__bar">
                        <div style={{ height: `${Math.max(6, (count / maxYearCount) * 100)}%` }} />
                        <span>{year}</span>
                        <em>{count}</em>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {topBreaches.length > 0 && (
              <>
                <div className="reg-hub-section-head">
                  <span>04</span>
                  <h2>Top breach categories</h2>
                  <i />
                </div>
                <div className="reg-hub-breach-grid">
                  {topBreaches.map(([category, count]) => (
                    <div key={category} className="reg-hub-card">
                      <strong>{category}</strong>
                      <span>{count} {count === 1 ? "fine" : "fines"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {topFines.length > 0 && (
              <>
                <div className="reg-hub-section-head">
                  <span>05</span>
                  <h2>Largest fines</h2>
                  <i />
                </div>
                <div className="reg-hub-card reg-hub-card--table">
                  <div className="reg-hub-table-scroll">
                    <table>
                      <thead>
                        <tr><th>Rank</th><th>Firm</th><th>Amount</th><th>Date</th><th>Breach</th></tr>
                      </thead>
                      <tbody>
                        {topFines.map((fine, index) => (
                          <tr key={fine.id || index}>
                            <td>#{index + 1}</td>
                            <td>{fine.firm_individual}</td>
                            <td>{formatCurrency(fine.amount || 0, currency)}</td>
                            <td>{new Date(fine.date_issued).toLocaleDateString("en-GB")}</td>
                            <td>{fine.breach_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            <div className="reg-hub-section-head">
              <span>06</span>
              <h2>Source health</h2>
              <i />
            </div>
            <div className="reg-hub-health-grid">
              {healthCards.map((card) => (
                <div key={card.label} className="reg-hub-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.note}</small>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
