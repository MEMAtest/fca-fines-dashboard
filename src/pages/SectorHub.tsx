import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchSector } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { SectorDetails } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export function SectorHub() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<SectorDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sector = data?.sector ?? null;

  useSEO({
    title: sector ? `FCA Fines for ${sector.name} | Largest Penalties and Trends (2013-2026)` : 'FCA Fines by Sector',
    description: sector
      ? `Explore FCA enforcement actions for ${sector.name}. See totals, top breach categories, and the largest penalties.`
      : 'Explore FCA fines by sector.',
    keywords: sector ? `FCA fines ${sector.name}, FCA penalties ${sector.name}` : 'FCA fines by sector',
    canonicalPath: slug ? `/sectors/${slug}` : '/sectors',
    ogType: 'website',
  });

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await fetchSector(slug, 10, 10);
        if (!mounted) return;
        setData(res.data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Unable to load this sector. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const totals = {
    count: sector?.fineCount ?? 0,
    amount: sector?.totalAmount ?? 0,
  };
  const topPenalties = data?.topPenalties ?? [];
  const topBreaches = data?.topBreaches ?? [];

  if (!slug) {
    return (
      <div className="hub-page">
        <div className="hub-container">
          <p className="status">Missing sector.</p>
          <Link to="/sectors" className="btn btn-primary">Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>{sector ? sector.name : 'Sector'}</h1>
          <p>{sector ? `FCA enforcement actions for ${sector.name} across 2013-2026.` : 'Loading sector...'}</p>
          <div className="hub-hero__actions">
            {sector && (
              <Link
                to={`/dashboard?year=0&firms=${encodeURIComponent(sector.name)}`}
                className="btn btn-primary"
              >
                View in Dashboard
              </Link>
            )}
            <Link to="/sectors" className="btn btn-ghost">All Sectors</Link>
          </div>
        </header>

        {loading ? (
          <p className="status">Loading sector...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : !sector ? (
          <p className="status">Sector not found.</p>
        ) : (
          <>
            <div className="hub-card" style={{ marginBottom: '1rem' }}>
              <div className="hub-card__meta">
                <span className="hub-chip">{totals.count} actions</span>
                <span className="hub-chip hub-chip--neutral">{currency.format(totals.amount)}</span>
              </div>
              <h3>At A Glance</h3>
              <p>Use dashboard filters to drill into years, breach categories, and the largest penalties within {sector.name}.</p>
            </div>

            <section className="hub-section">
              <h2>Top Breach Categories</h2>
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>Breach</th>
                    <th>Actions</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topBreaches.map((b) => (
                    <tr key={b.slug}>
                      <td>
                        <Link className="hub-link" to={`/dashboard?year=0&firms=${encodeURIComponent(sector.name)}&breaches=${encodeURIComponent(b.name)}`}>
                          {b.name}
                        </Link>
                      </td>
                      <td>{b.fineCount}</td>
                      <td>{currency.format(b.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="hub-section">
              <h2>Largest Penalties</h2>
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Notice</th>
                  </tr>
                </thead>
                <tbody>
                  {topPenalties.map((r) => (
                    <tr key={`${r.firm_individual}-${r.date_issued}-${r.amount}`}>
                      <td>{r.firm_individual}</td>
                      <td>{new Date(r.date_issued).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td>{currency.format(r.amount)}</td>
                      <td>
                        <a className="hub-link" href={r.final_notice_url} target="_blank" rel="noreferrer noopener">
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
