import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchFines, fetchYears } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { FineRecord, YearSummary } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

function sumAmount(records: FineRecord[]) {
  return records.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
}

export function YearHub() {
  const { year: yearParam } = useParams<{ year: string }>();
  const year = Number(yearParam);

  const [summary, setSummary] = useState<YearSummary | null>(null);
  const [records, setRecords] = useState<FineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useSEO({
    title: Number.isFinite(year)
      ? `FCA Fines ${year} | Complete List, Largest Penalties and Trends`
      : 'FCA Fines by Year',
    description: Number.isFinite(year)
      ? `Explore FCA fines issued in ${year}. View totals, the largest penalties, and jump into the dashboard with ${year} selected.`
      : 'Explore FCA fines by year.',
    keywords: Number.isFinite(year) ? `FCA fines ${year}, FCA enforcement ${year}, FCA penalties ${year}` : 'FCA fines by year',
    canonicalPath: Number.isFinite(year) ? `/years/${year}` : '/years',
    ogType: 'website',
  });

  useEffect(() => {
    if (!Number.isFinite(year)) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [yearsRes, finesRes] = await Promise.all([fetchYears(), fetchFines(year)]);
        if (!mounted) return;
        setSummary(yearsRes.data.find((y) => y.year === year) || null);
        setRecords(finesRes.data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Unable to load this year. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [year]);

  const totals = useMemo(() => ({ count: records.length, amount: sumAmount(records) }), [records]);
  const topPenalties = useMemo(() => [...records].sort((a, b) => b.amount - a.amount).slice(0, 10), [records]);
  const topFirms = useMemo(() => {
    const map = new Map<string, { firm: string; total: number; count: number }>();
    records.forEach((r) => {
      const key = r.firm_individual;
      const existing = map.get(key) || { firm: key, total: 0, count: 0 };
      existing.total += Number(r.amount) || 0;
      existing.count += 1;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [records]);

  const annualReviewSlug = useMemo(() => {
    if (!Number.isFinite(year)) return null;
    if (year >= 2013 && year <= 2025) return `/blog/fca-fines-${year}-annual-review`;
    return null;
  }, [year]);

  if (!Number.isFinite(year)) {
    return (
      <div className="hub-page">
        <div className="hub-container">
          <p className="status">Invalid year.</p>
          <Link to="/years" className="btn btn-primary">Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>FCA Fines {year}</h1>
          <p>Totals and highlights for enforcement actions issued in {year}. Use the dashboard for deep filtering and exports.</p>
          <div className="hub-hero__actions">
            <Link to={`/dashboard?year=${encodeURIComponent(String(year))}`} className="btn btn-primary">
              View {year} in Dashboard
            </Link>
            <Link to="/years" className="btn btn-ghost">All Years</Link>
            {annualReviewSlug && (
              <Link to={annualReviewSlug} className="btn btn-ghost">Read Annual Review</Link>
            )}
          </div>
        </header>

        {loading ? (
          <p className="status">Loading year...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : (
          <>
            <div className="hub-card" style={{ marginBottom: '1rem' }}>
              <div className="hub-card__meta">
                <span className="hub-chip">{summary?.fineCount ?? totals.count} actions</span>
                <span className="hub-chip hub-chip--neutral">{currency.format(summary?.totalAmount ?? totals.amount)}</span>
              </div>
              <h3>At A Glance</h3>
              <p>Largest penalties and top entities for {year}. Click into the dashboard to compare with other years.</p>
            </div>

            <section className="hub-section">
              <h2>Top Firms and Individuals</h2>
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Actions</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topFirms.map((row) => (
                    <tr key={row.firm}>
                      <td>
                        <Link
                          className="hub-link"
                          to={`/dashboard?year=${encodeURIComponent(String(year))}&search=${encodeURIComponent(row.firm)}&scope=firm`}
                        >
                          {row.firm}
                        </Link>
                      </td>
                      <td>{row.count}</td>
                      <td>{currency.format(row.total)}</td>
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
