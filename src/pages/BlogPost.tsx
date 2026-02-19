import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import {
  Calendar,
  Clock,
  ChevronLeft,
  ExternalLink,
  Briefcase,
  BarChart3,
} from 'lucide-react';
import { useSEO, injectStructuredData } from '../hooks/useSEO';
import { blogArticles, yearlyArticles } from '../data/blogArticles.js';
import type { BlogArticleMeta, YearlyArticleMeta } from '../data/blogArticles.js';
import { getFaqsForArticle, getFaqsForYearlyArticle, generateFaqSchema } from '../data/faqData';
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
  Q1_2026_EnforcementChart,
  Enforcement2026BreakdownChart,
  InsuranceFinesChart,
  InsuranceBreachChart,
  InsuranceTrendChart,
  Jan2026EnforcementChart,
  HistoricalJanuaryChart,
  EnforcementTrendOutlookChart,
  EnforcementPriorityChart,
  HistoricalFebruaryChart,
  Feb2026ThemesChart,
  IndividualVsFirmChart,
  TopIndividualFinesChart,
  IndividualActionTypesChart,
} from '../components/MainArticleCharts';
import '../styles/blog.css';

// Helper function to format currency (same as Blog.tsx)
const formatYearlyCurrency = (amount: number): string => {
  if (amount >= 1_000_000_000) {
    return `£${(amount / 1_000_000_000).toFixed(2)}bn`;
  }
  if (amount >= 1_000_000) {
    return `£${(amount / 1_000_000).toFixed(0)}m`;
  }
  return `£${(amount / 1_000).toFixed(0)}k`;
};

// Related articles mapping for internal linking
const RELATED_ARTICLES: Record<string, string[]> = {
  '20-biggest-fca-fines-of-all-time': ['fca-fines-banks-complete-list', 'fca-enforcement-trends-2013-2025'],
  'fca-fines-2025-complete-list': ['fca-enforcement-trends-2013-2025', '20-biggest-fca-fines-of-all-time'],
  'fca-fines-database-how-to-search': ['fca-final-notices-explained', '20-biggest-fca-fines-of-all-time'],
  'fca-aml-fines-anti-money-laundering': ['fca-fines-banks-complete-list', '20-biggest-fca-fines-of-all-time'],
  'fca-fines-banks-complete-list': ['20-biggest-fca-fines-of-all-time', 'fca-aml-fines-anti-money-laundering'],
  'fca-enforcement-trends-2013-2025': ['20-biggest-fca-fines-of-all-time', 'fca-fines-2025-complete-list'],
  'fca-final-notices-explained': ['fca-fines-database-how-to-search', 'senior-managers-regime-fca-fines'],
  'senior-managers-regime-fca-fines': ['fca-fines-individuals-personal-accountability', 'fca-final-notices-explained'],
  'fca-fines-january-2026': ['fca-fines-february-2026', 'fca-enforcement-outlook-february-2026'],
  'fca-enforcement-outlook-february-2026': ['fca-fines-february-2026', 'fca-fines-january-2026'],
  'fca-fines-february-2026': ['fca-fines-january-2026', 'fca-fines-march-2026'],
  'fca-fines-individuals-personal-accountability': ['senior-managers-regime-fca-fines', 'fca-final-notices-explained'],
  'fca-fines-march-2026': ['fca-fines-february-2026', 'fca-fines-january-2026'],
  'fca-fines-insurance-sector': ['fca-fines-banks-complete-list', 'fca-aml-fines-anti-money-laundering'],
};

function RelatedArticles({ currentSlug }: { currentSlug: string }) {
  const relatedSlugs = RELATED_ARTICLES[currentSlug] || [];
  const related = relatedSlugs
    .map(slug => blogArticles.find(a => a.slug === slug))
    .filter((a): a is BlogArticleMeta => !!a);

  if (related.length === 0) return null;

  return (
    <nav className="related-articles" aria-label="Related articles">
      <h3 className="related-articles__title">Related Articles</h3>
      <div className="related-articles__grid">
        {related.map(article => (
          <Link key={article.slug} to={`/blog/${article.slug}`} className="related-articles__card">
            <span className="related-articles__category">{article.category}</span>
            <span className="related-articles__headline">{article.title}</span>
            <span className="related-articles__meta">{article.date} &middot; {article.readTime}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function RelatedYearlyArticles({ currentYear }: { currentYear: number }) {
  const adjacent = yearlyArticles
    .filter(a => Math.abs(a.year - currentYear) === 1)
    .sort((a, b) => b.year - a.year);

  const trendsArticle = blogArticles.find(a => a.slug === 'fca-enforcement-trends-2013-2025');
  const items: Array<{ slug: string; title: string; category: string; meta: string }> = [];

  for (const a of adjacent) {
    items.push({ slug: a.slug, title: a.title, category: 'Annual Analysis', meta: `${a.year} Review` });
  }
  if (trendsArticle) {
    items.push({ slug: trendsArticle.slug, title: trendsArticle.title, category: trendsArticle.category, meta: trendsArticle.date });
  }

  if (items.length === 0) return null;

  return (
    <nav className="related-articles" aria-label="Related articles">
      <h3 className="related-articles__title">Related Articles</h3>
      <div className="related-articles__grid">
        {items.map(item => (
          <Link key={item.slug} to={`/blog/${item.slug}`} className="related-articles__card">
            <span className="related-articles__category">{item.category}</span>
            <span className="related-articles__headline">{item.title}</span>
            <span className="related-articles__meta">{item.meta}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function renderMarkdownContent(content: string) {
  return content
    .replace(/(\|.+\|\n)+/g, (tableBlock) => {
      const rows = tableBlock.trim().split('\n');
      let html = '<table><thead>';
      let inBody = false;
      rows.forEach((row) => {
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
    .replace(/\n\n/g, '</p><p>');
}

function clampToToday(dateISO: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return dateISO > today ? today : dateISO;
}

function generateArticleSchema(article: BlogArticleMeta | YearlyArticleMeta) {
  const isYearly = 'year' in article;
  const slug = article.slug;
  const dateModified = isYearly ? clampToToday(`${article.year}-12-31`) : article.dateISO;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": article.seoTitle,
    "description": article.excerpt,
    "datePublished": isYearly ? `${article.year}-01-01` : article.dateISO,
    "dateModified": dateModified,
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
      "@id": `https://fcafines.memaconsultants.com/blog/${slug}`
    },
    "keywords": article.keywords.join(", "),
    "image": "https://fcafines.memaconsultants.com/og-image.png",
  };
}

function BlogArticlePage({ article }: { article: BlogArticleMeta }) {
  const navigate = useNavigate();
  const articleFaqs = getFaqsForArticle(article.slug);

  useSEO({
    title: article.seoTitle,
    description: article.excerpt,
    keywords: article.keywords.join(', '),
    canonicalPath: `/blog/${article.slug}`,
    ogType: 'article',
    articlePublishedTime: article.dateISO,
    articleModifiedTime: article.dateISO,
    articleSection: article.category,
    articleTags: article.keywords,
  });

  useEffect(() => {
    const cleanup = injectStructuredData(generateArticleSchema(article));
    return cleanup;
  }, [article]);

  // Inject second JSON-LD block for FAQPage schema (alongside Article schema)
  useEffect(() => {
    if (articleFaqs.length === 0) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-faq-ld', 'true');
    script.textContent = JSON.stringify(generateFaqSchema(articleFaqs));
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [article.slug]);

  return (
    <div className="blog-page">
      <div className="blog-post-container">
        <nav className="blog-post-nav">
          <Link to="/blog" className="blog-post-back">
            <ChevronLeft size={18} />
            Back to Blog
          </Link>
        </nav>

        <article className="blog-article-modal" itemScope itemType="https://schema.org/Article">
          <h1 className="blog-post-title" itemProp="headline">{article.title}</h1>

          <div className="blog-article-modal-header">
            <span className="blog-card-category" itemProp="articleSection">{article.category}</span>
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
          </div>

          <div
            className="blog-article-content"
            itemProp="articleBody"
            dangerouslySetInnerHTML={{ __html: renderMarkdownContent(article.content) }}
          />

          {/* Article-specific charts */}
          {article.id === 'largest-fca-fines-history' && (
            <div className="article-charts-section">
              <Top20FinesChart />
              <Top20BreachTypesChart />
            </div>
          )}

          {article.id === 'fca-fines-2025' && (
            <div className="article-charts-section">
              <Fines2025MonthlyChart />
              <Fines2025BreachChart />
            </div>
          )}

          {article.id === 'fca-fines-database-guide' && (
            <div className="article-charts-section">
              <CumulativeFinesChart />
            </div>
          )}

          {article.id === 'fca-aml-fines' && (
            <div className="article-charts-section">
              <AMLFinesChart />
              <AMLTrendChart />
            </div>
          )}

          {article.id === 'fca-fines-banks' && (
            <div className="article-charts-section">
              <BankFinesComparisonChart />
            </div>
          )}

          {article.id === 'fca-enforcement-trends' && (
            <div className="article-charts-section">
              <AllYearsEnforcementChart />
            </div>
          )}

          {article.id === 'fca-final-notices' && (
            <div className="article-charts-section">
              <FinalNoticesBreakdownChart />
            </div>
          )}

          {article.id === 'senior-managers-regime-fines' && (
            <div className="article-charts-section">
              <SMCREnforcementChart />
            </div>
          )}

          {article.id === 'fca-fines-january-2026' && (
            <div className="article-charts-section">
              <Jan2026EnforcementChart />
              <HistoricalJanuaryChart />
            </div>
          )}

          {article.id === 'fca-enforcement-outlook-february-2026' && (
            <div className="article-charts-section">
              <EnforcementTrendOutlookChart />
              <EnforcementPriorityChart />
            </div>
          )}

          {article.id === 'fca-fines-february-2026' && (
            <div className="article-charts-section">
              <HistoricalFebruaryChart />
              <Feb2026ThemesChart />
            </div>
          )}

          {article.id === 'fca-fines-individuals' && (
            <div className="article-charts-section">
              <IndividualVsFirmChart />
              <TopIndividualFinesChart />
              <IndividualActionTypesChart />
            </div>
          )}

          {article.id === 'fca-fines-march-2026' && (
            <div className="article-charts-section">
              <Q1_2026_EnforcementChart />
              <Enforcement2026BreakdownChart />
            </div>
          )}

          {article.id === 'fca-fines-insurance' && (
            <div className="article-charts-section">
              <InsuranceFinesChart />
              <InsuranceBreachChart />
              <InsuranceTrendChart />
            </div>
          )}

          {/* FAQ Section — question-based H2s for PAA extraction */}
          {articleFaqs.length > 0 && (
            <div className="article-faq-section">
              <div className="article-faq-badge">FAQ</div>
              <div className="blog-article-content">
                {articleFaqs.map(faq => (
                  <div key={faq.slug} id={faq.slug} className="faq-item">
                    <h2 className="faq-question">{faq.question}</h2>
                    <p>{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <RelatedArticles currentSlug={article.slug} />

          <div className="blog-article-modal-footer">
            <p className="blog-article-keywords">
              <strong>Related searches:</strong> {article.keywords.join(', ')}
            </p>
            <button
              className="blog-cta-button"
              onClick={() => navigate('/dashboard')}
            >
              Explore FCA Fines Dashboard
              <ExternalLink size={18} />
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}

function YearlyArticlePage({ article }: { article: YearlyArticleMeta }) {
  const navigate = useNavigate();
  const yearlyFaqs = getFaqsForYearlyArticle(article.year);

  useSEO({
    title: article.seoTitle,
    description: article.excerpt,
    keywords: article.keywords.join(', '),
    canonicalPath: `/blog/${article.slug}`,
    ogType: 'article',
    articlePublishedTime: `${article.year}-01-01`,
    articleModifiedTime: clampToToday(`${article.year}-12-31`),
    articleSection: 'Annual Analysis',
    articleTags: article.keywords,
  });

  useEffect(() => {
    const cleanup = injectStructuredData(generateArticleSchema(article));
    return cleanup;
  }, [article]);

  // Inject FAQPage JSON-LD for yearly review
  useEffect(() => {
    if (yearlyFaqs.length === 0) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-faq-ld', 'true');
    script.textContent = JSON.stringify(generateFaqSchema(yearlyFaqs));
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [article.year]);

  return (
    <div className="blog-page">
      <div className="blog-post-container">
        <nav className="blog-post-nav">
          <Link to="/blog" className="blog-post-back">
            <ChevronLeft size={18} />
            Back to Blog
          </Link>
        </nav>

        <article className="blog-article-modal" itemScope itemType="https://schema.org/Article">
          <h1 className="blog-post-title" itemProp="headline">{article.title}</h1>

          <div className="blog-article-modal-header">
            <span className="blog-card-category">
              <BarChart3 size={14} style={{ marginRight: '0.375rem' }} />
              Annual Analysis
            </span>
            <div className="blog-card-meta">
              <span className="blog-card-meta-item">
                <Calendar size={14} />
                <time>{article.year} Review</time>
              </span>
              <span className="blog-card-meta-item">
                <Clock size={14} />
                15 min read
              </span>
            </div>
          </div>

          <div className="blog-article-content" itemProp="articleBody">
            {/* Stats Summary */}
            {yearlyFCAData[article.year] && (
              <div className="stats-summary-row">
                <div className="stats-summary-item">
                  <div className="stats-summary-value">
                    {formatYearlyCurrency(yearlyFCAData[article.year].totalAmount)}
                  </div>
                  <div className="stats-summary-label">Total Fines</div>
                </div>
                <div className="stats-summary-item">
                  <div className="stats-summary-value">
                    {yearlyFCAData[article.year].totalFines}
                  </div>
                  <div className="stats-summary-label">Actions</div>
                </div>
                <div className="stats-summary-item">
                  <div className="stats-summary-value">
                    {formatYearlyCurrency(yearlyFCAData[article.year].avgFine)}
                  </div>
                  <div className="stats-summary-label">Average Fine</div>
                </div>
                <div className="stats-summary-item">
                  <div className="stats-summary-value">
                    {formatYearlyCurrency(yearlyFCAData[article.year].largestFine.amount)}
                  </div>
                  <div className="stats-summary-label">Largest Fine</div>
                </div>
              </div>
            )}

            <h2>Executive Summary</h2>
            {article.executiveSummary.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}

            {/* Monthly Enforcement Chart */}
            {yearlyFCAData[article.year] && (
              <MonthlyFinesChart
                data={yearlyFCAData[article.year].monthlyData}
                year={article.year}
              />
            )}

            <h2>Regulatory Context</h2>
            {article.regulatoryContext.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}

            {/* Key Insights Box */}
            <div className="article-key-insights">
              <h4>Key Enforcement Themes - {article.year}</h4>
              <ul>
                {article.keyEnforcementThemes.map((theme, i) => (
                  <li key={i}>{theme}</li>
                ))}
              </ul>
            </div>

            {/* Breach Category and Top Firms Charts */}
            {yearlyFCAData[article.year] && (
              <div className="yearly-charts-grid">
                <BreachCategoryChart
                  data={yearlyFCAData[article.year].breachData}
                  year={article.year}
                />
                <TopFirmsChart
                  data={yearlyFCAData[article.year].topFirms}
                  year={article.year}
                />
              </div>
            )}

            {/* Professional Insight Box */}
            <div className="professional-analysis">
              <h4>
                <Briefcase size={18} />
                Professional Analysis
              </h4>
              {article.professionalInsight.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            <h2>Looking Ahead</h2>
            {article.lookingAhead.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}

            {/* Year Comparison Chart */}
            {article.year >= 2015 && (
              <YearOverYearChart
                years={[2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].filter(y => y <= article.year)}
              />
            )}
          </div>

          {/* FAQ Section — question-based H2s for PAA extraction */}
          {yearlyFaqs.length > 0 && (
            <div className="article-faq-section">
              <div className="article-faq-badge">FAQ</div>
              <div className="blog-article-content">
                {yearlyFaqs.map(faq => (
                  <div key={faq.slug} id={faq.slug} className="faq-item">
                    <h2 className="faq-question">{faq.question}</h2>
                    <p>{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <RelatedYearlyArticles currentYear={article.year} />

          <div className="blog-article-modal-footer">
            <p className="blog-article-keywords">
              <strong>Related searches:</strong> {article.keywords.join(', ')}
            </p>
            <button
              className="blog-cta-button"
              onClick={() => navigate('/dashboard')}
            >
              Explore FCA Fines Dashboard
              <ExternalLink size={18} />
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="blog-page">
      <div className="blog-post-container">
        <nav className="blog-post-nav">
          <Link to="/blog" className="blog-post-back">
            <ChevronLeft size={18} />
            Back to Blog
          </Link>
        </nav>
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <h1>Article Not Found</h1>
          <p>The article you're looking for doesn't exist.</p>
          <Link to="/blog" className="blog-cta-button" style={{ display: 'inline-flex', marginTop: '1.5rem' }}>
            Browse All Articles
          </Link>
        </div>
      </div>
    </div>
  );
}

export function BlogPost() {
  const { slug } = useParams<{ slug: string }>();

  // Look up in both blog articles and yearly articles
  const blogArticle = blogArticles.find(a => a.slug === slug);
  const yearlyArticle = yearlyArticles.find(a => a.slug === slug);

  if (blogArticle) {
    return <BlogArticlePage article={blogArticle} />;
  }

  if (yearlyArticle) {
    return <YearlyArticlePage article={yearlyArticle} />;
  }

  return <NotFoundPage />;
}
