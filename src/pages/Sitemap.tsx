import { Link } from 'react-router-dom';
import { blogArticles, yearlyArticles } from '../data/blogArticles.js';
import { useSEO } from '../hooks/useSEO';
import '../styles/blog.css';

export function Sitemap() {
  useSEO({
    title: 'Sitemap | FCA Fines Dashboard',
    description:
      'Complete sitemap of the FCA Fines Dashboard. Browse all pages including the interactive dashboard, blog articles, annual reviews, and hub pages.',
    keywords: 'FCA fines sitemap, FCA fines pages, FCA fines navigation',
    canonicalPath: '/sitemap',
    ogType: 'website',
  });

  return (
    <div className="blog-page">
      <div className="blog-post-container">
        <article className="blog-article-modal">
          <h1 className="blog-post-title">Sitemap</h1>
          <div className="blog-article-content">
            <p>
              Browse all pages on the FCA Fines Dashboard. Use the links below to navigate to any
              section of the site.
            </p>

            <h2>Main Pages</h2>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/dashboard">Dashboard</Link></li>
              <li><Link to="/topics">Topics</Link></li>
              <li><Link to="/breaches">Breach Categories</Link></li>
              <li><Link to="/years">FCA Fines by Year</Link></li>
              <li><Link to="/sectors">FCA Fines by Sector</Link></li>
              <li><Link to="/firms">Top Firms & Individuals</Link></li>
              <li><Link to="/blog">Blog & Insights</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/guide/fca-enforcement">Complete Guide to FCA Enforcement</Link></li>
            </ul>

            <h2>Blog Articles</h2>
            <ul>
              {(blogArticles ?? []).map(article => (
                <li key={article.slug}>
                  <Link to={`/blog/${article.slug}`}>{article.title}</Link>
                  <span style={{ color: 'var(--text-tertiary, #94a3b8)', fontSize: '0.85em' }}>
                    {' '}— {article.date}
                  </span>
                </li>
              ))}
            </ul>

            <h2>Annual Reviews (2013–2025)</h2>
            <ul>
              {(yearlyArticles ?? []).map(article => (
                <li key={article.slug}>
                  <Link to={`/blog/${article.slug}`}>{article.title}</Link>
                </li>
              ))}
            </ul>

            <h2>Hub Pages</h2>
            <p>
              The following pages serve as entry points into detailed sub-pages for each category:
            </p>
            <ul>
              <li>
                <Link to="/breaches">Breach Categories</Link> — Browse FCA fines by breach type
                (e.g. AML, market abuse, systems and controls)
              </li>
              <li>
                <Link to="/years">Years</Link> — Browse FCA fines by year from 2013 to present
              </li>
              <li>
                <Link to="/sectors">Sectors</Link> — Browse FCA fines by firm category (banks,
                insurance, individuals, etc.)
              </li>
              <li>
                <Link to="/firms">Firms</Link> — Browse the top FCA fine recipients with individual
                enforcement histories
              </li>
            </ul>
          </div>
        </article>
      </div>

      {/* Footer */}
      <footer className="blog-footer">
        <div className="blog-footer-content">
          <div className="blog-footer-brand">
            <p className="blog-footer-logo">FCA Fines Dashboard</p>
            <p className="blog-footer-tagline">The definitive FCA fines database | Powered by MEMA Consultants</p>
          </div>
          <nav className="blog-footer-nav" aria-label="Footer navigation">
            <Link to="/">Home</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/sitemap">Sitemap</Link>
          </nav>
          <p className="blog-footer-copyright">
            © {new Date().getFullYear()} MEMA Consultants · All rights reserved
          </p>
        </div>
      </footer>
    </div>
  );
}
