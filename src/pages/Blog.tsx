import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  Landmark,
  PoundSterling,
  Scale,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Blog3DVisualization } from '../components/Blog3DVisualization';
import { yearlyFCAData } from '../components/YearlyArticleCharts';
import { blogArticles as blogArticlesMeta, yearlyArticles as yearlyArticlesMeta } from '../data/blogArticles.js';
import type { BlogArticleMeta } from '../data/blogArticles.js';
import { injectStructuredData, useSEO } from '../hooks/useSEO';
import '../styles/blog.css';
import '../styles/blog3d.css';

interface BlogArticle extends BlogArticleMeta {
  icon: React.ReactNode;
}

const MotionLink = motion.create(Link);

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
  'fca-fines-march-2026': <PoundSterling className="blog-card-icon" />,
  'fca-fines-insurance': <Shield className="blog-card-icon" />,
};

// Merge icon into each article
const blogArticles: BlogArticle[] = blogArticlesMeta.map((a) => ({
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

function generateItemListSchema() {
  const allArticles = [
    ...blogArticlesMeta.filter(a => a.featured),
    ...blogArticlesMeta.filter(a => !a.featured),
    ...yearlyArticlesMeta,
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: allArticles.map((article, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `https://fcafines.memaconsultants.com/blog/${article.slug}`,
    })),
  };
}

function generateBlogListSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'FCA Fines Insights & Analysis',
    description: 'Expert analysis of FCA fines, enforcement trends, and compliance guidance',
    url: 'https://fcafines.memaconsultants.com/blog',
    publisher: {
      '@type': 'Organization',
      name: 'MEMA Consultants',
    },
    blogPost: blogArticles.map((article) => ({
      '@type': 'BlogPosting',
      headline: article.title,
      description: article.excerpt,
      datePublished: article.dateISO,
      url: `https://fcafines.memaconsultants.com/blog/${article.slug}`,
      author: {
        '@type': 'Organization',
        name: 'MEMA Consultants',
      },
    })),
  };
}

export function Blog() {
  const navigate = useNavigate();

  useSEO({
    title: 'FCA Fines Blog | Expert Analysis & Insights on Financial Conduct Authority Penalties',
    description:
      'Expert analysis of FCA fines, biggest penalties, enforcement trends, and compliance guidance. Covering the 20 largest FCA fines, AML enforcement, banking sector penalties, and 2025 fines.',
    keywords:
      'FCA fines blog, FCA fines analysis, FCA enforcement insights, biggest FCA fines, FCA fines 2025, FCA AML fines, FCA compliance guide',
    canonicalPath: '/blog',
    ogType: 'website',
  });

  useEffect(() => {
    const cleanup = injectStructuredData(generateBlogListSchema());
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = injectStructuredData(generateItemListSchema());
    return cleanup;
  }, []);

  const featuredArticles = blogArticles.filter((article) => article.featured);
  const regularArticles = blogArticles.filter((article) => !article.featured);

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
              and compliance best practices.
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
          <h2 id="featured-heading">Featured: Biggest FCA Fines & 2026 Updates</h2>
          <p>Essential reading on the largest Financial Conduct Authority penalties</p>
        </div>

        <div className="blog-featured-grid">
          {featuredArticles.map((article, index) => (
            <MotionLink
              key={article.id}
              to={`/blog/${article.slug}`}
              className="blog-card blog-card--featured"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              itemScope
              itemType="https://schema.org/Article"
            >
              <div className="blog-card-header">
                <span className="blog-card-category" itemProp="articleSection">
                  {article.category}
                </span>
                <span className="blog-card-featured-badge">Featured</span>
              </div>
              <div className="blog-card-icon-wrapper">{article.icon}</div>
              <h3 className="blog-card-title" itemProp="headline">
                {article.title}
              </h3>
              <p className="blog-card-excerpt" itemProp="description">
                {article.excerpt}
              </p>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time dateTime={article.dateISO} itemProp="datePublished">
                    {article.date}
                  </time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {article.readTime}
                </span>
              </div>
              <span className="blog-card-cta" aria-label={`Read article: ${article.title}`}>
                Read Article
                <ChevronRight size={16} />
              </span>
            </MotionLink>
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
            <MotionLink
              key={article.id}
              to={`/blog/${article.slug}`}
              className="blog-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              itemScope
              itemType="https://schema.org/Article"
            >
              <div className="blog-card-header">
                <span className="blog-card-category" itemProp="articleSection">
                  {article.category}
                </span>
              </div>
              <div className="blog-card-icon-wrapper">{article.icon}</div>
              <h3 className="blog-card-title" itemProp="headline">
                {article.title}
              </h3>
              <p className="blog-card-excerpt" itemProp="description">
                {article.excerpt}
              </p>
              <div className="blog-card-meta">
                <span className="blog-card-meta-item">
                  <Calendar size={14} />
                  <time dateTime={article.dateISO} itemProp="datePublished">
                    {article.date}
                  </time>
                </span>
                <span className="blog-card-meta-item">
                  <Clock size={14} />
                  {article.readTime}
                </span>
              </div>
              <span className="blog-card-cta" aria-label={`Read article: ${article.title}`}>
                Read Article
                <ChevronRight size={16} />
              </span>
            </MotionLink>
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
              <MotionLink
                key={article.year}
                to={`/blog/${article.slug}`}
                className="yearly-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <h3 className="yearly-card-year">{article.year}</h3>
                <div className="yearly-card-stats">
                  <div className="yearly-card-stat">
                    <div className="yearly-card-stat-value">
                      {formatYearlyCurrency(yearData?.totalAmount || 0)}
                    </div>
                    <div className="yearly-card-stat-label">Total Fines</div>
                  </div>
                  <div className="yearly-card-stat">
                    <div className="yearly-card-stat-value">{yearData?.totalFines || 0}</div>
                    <div className="yearly-card-stat-label">Actions</div>
                  </div>
                </div>
                <p className="yearly-card-highlight">
                  Largest: {yearData?.largestFine.firm.split(' ').slice(0, 3).join(' ')} -
                  {' '}
                  {formatYearlyCurrency(yearData?.largestFine.amount || 0)}
                </p>
              </MotionLink>
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
            <li><strong>FCA fines 2026</strong> - This year's enforcement actions</li>
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
            Access our interactive dashboard to search all FCA fines from 2013-2026.
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
