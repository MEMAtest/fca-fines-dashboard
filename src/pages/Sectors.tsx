import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSectors } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { SectorSummary } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export function Sectors() {
  useSEO({
    title: 'FCA Fines by Sector | Banks, Insurance, Individuals and More',
    description:
      'Browse FCA fines by firm category (sector). View which sectors receive the most penalties and jump into filtered dashboard views.',
    keywords: 'FCA fines by sector, FCA fines banks, FCA fines insurance, FCA fines individuals',
    canonicalPath: '/sectors',
    ogType: 'website',
  });

  const [sectors, setSectors] = useState<SectorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetchSectors();
        if (!mounted) return;
        setSectors(res.data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Unable to load sectors. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const top = useMemo(() => sectors.slice(0, 12), [sectors]);

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>FCA Fines by Sector</h1>
          <p>Explore enforcement actions grouped by firm category and see which sectors attract the largest penalties.</p>
          <div className="hub-hero__actions">
            <Link to="/dashboard?year=0" className="btn btn-primary">Explore All Fines</Link>
            <Link to="/topics" className="btn btn-ghost">Back to Topics</Link>
          </div>
        </header>

        {loading ? (
          <p className="status">Loading sectors...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : (
          <div className="hub-grid">
            {top.map((s) => (
              <Link key={s.slug} to={`/sectors/${s.slug}`} className="hub-card hover-lift">
                <div className="hub-card__meta">
                  <span className="hub-chip">{s.fineCount} actions</span>
                  <span className="hub-chip hub-chip--neutral">{currency.format(s.totalAmount)}</span>
                </div>
                <h3>{s.name}</h3>
                <p>Open the {s.name} sector view with largest penalties and trends.</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

