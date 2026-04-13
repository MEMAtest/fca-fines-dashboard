import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
} from "lucide-react";
import { Blog3DVisualization } from "../components/Blog3DVisualization.js";
import { LazyVisible } from "../components/LazyVisible.js";
import { yearlyFCAData } from "../components/YearlyArticleCharts.js";
import {
  allBlogArticles as blogArticlesMeta,
  yearlyArticles as yearlyArticlesMeta,
} from "../data/blogArticles.js";
import type { BlogArticleMeta } from "../data/blogArticles.js";
import { LIVE_REGULATOR_NAV_ITEMS } from "../data/regulatorCoverage.js";
import { injectStructuredData, useSEO } from "../hooks/useSEO.js";
import "../styles/blog.css";
import "../styles/blog3d.css";

interface BlogArticle extends BlogArticleMeta {
  icon: React.ReactNode;
}

const MotionLink = motion.create(Link);
const LIVE_REGULATOR_COUNT = LIVE_REGULATOR_NAV_ITEMS.length;

// Map article IDs to their icons (JSX stays in this file)
const iconMap: Record<string, React.ReactNode> = {
  "largest-fca-fines-history": <Scale className="blog-card-icon" />,
  "fca-fines-2025": <PoundSterling className="blog-card-icon" />,
  "fca-fines-database-guide": <BookOpen className="blog-card-icon" />,
  "fca-aml-fines": <AlertTriangle className="blog-card-icon" />,
  "fca-fines-banks": <Building2 className="blog-card-icon" />,
  "fca-enforcement-trends": <TrendingUp className="blog-card-icon" />,
  "fca-final-notices": <Landmark className="blog-card-icon" />,
  "senior-managers-regime-fines": <Users className="blog-card-icon" />,
  "fca-fines-january-2026": <Scale className="blog-card-icon" />,
  "fca-enforcement-outlook-february-2026": (
    <TrendingUp className="blog-card-icon" />
  ),
  "fca-fines-february-2026": <PoundSterling className="blog-card-icon" />,
  "fca-fines-individuals": <Users className="blog-card-icon" />,
  "fca-fines-march-2026": <PoundSterling className="blog-card-icon" />,
  "fca-fines-insurance": <Shield className="blog-card-icon" />,
  // Regulator enforcement guides
  "fca-enforcement-guide": <Landmark className="blog-card-icon" />,
  "bafin-enforcement-guide": <Landmark className="blog-card-icon" />,
  "amf-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cnmv-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cbi-enforcement-guide": <Landmark className="blog-card-icon" />,
  "sfc-enforcement-guide": <Landmark className="blog-card-icon" />,
  "afm-enforcement-guide": <Landmark className="blog-card-icon" />,
  "dnb-enforcement-guide": <Landmark className="blog-card-icon" />,
  "esma-enforcement-guide": <Landmark className="blog-card-icon" />,
  // Phase 1 regulators (deployed 2026-03-29) - using ID pattern, not slug
  "cvm-enforcement-guide": <Landmark className="blog-card-icon" />,
  "fdic-enforcement-guide": <Landmark className="blog-card-icon" />,
  "frb-enforcement-guide": <Landmark className="blog-card-icon" />,
  // Phase 2 regulators
  "cnbv-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cmf-enforcement-guide": <Landmark className="blog-card-icon" />,
  "finma-enforcement-guide": <Landmark className="blog-card-icon" />,
  "sesc-enforcement-guide": <Landmark className="blog-card-icon" />,
  // Phase 3 regulators
  "twfsc-enforcement-guide": <Landmark className="blog-card-icon" />,
  "hkma-enforcement-guide": <Landmark className="blog-card-icon" />,
  "asic-enforcement-guide": <Landmark className="blog-card-icon" />,
  "mas-enforcement-guide": <Landmark className="blog-card-icon" />,
  "occ-enforcement-guide": <Landmark className="blog-card-icon" />,
  "fsca-enforcement-guide": <Landmark className="blog-card-icon" />,
  "fmanz-enforcement-guide": <Landmark className="blog-card-icon" />,
  "csrc-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cmasa-enforcement-guide": <Landmark className="blog-card-icon" />,
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
    ...blogArticlesMeta.filter((a) => a.featured),
    ...blogArticlesMeta.filter((a) => !a.featured),
    ...yearlyArticlesMeta,
  ];
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: allArticles.map((article, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `https://fcafines.memaconsultants.com/blog/${article.slug}`,
    })),
  };
}

function generateBlogListSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Regulatory Enforcement Insights & Analysis",
    description:
      "Expert analysis of global regulator enforcement trends, fines intelligence, and compliance guidance",
    url: "https://fcafines.memaconsultants.com/blog",
    publisher: {
      "@type": "Organization",
      name: "MEMA Consultants",
    },
    blogPost: blogArticles.map((article) => ({
      "@type": "BlogPosting",
      headline: article.title,
      description: article.excerpt,
      datePublished: article.dateISO,
      url: `https://fcafines.memaconsultants.com/blog/${article.slug}`,
      author: {
        "@type": "Organization",
        name: "MEMA Consultants",
      },
    })),
  };
}

const ITEMS_PER_PAGE = 6;

export function Blog() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(
    1,
    parseInt(searchParams.get("page") || "1", 10),
  );
  const regularSectionRef = useRef<HTMLElement>(null);

  const featuredArticles = blogArticles.filter((article) => article.featured);
  const regularArticles = blogArticles.filter((article) => !article.featured);
  const totalPages = Math.ceil(regularArticles.length / ITEMS_PER_PAGE);
  const safePage = Math.min(currentPage, totalPages);
  const paginatedArticles = regularArticles.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  const baseUrl = "https://fcafines.memaconsultants.com";
  const relNext =
    safePage < totalPages ? `${baseUrl}/blog?page=${safePage + 1}` : undefined;
  const relPrev =
    safePage > 1 ? `${baseUrl}/blog?page=${safePage - 1}` : undefined;

  useSEO({
    title:
      "Regulatory Enforcement Blog | FCA Benchmarks, Regulator Guides & Analysis",
    description:
      "Expert analysis of global regulator enforcement trends, fines intelligence, and compliance guidance. Covers major regulators including BaFin, SEC, FCA, AMF, CNMV, CBI, SFC, AFM, and DNB.",
    keywords:
      "regulatory enforcement blog, FCA fines analysis, regulator enforcement insights, BaFin guide, AMF guide, SFC guide, FCA compliance guide",
    canonicalPath: "/blog",
    ogType: "website",
    relNext,
    relPrev,
  });

  useEffect(() => {
    const cleanup = injectStructuredData(generateBlogListSchema());
    return cleanup;
  }, []);

  useEffect(() => {
    const cleanup = injectStructuredData(generateItemListSchema());
    return cleanup;
  }, []);

  function goToPage(page: number) {
    if (page === 1) {
      setSearchParams({});
    } else {
      setSearchParams({ page: String(page) });
    }
    regularSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

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
            <h1>Global Regulatory Enforcement Intelligence</h1>
            <p className="blog-hero-subtitle">
              In-depth analysis of enforcement trends, regulatory fines, and
              compliance intelligence across <strong>{REGULATOR_COUNT}</strong> global financial regulators.
            </p>
            <p className="blog-hero-stats">
              Tracking <strong>{LIVE_REGULATOR_COUNT} live regulators</strong> with
              comprehensive multi-regulator enforcement analysis
            </p>
          </motion.div>

          <div className="blog-hero-visualization">
            <LazyVisible
              rootMargin="0px"
              fallback={<div style={{ minHeight: 300 }} />}
            >
              <Blog3DVisualization />
            </LazyVisible>
          </div>
        </div>
      </section>

      {/* Featured Articles */}
      <section className="blog-section" aria-labelledby="featured-heading">
        <div className="blog-section-header">
          <h2 id="featured-heading">
            Featured: Major Enforcement Actions & 2026 Updates
          </h2>
          <p>
            Essential reading on significant regulatory penalties and
            enforcement trends
          </p>
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
              <span
                className="blog-card-cta"
                aria-label={`Read article: ${article.title}`}
              >
                Read Article
                <ChevronRight size={16} />
              </span>
            </MotionLink>
          ))}
        </div>
      </section>

      {/* All Articles */}
      <section
        className="blog-section blog-section--alt"
        aria-labelledby="all-articles-heading"
        ref={regularSectionRef}
      >
        <div className="blog-section-header">
          <h2 id="all-articles-heading">All Enforcement Intelligence</h2>
          <p>
            In-depth analysis of global enforcement trends, AML fines, regulatory
            penalties, and compliance insights
          </p>
        </div>

        <div className="blog-grid">
          {paginatedArticles.map((article, index) => (
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
              <span
                className="blog-card-cta"
                aria-label={`Read article: ${article.title}`}
              >
                Read Article
                <ChevronRight size={16} />
              </span>
            </MotionLink>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav
            className="blog-pagination"
            aria-label="Blog articles pagination"
          >
            <button
              className="blog-pagination__btn"
              disabled={safePage <= 1}
              onClick={() => goToPage(safePage - 1)}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                className={`blog-pagination__btn${page === safePage ? " blog-pagination__btn--active" : ""}`}
                onClick={() => goToPage(page)}
                aria-current={page === safePage ? "page" : undefined}
              >
                {page}
              </button>
            ))}
            <button
              className="blog-pagination__btn"
              disabled={safePage >= totalPages}
              onClick={() => goToPage(safePage + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>

      {/* Yearly Analysis Section */}
      <section
        className="yearly-analysis-section"
        aria-labelledby="yearly-heading"
      >
        <div className="blog-section-header">
          <h2 id="yearly-heading">
            FCA Fines by Year: Professional Analysis 2013-2025
          </h2>
          <p>
            In-depth regulatory analysis with data visualisations for each
            enforcement year
          </p>
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
                    <div className="yearly-card-stat-value">
                      {yearData?.totalFines || 0}
                    </div>
                    <div className="yearly-card-stat-label">Actions</div>
                  </div>
                </div>
                <p className="yearly-card-highlight">
                  Largest:{" "}
                  {yearData?.largestFine.firm.split(" ").slice(0, 3).join(" ")}{" "}
                  - {formatYearlyCurrency(yearData?.largestFine.amount || 0)}
                </p>
              </MotionLink>
            );
          })}
        </div>
      </section>

      {/* SEO Content Section */}
      <section className="blog-seo-section">
        <div className="blog-seo-content">
          <h2>About RegActions Enforcement Intelligence</h2>
          <p>
            <strong>RegActions</strong> is the most comprehensive multi-regulator
            enforcement intelligence platform, tracking <strong>{REGULATOR_COUNT}</strong> global financial
            regulators including FCA, BaFin, SEC, AMF, and more. Our database
            covers over <strong>£5 billion in enforcement actions</strong> across
            multiple jurisdictions.
          </p>
          <p>
            Use our <Link to="/regulators">interactive dashboard</Link> to search
            enforcement actions across all regulators, filter by year, firm, breach
            category, and export data for compliance reporting.
          </p>

          <h3>Most Searched Enforcement Topics</h3>
          <ul className="blog-seo-links">
            <li>
              <strong>Largest regulatory fines</strong> - The biggest penalties
              across global regulators
            </li>
            <li>
              <strong>Enforcement actions 2026</strong> - This year's regulatory
              penalties and trends
            </li>
            <li>
              <strong>AML fines</strong> - Anti-money laundering penalties across
              regulators
            </li>
            <li>
              <strong>Banking sector enforcement</strong> - Regulatory actions
              against financial institutions
            </li>
            <li>
              <strong>Enforcement notices</strong> - Official regulatory decisions
              and final notices
            </li>
          </ul>
        </div>
      </section>

      {/* CTA Section */}
      <section className="blog-cta-section">
        <div className="blog-cta-content">
          <h2>Search the Complete Enforcement Database</h2>
          <p>
            Access our interactive dashboard to search enforcement actions across
            <strong> {REGULATOR_COUNT}</strong> global regulators from 2013-2026. Filter by regulator, firm, year,
            amount, and breach category.
          </p>
          <button
            className="blog-cta-button"
            onClick={() => navigate("/regulators")}
          >
            Explore All Regulators
            <ExternalLink size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="blog-footer">
        <div className="blog-footer-content">
          <div className="blog-footer-brand">
            <p className="blog-footer-logo">FCA Fines Dashboard</p>
            <p className="blog-footer-tagline">
              The definitive FCA fines database | Powered by MEMA Consultants
            </p>
          </div>
          <nav className="blog-footer-nav" aria-label="Footer navigation">
            <Link to="/">Home</Link>
            <Link to="/regulators">Dashboard</Link>
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
