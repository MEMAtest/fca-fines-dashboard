import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, TrendingUp, Calendar, Building2 } from 'lucide-react';
import { getRegulatorCoverage, isValidRegulatorCode } from '../data/regulatorCoverage';
import { DataCoverageNotice } from '../components/DataCoverageNotice';
import { useUnifiedData } from '../hooks/useUnifiedData';
import '../styles/regulator-hub.css';

function formatCurrency(value: number, currency: 'GBP' | 'EUR'): string {
  const symbol = currency === 'GBP' ? '£' : '€';
  if (value >= 1_000_000_000) {
    return `${symbol}${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${symbol}${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${symbol}${(value / 1_000).toFixed(0)}K`;
  }
  return `${symbol}${value.toLocaleString()}`;
}

export function RegulatorHub() {
  const { regulatorCode } = useParams<{ regulatorCode: string }>();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState<'GBP' | 'EUR'>('GBP');

  // Validate regulator code
  const normalizedCode = regulatorCode?.toUpperCase();
  const isValid = normalizedCode && isValidRegulatorCode(normalizedCode);

  useEffect(() => {
    if (!isValid) {
      // Invalid regulator code - redirect to 404
      navigate('/404', { replace: true });
    }
  }, [isValid, navigate]);

  const coverage = normalizedCode ? getRegulatorCoverage(normalizedCode) : null;

  // Fetch data for this regulator
  const { fines, stats, loading, error } = useUnifiedData({
    regulator: normalizedCode || 'FCA',
    country: 'All',
    year: 0,
    currency,
  });

  if (!isValid || !coverage) {
    return null; // Will redirect in useEffect
  }

  // Calculate regulator-specific stats
  const totalFines = fines.length;
  const totalAmount = fines.reduce((sum, fine) => sum + (fine.amount || 0), 0);
  const largestFine = fines.length > 0 ? Math.max(...fines.map(f => f.amount || 0)) : 0;
  const averageFine = totalFines > 0 ? totalAmount / totalFines : 0;

  // Get top 10 fines
  const topFines = [...fines]
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 10);

  // Get breach category breakdown
  const breachCounts = fines.reduce((acc, fine) => {
    const category = fine.breach_category || 'Unknown';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topBreaches = Object.entries(breachCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Get year distribution
  const yearCounts = fines.reduce((acc, fine) => {
    const year = fine.year || new Date(fine.date_of_notice || '').getFullYear();
    if (year) {
      acc[year] = (acc[year] || 0) + 1;
    }
    return acc;
  }, {} as Record<number, number>);

  const yearData = Object.entries(yearCounts)
    .map(([year, count]) => ({ year: parseInt(year), count }))
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
            <h1 className="regulator-hub__title">
              {coverage.fullName}
            </h1>
            <p className="regulator-hub__subtitle">
              {coverage.country} • {coverage.code}
            </p>
          </div>

          <div className="regulator-hub__currency-toggle">
            <label htmlFor="currency-select">Currency</label>
            <select
              id="currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'GBP' | 'EUR')}
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
                <div className="regulator-hub__stat-label">Enforcement Actions</div>
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
              <h2 className="regulator-hub__section-title">Enforcement Timeline</h2>
              <div className="regulator-hub__timeline">
                {yearData.map(({ year, count }) => {
                  const maxCount = Math.max(...yearData.map(d => d.count));
                  const heightPercent = (count / maxCount) * 100;

                  return (
                    <div key={year} className="regulator-hub__timeline-bar">
                      <div
                        className="regulator-hub__timeline-bar-fill"
                        style={{ height: `${heightPercent}%` }}
                      />
                      <div className="regulator-hub__timeline-year">{year}</div>
                      <div className="regulator-hub__timeline-count">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Breaches */}
          {topBreaches.length > 0 && (
            <div className="regulator-hub__section">
              <h2 className="regulator-hub__section-title">Top Breach Categories</h2>
              <div className="regulator-hub__breach-grid">
                {topBreaches.map(([category, count]) => (
                  <div key={category} className="regulator-hub__breach-card">
                    <div className="regulator-hub__breach-category">{category}</div>
                    <div className="regulator-hub__breach-count">{count} fines</div>
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
                        <td className="regulator-hub__firm">{fine.firm_individual}</td>
                        <td className="regulator-hub__amount">
                          {formatCurrency(fine.amount || 0, currency)}
                        </td>
                        <td className="regulator-hub__date">
                          {new Date(fine.date_of_notice || '').toLocaleDateString('en-GB')}
                        </td>
                        <td className="regulator-hub__breach">{fine.breach_category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CTA to Dashboard */}
          <div className="regulator-hub__cta">
            <p>Explore more detailed analytics and cross-regulator comparisons</p>
            <Link to="/dashboard" className="regulator-hub__cta-button">
              Go to Full Dashboard
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
