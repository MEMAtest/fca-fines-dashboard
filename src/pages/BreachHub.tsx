import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchCategories, fetchFines } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { CategorySummary, FineRecord } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

function humanize(label: string) {
  const withSpaces = label.replace(/_/g, ' ').toLowerCase();
  return withSpaces.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function sumAmount(records: FineRecord[]) {
  return records.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
}

export function BreachHub() {
  const { slug } = useParams<{ slug: string }>();
  const [category, setCategory] = useState<CategorySummary | null>(null);
  const [records, setRecords] = useState<FineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useSEO({
    title: category
      ? `${humanize(category.name)} FCA Fines | Cases, Totals and Largest Penalties (2013-2026)`
      : 'FCA Fines by Breach Category',
    description: category
      ? `Explore FCA enforcement actions tagged ${humanize(category.name)}. See totals, top firms and the largest penalties, and jump into the dashboard filters.`
      : 'Explore FCA fines by breach category. Jump into the dashboard with filters applied.',
    keywords: category
      ? `FCA ${humanize(category.name)} fines, ${humanize(category.name)} enforcement, FCA breach category fines`
      : 'FCA fines breach category, market abuse FCA fines, AML FCA fines',
    canonicalPath: slug ? `/breaches/${slug}` : '/breaches',
    ogType: 'website',
  });

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [catsRes, finesRes] = await Promise.all([fetchCategories(), fetchFines(0)]);
        if (!mounted) return;
        const found = catsRes.data.find((c) => c.slug === slug) || null;
        setCategory(found);
        setRecords(finesRes.data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Unable to load this topic. Please try again.');
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
    if (!category) return [];
    return records.filter((r) => r.breach_categories?.includes(category.name));
  }, [records, category]);

  const totals = useMemo(() => ({ count: scoped.length, amount: sumAmount(scoped) }), [scoped]);

  const topPenalties = useMemo(() => {
    return [...scoped].sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [scoped]);

  const topFirms = useMemo(() => {
    const map = new Map<string, { firm: string; total: number; count: number }>();
    scoped.forEach((r) => {
      const key = r.firm_individual;
      const existing = map.get(key) || { firm: key, total: 0, count: 0 };
      existing.total += Number(r.amount) || 0;
      existing.count += 1;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [scoped]);

  if (!slug) {
    return (
      <div className="hub-page">
        <div className="hub-container">
          <p className="status">Missing category.</p>
          <Link to="/breaches" className="btn btn-primary">Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>{category ? humanize(category.name) : 'Breach Category'}</h1>
          <p>
            {category
              ? `A breakdown of FCA enforcement actions tagged ${humanize(category.name)} across 2013-2026.`
              : 'Loading breach category...'}
          </p>
          <div className="hub-hero__actions">
            {category && (
              <Link
                to={`/dashboard?year=0&breaches=${encodeURIComponent(category.name)}`}
                className="btn btn-primary"
              >
                View in Dashboard
              </Link>
            )}
            <Link to="/breaches" className="btn btn-ghost">All Breaches</Link>
          </div>
        </header>

        {loading ? (
          <p className="status">Loading topic...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : !category ? (
          <p className="status">Topic not found.</p>
        ) : (
          <>
            <div className="hub-card" style={{ marginBottom: '1rem' }}>
              <div className="hub-card__meta">
                <span className="hub-chip">{totals.count} actions</span>
                <span className="hub-chip hub-chip--neutral">{currency.format(totals.amount)}</span>
              </div>
              <h3>At A Glance</h3>
              <p>
                Use the dashboard filter to explore timelines, compare years, and export results for {humanize(category.name)} cases.
              </p>
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
                          to={`/dashboard?search=${encodeURIComponent(row.firm)}&scope=firm&year=0&breaches=${encodeURIComponent(category.name)}`}
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

