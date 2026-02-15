import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchFines, fetchSectors } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { FineRecord, SectorSummary } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

function sumAmount(records: FineRecord[]) {
  return records.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
}

export function SectorHub() {
  const { slug } = useParams<{ slug: string }>();
  const [sector, setSector] = useState<SectorSummary | null>(null);
  const [records, setRecords] = useState<FineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      try {
        const [sectorsRes, finesRes] = await Promise.all([fetchSectors(), fetchFines(0)]);
        if (!mounted) return;
        const found = sectorsRes.data.find((s) => s.slug === slug) || null;
        setSector(found);
        setRecords(finesRes.data);
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

  const scoped = useMemo(() => {
    if (!sector) return [];
    return records.filter((r) => (r.firm_category || '') === sector.name);
  }, [records, sector]);

  const totals = useMemo(() => ({ count: scoped.length, amount: sumAmount(scoped) }), [scoped]);
  const topPenalties = useMemo(() => [...scoped].sort((a, b) => b.amount - a.amount).slice(0, 10), [scoped]);

  const topBreaches = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number }>();
    scoped.forEach((r) => {
      const categories = r.breach_categories?.length ? r.breach_categories : ['Unclassified'];
      categories.forEach((c) => {
        const key = c || 'Unclassified';
        const existing = map.get(key) || { name: key, count: 0, total: 0 };
        existing.count += 1;
        existing.total += Number(r.amount) || 0;
        map.set(key, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [scoped]);

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
                    <tr key={b.name}>
                      <td>
                        <Link className="hub-link" to={`/dashboard?year=0&firms=${encodeURIComponent(sector.name)}&breaches=${encodeURIComponent(b.name)}`}>
                          {b.name}
                        </Link>
                      </td>
                      <td>{b.count}</td>
                      <td>{currency.format(b.total)}</td>
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
                        <a className="hub-link" href={r.final_notice_url} target="_blank" rel="noreferrer">
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

