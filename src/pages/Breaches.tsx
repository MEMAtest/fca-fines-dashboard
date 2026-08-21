import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories } from "../api.js";
import { useSEO } from "../hooks/useSEO.js";
import type { CategorySummary } from "../types.js";
import { formatBreachCategory } from "../utils/labelConversion.js";

const currency = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function Breaches() {
  useSEO({
    title: "Enforcement Actions by Breach Type | Market Abuse, AML, Principles and More",
    description:
      "Browse regulatory enforcement actions by breach category. See which breach types drive the most penalties and jump into the dashboard with filters applied.",
    keywords:
      "regulatory fines by breach, market abuse enforcement, AML fines, regulatory principles fines, breach category fines",
    canonicalPath: "/breaches",
    ogType: "website",
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
        if (mounted)
          setError("Unable to load breach categories. Please try again.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const ranked = useMemo(
    () => categories.slice().sort((a, b) => b.totalAmount - a.totalAmount),
    [categories],
  );
  const railItems = useMemo(() => ranked.slice(0, 10), [ranked]);
  const totalValue = useMemo(
    () => ranked.reduce((sum, cat) => sum + cat.totalAmount, 0),
    [ranked],
  );

  return (
    <div className="hub-two-col">
      <aside className="hub-rail">
        <div className="hub-rail__inner">
          <div className="hub-rail__label">Breach types</div>
          <nav className="hub-rail__nav" aria-label="Breach categories">
            {railItems.map((cat) => (
              <Link key={cat.slug} to={`/breaches/${cat.slug}`} className="hub-rail__item">
                {formatBreachCategory(cat.name)}
              </Link>
            ))}
          </nav>
          <div className="hub-rail__divider" />
          <div className="hub-rail__actions">
            <Link to="/fines?year=0" className="hub-rail__action">
              Explore All Actions
            </Link>
            <Link to="/topics" className="hub-rail__action">
              Back to Topics
            </Link>
          </div>
        </div>
      </aside>

      <main className="hub-main">
        <div className="hub-header-row">
          <div>
            <h1 className="hub-main__title">Enforcement by breach category</h1>
            <p className="hub-main__lede">
              Which control failures actually attract enforcement, ranked by penalty value. Each row
              opens the dashboard filtered to that category.
            </p>
          </div>
          <Link to="/fines?year=0" className="btn btn-primary">
            Explore all actions
          </Link>
        </div>

        {loading ? (
          <p className="status">Loading categories...</p>
        ) : error ? (
          <p className="status">{error}</p>
        ) : (
          <div className="breach-table">
            <div className="breach-table__head">
              <span>#</span>
              <span>Category</span>
              <span>Value</span>
              <span>Actions</span>
              <span>Share of total value</span>
            </div>
            {ranked.map((cat, index) => {
              const pct = totalValue > 0 ? Math.round((cat.totalAmount / totalValue) * 1000) / 10 : 0;
              return (
                <Link key={cat.slug} to={`/breaches/${cat.slug}`} className="breach-row">
                  <span className="breach-row__rank">{index + 1}</span>
                  <span>
                    <span className="breach-row__name">{formatBreachCategory(cat.name)}</span>
                    <span className="breach-row__note">
                      {cat.fineCount.toLocaleString("en-GB")} actions tagged {formatBreachCategory(cat.name)}
                    </span>
                  </span>
                  <span className="breach-row__value">{currency.format(cat.totalAmount)}</span>
                  <span className="breach-row__count">{cat.fineCount.toLocaleString("en-GB")}</span>
                  <span className="breach-row__share" aria-hidden="true">
                    <span className="breach-row__share-fill" style={{ width: `${pct}%` }} />
                  </span>
                </Link>
              );
            })}
            <div className="breach-table__note">
              Ranked by total recorded penalty value. Value and volume leaders are not always the same
              category — benchmarking on value alone can under-weight the theme most likely to appear in
              your own supervisory correspondence.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
