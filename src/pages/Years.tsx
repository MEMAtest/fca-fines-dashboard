import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchYears } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { YearSummary } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export function Years() {
  useSEO({
    title: 'FCA Fines by Year | 2013-2026 Annual Summaries',
    description:
      'Browse FCA fines by year. Compare enforcement totals and jump into the dashboard for each year’s full list of actions.',
    keywords: 'FCA fines by year, FCA fines 2026, FCA fines 2025, FCA enforcement by year',
    canonicalPath: '/years',
    ogType: 'website',
  });

  const [years, setYears] = useState<YearSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetchYears();
        if (!mounted) return;
        setYears(res.data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Unable to load yearly summaries. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const top = useMemo(() => years.slice(0, 18), [years]);

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>FCA Fines by Year</h1>
          <p>Annual summaries across the full enforcement dataset. Use the dashboard for the complete record and exports.</p>
          <div className="hub-hero__actions">
            <Link to="/dashboard?year=0" className="btn btn-primary">Explore All Years</Link>
            <Link to="/topics" className="btn btn-ghost">Back to Topics</Link>
          </div>
        </header>

        {loading ? (
          <p className="status">Loading years...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : (
          <div className="hub-grid">
            {top.map((y) => (
              <Link key={y.year} to={`/years/${y.year}`} className="hub-card hover-lift">
                <div className="hub-card__meta">
                  <span className="hub-chip">{y.fineCount} actions</span>
                  <span className="hub-chip hub-chip--neutral">{currency.format(y.totalAmount)}</span>
                </div>
                <h3>{y.year}</h3>
                <p>Open the full {y.year} list, largest penalties, and year-level patterns.</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

