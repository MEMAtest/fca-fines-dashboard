import { Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';

export function Topics() {
  useSEO({
    title: 'FCA Fines Topics | Breaches, Years, Sectors & Firm Pages',
    description:
      'Browse FCA fines by breach type, year, sector, or firm. Explore hub pages and jump into the interactive dashboard for deeper analysis.',
    keywords:
      'FCA fines topics, FCA fines by breach, FCA fines by year, FCA fines by firm, FCA fines by sector',
    canonicalPath: '/topics',
    ogType: 'website',
  });

  return (
    <div className="hub-page">
      <div className="hub-container">
        <header className="hub-hero">
          <h1>Explore FCA Fines Topics</h1>
          <p>
            Fast entry points into the data: breach categories, yearly enforcement, firm sectors, and the biggest firms and individuals.
          </p>
          <div className="hub-hero__actions">
            <Link to="/dashboard" className="btn btn-primary">
              Open Dashboard
            </Link>
            <Link to="/blog" className="btn btn-ghost">
              Read Insights
            </Link>
          </div>
        </header>

        <div className="hub-grid">
          <Link to="/breaches" className="hub-card hover-lift">
            <div className="hub-card__meta">
              <span className="hub-chip">Breach types</span>
              <span className="hub-chip hub-chip--neutral">Market abuse, AML, principles</span>
            </div>
            <h3>Breach Categories</h3>
            <p>See which breach types drive the most enforcement activity and penalty totals.</p>
          </Link>

          <Link to="/years" className="hub-card hover-lift">
            <div className="hub-card__meta">
              <span className="hub-chip">Yearly view</span>
              <span className="hub-chip hub-chip--neutral">2013–2026</span>
            </div>
            <h3>Fines By Year</h3>
            <p>Compare enforcement volumes and totals across years with one click to the dashboard.</p>
          </Link>

          <Link to="/sectors" className="hub-card hover-lift">
            <div className="hub-card__meta">
              <span className="hub-chip">Sectors</span>
              <span className="hub-chip hub-chip--neutral">Banks, insurance, individuals</span>
            </div>
            <h3>Fines By Sector</h3>
            <p>Explore penalty patterns by firm category and identify the most exposed areas of the market.</p>
          </Link>

          <Link to="/firms" className="hub-card hover-lift">
            <div className="hub-card__meta">
              <span className="hub-chip">Firm pages</span>
              <span className="hub-chip hub-chip--neutral">Totals + history</span>
            </div>
            <h3>Top Firms & Individuals</h3>
            <p>Browse the biggest penalty recipients and drill into each entity’s enforcement history.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

