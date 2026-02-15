import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchFirm } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { FirmDetails } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function FirmPage() {
  const { slug } = useParams<{ slug: string }>();
  const [firm, setFirm] = useState<FirmDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dashboardUrl = useMemo(() => {
    if (!firm) return '/dashboard?year=0';
    return `/dashboard?year=0&search=${encodeURIComponent(firm.name)}&scope=firm`;
  }, [firm]);

  useSEO({
    title: firm
      ? `${firm.name} FCA Fines | Total Penalties, Largest Fine and Enforcement History`
      : 'Firm FCA Fines | Enforcement History',
    description: firm
      ? `Explore FCA enforcement actions for ${firm.name}. View total penalties, number of actions, largest fine, and recent Final Notices.`
      : 'Explore FCA enforcement actions by firm or individual. View totals, largest penalties, and history.',
    keywords: firm
      ? `${firm.name} FCA fines, FCA fines ${firm.name}, FCA penalties ${firm.name}, FCA enforcement ${firm.name}`
      : 'FCA fines by firm, FCA fines by individual',
    canonicalPath: slug ? `/firms/${slug}` : '/firms',
    ogType: 'website',
  });

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchFirm(slug, 250);
        if (!mounted) return;
        setFirm(res.data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Unable to load this firm right now. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const breachSummary = useMemo(() => {
    if (!firm?.records?.length) return [];
    const map = new Map<string, { name: string; count: number; total: number }>();
    firm.records.forEach((r) => {
      const labels = r.breach_categories?.length ? r.breach_categories : ['Unclassified'];
      labels.forEach((label) => {
        const key = label || 'Unclassified';
        const existing = map.get(key) || { name: key, count: 0, total: 0 };
        existing.count += 1;
        existing.total += Number(r.amount) || 0;
        map.set(key, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [firm]);

  if (!slug) {
    return (
      <div className="hub-page">
        <div className="hub-container">
          <p className="status">Missing firm.</p>
          <Link to="/firms" className="btn btn-primary">
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>{firm?.name || 'Firm / Individual'}</h1>
          <p>
            {firm
              ? `Totals and enforcement history for ${firm.name} across 2013-2026.`
              : 'Loading enforcement history...'}
          </p>
          <div className="hub-hero__actions">
            <Link to={dashboardUrl} className="btn btn-primary">
              View In Dashboard
            </Link>
            <Link to="/firms" className="btn btn-ghost">
              All Firms
            </Link>
          </div>
        </header>

        {loading ? (
          <p className="status">Loading firm...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : !firm ? (
          <p className="status">Firm not found.</p>
        ) : (
          <>
            <div className="hub-card" style={{ marginBottom: '1rem' }}>
              <div className="hub-card__meta">
                <span className="hub-chip">{firm.fineCount} actions</span>
                <span className="hub-chip hub-chip--neutral">{currency.format(firm.totalAmount)}</span>
                <span className="hub-chip hub-chip--neutral">Largest: {currency.format(firm.maxFine)}</span>
                <span className="hub-chip hub-chip--neutral">First: {formatDate(firm.earliestDate)}</span>
                <span className="hub-chip hub-chip--neutral">Latest: {formatDate(firm.latestDate)}</span>
              </div>
              <h3>At A Glance</h3>
              <p>Open this entity in the dashboard to compare with peers, filter by year, and export records.</p>
            </div>

            {breachSummary.length > 0 && (
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
                    {breachSummary.map((b) => (
                      <tr key={b.name}>
                        <td>
                          <Link
                            className="hub-link"
                            to={`/dashboard?year=0&search=${encodeURIComponent(firm.name)}&scope=firm&breaches=${encodeURIComponent(b.name)}`}
                          >
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
            )}

            <section className="hub-section">
              <h2>Recent Enforcement Actions</h2>
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Regulator</th>
                    <th>Breach categories</th>
                    <th>Notice</th>
                  </tr>
                </thead>
                <tbody>
                  {firm.records.slice(0, 25).map((r) => (
                    <tr key={`${r.fine_reference || ''}-${r.date_issued}-${r.amount}`}>
                      <td>{formatDate(r.date_issued)}</td>
                      <td>{currency.format(r.amount)}</td>
                      <td>{r.regulator}</td>
                      <td>{(r.breach_categories?.length ? r.breach_categories : ['Unclassified']).join(', ')}</td>
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

