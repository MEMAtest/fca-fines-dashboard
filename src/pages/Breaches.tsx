import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCategories } from '../api';
import { useSEO } from '../hooks/useSEO';
import type { CategorySummary } from '../types';

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export function Breaches() {
  useSEO({
    title: 'FCA Fines by Breach Type | Market Abuse, AML, Principles and More',
    description:
      'Browse FCA fines by breach category. See which breach types drive the most penalties and jump into the dashboard with filters applied.',
    keywords: 'FCA fines by breach, market abuse FCA fines, AML FCA fines, FCA principles fines, breach category fines',
    canonicalPath: '/breaches',
    ogType: 'website',
  });

  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetchCategories();
        if (!mounted) return;
        setCategories(res.data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Unable to load breach categories. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const top = useMemo(() => categories.slice(0, 12), [categories]);

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>FCA Fines by Breach Category</h1>
          <p>
            Explore enforcement actions grouped by breach category. Each topic page links straight into the dashboard filters.
          </p>
          <div className="hub-hero__actions">
            <Link to="/dashboard?year=0" className="btn btn-primary">
              Explore All Fines
            </Link>
            <Link to="/topics" className="btn btn-ghost">
              Back to Topics
            </Link>
          </div>
        </header>

        {loading ? (
          <p className="status">Loading categories...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : (
          <div className="hub-grid">
            {top.map((cat) => (
              <Link key={cat.slug} to={`/breaches/${cat.slug}`} className="hub-card hover-lift">
                <div className="hub-card__meta">
                  <span className="hub-chip">{cat.fineCount} actions</span>
                  <span className="hub-chip hub-chip--neutral">{currency.format(cat.totalAmount)}</span>
                </div>
                <h3>{cat.name}</h3>
                <p>View cases, totals, and the biggest penalties tagged {cat.name}.</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

