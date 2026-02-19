import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useSEO, injectStructuredData } from '../hooks/useSEO';
import { yearlyArticles } from '../data/blogArticles.js';
import '../styles/blog.css';

function generatePillarSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Complete Guide to FCA Enforcement & Fines | From Investigation to Penalty",
    "description": "Comprehensive guide covering how the FCA enforces financial regulation, how fines are calculated, the biggest penalties of all time, enforcement by year, sector, and breach type.",
    "datePublished": "2026-02-01",
    "dateModified": new Date().toISOString().slice(0, 10),
    "author": {
      "@type": "Organization",
      "name": "MEMA Consultants",
      "url": "https://memaconsultants.com",
      "description": "Compliance consultancy specialising in FCA regulatory data and analysis"
    },
    "publisher": {
      "@type": "Organization",
      "name": "FCA Fines Dashboard",
      "logo": {
        "@type": "ImageObject",
        "url": "https://fcafines.memaconsultants.com/mema-logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "https://fcafines.memaconsultants.com/guide/fca-enforcement"
    },
    "image": {
      "@type": "ImageObject",
      "url": "https://fcafines.memaconsultants.com/og-image.png",
      "width": 1200,
      "height": 630,
      "caption": "FCA Fines Dashboard - Financial Conduct Authority Enforcement Data"
    },
    "keywords": "FCA enforcement guide, FCA fines guide, FCA fines explained, how FCA fines work, FCA enforcement process",
  };
}

export function PillarPage() {
  useSEO({
    title: 'Complete Guide to FCA Enforcement & Fines | From Investigation to Penalty',
    description:
      'Comprehensive guide covering how the FCA enforces financial regulation, how fines are calculated, the biggest penalties of all time, enforcement by year, sector, and breach type.',
    keywords:
      'FCA enforcement guide, FCA fines guide, FCA fines explained, how FCA fines work, FCA enforcement process, FCA penalties guide',
    canonicalPath: '/guide/fca-enforcement',
    ogType: 'article',
    articlePublishedTime: '2026-02-01',
    articleModifiedTime: new Date().toISOString().slice(0, 10),
    articleSection: 'Guide',
    articleTags: ['FCA enforcement', 'FCA fines', 'regulatory guide', 'compliance'],
  });

  useEffect(() => {
    const cleanup = injectStructuredData(generatePillarSchema());
    return cleanup;
  }, []);

  return (
    <div className="blog-page">
      <div className="blog-post-container">
        <article className="blog-article-modal" itemScope itemType="https://schema.org/Article">
          <h1 className="blog-post-title" itemProp="headline">
            Complete Guide to FCA Enforcement & Fines
          </h1>

          <div className="blog-article-modal-header">
            <span className="blog-card-category" itemProp="articleSection">Guide</span>
            <div className="blog-card-meta">
              <span className="blog-card-meta-item">Comprehensive Reference</span>
            </div>
          </div>

          <div className="blog-article-content" itemProp="articleBody">
            <p>
              <strong>This guide is your single reference for understanding how the Financial Conduct Authority
              enforces UK financial regulation.</strong> From the investigation process to penalty calculation, from
              the biggest fines of all time to the latest monthly enforcement data, every section links to detailed
              analysis on our site. Bookmark this page as your starting point for FCA enforcement research.
            </p>

            {/* Section 1 */}
            <h2>1. What is the FCA?</h2>
            <p>
              The Financial Conduct Authority was established on 1 April 2013, succeeding the Financial Services
              Authority (FSA) under the Financial Services Act 2012. It is the conduct regulator for approximately
              50,000 financial services firms and financial markets in the United Kingdom. The FCA operates independently
              of the UK Government and is funded by fees charged to the firms it regulates.
            </p>
            <p>
              The FCA's three operational objectives are: ensuring consumers receive appropriate protection, protecting
              and enhancing the integrity of the UK financial system, and promoting effective competition in the
              interests of consumers.
            </p>

            {/* Section 2 */}
            <h2>2. How FCA Enforcement Works</h2>
            <p>
              When the FCA identifies potential misconduct, it follows a structured enforcement process that can take
              months or years to conclude. Understanding this process helps firms and individuals respond appropriately
              when faced with regulatory scrutiny.
            </p>
            <p>
              The process begins with investigation (gathering evidence and interviewing witnesses), progresses through
              a Warning Notice (proposed action), then a Decision Notice (confirmed decision), and concludes with a
              Final Notice (published outcome). Firms can refer contested decisions to the Upper Tribunal for
              independent review.
            </p>
            <p>
              <Link to="/blog/fca-final-notices-explained">
                Read our detailed guide to FCA Final Notices and enforcement decisions &rarr;
              </Link>
            </p>

            {/* Section 3 */}
            <h2>3. How the FCA Calculates Fines</h2>
            <p>
              The FCA uses a five-step framework to calculate financial penalties: (1) determine the relevant revenue
              or income figure, (2) apply a percentage based on the seriousness of the breach (1-20%), (3) adjust for
              duration, (4) apply aggravating and mitigating factors, and (5) apply the settlement discount (typically
              30% for early resolution). The resulting figure must meet the "credible deterrence" threshold.
            </p>
            <p>
              Our searchable database lets you compare fine calculations across all enforcement actions.
            </p>
            <p>
              <Link to="/blog/fca-fines-database-how-to-search">
                Learn how to search and analyse the FCA fines database &rarr;
              </Link>
            </p>

            {/* Section 4 */}
            <h2>4. Biggest FCA Fines of All Time</h2>
            <p>
              The 20 largest FCA fines range from £284 million (Barclays, FX manipulation) to significant AML
              penalties against Deutsche Bank, HSBC, and NatWest. These cases have shaped regulatory expectations
              and demonstrate the FCA's willingness to impose substantial sanctions for serious misconduct.
            </p>
            <p>
              <Link to="/blog/20-biggest-fca-fines-of-all-time">
                See the complete list of the 20 biggest FCA fines of all time &rarr;
              </Link>
            </p>

            {/* Section 5 */}
            <h2>5. FCA Fines by Year (2013–2025)</h2>
            <p>
              FCA enforcement shows clear cyclical patterns. The peak year was 2014 (£1.47 billion, driven by FX
              enforcement), followed by the quietest year in 2016 (£22 million). AML enforcement drove a resurgence
              in 2021 (£568 million). Understanding these cycles helps compliance teams anticipate regulatory focus.
            </p>
            <ul>
              {yearlyArticles.map(article => (
                <li key={article.slug}>
                  <Link to={`/blog/${article.slug}`}>
                    FCA Fines {article.year}: Annual Review
                  </Link>
                </li>
              ))}
            </ul>
            <p>
              <Link to="/blog/fca-enforcement-trends-2013-2025">
                Read our full analysis of FCA enforcement trends 2013–2025 &rarr;
              </Link>
            </p>

            {/* Section 6 */}
            <h2>6. FCA Fines by Sector</h2>
            <p>
              The banking sector accounts for approximately 65% of all FCA fines by value, driven by FX manipulation
              and AML enforcement. Insurance companies face enforcement for mis-selling, claims handling failures, and
              AML deficiencies. Individuals are increasingly targeted under SM&CR, with personal fines and prohibition
              orders accelerating since 2019.
            </p>
            <ul>
              <li>
                <Link to="/blog/fca-fines-banks-complete-list">
                  FCA Fines to Banks: Complete List &rarr;
                </Link>
              </li>
              <li>
                <Link to="/blog/fca-fines-insurance-sector">
                  FCA Fines for Insurance Companies &rarr;
                </Link>
              </li>
              <li>
                <Link to="/blog/fca-fines-individuals-personal-accountability">
                  FCA Fines for Individuals: Personal Accountability &rarr;
                </Link>
              </li>
            </ul>

            {/* Section 7 */}
            <h2>7. AML and Financial Crime Fines</h2>
            <p>
              Anti-money laundering failures represent the single largest enforcement category, accounting for
              approximately 25% of total FCA fine value (over £1.2 billion). Major AML cases include Deutsche Bank's
              £227 million penalty for Russian mirror trades, HSBC's £176 million for transaction monitoring failures,
              and the landmark NatWest criminal prosecution in 2021.
            </p>
            <p>
              <Link to="/blog/fca-aml-fines-anti-money-laundering">
                Read our complete guide to FCA AML fines and enforcement &rarr;
              </Link>
            </p>

            {/* Section 8 */}
            <h2>8. SM&CR and Individual Accountability</h2>
            <p>
              The Senior Managers and Certification Regime has fundamentally changed individual accountability in
              financial services. Senior managers face personal fines, prohibition orders, and even criminal prosecution
              for failures in their areas of responsibility. The Duty of Responsibility reverses the burden of proof:
              the FCA need only show a breach occurred in the manager's area and that they failed to take reasonable
              steps to prevent it.
            </p>
            <p>
              <Link to="/blog/senior-managers-regime-fca-fines">
                Read our guide to SM&CR and personal liability &rarr;
              </Link>
            </p>

            {/* Section 9 */}
            <h2>9. Enforcement Trends and Analysis</h2>
            <p>
              FCA enforcement follows recognisable patterns. The 2014-2015 period resolved post-FSA legacy issues
              and the FX scandal. The 2016-2018 consolidation gave way to renewed AML focus from 2019-2021. The
              current cycle (2022-2026) combines Consumer Duty implementation with continued financial crime
              enforcement and increasing individual accountability.
            </p>
            <p>
              <Link to="/blog/fca-enforcement-trends-2013-2025">
                Explore our full enforcement trends analysis &rarr;
              </Link>
            </p>

            {/* Section 10 */}
            <h2>10. Latest FCA Fines: 2026</h2>
            <p>
              2026 has started with a clear signal: the FCA is prioritising individual accountability. January 2026
              saw five enforcement actions totalling £2.52 million, all targeting individuals for market abuse and
              dishonest conduct. Monthly tracking pages cover each month's enforcement activity as it unfolds.
            </p>
            <ul>
              <li>
                <Link to="/blog/fca-fines-january-2026">
                  FCA Fines January 2026 &rarr;
                </Link>
              </li>
              <li>
                <Link to="/blog/fca-enforcement-outlook-february-2026">
                  FCA Enforcement Outlook: Early 2026 &rarr;
                </Link>
              </li>
              <li>
                <Link to="/blog/fca-fines-february-2026">
                  FCA Fines February 2026 &rarr;
                </Link>
              </li>
              <li>
                <Link to="/blog/fca-fines-march-2026">
                  FCA Fines March 2026 &rarr;
                </Link>
              </li>
            </ul>
            <p>
              <Link to="/blog/fca-fines-2025-complete-list">
                See the full list of FCA fines 2025 &rarr;
              </Link>
            </p>
          </div>

          {/* Bottom CTA */}
          <div className="blog-article-modal-footer">
            <p className="blog-article-keywords">
              <strong>Related searches:</strong> FCA enforcement guide, how FCA fines work, FCA penalties explained, FCA enforcement process, FCA fines database
            </p>
            <Link to="/dashboard" className="blog-cta-button" style={{ display: 'inline-flex' }}>
              Explore the FCA Fines Dashboard
            </Link>
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
