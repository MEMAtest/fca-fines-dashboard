import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  TrendingUp,
  Shield,
  AlertTriangle,
  BookOpen,
  Scale,
  Building2,
  Users,
  ChevronRight,
  ExternalLink,
  Landmark,
  PoundSterling,
  BarChart3,
  Briefcase
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useSEO, injectStructuredData } from '../hooks/useSEO';
import {
  yearlyFCAData,
  MonthlyFinesChart,
  BreachCategoryChart,
  TopFirmsChart,
  YearOverYearChart,
} from '../components/YearlyArticleCharts';
import {
  Top20FinesChart,
  Top20BreachTypesChart,
  AMLFinesChart,
  AMLTrendChart,
  BankFinesComparisonChart,
  AllYearsEnforcementChart,
  FinalNoticesBreakdownChart,
  SMCREnforcementChart,
  Fines2025MonthlyChart,
  Fines2025BreachChart,
  CumulativeFinesChart,
} from '../components/MainArticleCharts';
import { Blog3DVisualization } from '../components/Blog3DVisualization';
import { blogArticles as blogArticlesMeta, yearlyArticles as yearlyArticlesMeta } from '../data/blogArticles.js';
import type { YearlyArticleMeta } from '../data/blogArticles.js';
import '../styles/blog.css';
import '../styles/blog3d.css';

interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  seoTitle: string;
  excerpt: string;
  content: string;
  category: string;
  readTime: string;
  date: string;
  dateISO: string;
  icon: React.ReactNode;
  featured?: boolean;
  keywords: string[];
}

// Map article IDs to their icons (JSX stays in this file)
const iconMap: Record<string, React.ReactNode> = {
  'largest-fca-fines-history': <Scale className="blog-card-icon" />,
  'fca-fines-2025': <PoundSterling className="blog-card-icon" />,
  'fca-fines-database-guide': <BookOpen className="blog-card-icon" />,
  'fca-aml-fines': <AlertTriangle className="blog-card-icon" />,
  'fca-fines-banks': <Building2 className="blog-card-icon" />,
  'fca-enforcement-trends': <TrendingUp className="blog-card-icon" />,
  'fca-final-notices': <Landmark className="blog-card-icon" />,
  'senior-managers-regime-fines': <Users className="blog-card-icon" />,
  'fca-fines-january-2026': <Scale className="blog-card-icon" />,
  'fca-enforcement-outlook-february-2026': <TrendingUp className="blog-card-icon" />,
  'fca-fines-february-2026': <PoundSterling className="blog-card-icon" />,
  'fca-fines-individuals': <Users className="blog-card-icon" />,
};

// Merge icon into each article
const blogArticles: BlogArticle[] = blogArticlesMeta.map(a => ({
  ...a,
  icon: iconMap[a.id] || <Scale className="blog-card-icon" />,
}));

// Helper function to format currency
const formatYearlyCurrency = (amount: number): string => {
  if (amount >= 1_000_000_000) {
    return `£${(amount / 1_000_000_000).toFixed(2)}bn`;
  }
  if (amount >= 1_000_000) {
    return `£${(amount / 1_000_000).toFixed(0)}m`;
  }
  return `£${(amount / 1_000).toFixed(0)}k`;
};

// Generate Article structured data for SEO
function generateArticleSchema(article: BlogArticle) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.seoTitle,
    "description": article.excerpt,
    "datePublished": article.dateISO,
    "dateModified": article.dateISO,
    "author": {
      "@type": "Organization",
      "name": "MEMA Consultants",
      "url": "https://memaconsultants.com"
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
      "@id": `https://fcafines.memaconsultants.com/blog/${article.slug}`
    },
    "keywords": article.keywords.join(", "),
    "articleSection": article.category,
    "wordCount": article.content.split(/\s+/).length
  };
}

// Generate BlogPosting list schema
function generateBlogListSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "FCA Fines Insights & Analysis",
    "description": "Expert analysis of FCA fines, enforcement trends, and compliance guidance",
    "url": "https://fcafines.memaconsultants.com/blog",
    "publisher": {
      "@type": "Organization",
      "name": "MEMA Consultants"
    },
    "blogPost": blogArticles.map(article => ({
      "@type": "BlogPosting",
      "headline": article.title,
      "description": article.excerpt,
      "datePublished": article.dateISO,
      "url": `https://fcafines.memaconsultants.com/blog/${article.slug}`,
      "author": {
        "@type": "Organization",
        "name": "MEMA Consultants"
      }
    }))
  };
}

export function Blog() {
  const navigate = useNavigate();
  const [selectedArticle, setSelectedArticle] = useState<BlogArticle | null>(null);
  const [selectedYearlyArticle, setSelectedYearlyArticle] = useState<YearlyArticleMeta | null>(null);

  // SEO for blog listing page
  useSEO({
    title: 'FCA Fines Blog | Expert Analysis & Insights on Financial Conduct Authority Penalties',
    description: 'Expert analysis of FCA fines, biggest penalties, enforcement trends, and compliance guidance. Covering the 20 largest FCA fines, AML enforcement, banking sector penalties, and 2025 fines.',
    keywords: 'FCA fines blog, FCA fines analysis, FCA enforcement insights, biggest FCA fines, FCA fines 2025, FCA AML fines, FCA compliance guide',
    canonicalPath: '/blog',
    ogType: 'blog'
  });

  // Inject blog list structured data
  useEffect(() => {
    const cleanup = injectStructuredData(generateBlogListSchema());
    return cleanup;
  }, []);

  // Update structured data when article is selected
  useEffect(() => {
    if (selectedArticle) {
      document.title = selectedArticle.seoTitle;
      const cleanup = injectStructuredData(generateArticleSchema(selectedArticle));
      return cleanup;
    }
  }, [selectedArticle]);

  const featuredArticles = blogArticles.filter(article => article.featured);
  const regularArticles = blogArticles.filter(article => !article.featured);

  const handleArticleClick = (article: BlogArticle) => {
    setSelectedArticle(article);
  };

  return (
    <div className="blog-page">
      {/* Hero Section - SEO optimized with 3D visualization */}
      <section className="blog-hero-3d">
        <div className="blog-hero-container">
          <motion.div
            className="blog-hero-text"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1>FCA Fines: Expert Analysis & Insights</h1>
            <p className="blog-hero-subtitle">
              Comprehensive guides to Financial Conduct Authority fines, enforcement trends,
              and compliance best practices. Updated for 2025.
            </p>
            <p className="blog-hero-stats">
              Tracking <strong>£4.9+ billion</strong> in FCA fines since 2013
            </p>
          </motion.div>

          <div className="blog-hero-visualization">
            <Blog3DVisualization />
          </div>
        </div>
      </section>

      {/* Featured Articles */}
      <section className="blog-section" aria-labelledby="featured-heading">
        <div className="blog-section-header">
          <h2 id="featured-heading">Featured: Biggest FCA Fines & 2025 Updates</h2>
          <p>Essential reading on the largest Financial Conduct Authority penalties</p>
        </div>

        <div className="blog-featured-grid">
          {featuredArticles.map((article, index) => (
            <motion.article
              key={article.id}
              className="blog-card blog-card--featured"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              onClick={() => handleArticleClick(article)}
              itemScope
              itemType="https://schema.org/Article"
            >
              <div className="blog-card-header">
                <span className="blog-card-category" itemProp="articleSection">{article.category}</span>
                <span className="blog-card-featured-badge">Featured</span>
              </div>
              <div className="blog-card-icon-wrapper">
                {article.icon}
              </div>
              <h3 className="blog-card-title" itemProp="headline">{article.title}</h3>
              <p className="blog-card-excerpt" itemProp="description">{article.excerpt}</p>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time dateTime={article.dateISO} itemProp="datePublished">{article.date}</time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {article.readTime}
                </span>
              </div>
              <button className="blog-card-cta" aria-label={`Read article: ${article.title}`}>
                Read Article
                <ChevronRight size={16} />
              </button>
            </motion.article>
          ))}
        </div>
      </section>

      {/* All Articles */}
      <section className="blog-section blog-section--alt" aria-labelledby="all-articles-heading">
        <div className="blog-section-header">
          <h2 id="all-articles-heading">All FCA Fines Articles</h2>
          <p>Complete coverage of FCA enforcement, AML fines, banking penalties, and compliance</p>
        </div>

        <div className="blog-grid">
          {regularArticles.map((article, index) => (
            <motion.article
              key={article.id}
              className="blog-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              onClick={() => handleArticleClick(article)}
              itemScope
              itemType="https://schema.org/Article"
            >
              <div className="blog-card-header">
                <span className="blog-card-category" itemProp="articleSection">{article.category}</span>
              </div>
              <div className="blog-card-icon-wrapper">
                {article.icon}
              </div>
              <h3 className="blog-card-title" itemProp="headline">{article.title}</h3>
              <p className="blog-card-excerpt" itemProp="description">{article.excerpt}</p>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time dateTime={article.dateISO} itemProp="datePublished">{article.date}</time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {article.readTime}
                </span>
              </div>
              <button className="blog-card-cta" aria-label={`Read article: ${article.title}`}>
                Read Article
                <ChevronRight size={16} />
              </button>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Yearly Analysis Section */}
      <section className="yearly-analysis-section" aria-labelledby="yearly-heading">
        <div className="blog-section-header">
          <h2 id="yearly-heading">FCA Fines by Year: Professional Analysis 2013-2025</h2>
          <p>In-depth regulatory analysis with data visualisations for each enforcement year</p>
        </div>

        <div className="yearly-analysis-grid">
          {yearlyArticlesMeta.map((article, index) => {
            const yearData = yearlyFCAData[article.year];
            return (
              <motion.div
                key={article.year}
                className="yearly-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                onClick={() => setSelectedYearlyArticle(article)}
              >
                <h3 className="yearly-card-year">{article.year}</h3>
                <div className="yearly-card-stats">
                  <div className="yearly-card-stat">
                    <div className="yearly-card-stat-value">{formatYearlyCurrency(yearData?.totalAmount || 0)}</div>
                    <div className="yearly-card-stat-label">Total Fines</div>
                  </div>
                  <div className="yearly-card-stat">
                    <div className="yearly-card-stat-value">{yearData?.totalFines || 0}</div>
                    <div className="yearly-card-stat-label">Actions</div>
                  </div>
                </div>
                <p className="yearly-card-highlight">
                  Largest: {yearData?.largestFine.firm.split(' ').slice(0, 3).join(' ')} - {formatYearlyCurrency(yearData?.largestFine.amount || 0)}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* SEO Content Section */}
      <section className="blog-seo-section">
        <div className="blog-seo-content">
          <h2>About the FCA Fines Database</h2>
          <p>
            Our <strong>FCA fines database</strong> is the most comprehensive resource for tracking
            Financial Conduct Authority enforcement actions. Since the FCA was established in 2013,
            it has issued over <strong>£4.9 billion in fines</strong> to financial services firms
            and individuals.
          </p>
          <p>
            Use our <Link to="/dashboard">interactive FCA fines dashboard</Link> to search all penalties,
            filter by year, firm, or breach category, and export data for compliance reporting.
          </p>

          <h3>Most Searched FCA Fines Topics</h3>
          <ul className="blog-seo-links">
            <li><strong>Biggest FCA fines</strong> - The 20 largest penalties ever issued</li>
            <li><strong>FCA fines 2025</strong> - This year's enforcement actions</li>
            <li><strong>FCA AML fines</strong> - Anti-money laundering penalties</li>
            <li><strong>FCA fines to banks</strong> - Banking sector enforcement</li>
            <li><strong>FCA final notices</strong> - Official enforcement decisions</li>
          </ul>
        </div>
      </section>

      {/* CTA Section */}
      <section className="blog-cta-section">
        <div className="blog-cta-content">
          <h2>Search the Complete FCA Fines Database</h2>
          <p>
            Access our interactive dashboard to search all FCA fines from 2013-2025.
            Filter by firm, year, amount, and breach category.
          </p>
          <button className="blog-cta-button" onClick={() => navigate('/dashboard')}>
            Open FCA Fines Dashboard
            <ExternalLink size={18} />
          </button>
        </div>
      </section>

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
          </nav>
          <p className="blog-footer-copyright">
            © {new Date().getFullYear()} MEMA Consultants · All rights reserved
          </p>
        </div>
      </footer>

      {/* Article Modal */}
      {selectedArticle && (
        <Modal
          isOpen={!!selectedArticle}
          onClose={() => setSelectedArticle(null)}
          title={selectedArticle.title}
        >
          <article className="blog-article-modal" itemScope itemType="https://schema.org/Article">
            <div className="blog-article-modal-header">
              <span className="blog-card-category">{selectedArticle.category}</span>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time dateTime={selectedArticle.dateISO}>{selectedArticle.date}</time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {selectedArticle.readTime}
                </span>
              </div>
            </div>
            <div
              className="blog-article-content"
              itemProp="articleBody"
              dangerouslySetInnerHTML={{
                __html: selectedArticle.content
                  // Convert markdown tables to HTML tables
                  .replace(/(\|.+\|\n)+/g, (tableBlock) => {
                    const rows = tableBlock.trim().split('\n');
                    let html = '<table><thead>';
                    let inBody = false;
                    rows.forEach((row, index) => {
                      // Skip separator rows (|---|---|)
                      if (/^\|[\s\-:]+\|$/.test(row.replace(/\|/g, '|').replace(/[^|\-:\s]/g, ''))) {
                        html += '</thead><tbody>';
                        inBody = true;
                        return;
                      }
                      const cells = row.split('|').filter(Boolean).map(cell => cell.trim());
                      const cellTag = !inBody ? 'th' : 'td';
                      html += `<tr>${cells.map(cell => `<${cellTag}>${cell}</${cellTag}>`).join('')}</tr>`;
                    });
                    html += inBody ? '</tbody></table>' : '</thead></table>';
                    return html;
                  })
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/^\- (.+)$/gm, '<li>$1</li>')
                  .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
                  .replace(/\n\n/g, '</p><p>')
              }}
            />

            {/* Article-specific charts */}
            {selectedArticle.id === 'largest-fca-fines-history' && (
              <div className="article-charts-section">
                <Top20FinesChart />
                <Top20BreachTypesChart />
              </div>
            )}

            {selectedArticle.id === 'fca-fines-2025' && (
              <div className="article-charts-section">
                <Fines2025MonthlyChart />
                <Fines2025BreachChart />
              </div>
            )}

            {selectedArticle.id === 'fca-fines-database-guide' && (
              <div className="article-charts-section">
                <CumulativeFinesChart />
              </div>
            )}

            {selectedArticle.id === 'fca-aml-fines' && (
              <div className="article-charts-section">
                <AMLFinesChart />
                <AMLTrendChart />
              </div>
            )}

            {selectedArticle.id === 'fca-fines-banks' && (
              <div className="article-charts-section">
                <BankFinesComparisonChart />
              </div>
            )}

            {selectedArticle.id === 'fca-enforcement-trends' && (
              <div className="article-charts-section">
                <AllYearsEnforcementChart />
              </div>
            )}

            {selectedArticle.id === 'fca-final-notices' && (
              <div className="article-charts-section">
                <FinalNoticesBreakdownChart />
              </div>
            )}

            {selectedArticle.id === 'senior-managers-regime-fines' && (
              <div className="article-charts-section">
                <SMCREnforcementChart />
              </div>
            )}

            <div className="blog-article-modal-footer">
              <p className="blog-article-keywords">
                <strong>Related searches:</strong> {selectedArticle.keywords.join(', ')}
              </p>
              <button
                className="blog-cta-button"
                onClick={() => {
                  setSelectedArticle(null);
                  navigate('/dashboard');
                }}
              >
                Explore FCA Fines Dashboard
                <ExternalLink size={18} />
              </button>
            </div>
          </article>
        </Modal>
      )}

      {/* Yearly Analysis Article Modal */}
      {selectedYearlyArticle && (
        <Modal
          isOpen={!!selectedYearlyArticle}
          onClose={() => setSelectedYearlyArticle(null)}
          title={selectedYearlyArticle.title}
        >
          <article className="blog-article-modal" itemScope itemType="https://schema.org/Article">
            <div className="blog-article-modal-header">
              <span className="blog-card-category">
                <BarChart3 size={14} style={{ marginRight: '0.375rem' }} />
                Annual Analysis
              </span>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time>{selectedYearlyArticle.year} Review</time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  15 min read
                </span>
              </div>
            </div>

            <div className="blog-article-content" itemProp="articleBody">
              {/* Stats Summary */}
              {yearlyFCAData[selectedYearlyArticle.year] && (
                <div className="stats-summary-row">
                  <div className="stats-summary-item">
                    <div className="stats-summary-value">
                      {formatYearlyCurrency(yearlyFCAData[selectedYearlyArticle.year].totalAmount)}
                    </div>
                    <div className="stats-summary-label">Total Fines</div>
                  </div>
                  <div className="stats-summary-item">
                    <div className="stats-summary-value">
                      {yearlyFCAData[selectedYearlyArticle.year].totalFines}
                    </div>
                    <div className="stats-summary-label">Actions</div>
                  </div>
                  <div className="stats-summary-item">
                    <div className="stats-summary-value">
                      {formatYearlyCurrency(yearlyFCAData[selectedYearlyArticle.year].avgFine)}
                    </div>
                    <div className="stats-summary-label">Average Fine</div>
                  </div>
                  <div className="stats-summary-item">
                    <div className="stats-summary-value">
                      {formatYearlyCurrency(yearlyFCAData[selectedYearlyArticle.year].largestFine.amount)}
                    </div>
                    <div className="stats-summary-label">Largest Fine</div>
                  </div>
                </div>
              )}

              <h2>Executive Summary</h2>
              {selectedYearlyArticle.executiveSummary.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}

              {/* Monthly Enforcement Chart */}
              {yearlyFCAData[selectedYearlyArticle.year] && (
                <MonthlyFinesChart
                  data={yearlyFCAData[selectedYearlyArticle.year].monthlyData}
                  year={selectedYearlyArticle.year}
                />
              )}

              <h2>Regulatory Context</h2>
              {selectedYearlyArticle.regulatoryContext.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}

              {/* Key Insights Box */}
              <div className="article-key-insights">
                <h4>Key Enforcement Themes - {selectedYearlyArticle.year}</h4>
                <ul>
                  {selectedYearlyArticle.keyEnforcementThemes.map((theme, i) => (
                    <li key={i}>{theme}</li>
                  ))}
                </ul>
              </div>

              {/* Breach Category and Top Firms Charts */}
              {yearlyFCAData[selectedYearlyArticle.year] && (
                <div className="yearly-charts-grid">
                  <BreachCategoryChart
                    data={yearlyFCAData[selectedYearlyArticle.year].breachData}
                    year={selectedYearlyArticle.year}
                  />
                  <TopFirmsChart
                    data={yearlyFCAData[selectedYearlyArticle.year].topFirms}
                    year={selectedYearlyArticle.year}
                  />
                </div>
              )}

              {/* Professional Insight Box */}
              <div className="professional-analysis">
                <h4>
                  <Briefcase size={18} />
                  Professional Analysis
                </h4>
                {selectedYearlyArticle.professionalInsight.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>

              <h2>Looking Ahead</h2>
              {selectedYearlyArticle.lookingAhead.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}

              {/* Year Comparison Chart */}
              {selectedYearlyArticle.year >= 2015 && (
                <YearOverYearChart
                  years={[2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].filter(y => y <= selectedYearlyArticle.year)}
                />
              )}
            </div>

            <div className="blog-article-modal-footer">
              <p className="blog-article-keywords">
                <strong>Related searches:</strong> {selectedYearlyArticle.keywords.join(', ')}
              </p>
              <button
                className="blog-cta-button"
                onClick={() => {
                  setSelectedYearlyArticle(null);
                  navigate('/dashboard');
                }}
              >
                Explore FCA Fines Dashboard
                <ExternalLink size={18} />
              </button>
            </div>
          </article>
        </Modal>
      )}
    </div>
  );
}
