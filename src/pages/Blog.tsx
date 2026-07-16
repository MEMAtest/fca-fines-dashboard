import { motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bookmark,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Grid2X2,
  Landmark,
  List,
  Mail,
  PoundSterling,
  Scale,
  Search,
  Shield,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { DigestSubscribeForm } from "../components/DigestSubscribeForm.js";
import { yearlyFCAData } from "../components/YearlyArticleCharts.js";
import {
  getPublishedBlogArticles,
  getPublishedYearlyArticles,
} from "../data/blogArticles.js";
import type { BlogArticleMeta } from "../data/blogArticles.js";
import { LIVE_REGULATOR_NAV_ITEMS } from "../data/regulatorCoverage.js";
import { injectStructuredData, useSEO } from "../hooks/useSEO.js";
import { REGULATOR_COUNT } from "../constants/site.js";
import "../styles/blog.css";

interface BlogArticle extends BlogArticleMeta {
  icon: React.ReactNode;
}

type SortMode = "latest" | "oldest";
type ViewMode = "grid" | "list";

interface TopicPathwayLink {
  label: string;
  description: string;
  to?: string;
  href?: string;
}

interface TopicPathway {
  title: string;
  description: string;
  icon: React.ReactNode;
  links: TopicPathwayLink[];
}

interface FilterOption {
  label: string;
  value: string;
  count: number;
}

const MotionLink = motion.create(Link);
const LIVE_REGULATOR_COUNT = LIVE_REGULATOR_NAV_ITEMS.length;
const blogArticlesMeta = getPublishedBlogArticles();
const yearlyArticlesMeta = getPublishedYearlyArticles();

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
  "fca-fines-april-2026": <Scale className="blog-card-icon" />,
  "dora-enforcement-18-months": <Shield className="blog-card-icon" />,
  "payments-firms-fca-aml-enforcement": <Building2 className="blog-card-icon" />,
  "fca-vs-sec-enforcement-differences": <Scale className="blog-card-icon" />,
  "fca-fines-may-2026": <PoundSterling className="blog-card-icon" />,
  "consumer-duty-three-years-enforcement": <Users className="blog-card-icon" />,
  "wealth-managers-consumer-duty-enforcement": (
    <Landmark className="blog-card-icon" />
  ),
  "sanctions-enforcement-ofsi-ofac-eu": (
    <AlertTriangle className="blog-card-icon" />
  ),
  "crypto-firms-global-enforcement-mica-fca-mas": (
    <Scale className="blog-card-icon" />
  ),
  "bafin-vs-fca-uk-german-firms": <Scale className="blog-card-icon" />,
  "fca-fines-insurance": <Shield className="blog-card-icon" />,
  "fca-enforcement-guide": <Landmark className="blog-card-icon" />,
  "bafin-enforcement-guide": <Landmark className="blog-card-icon" />,
  "amf-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cnmv-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cbi-enforcement-guide": <Landmark className="blog-card-icon" />,
  "sfc-enforcement-guide": <Landmark className="blog-card-icon" />,
  "afm-enforcement-guide": <Landmark className="blog-card-icon" />,
  "dnb-enforcement-guide": <Landmark className="blog-card-icon" />,
  "esma-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cvm-enforcement-guide": <Landmark className="blog-card-icon" />,
  "fdic-enforcement-guide": <Landmark className="blog-card-icon" />,
  "frb-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cnbv-enforcement-guide": <Landmark className="blog-card-icon" />,
  "cmf-enforcement-guide": <Landmark className="blog-card-icon" />,
  "finma-enforcement-guide": <Landmark className="blog-card-icon" />,
  "sesc-enforcement-guide": <Landmark className="blog-card-icon" />,
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

const blogArticles: BlogArticle[] = blogArticlesMeta.map((article) => ({
  ...article,
  icon: iconMap[article.id] || <Scale className="blog-card-icon" />,
}));

const REGULATOR_FILTERS = [
  "FCA",
  "SEC",
  "BaFin",
  "AMF",
  "SFC",
  "FinCEN",
  "OFSI",
  "OFAC",
  "ESMA",
  "MAS",
  "PRA",
  "Bank of England",
];

const QUICK_FILTERS: Array<{
  label: string;
  updates: Record<string, string | null>;
}> = [
  { label: "All", updates: { q: null, month: null, category: null } },
  { label: "June 2026", updates: { month: "2026-06", q: null } },
  { label: "July 2026", updates: { month: "2026-07", q: null } },
  {
    label: "FCA Fines 2026",
    updates: { category: "FCA Fines 2026", q: null },
  },
  { label: "Consumer Duty", updates: { q: "consumer duty", month: null } },
  { label: "Payments/AML", updates: { q: "payments aml", month: null } },
  { label: "Cross-regulator", updates: { q: "vs enforcement", month: null } },
];

const TRENDING_TOPICS = [
  { label: "Individual Accountability", terms: ["individual", "smcr", "senior manager"] },
  { label: "Consumer Duty", terms: ["consumer duty", "fair value"] },
  { label: "Payments & AML", terms: ["payments", "aml", "anti-money"] },
  { label: "Market Abuse", terms: ["market abuse", "insider", "manipulation"] },
  { label: "Governance & Culture", terms: ["governance", "culture", "board"] },
];

const TOPIC_PATHWAYS: TopicPathway[] = [
  {
    title: "FCA fines and enforcement",
    description:
      "Move from monthly FCA commentary into the live regulator hub and source-backed enforcement records.",
    icon: <Scale className="insights-pathway-icon" />,
    links: [
      {
        label: "FCA fines 2026 cluster",
        description: "Follow the monthly FCA enforcement pathway.",
        to: "/topics/fca-fines-2026",
      },
      {
        label: "FCA regulator hub",
        description: "Open the live FCA data workspace.",
        to: "/regulators/fca",
      },
      {
        label: "FCA fines May 2026",
        description: "Read the latest monthly FCA fines analysis.",
        to: "/blog/fca-fines-may-2026",
      },
    ],
  },
  {
    title: "AML and financial crime controls",
    description:
      "Connect payments, sanctions, and money-laundering analysis into practical control review material.",
    icon: <AlertTriangle className="insights-pathway-icon" />,
    links: [
      {
        label: "AML enforcement cluster",
        description: "Start with the complete AML pathway.",
        to: "/topics/aml-enforcement",
      },
      {
        label: "Global AML comparison",
        description: "Compare AML enforcement themes across regulators.",
        to: "/blog/global-aml-enforcement-comparison-2026",
      },
      {
        label: "FCA AML fines",
        description: "Review the FCA-specific AML enforcement record.",
        to: "/blog/fca-aml-fines-anti-money-laundering",
      },
      {
        label: "Board AML controls",
        description: "Translate AML findings into board-level prompts.",
        to: "/blog/board-guide-aml-controls-global-enforcement",
      },
    ],
  },
  {
    title: "Consumer Duty and accountability",
    description:
      "Use individual-accountability and Consumer Duty insight to spot governance and conduct-risk signals.",
    icon: <Users className="insights-pathway-icon" />,
    links: [
      {
        label: "Consumer Duty cluster",
        description: "Open the customer-outcomes pathway.",
        to: "/topics/consumer-duty-enforcement",
      },
      {
        label: "Consumer Duty three years in",
        description: "Track how the regime is becoming enforceable.",
        to: "/blog/consumer-duty-three-years-enforcement",
      },
      {
        label: "Wealth managers and Consumer Duty",
        description: "See where advice and suitability risk is emerging.",
        to: "/blog/wealth-managers-consumer-duty-enforcement",
      },
      {
        label: "Individual accountability",
        description: "Review personal fines, bans, and SM&CR themes.",
        to: "/blog/fca-fines-individuals-personal-accountability",
      },
    ],
  },
  {
    title: "Market abuse and disclosure",
    description:
      "Connect insider dealing, disclosure, surveillance, and market integrity analysis across regulators.",
    icon: <TrendingUp className="insights-pathway-icon" />,
    links: [
      {
        label: "Market abuse cluster",
        description: "Open the market integrity pathway.",
        to: "/topics/market-abuse-enforcement",
      },
      {
        label: "Global market abuse comparison",
        description: "Compare FCA, SEC, AMF, SEBI, and SFC approaches.",
        to: "/blog/market-abuse-enforcement-global-comparison",
      },
      {
        label: "Search market abuse",
        description: "Find insider trading and manipulation records.",
        to: "/search?q=market%20abuse",
      },
    ],
  },
  {
    title: "Board and advisory workflows",
    description:
      "Turn enforcement themes into board packs, governance reviews, and advisory support for regulated firms.",
    icon: <BookOpen className="insights-pathway-icon" />,
    links: [
      {
        label: "Governance topic cluster",
        description: "Open the board reporting pathway.",
        to: "/topics/board-reporting-governance",
      },
      {
        label: "Create board pack",
        description: "Generate a board-ready enforcement pack.",
        to: "/board-pack",
      },
      {
        label: "Governance enforcement guide",
        description: "Read board accountability patterns across actions.",
        to: "/blog/board-guide-governance-accountability-enforcement",
      },
      {
        label: "MEMA compliance support",
        description: "Get implementation support for regulated firms.",
        href: "https://memaconsultants.com",
      },
    ],
  },
];

const ITEMS_PER_PAGE = 9;
const ALL_VALUE = "all";

const byNewestArticle = (left: BlogArticle, right: BlogArticle): number =>
  right.dateISO.localeCompare(left.dateISO) || left.title.localeCompare(right.title);

const byOldestArticle = (left: BlogArticle, right: BlogArticle): number =>
  left.dateISO.localeCompare(right.dateISO) || left.title.localeCompare(right.title);

const byNewestMeta = (left: BlogArticleMeta, right: BlogArticleMeta): number =>
  right.dateISO.localeCompare(left.dateISO) || left.title.localeCompare(right.title);

const normalize = (value: string): string => value.toLowerCase().trim();

const articleCorpus = (article: BlogArticleMeta): string =>
  normalize(
    [
      article.title,
      article.excerpt,
      article.category,
      article.slug,
      article.keywords.join(" "),
    ].join(" "),
  );

function inferContentType(article: BlogArticleMeta): string {
  const corpus = articleCorpus(article);
  if (article.articleType === "regulator" || corpus.includes("guide")) return "Guides";
  if (article.category === "Case Study" || corpus.includes("case")) return "Briefings";
  if (article.category.includes("Analysis") || article.category.includes("Benchmark")) {
    return "Articles";
  }
  return "Articles";
}

function detectRegulators(article: BlogArticleMeta): string[] {
  const corpus = articleCorpus(article);
  return REGULATOR_FILTERS.filter((regulator) =>
    corpus.includes(normalize(regulator)),
  );
}

function countMatches(
  articles: BlogArticle[],
  predicate: (article: BlogArticle) => boolean,
): number {
  return articles.filter(predicate).length;
}

function getCategoryOptions(articles: BlogArticle[]): FilterOption[] {
  return Array.from(new Set(articles.map((article) => article.category)))
    .map((category) => ({
      label: category,
      value: category,
      count: countMatches(articles, (article) => article.category === category),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 8);
}

function getYearOptions(articles: BlogArticle[]): FilterOption[] {
  return Array.from(new Set(articles.map((article) => article.dateISO.slice(0, 4))))
    .map((year) => ({
      label: year,
      value: year,
      count: countMatches(articles, (article) => article.dateISO.startsWith(year)),
    }))
    .sort((left, right) => right.value.localeCompare(left.value));
}

function getRegulatorOptions(articles: BlogArticle[]): FilterOption[] {
  return REGULATOR_FILTERS.map((regulator) => ({
    label: regulator,
    value: regulator,
    count: countMatches(articles, (article) =>
      detectRegulators(article).includes(regulator),
    ),
  }))
    .filter((option) => option.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function getTypeOptions(articles: BlogArticle[]): FilterOption[] {
  const types = Array.from(new Set(articles.map(inferContentType)));
  return types
    .map((type) => ({
      label: type,
      value: type,
      count: countMatches(articles, (article) => inferContentType(article) === type),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function getTopicCounts(articles: BlogArticle[]) {
  return TRENDING_TOPICS.map((topic) => ({
    ...topic,
    count: countMatches(articles, (article) =>
      topic.terms.some((term) => articleCorpus(article).includes(normalize(term))),
    ),
  }));
}

function formatYearlyCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `£${(amount / 1_000_000_000).toFixed(2)}bn`;
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(0)}m`;
  return `£${(amount / 1_000).toFixed(0)}k`;
}

function generateItemListSchema() {
  const allArticles = [
    ...[...blogArticlesMeta].sort(byNewestMeta),
    ...[...yearlyArticlesMeta].sort(byNewestMeta),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: allArticles.map((article, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `https://regactions.com/blog/${article.slug}`,
    })),
  };
}

function generateBlogListSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Regulatory Insights",
    description:
      "Expert analysis of global regulator enforcement trends, fines intelligence, and compliance guidance",
    url: "https://regactions.com/blog",
    publisher: {
      "@type": "Organization",
      name: "RegActions",
    },
    blogPost: [...blogArticles].sort(byNewestArticle).map((article) => ({
      "@type": "BlogPosting",
      headline: article.title,
      description: article.excerpt,
      datePublished: article.dateISO,
      url: `https://regactions.com/blog/${article.slug}`,
      author: {
        "@type": "Organization",
        name: "RegActions",
      },
    })),
  };
}

function FilterButton({
  option,
  active,
  onClick,
}: {
  option: FilterOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`insights-filter-option${active ? " insights-filter-option--active" : ""}`}
      onClick={onClick}
    >
      <span>{option.label}</span>
      <span>{option.count}</span>
    </button>
  );
}

function ArticleCard({
  article,
  index,
  viewMode,
}: {
  article: BlogArticle;
  index: number;
  viewMode: ViewMode;
}) {
  return (
    <MotionLink
      key={article.id}
      to={`/blog/${article.slug}`}
      className={`blog-card insights-article-card${viewMode === "list" ? " insights-article-card--list" : ""}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2) }}
      itemScope
      itemType="https://schema.org/Article"
    >
      <div className="blog-card-header">
        <span className="blog-card-category" itemProp="articleSection">
          {article.category}
        </span>
        {article.featured && <span className="blog-card-featured-badge">Featured</span>}
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
        Read article
        <ChevronRight size={16} />
      </span>
    </MotionLink>
  );
}

export function Blog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const selectedMonth = searchParams.get("month") || ALL_VALUE;
  const selectedCategory = searchParams.get("category") || ALL_VALUE;
  const selectedRegulator = searchParams.get("regulator") || ALL_VALUE;
  const selectedType = searchParams.get("type") || ALL_VALUE;
  const selectedYear = searchParams.get("year") || ALL_VALUE;
  const sortMode: SortMode = searchParams.get("sort") === "oldest" ? "oldest" : "latest";
  const viewMode: ViewMode = searchParams.get("view") === "list" ? "list" : "grid";
  const currentPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const categoryOptions = useMemo(() => getCategoryOptions(blogArticles), []);
  const regulatorOptions = useMemo(() => getRegulatorOptions(blogArticles), []);
  const yearOptions = useMemo(() => getYearOptions(blogArticles), []);
  const typeOptions = useMemo(() => getTypeOptions(blogArticles), []);
  const topicCounts = useMemo(() => getTopicCounts(blogArticles), []);
  const julyCount = countMatches(blogArticles, (article) => article.dateISO.startsWith("2026-07"));
  const juneCount = countMatches(blogArticles, (article) => article.dateISO.startsWith("2026-06"));
  const featuredCount = countMatches(blogArticles, (article) => Boolean(article.featured));

  const filteredArticles = useMemo(() => {
    const terms = normalize(query)
      .split(/\s+/)
      .filter(Boolean);
    const filtered = blogArticles.filter((article) => {
      const corpus = articleCorpus(article);
      if (terms.length && !terms.every((term) => corpus.includes(term))) return false;
      if (selectedMonth !== ALL_VALUE && !article.dateISO.startsWith(selectedMonth)) return false;
      if (selectedYear !== ALL_VALUE && !article.dateISO.startsWith(selectedYear)) return false;
      if (selectedCategory !== ALL_VALUE && article.category !== selectedCategory) return false;
      if (selectedRegulator !== ALL_VALUE && !detectRegulators(article).includes(selectedRegulator)) {
        return false;
      }
      if (selectedType !== ALL_VALUE && inferContentType(article) !== selectedType) return false;
      return true;
    });
    return filtered.sort(sortMode === "oldest" ? byOldestArticle : byNewestArticle);
  }, [query, selectedMonth, selectedYear, selectedCategory, selectedRegulator, selectedType, sortMode]);

  const leadArticle = filteredArticles[0];
  const gridArticles = filteredArticles.slice(1);
  const totalPages = Math.max(1, Math.ceil(gridArticles.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedArticles = gridArticles.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );
  const hasActiveFilters = [
    query,
    selectedMonth !== ALL_VALUE ? selectedMonth : "",
    selectedCategory !== ALL_VALUE ? selectedCategory : "",
    selectedRegulator !== ALL_VALUE ? selectedRegulator : "",
    selectedType !== ALL_VALUE ? selectedType : "",
    selectedYear !== ALL_VALUE ? selectedYear : "",
  ].some(Boolean);

  const baseUrl = "https://regactions.com";
  const relNext =
    safePage < totalPages ? `${baseUrl}/blog?page=${safePage + 1}` : undefined;
  const relPrev =
    safePage > 1 ? `${baseUrl}/blog?page=${safePage - 1}` : undefined;

  useSEO({
    title: "Regulatory Insights | Global Enforcement Intelligence",
    description:
      "Search and filter RegActions insights on global regulator enforcement trends, FCA fines, Consumer Duty, AML, sanctions, market abuse, and cross-regulator compliance themes.",
    keywords:
      "regulatory insights, enforcement intelligence, FCA fines 2026, Consumer Duty enforcement, AML fines, sanctions enforcement, regulator analysis",
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

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === ALL_VALUE) next.delete(key);
      else next.set(key, value);
    });
    next.delete("page");
    setSearchParams(next);
  }

  function goToPage(page: number) {
    const next = new URLSearchParams(searchParams);
    if (page <= 1) next.delete("page");
    else next.set("page", String(page));
    setSearchParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams();
    if (sortMode !== "latest") next.set("sort", sortMode);
    if (viewMode !== "grid") next.set("view", viewMode);
    setSearchParams(next);
  }

  return (
    <div className="blog-page insights-page">
      <section className="insights-header" aria-labelledby="insights-heading">
        <div>
          <p className="insights-eyebrow">Research</p>
          <h1 id="insights-heading">Regulatory Insights</h1>
          <p className="blog-hero-subtitle">
            Expert analysis and intelligence on regulatory enforcement, fines,
            supervisory action, and compliance trends across{" "}
            <strong>{REGULATOR_COUNT}</strong> global regulators.
          </p>
        </div>
        <div className="insights-header__metrics" aria-label="Insights coverage">
          <span>{blogArticles.length} insights</span>
          <span>{LIVE_REGULATOR_COUNT} live regulators</span>
          <span>{juneCount + julyCount} June/July reads</span>
        </div>
      </section>

      <section className="insights-toolbar" aria-label="Insights search and shortcuts">
        <label className="insights-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search insights</span>
          <input
            value={query}
            onChange={(event) => updateParams({ q: event.target.value })}
            placeholder="Search insights, topics or regulators..."
            type="search"
          />
          {query && (
            <button
              type="button"
              className="insights-search__clear"
              onClick={() => updateParams({ q: null })}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </label>
        <div className="insights-quick-filters" aria-label="Quick filters">
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              className="insights-chip"
              onClick={() => updateParams(filter.updates)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <main className="insights-shell">
        <aside className="insights-sidebar" aria-label="Insights filters">
          <div className="insights-panel insights-panel--filters">
            <div className="insights-panel__header">
              <h2>
                <Filter size={16} />
                Filters
              </h2>
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters}>
                  Clear all
                </button>
              )}
            </div>

            <div className="insights-filter-group">
              <h3>Category</h3>
              <FilterButton
                option={{ label: "All categories", value: ALL_VALUE, count: blogArticles.length }}
                active={selectedCategory === ALL_VALUE}
                onClick={() => updateParams({ category: null })}
              />
              {categoryOptions.map((option) => (
                <FilterButton
                  key={option.value}
                  option={option}
                  active={selectedCategory === option.value}
                  onClick={() => updateParams({ category: option.value })}
                />
              ))}
            </div>

            <div className="insights-filter-group">
              <h3>Regulator</h3>
              <FilterButton
                option={{ label: "All regulators", value: ALL_VALUE, count: blogArticles.length }}
                active={selectedRegulator === ALL_VALUE}
                onClick={() => updateParams({ regulator: null })}
              />
              {regulatorOptions.slice(0, 8).map((option) => (
                <FilterButton
                  key={option.value}
                  option={option}
                  active={selectedRegulator === option.value}
                  onClick={() => updateParams({ regulator: option.value })}
                />
              ))}
            </div>

            <div className="insights-filter-group">
              <h3>Year</h3>
              <FilterButton
                option={{ label: "All years", value: ALL_VALUE, count: blogArticles.length }}
                active={selectedYear === ALL_VALUE}
                onClick={() => updateParams({ year: null })}
              />
              {yearOptions.map((option) => (
                <FilterButton
                  key={option.value}
                  option={option}
                  active={selectedYear === option.value}
                  onClick={() => updateParams({ year: option.value, month: null })}
                />
              ))}
            </div>

            <div className="insights-filter-group">
              <h3>Content type</h3>
              <FilterButton
                option={{ label: "All content", value: ALL_VALUE, count: blogArticles.length }}
                active={selectedType === ALL_VALUE}
                onClick={() => updateParams({ type: null })}
              />
              {typeOptions.map((option) => (
                <FilterButton
                  key={option.value}
                  option={option}
                  active={selectedType === option.value}
                  onClick={() => updateParams({ type: option.value })}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="insights-main" aria-labelledby="latest-heading">
          {leadArticle ? (
            <MotionLink
              to={`/blog/${leadArticle.slug}`}
              className="blog-card blog-card--featured insights-lead-card"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              itemScope
              itemType="https://schema.org/Article"
            >
              <div className="insights-lead-card__content">
                <span className="blog-card-featured-badge">
                  <Bookmark size={14} />
                  Featured
                </span>
                <span className="blog-card-category" itemProp="articleSection">
                  {leadArticle.category}
                </span>
                <h2 id="latest-heading" itemProp="headline">
                  {leadArticle.title}
                </h2>
                <p itemProp="description">{leadArticle.excerpt}</p>
                <div className="blog-card-meta">
                  <span className="blog-card-meta-item">
                    <Calendar size={14} />
                    <time dateTime={leadArticle.dateISO} itemProp="datePublished">
                      {leadArticle.date}
                    </time>
                  </span>
                  <span className="blog-card-meta-item">
                    <Clock size={14} />
                    {leadArticle.readTime}
                  </span>
                  <span className="blog-card-meta-item">{inferContentType(leadArticle)}</span>
                </div>
                <span className="blog-card-cta">
                  Read article
                  <ChevronRight size={16} />
                </span>
              </div>
              <div className="insights-lead-card__visual" aria-hidden="true">
                {leadArticle.icon}
                <span>{leadArticle.dateISO.slice(0, 7)}</span>
              </div>
            </MotionLink>
          ) : (
            <div className="insights-empty-state">
              <h2>No insights match these filters</h2>
              <p>Clear filters or search for a broader enforcement topic.</p>
              <button type="button" onClick={clearFilters}>
                Clear all filters
              </button>
            </div>
          )}

          <div className="blog-section-header insights-results-heading">
            <h2>All Enforcement Intelligence</h2>
            <p>
              Browse source-led analysis across regulators, sectors, themes,
              jurisdictions and enforcement outcomes.
            </p>
          </div>

          <div className="insights-results-bar">
            <p>
              <strong>{filteredArticles.length}</strong> insights found
            </p>
            <div className="insights-results-controls">
              <label>
                Sort by
                <select
                  value={sortMode}
                  onChange={(event) => updateParams({ sort: event.target.value })}
                >
                  <option value="latest">Latest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </label>
              <div className="insights-view-toggle" aria-label="View mode">
                <button
                  type="button"
                  className={viewMode === "grid" ? "active" : ""}
                  onClick={() => updateParams({ view: "grid" })}
                  aria-label="Grid view"
                >
                  <Grid2X2 size={16} />
                </button>
                <button
                  type="button"
                  className={viewMode === "list" ? "active" : ""}
                  onClick={() => updateParams({ view: "list" })}
                  aria-label="List view"
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className={`blog-grid insights-grid insights-grid--${viewMode}`}>
            {paginatedArticles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                index={index}
                viewMode={viewMode}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="blog-pagination" aria-label="Blog articles pagination">
              <button
                className="blog-pagination__btn"
                disabled={safePage <= 1}
                onClick={() => goToPage(safePage - 1)}
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
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

        <aside className="insights-right-rail" aria-label="Insights intelligence modules">
          <div className="insights-panel">
            <h2>
              <TrendingUp size={18} />
              Trending topics
            </h2>
            <div className="insights-topic-list">
              {topicCounts.map((topic) => (
                <button
                  key={topic.label}
                  type="button"
                  onClick={() => updateParams({ q: topic.terms[0], month: null })}
                >
                  <span>{topic.label}</span>
                  <strong>{topic.count}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="insights-panel">
            <h2>
              <Activity size={18} />
              Regulatory pulse
            </h2>
            <div className="insights-pulse-list">
              <div>
                <strong>{julyCount}</strong>
                <span>July insights live</span>
              </div>
              <div>
                <strong>{juneCount}</strong>
                <span>June insights live</span>
              </div>
              <div>
                <strong>{featuredCount}</strong>
                <span>Featured analyses</span>
              </div>
            </div>
            <Link className="insights-panel-link" to="/regulators">
              View intelligence dashboard
              <ExternalLink size={14} />
            </Link>
          </div>

          <div className="insights-panel">
            <h2>
              <BookOpen size={18} />
              Board pack
            </h2>
            <p>
              Convert enforcement themes into board-ready context, risk prompts,
              and source-backed review packs.
            </p>
            <Link className="insights-panel-link" to="/board-pack">
              Build a board pack
              <ChevronRight size={14} />
            </Link>
          </div>

          <div className="insights-panel insights-panel--newsletter">
            <h2>
              <Mail size={18} />
              Stay ahead
            </h2>
            <DigestSubscribeForm
              compact
              defaultFrequency="weekly"
              source="insights_page_right_rail"
            />
          </div>
        </aside>
      </main>

      <section className="yearly-analysis-section" aria-labelledby="yearly-heading">
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

      <section className="blog-seo-section">
        <div className="blog-seo-content">
          <h2>About RegActions Enforcement Intelligence</h2>
          <p>
            <strong>RegActions</strong> tracks enforcement intelligence across{" "}
            <strong>{REGULATOR_COUNT}</strong> global financial regulators,
            including FCA, BaFin, SEC, AMF, SFC, MAS, and more.
          </p>
          <p>
            Use the <Link to="/regulators">interactive dashboard</Link> to search
            enforcement actions across regulators, filter by year, firm, breach
            category, and export data for compliance reporting.
          </p>
        </div>
      </section>

      <section className="insights-pathways" aria-labelledby="topic-pathways-heading">
        <div className="insights-pathways__header">
          <p className="insights-eyebrow">Topic pathways</p>
          <h2 id="topic-pathways-heading">Explore enforcement themes by use case</h2>
          <p>
            Start with the latest insight, then move into the underlying data,
            regulator hubs, board reporting, or advisory support.
          </p>
        </div>
        <div className="insights-pathways__grid">
          {TOPIC_PATHWAYS.map((pathway) => (
            <article className="insights-pathway-card" key={pathway.title}>
              <div className="insights-pathway-card__head">
                <span className="insights-pathway-card__icon" aria-hidden="true">
                  {pathway.icon}
                </span>
                <div>
                  <h3>{pathway.title}</h3>
                  <p>{pathway.description}</p>
                </div>
              </div>
              <ul className="insights-pathway-links">
                {pathway.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link to={link.to}>
                        <span>
                          <strong>{link.label}</strong>
                          <small>{link.description}</small>
                        </span>
                        <ChevronRight size={16} aria-hidden="true" />
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span>
                          <strong>{link.label}</strong>
                          <small>{link.description}</small>
                        </span>
                        <ExternalLink size={16} aria-hidden="true" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="blog-cta-section">
        <div className="blog-cta-content">
          <h2>Search the Complete Enforcement Database</h2>
          <p>
            Access regulator hubs and enforcement data across{" "}
            <strong>{REGULATOR_COUNT}</strong> global regulators from 2013-2026.
          </p>
          <Link className="blog-cta-button" to="/regulators">
            Explore All Regulators
            <ExternalLink size={18} />
          </Link>
        </div>
      </section>

      <footer className="blog-footer">
        <div className="blog-footer-content">
          <div className="blog-footer-brand">
            <p className="blog-footer-logo">RegActions</p>
            <p className="blog-footer-tagline">
              Global enforcement intelligence platform
            </p>
          </div>
          <nav className="blog-footer-nav" aria-label="Footer navigation">
            <Link to="/">Home</Link>
            <Link to="/regulators">Data</Link>
            <Link to="/blog">Insights</Link>
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
