import { Link } from "react-router-dom";
import {
  allBlogArticles as blogArticles,
  yearlyArticles,
} from "../data/blogArticles.js";
import { useSEO } from "../hooks/useSEO.js";
import "../styles/blog.css";

export function Sitemap() {
  useSEO({
    title: "Sitemap | RegActions",
    description:
      "Complete sitemap of RegActions. Browse all pages including the interactive dashboard, blog articles, annual reviews, and hub pages.",
    keywords: "RegActions sitemap, regulatory enforcement pages, regulatory fines navigation",
    canonicalPath: "/sitemap",
    ogType: "website",
  });

  return (
    <div className="blog-page">
      <div className="blog-post-container">
        <article className="blog-article-modal">
          <h1 className="blog-post-title">Sitemap</h1>
          <div className="blog-article-content">
            <p>
              Browse all pages on RegActions. Use the links below
              to navigate to any section of the site.
            </p>

            <h2>Main Pages</h2>
            <ul>
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/regulators">Dashboard</Link>
              </li>
              <li>
                <Link to="/board-pack">Board Pack</Link>
              </li>
              <li>
                <Link to="/topics">Topics</Link>
              </li>
              <li>
                <Link to="/breaches">Breach Categories</Link>
              </li>
              <li>
                <Link to="/years">Enforcement Actions by Year</Link>
              </li>
              <li>
                <Link to="/sectors">Enforcement Actions by Sector</Link>
              </li>
              <li>
                <Link to="/firms">Top Firms & Individuals</Link>
              </li>
              <li>
                <Link to="/blog">Blog & Insights</Link>
              </li>
              <li>
                <Link to="/faq">FAQ</Link>
              </li>
              <li>
                <Link to="/guide/fca-enforcement">
                  Complete Guide to FCA Enforcement
                </Link>
              </li>
            </ul>

            <h2>Blog Articles</h2>
            <ul>
              {(blogArticles ?? []).map((article) => (
                <li key={article.slug}>
                  <Link to={`/blog/${article.slug}`}>{article.title}</Link>
                  <span
                    style={{
                      color: "var(--text-tertiary, #94a3b8)",
                      fontSize: "0.85em",
                    }}
                  >
                    {" "}
                    — {article.date}
                  </span>
                </li>
              ))}
            </ul>

            <h2>Annual Reviews (2013–2025)</h2>
            <ul>
              {(yearlyArticles ?? []).map((article) => (
                <li key={article.slug}>
                  <Link to={`/blog/${article.slug}`}>{article.title}</Link>
                </li>
              ))}
            </ul>

            <h2>Hub Pages</h2>
            <p>
              The following pages serve as entry points into detailed sub-pages
              for each category:
            </p>
            <ul>
              <li>
                <Link to="/breaches">Breach Categories</Link> — Browse enforcement actions
                by breach type (e.g. AML, market abuse, systems and controls)
              </li>
              <li>
                <Link to="/years">Years</Link> — Browse enforcement actions by year from
                2013 to present
              </li>
              <li>
                <Link to="/sectors">Sectors</Link> — Browse enforcement actions by firm
                category (banks, insurance, individuals, etc.)
              </li>
              <li>
                <Link to="/firms">Firms</Link> — Browse the top penalty
                recipients with individual enforcement histories
              </li>
            </ul>
          </div>
        </article>
      </div>

      {/* Footer */}
      <footer className="blog-footer">
        <div className="blog-footer-content">
          <div className="blog-footer-brand">
            <p className="blog-footer-logo">RegActions</p>
            <p className="blog-footer-tagline">
              Global regulatory enforcement intelligence
            </p>
          </div>
          <nav className="blog-footer-nav" aria-label="Footer navigation">
            <Link to="/">Home</Link>
            <Link to="/regulators">Dashboard</Link>
            <Link to="/board-pack">Board Pack</Link>
            <Link to="/blog">Blog</Link>
            <Link to="/sitemap">Sitemap</Link>
          </nav>
          <p className="blog-footer-copyright">
            © {new Date().getFullYear()} RegActions · All rights reserved
          </p>
        </div>
      </footer>
    </div>
  );
}
