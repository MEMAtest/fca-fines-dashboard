import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchFirms } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { FirmSummary } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Firms() {
  useSEO({
    title: 'Top FCA Fine Recipients | Firms and Individuals With the Largest Penalties (2013-2026)',
    description:
      'Browse the biggest FCA fine recipients across 2013-2026. Open an entity page to see totals, largest penalties, and full enforcement history.',
    keywords:
      'top FCA fines firms, biggest FCA fines recipients, FCA fines by firm, FCA fines by individual, largest FCA penalties',
    canonicalPath: '/firms',
    ogType: 'website',
  });

  const [firms, setFirms] = useState<FirmSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchFirms(250);
        if (!mounted) return;
        setFirms(res.data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Unable to load firms right now. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return firms;
    return firms.filter((f) => f.name.toLowerCase().includes(term));
  }, [firms, query]);

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>Top Firms and Individuals</h1>
          <p>
            A ranked list of the biggest FCA fine recipients across the dataset. Open an entity page for totals, largest penalties, and history.
          </p>
          <div className="hub-hero__actions">
            <Link to="/dashboard?year=0" className="btn btn-primary">
              Explore In Dashboard
            </Link>
            <Link to="/topics" className="btn btn-ghost">
              Back to Topics
            </Link>
          </div>
        </header>

        <div className="hub-card" style={{ marginBottom: '1rem' }}>
          <div className="hub-card__meta" style={{ justifyContent: 'space-between', width: '100%' }}>
            <span className="hub-chip hub-chip--neutral">{filtered.length} results</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search firms and individuals..."
              aria-label="Search firms"
              style={{
                width: 'min(420px, 100%)',
                padding: '0.6rem 0.75rem',
                borderRadius: '12px',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(255, 255, 255, 0.95)',
              }}
            />
          </div>
        </div>

        {loading ? (
          <p className="status">Loading firms...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : (
          <section className="hub-section">
            <table className="hub-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Actions</th>
                  <th>Total</th>
                  <th>Latest</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 250).map((firm) => (
                  <tr key={firm.slug}>
                    <td>
                      <Link className="hub-link" to={`/firms/${firm.slug}`}>
                        {firm.name}
                      </Link>
                    </td>
                    <td>{firm.fineCount}</td>
                    <td>{currency.format(firm.totalAmount)}</td>
                    <td>{formatDate(firm.latestDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}

