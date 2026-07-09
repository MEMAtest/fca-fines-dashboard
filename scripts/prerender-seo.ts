/**
 * Post-build SEO pre-rendering script.
 *
 * After `vite build`, this script:
 * 1. Reads dist/index.html as a template
 * 2. Generates an index.html for key routes with correct <head> meta
 * 3. Generates dist/sitemap.xml for crawlers
 * 4. Generates dist/rss.xml for feed readers
 *
 * Vercel serves static files before rewrites, so pre-rendered files are
 * served directly to crawlers with correct meta tags.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");

const BASE_URL = "https://regactions.com";
const SITE_NAME = "RegActions";
const OG_IMAGE = `${BASE_URL}/og-image.png`;
const RSS_URL = `${BASE_URL}/rss.xml`;
const GOOGLE_SITE_VERIFICATION =
  process.env.VITE_GOOGLE_SITE_VERIFICATION?.trim() || "";
const BING_SITE_VERIFICATION =
  process.env.VITE_BING_SITE_VERIFICATION?.trim() || "";

// ---------------------------------------------------------------------------
// Import article data (pure TS, no JSX)
// ---------------------------------------------------------------------------

// We can't import .ts directly (no bundler), so we require the compiled output.
// However since the project uses "type": "module" and ts-node/esm, the import
// resolves the .ts source directly.
import {
  getPublishedBlogArticles,
  getPublishedYearlyArticles,
} from "../src/data/blogArticles.js";
import {
  faqItems,
  getFaqsForArticle,
  getFaqsForYearlyArticle,
  getHomepageFaqs,
  generateFaqSchema,
} from "../src/data/faqData.js";

const blogArticles = getPublishedBlogArticles();
const yearlyArticles = getPublishedYearlyArticles();
import {
  REGULATOR_COVERAGE,
  PUBLIC_REGULATOR_CODES,
} from "../src/data/regulatorCoverage.js";
import { topicClusters } from "../src/data/topicClusters.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function clampISODate(value: string, maxValue: string): string {
  // Both should be YYYY-MM-DD. Lexicographic compare is OK.
  if (!value) return maxValue;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return maxValue;
  return value > maxValue ? maxValue : value;
}

function toRfc2822(valueISO: string, fallbackISO: string): string {
  const safe = clampISODate(valueISO, fallbackISO);
  const date = new Date(`${safe}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return new Date(`${fallbackISO}T00:00:00.000Z`).toUTCString();
  }
  return date.toUTCString();
}

function humanize(label: string) {
  return label
    .replace(/_/g, " ")
    .replace(/[-]+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

interface PageMeta {
  path: string; // e.g. '/blog/fca-fines-2025-complete-list'
  title: string;
  description: string;
  keywords: string;
  ogType: string; // 'website' | 'article'
  datePublished?: string;
  dateModified?: string;
  articleSection?: string;
  jsonLd?: object;
  extraJsonLd?: object[]; // Additional JSON-LD blocks (e.g. FAQPage alongside Article)
  breadcrumbLabel?: string; // Short name for last breadcrumb item (defaults to humanized slug)
  bodyContent?: string; // Pre-rendered HTML body for SSG (injected into #root)
  ogImage?: string; // Custom OG image URL
}

// ---------------------------------------------------------------------------
// Markdown → HTML renderer (pure regex, mirrors BlogPost.tsx renderMarkdownContent)
// ---------------------------------------------------------------------------

function renderMarkdownToHtml(content: string): string {
  const html = content
    .replace(/(\|.+\|\n)+/g, (tableBlock) => {
      const rows = tableBlock.trim().split("\n");
      let html = "<table><thead>";
      let inBody = false;
      rows.forEach((row) => {
        if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(row)) {
          html += "</thead><tbody>";
          inBody = true;
          return;
        }
        const cells = row
          .split("|")
          .filter(Boolean)
          .map((cell) => cell.trim());
        const cellTag = !inBody ? "th" : "td";
        html += `<tr>${cells.map((cell) => `<${cellTag}>${cell}</${cellTag}>`).join("")}</tr>`;
      });
      html += inBody ? "</tbody></table>" : "</thead></table>";
      return html;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  return html
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^<(h2|h3|table|ul|ol|div|section)\b/i.test(block)) return block;
      return `<p>${block.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}

function wrapArticleShell(title: string, renderedContent: string): string {
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(title)}</h1><div class="blog-article-content">${renderedContent}</div></article></div></div>`;
}

function renderStaticPageBody(
  title: string,
  intro: string,
  sections: Array<{ heading: string; body: string }>,
): string {
  const sectionHtml = sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></section>`,
    )
    .join("");
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(title)}</h1><div class="blog-article-content"><p>${escapeHtml(intro)}</p>${sectionHtml}</div></article></div></div>`;
}

function renderHubBody(
  title: string,
  description: string,
  metrics: Array<{ label: string; value: string }>,
  ctaPath = "/regulators",
): string {
  const metricsHtml = metrics
    .map(
      (metric) =>
        `<li><strong>${escapeHtml(metric.label)}:</strong> ${escapeHtml(metric.value)}</li>`,
    )
    .join("");
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(title)}</h1><div class="blog-article-content"><p>${escapeHtml(description)}</p><h2>Coverage Snapshot</h2><ul>${metricsHtml}</ul><h2>Use This Data</h2><p>Open the live RegActions workspace to filter the source records, inspect related firms, compare breach themes, and export the evidence for compliance or board reporting.</p><p><a href="${ctaPath}">Open live enforcement data</a></p></div></article></div></div>`;
}

function renderTopicClusterBody(slug: string): string {
  const cluster = topicClusters.find((item) => item.slug === slug);
  if (!cluster) return "";
  const articles = cluster.primaryArticles
    .map(
      (article) =>
        `<li><a href="/blog/${article.slug}">${escapeHtml(article.title)}</a> — ${escapeHtml(article.role)}</li>`,
    )
    .join("");
  const evidence = cluster.evidenceFocus
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const questions = cluster.boardQuestions
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const links = [...cluster.supportingLinks, ...cluster.nextActions]
    .map(
      (link) =>
        `<li><a href="${link.href}">${escapeHtml(link.label)}</a> — ${escapeHtml(link.description)}</li>`,
    )
    .join("");

  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">${escapeHtml(cluster.title)}</h1><div class="blog-article-content"><p>${escapeHtml(cluster.summary)}</p><h2>Core Articles</h2><ul>${articles}</ul><h2>Evidence Focus</h2><ul>${evidence}</ul><h2>Board Questions</h2><ul>${questions}</ul><h2>Search, Data and Advisory Paths</h2><ul>${links}</ul></div></article></div></div>`;
}

function renderTopicsLandingBody(): string {
  const clusterLinks = topicClusters
    .map(
      (cluster) =>
        `<li><a href="/topics/${cluster.slug}">${escapeHtml(cluster.title)}</a> — ${escapeHtml(cluster.description)}</li>`,
    )
    .join("");
  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Explore Enforcement Topics</h1><div class="blog-article-content"><p>Browse RegActions editorial clusters for FCA fines, AML, Consumer Duty, market abuse, and board reporting, then move into breach, year, sector, and firm data hubs.</p><h2>Editorial Topic Clusters</h2><ul>${clusterLinks}</ul><h2>Data Hubs</h2><ul><li><a href="/breaches">Breach categories</a></li><li><a href="/years">Fines by year</a></li><li><a href="/sectors">Fines by sector</a></li><li><a href="/firms">Top firms and individuals</a></li></ul></div></article></div></div>`;
}

function renderHomepageBody(): string {
  const latestArticles = [...blogArticles]
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
    .slice(0, 5);
  const articleLinks = latestArticles
    .map(
      (article) =>
        `<li><a href="/blog/${article.slug}">${escapeHtml(article.title)}</a></li>`,
    )
    .join("");

  return `<div class="blog-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Global Regulatory Fines & Enforcement Intelligence</h1><div class="blog-article-content"><p>RegActions tracks enforcement actions, penalties, breach categories, firms, and regulator activity across 45+ global financial regulators.</p><h2>What RegActions Covers</h2><ul><li><strong>Regulators:</strong> 45+ global financial regulators across the UK, Europe, North America, APAC, the Middle East, Africa, and offshore markets.</li><li><strong>Dataset:</strong> searchable enforcement actions, monetary penalties, breach themes, dates, sectors, and source links.</li><li><strong>Use cases:</strong> compliance monitoring, board packs, regulator benchmarking, control reviews, and trend analysis.</li></ul><h2>Start With The Data</h2><p><a href="/regulators">Open the regulator data hub</a>, <a href="/search">search enforcement actions</a>, or <a href="/board-pack">create a board pack</a> from the evidence.</p><h2>Latest Insights</h2><ul>${articleLinks}</ul><h2>Frequently Asked Questions</h2><p>RegActions combines official-source enforcement monitoring with practical analysis so compliance teams can understand what changed, why it matters, and what action to take next.</p></div></article></div></div>`;
}

function renderBlogListingBody(): string {
  const sortedArticles = [...blogArticles].sort((a, b) =>
    b.dateISO.localeCompare(a.dateISO),
  );
  const lead = sortedArticles[0];
  const articlesHtml = sortedArticles
    .slice(0, 16)
    .map(
      (article) =>
        `<article><h2><a href="/blog/${article.slug}">${escapeHtml(article.title)}</a></h2><p>${escapeHtml(article.excerpt)}</p><p><time datetime="${article.dateISO}">${escapeHtml(article.date)}</time> · ${escapeHtml(article.category)} · ${escapeHtml(article.readTime)}</p></article>`,
    )
    .join("");
  const categoryLinks = [
    ["FCA fines 2026", "/topics/fca-fines-2026"],
    ["AML enforcement", "/topics/aml-enforcement"],
    ["Consumer Duty", "/topics/consumer-duty-enforcement"],
    ["Market abuse", "/topics/market-abuse-enforcement"],
    ["Board reporting", "/board-pack"],
    ["MEMA compliance support", "https://memaconsultants.com"],
  ]
    .map(([label, href]) => `<li><a href="${href}">${label}</a></li>`)
    .join("");

  return `<div class="blog-page insights-page"><div class="blog-post-container"><article class="blog-article-modal"><h1 class="blog-post-title">Regulatory Insights</h1><div class="blog-article-content"><p>Expert analysis of significant regulatory penalties, enforcement trends, and compliance intelligence across global financial regulators.</p><h2>Latest Regulatory Enforcement Insight</h2><p><a href="/blog/${lead.slug}">${escapeHtml(lead.title)}</a> — ${escapeHtml(lead.excerpt)}</p><h2>Browse Recent Analysis</h2>${articlesHtml}<h2>Explore Enforcement Themes</h2><p>Use these crawlable topic pathways to move from insight into regulator hubs, board workflows, and advisory support.</p><ul>${categoryLinks}</ul><h2>Use The Intelligence</h2><p>Move from analysis to evidence: <a href="/regulators">open regulator hubs</a>, <a href="/search">search enforcement records</a>, or <a href="/board-pack">build a board pack</a>.</p></div></article></div></div>`;
}

// HowTo schema for database guide
const HOWTO_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to Search the Global Regulatory Fines Database",
  description:
    "Step-by-step guide to searching and filtering enforcement actions from 45+ global financial regulators using RegActions.",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Navigate to Data Hub",
      text: "Open the RegActions regulator intelligence hub at regactions.com/regulators to access the complete database of regulatory fines and enforcement actions from global financial regulators.",
      url: `${BASE_URL}/regulators`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Search by Firm",
      text: "Use the search bar to find fines by firm or individual name. Type a company name to filter results instantly across all regulators.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Filter by Year",
      text: "Select a specific year from the year dropdown to view all regulatory fines issued in that period, from 2013 to the current year.",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Filter by Breach Category",
      text: "Choose a breach category such as AML, Market Abuse, or Consumer Protection to see fines grouped by the type of regulatory failure.",
    },
    {
      "@type": "HowToStep",
      position: 5,
      name: "Filter by Amount",
      text: "Use the advanced filters to set a minimum and maximum fine amount, helping you identify the largest or smallest penalties.",
    },
    {
      "@type": "HowToStep",
      position: 6,
      name: "Export Data",
      text: "Click the export button to download the filtered results as a CSV file for further analysis in Excel or other tools.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Per-page @graph generation (BreadcrumbList, Dataset, WebPage, SearchAction)
// ---------------------------------------------------------------------------

function generateBreadcrumbItems(
  path: string,
): Array<{ name: string; item: string }> {
  const crumbs = [{ name: "Home", item: `${BASE_URL}/` }];
  if (path === "/") return crumbs;

  const segments = path.split("/").filter(Boolean);
  let current = "";
  for (const seg of segments) {
    current += `/${seg}`;
    let name = seg;
    if (seg === "dashboard") name = "Data";
    else if (seg === "board-pack") name = "Board Pack";
    else if (seg === "blog") name = "Insights";
    else if (seg === "topics") name = "Topics";
    else if (seg === "breaches") name = "Breach Categories";
    else if (seg === "years") name = "Years";
    else if (seg === "sectors") name = "Sectors";
    else if (seg === "firms") name = "Firms";
    else if (seg === "faq") name = "FAQ";
    else if (seg === "guide") name = "Guide";
    else if (seg === "sitemap") name = "Sitemap";
    else name = humanize(seg);
    crumbs.push({ name, item: `${BASE_URL}${current}` });
  }
  return crumbs;
}

// Pages that describe or provide access to the dataset get Dataset schema
const DATASET_PAGES = new Set([
  "/",
  "/regulators",
  "/search",
  "/topics",
  "/breaches",
  "/years",
  "/sectors",
  "/firms",
]);

function generatePageGraph(meta: PageMeta): object {
  const crumbs = generateBreadcrumbItems(meta.path);

  // Override last crumb name with breadcrumbLabel if provided (uses actual title instead of slug)
  if (meta.breadcrumbLabel && crumbs.length > 1) {
    crumbs[crumbs.length - 1].name = meta.breadcrumbLabel;
  }

  const pageUrl = meta.path === "/" ? BASE_URL : `${BASE_URL}${meta.path}`;
  const today = todayISO();

  const graph: object[] = [
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: "RegActions",
      url: BASE_URL,
      logo: { "@type": "ImageObject", url: `${BASE_URL}/regactions-mark.png` },
      description:
        "Global regulatory enforcement intelligence from 45+ financial regulators worldwide",
    },
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: `${BASE_URL}/`,
      name: SITE_NAME,
      description:
        "Regulatory fines and enforcement intelligence from 45+ global financial regulators including FCA, BaFin, AMF, SEC, and more",
      publisher: { "@id": `${BASE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
      inLanguage: "en-GB",
    },
    {
      "@type": "WebPage",
      "@id": `${pageUrl}/#webpage`,
      url: pageUrl,
      name: meta.title,
      isPartOf: { "@id": `${BASE_URL}/#website` },
      about: { "@id": `${BASE_URL}/#organization` },
      description: meta.description,
      breadcrumb: { "@id": `${pageUrl}/#breadcrumb` },
      inLanguage: "en-GB",
      dateModified: meta.dateModified || today,
      potentialAction: [{ "@type": "ReadAction", target: [pageUrl] }],
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${pageUrl}/#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    },
  ];

  // Only include Dataset schema on pages that describe or provide access to the data
  if (DATASET_PAGES.has(meta.path)) {
    graph.push({
      "@type": "Dataset",
      name: "RegActions Regulatory Fines Database",
      description:
        "Comprehensive database of regulatory fines and enforcement actions from 45+ global financial regulators. Includes penalty amounts, breach categories, and firm details.",
      url: `${BASE_URL}/regulators`,
      keywords: [
        "regulatory fines",
        "BaFin fines",
        "SEC fines",
        "AMF fines",
        "FCA fines",
        "global financial regulators",
        "financial enforcement",
        "cross-border enforcement",
        "regulatory compliance",
      ],
      creator: { "@id": `${BASE_URL}/#organization` },
      temporalCoverage: "2013/..",
      spatialCoverage: [
        { "@type": "Place", name: "Europe" },
        { "@type": "Place", name: "North America" },
        { "@type": "Place", name: "Asia Pacific" },
        { "@type": "Place", name: "Middle East" },
        { "@type": "Place", name: "Caribbean" },
        { "@type": "Place", name: "Africa" },
      ],
      license: "https://creativecommons.org/licenses/by-nc/4.0/",
      isAccessibleForFree: true,
      dateModified: today,
      variableMeasured: [
        { "@type": "PropertyValue", name: "Fine Amount", unitText: "GBP" },
        { "@type": "PropertyValue", name: "Date Issued" },
        { "@type": "PropertyValue", name: "Breach Category" },
        { "@type": "PropertyValue", name: "Firm Name" },
        { "@type": "PropertyValue", name: "Sector" },
        { "@type": "PropertyValue", name: "Final Notice Reference" },
      ],
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

// ---------------------------------------------------------------------------
// Build page metadata
// ---------------------------------------------------------------------------

async function buildPageMetas(): Promise<PageMeta[]> {
  const pages: PageMeta[] = [];

  // 1. Homepage (with FAQPage schema for top questions)
  const homepageFaqs = getHomepageFaqs();
  pages.push({
    path: "/",
    title:
      "RegActions | Global Regulatory Fines & Enforcement Intelligence",
    description:
      "Track fines from 45+ global financial regulators including BaFin, SEC, FCA, AMF, and more. Analyze £5B+ in enforcement actions from 2013-2026 with interactive charts, breach categories, and compliance insights.",
    keywords:
      "regulatory fines, financial regulator fines, enforcement actions, BaFin fines, SEC fines, FCA fines, AMF fines, CNMV fines, global fines database, multi-regulator tracker, financial compliance",
    ogType: "website",
    bodyContent: renderHomepageBody(),
    extraJsonLd:
      homepageFaqs.length > 0 ? [generateFaqSchema(homepageFaqs)] : [],
  });

  // 2. Regulator data hub (with DataFeed schema)
  pages.push({
    path: "/regulators",
    title: "RegActions Data Hub | Global Regulatory Fines Analytics",
    description:
      "Interactive multi-regulator data hub. Search enforcement actions from 45+ global financial regulators by firm, year, amount, breach category, and regulator.",
    keywords:
      "regulatory fines data hub, global enforcement tracker, multi-regulator search, BaFin fines, SEC fines, FCA fines, regulatory analytics",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "RegActions Data Hub",
      "Browse live and pipeline regulator coverage, open dedicated regulator hubs, and move from high-level enforcement intelligence into searchable records.",
      [
        {
          heading: "What You Can Search",
          body: "RegActions brings together enforcement actions, penalties, breach categories, dates, sectors, and firm names across global financial regulators.",
        },
        {
          heading: "How Compliance Teams Use It",
          body: "Use the hub to benchmark enforcement intensity, identify recurring control failures, prepare board challenge points, and find official source material.",
        },
        {
          heading: "Next Actions",
          body: "Open a regulator hub, search the enforcement database, subscribe to the digest, or create a board pack from the evidence.",
        },
      ],
    ),
    extraJsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "DataFeed",
        name: "RegActions Live Enforcement Feed",
        description:
          "Real-time feed of regulatory fines and enforcement actions from 45+ global financial regulators, updated as new penalties are published.",
        url: `${BASE_URL}/regulators`,
        dateModified: todayISO(),
        potentialAction: [
          {
            "@type": "SearchAction",
            name: "Search Global Regulatory Fines",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${BASE_URL}/search?q={query}`,
            },
            "query-input": "required name=query",
          },
          {
            "@type": "FilterAction",
            name: "Filter by Year",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${BASE_URL}/search?year={year}`,
            },
          },
          {
            "@type": "DownloadAction",
            name: "Export Regulatory Fines CSV",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${BASE_URL}/search`,
            },
          },
        ],
      },
    ],
  });

  pages.push({
    path: "/board-pack",
    title: "Board Pack | Board and Risk Committee Enforcement Advisory",
    description:
      "Generate a RegActions board pack with exposure scoring, peer-case evidence, board challenge points, and appendix-ready controls detail.",
    keywords:
      "board pack, board advisory pack, enforcement exposure, board intelligence, compliance committee pack, peer enforcement analysis",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "Board Pack",
      "Create committee-ready enforcement intelligence from regulator evidence, peer cases, and control questions.",
      [
        {
          heading: "Board-Level Enforcement Context",
          body: "The board pack workflow converts regulator actions into exposure themes, peer examples, board challenge questions, and appendix-ready control prompts.",
        },
        {
          heading: "Advisory Escalation",
          body: "Where the evidence points to a live governance or remediation issue, users can escalate the pack into a tailored MEMA Consultants advisory conversation.",
        },
      ],
    ),
  });

  pages.push({
    path: "/search",
    title: "Enforcement Search | Search Enforcement Actions by Firm, Regulator, and Theme",
    description:
      "Search enforcement actions by firm, regulator, jurisdiction, and theme across the live regulatory coverage set.",
    keywords:
      "enforcement search, regulator fines search, enforcement actions search, compliance enforcement database",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "Enforcement Search",
      "Search regulatory enforcement actions by firm, individual, regulator, jurisdiction, breach type, theme, amount, and date.",
      [
        {
          heading: "Search By Firm Or Theme",
          body: "Use search to move from a specific firm, case, or issue into the underlying enforcement record and the connected regulator context.",
        },
        {
          heading: "Turn Search Into Monitoring",
          body: "High-intent searches can become digest subscriptions, firm watchlist entries, or board-pack evidence sets.",
        },
      ],
    ),
  });

  pages.push({
    path: "/features",
    title: "RegActions Features | Search, Alerts, Exports and Board Packs",
    description:
      "Explore RegActions features for enforcement search, regulator monitoring, smart alerts, data export, and board-pack intelligence.",
    keywords:
      "RegActions features, enforcement alerts, regulatory fines export, board pack intelligence, compliance monitoring tools",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "RegActions Features",
      "RegActions combines searchable enforcement data, regulator coverage, smart alerts, exports, and board-pack workflows for compliance users.",
      [
        {
          heading: "Search And Monitor",
          body: "Search across global regulator records and use alerts or digest subscriptions to keep watch on new enforcement signals.",
        },
        {
          heading: "Report And Escalate",
          body: "Export data, create board packs, and use enforcement evidence to support governance and remediation conversations.",
        },
      ],
    ),
  });

  pages.push({
    path: "/roadmap",
    title: "RegActions Roadmap | Regulator Coverage and Product Direction",
    description:
      "See the RegActions roadmap for regulator coverage expansion, alert precision, board-pack persistence, exports, API surfaces, and embedded intelligence.",
    keywords:
      "RegActions roadmap, regulator coverage roadmap, enforcement intelligence roadmap, compliance data product roadmap",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "RegActions Roadmap",
      "The roadmap shows how RegActions is expanding regulator coverage and product workflows for enforcement monitoring, exports, and advisory use cases.",
      [
        {
          heading: "Coverage Expansion",
          body: "The coverage roadmap separates live regulators from validated pipeline sources so users can understand current depth and planned expansion.",
        },
        {
          heading: "Product Direction",
          body: "Near-term work prioritises alert precision, board-pack persistence, branded export quality, and reusable API or embedded surfaces.",
        },
      ],
    ),
  });

  pages.push({
    path: "/intelligence",
    title: "RegActions Intelligence | Enforcement Briefing Workbench",
    description:
      "Build enforcement briefings and compliance intelligence from regulator actions, precedent cases, watchlist themes, and board-level risk questions.",
    keywords:
      "enforcement intelligence, regulatory briefing, compliance intelligence workbench, regulator precedent analysis",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "RegActions Intelligence",
      "Use RegActions intelligence workflows to turn enforcement data into briefings, precedent analysis, and practical compliance questions.",
      [
        {
          heading: "Briefings From Evidence",
          body: "The intelligence workspace supports regulator, theme, and firm-led analysis grounded in the enforcement data layer.",
        },
        {
          heading: "Compliance Use Cases",
          body: "Use it to prepare internal briefings, identify relevant precedents, and frame board or committee questions from official enforcement evidence.",
        },
      ],
    ),
  });

  pages.push({
    path: "/uk-enforcement",
    title: "UK Enforcement | Financial and Adjacent Regulatory Penalties",
    description:
      "Search UK financial, sanctions, data, competition, audit, and pensions enforcement actions from official regulator sources.",
    keywords:
      "UK enforcement, PRA fines, PSR fines, OFSI penalties, ICO monetary penalties, CMA fines, FRC sanctions, pensions regulator penalties",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "UK Enforcement",
      "Search UK financial and adjacent regulator enforcement across FCA, PRA, PSR, OFSI, ICO, CMA, FRC, and pensions sources.",
      [
        {
          heading: "Focused UK View",
          body: "The UK workspace keeps financial, sanctions, competition, data protection, audit, and pensions enforcement in one focused search surface.",
        },
        {
          heading: "Official-Source Monitoring",
          body: "Records link back to source notices where available and can be filtered by regulator, domain, year, and firm or issue.",
        },
      ],
    ),
  });

  pages.push({
    path: "/about",
    title: "About RegActions | Regulatory Enforcement Intelligence",
    description:
      "RegActions is a regulatory enforcement intelligence platform built by MEMA Consultants to help compliance teams monitor fines, enforcement themes, and board-level regulatory risk.",
    keywords:
      "RegActions, MEMA Consultants, regulatory enforcement intelligence, FCA fines database, compliance monitoring",
    ogType: "website",
    bodyContent: renderStaticPageBody(
      "About RegActions",
      "RegActions is a regulatory enforcement intelligence platform built by MEMA Consultants for compliance, risk, governance, and advisory users.",
      [
        {
          heading: "Built For Compliance Work",
          body: "The platform helps users search official enforcement evidence, monitor recurring themes, compare regulator activity, and prepare board-ready analysis.",
        },
        {
          heading: "MEMA Consultants",
          body: "MEMA Consultants builds and uses RegActions as an advisory evidence layer for interpreting enforcement signals and prioritising remediation.",
        },
      ],
    ),
  });

  // 3. Topics (hub landing)
  pages.push({
    path: "/topics",
    title: "RegActions Topics | Breaches, Years, Sectors & Firm Pages",
    description:
      "Browse enforcement topic clusters, breach types, years, sectors, and firm pages. Explore hub pages and jump into the interactive dashboard for deeper analysis.",
    keywords:
      "RegActions topics, enforcement topic clusters, regulatory fines by breach, regulatory fines by year, enforcement actions by firm, regulatory fines by sector",
    ogType: "website",
    bodyContent: renderTopicsLandingBody(),
  });

  topicClusters.forEach((cluster) => {
    pages.push({
      path: `/topics/${cluster.slug}`,
      title: cluster.seoTitle,
      description: cluster.description,
      keywords: cluster.keywords,
      ogType: "website",
      bodyContent: renderTopicClusterBody(cluster.slug),
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: cluster.title,
          description: cluster.description,
          url: `${BASE_URL}/topics/${cluster.slug}`,
          mainEntity: {
            "@type": "ItemList",
            itemListElement: cluster.primaryArticles.map((article, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: `${BASE_URL}/blog/${article.slug}`,
              name: article.title,
            })),
          },
        },
      ],
    });
  });

  // 4. Hub list pages
  pages.push({
    path: "/breaches",
    title: "Enforcement Actions by Breach Type | Market Abuse, AML, Principles and More",
    description:
      "Browse regulatory enforcement actions by breach category. See which breach types drive the most penalties and jump into the dashboard with filters applied.",
    keywords:
      "regulatory fines by breach, market abuse enforcement, AML fines, regulatory principles fines, breach category fines",
    ogType: "website",
  });
  pages.push({
    path: "/years",
    title: "Enforcement Actions by Year | 2013-2026 Annual Summaries",
    description:
      "Browse regulatory enforcement actions by year. Compare enforcement totals and jump into the dashboard for each year’s full list of actions.",
    keywords:
      "regulatory fines by year, enforcement actions 2026, enforcement actions 2025, financial enforcement by year",
    ogType: "website",
  });
  pages.push({
    path: "/sectors",
    title: "Regulatory Fines by Sector | Banks, Insurance, Individuals and More",
    description:
      "Browse regulatory fines by firm category (sector). View which sectors receive the most penalties and jump into filtered dashboard views.",
    keywords:
      "regulatory fines by sector, bank enforcement penalties, insurance enforcement penalties, individual enforcement penalties",
    ogType: "website",
  });
  pages.push({
    path: "/firms",
    title:
      "Top Penalty Recipients | Firms and Individuals With the Largest Penalties (2013-2026)",
    description:
      "Browse the biggest regulatory penalty recipients across 2013-2026. Open an entity page to see totals, largest penalties, and full enforcement history.",
    keywords:
      "top regulatory fines firms, biggest enforcement penalty recipients, fines by firm, fines by individual, largest regulatory penalties",
    ogType: "website",
  });

  // 4b. Regulator Hub Pages
  PUBLIC_REGULATOR_CODES.forEach((code) => {
    const coverage = REGULATOR_COVERAGE[code];
    const path = `/regulators/${code.toLowerCase()}`;
    const title = `${code} Fines Database | ${coverage.fullName} Enforcement Actions`;
    const description = `Track all ${coverage.fullName} (${code}) fines and enforcement actions. ${coverage.count} penalties from ${coverage.years}. Complete database with stats, trends, and analysis.`;
    const keywords = `${code} fines, ${coverage.fullName}, regulatory enforcement, financial penalties, ${coverage.country}, compliance data, ${code} enforcement`;

    pages.push({
      path,
      title,
      description,
      keywords,
      ogType: "website",
      ogImage: `${BASE_URL}/og/${code.toLowerCase()}-hub.png`,
      bodyContent: renderHubBody(
        title,
        description,
        [
          { label: "Regulator", value: coverage.fullName },
          { label: "Jurisdiction", value: coverage.country },
          { label: "Tracked period", value: coverage.years },
          { label: "Tracked actions", value: String(coverage.count) },
          { label: "Default currency", value: coverage.defaultCurrency },
        ],
        path,
      ),
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: `${code} Fines Database`,
          description: `${coverage.fullName} enforcement actions and financial penalties from ${coverage.years}`,
          url: `${BASE_URL}${path}`,
          keywords: [
            `${code} fines`,
            coverage.fullName,
            "regulatory enforcement",
            "financial penalties",
            coverage.country,
            "compliance database",
          ],
          temporalCoverage: coverage.years,
          spatialCoverage: {
            "@type": "Place",
            name: coverage.country,
          },
          creator: {
            "@type": "Organization",
            name: SITE_NAME,
            url: "https://regactions.com",
          },
          variableMeasured: [
            {
              "@type": "PropertyValue",
              name: "Fine Amount",
              unitText: coverage.defaultCurrency,
            },
            { "@type": "PropertyValue", name: "Enforcement Date" },
            { "@type": "PropertyValue", name: "Breach Category" },
            { "@type": "PropertyValue", name: "Firm/Individual Name" },
          ],
        },
      ],
    });
  });

  // 5. Blog listing (with ItemList schema for carousel/list rich results)
  const allBlogItems = [
    ...blogArticles.filter((a) => a.featured),
    ...blogArticles.filter((a) => !a.featured),
    ...yearlyArticles,
  ];
  pages.push({
    path: "/blog",
    title:
      "RegActions Blog | Regulatory Enforcement Analysis & Insights",
    description:
      "Expert analysis of regulator fines, biggest penalties, enforcement trends, and compliance guidance across global financial regulators.",
    keywords:
      "RegActions blog, regulatory fines analysis, enforcement insights, biggest regulatory fines, AML fines, compliance guide",
    ogType: "website",
    bodyContent: renderBlogListingBody(),
    extraJsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: allBlogItems.map((article, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${BASE_URL}/blog/${article.slug}`,
        })),
      },
    ],
  });

  // 5b. Sitemap page
  pages.push({
    path: "/sitemap",
    title: "Sitemap | RegActions",
    description:
      "Complete sitemap of RegActions. Browse all pages including the interactive dashboard, blog articles, annual reviews, and hub pages.",
    keywords: "RegActions sitemap, regulatory enforcement pages, regulatory fines navigation",
    ogType: "website",
  });

  // 5c. Pillar page: Complete Guide to FCA Enforcement
  pages.push({
    path: "/guide/fca-enforcement",
    title:
      "Complete Guide to FCA Enforcement & Fines | From Investigation to Penalty",
    description:
      "Comprehensive guide covering how the FCA enforces financial regulation, how fines are calculated, the biggest penalties of all time, enforcement by year, sector, and breach type.",
    keywords:
      "FCA enforcement guide, FCA fines guide, FCA fines explained, how FCA fines work, FCA enforcement process, FCA penalties guide",
    ogType: "article",
    datePublished: "2026-02-01",
    dateModified: todayISO(),
    articleSection: "Guide",
    breadcrumbLabel: "Complete Guide to FCA Enforcement",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "Complete Guide to FCA Enforcement & Fines | From Investigation to Penalty",
      description:
        "Comprehensive guide covering how the FCA enforces financial regulation, how fines are calculated, the biggest penalties of all time, enforcement by year, sector, and breach type.",
      datePublished: "2026-02-01",
      dateModified: todayISO(),
      author: {
        "@type": "Organization",
        name: SITE_NAME,
        url: "https://regactions.com",
        description:
          "Regulatory enforcement intelligence platform",
      },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        logo: { "@type": "ImageObject", url: `${BASE_URL}/regactions-mark.png` },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${BASE_URL}/guide/fca-enforcement`,
      },
      keywords:
        "FCA enforcement guide, FCA fines guide, FCA fines explained, how FCA fines work, FCA enforcement process",
      articleSection: "Guide",
      image: {
        "@type": "ImageObject",
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        caption:
          "RegActions - Global Regulatory Fines & Enforcement Intelligence",
      },
    },
  });

  // 5d. FAQ page (with full FAQPage schema)
  pages.push({
    path: "/faq",
    title:
      "Regulatory Fines FAQ | Global Financial Enforcement | RegActions",
    description:
      "Answers to common questions about regulatory fines from 45+ global financial regulators including FCA, BaFin, SEC, ASIC, and MAS. Compare enforcement trends.",
    keywords:
      "regulatory fines FAQ, global enforcement questions, FCA fines, BaFin fines, SEC enforcement, ASIC fines, MAS penalties, ESMA regulation, FINRA, CNMV, AMF, financial regulator comparison, AML enforcement, biggest regulatory fines, RegActions",
    ogType: "website",
    jsonLd: generateFaqSchema(faqItems),
  });

  // 6. Blog articles (Article schema + FAQPage schema where mapped + SSG body + OG images)
  for (const article of blogArticles) {
    const articleFaqs = getFaqsForArticle(article.slug);
    const articleOgImage = `${BASE_URL}/og/${article.slug}.png`;
    const renderedBody = wrapArticleShell(
      article.title,
      renderMarkdownToHtml(article.content),
    );
    const extraLd: object[] = [];
    if (articleFaqs.length > 0) extraLd.push(generateFaqSchema(articleFaqs));
    // HowTo schema for database guide
    if (article.id === "fca-fines-database-guide") extraLd.push(HOWTO_SCHEMA);
    pages.push({
      path: `/blog/${article.slug}`,
      title: article.seoTitle,
      description: article.excerpt,
      keywords: article.keywords.join(", "),
      ogType: "article",
      datePublished: article.dateISO,
      dateModified: article.dateISO,
      articleSection: article.category,
      breadcrumbLabel: article.title,
      bodyContent: renderedBody,
      ogImage: articleOgImage,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.seoTitle,
        description: article.excerpt,
        datePublished: article.dateISO,
        dateModified: article.dateISO,
        author: {
          "@type": "Organization",
          name: SITE_NAME,
          url: "https://regactions.com",
          description:
            "Regulatory enforcement intelligence platform",
        },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          logo: { "@type": "ImageObject", url: `${BASE_URL}/regactions-mark.png` },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${BASE_URL}/blog/${article.slug}`,
        },
        keywords: article.keywords.join(", "),
        articleSection: article.category,
        image: {
          "@type": "ImageObject",
          url: articleOgImage,
          width: 1200,
          height: 630,
          caption:
            "RegActions - Global Regulatory Fines & Enforcement Intelligence",
        },
      },
      extraJsonLd: extraLd,
    });
  }

  // 7. Yearly review articles (AnalysisNewsArticle schema + FAQPage schema + SSG body + OG images)
  const buildDate = todayISO();
  for (const article of yearlyArticles) {
    const yearlyFaqs = getFaqsForYearlyArticle(article.year);
    const yearEnd = `${article.year}-12-31`;
    const clampedDateModified = clampISODate(yearEnd, buildDate);
    const yearlyOgImage = `${BASE_URL}/og/${article.slug}.png`;

    // Build SSG body for yearly articles from structured sections
    const yearlyBodyParts = [
      `<h2>Executive Summary</h2>${article.executiveSummary
        .split("\n\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}`,
      `<h2>Regulatory Context</h2>${article.regulatoryContext
        .split("\n\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}`,
      `<h2>Key Enforcement Themes</h2><ul>${article.keyEnforcementThemes.map((t) => `<li>${t}</li>`).join("")}</ul>`,
      `<h2>Professional Insight</h2>${article.professionalInsight
        .split("\n\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}`,
      `<h2>Looking Ahead</h2>${article.lookingAhead
        .split("\n\n")
        .map((p) => `<p>${p}</p>`)
        .join("")}`,
    ].join("");
    const yearlyBody = wrapArticleShell(article.title, yearlyBodyParts);

    pages.push({
      path: `/blog/${article.slug}`,
      title: article.seoTitle,
      description: article.excerpt,
      keywords: article.keywords.join(", "),
      ogType: "article",
      datePublished: article.dateISO,
      dateModified: clampedDateModified,
      articleSection: "Annual Analysis",
      breadcrumbLabel: article.title,
      bodyContent: yearlyBody,
      ogImage: yearlyOgImage,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "AnalysisNewsArticle",
        headline: article.seoTitle,
        description: article.excerpt,
        datePublished: article.dateISO,
        dateModified: clampedDateModified,
        author: {
          "@type": "Organization",
          name: SITE_NAME,
          url: "https://regactions.com",
          description:
            "Regulatory enforcement intelligence platform",
        },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          logo: { "@type": "ImageObject", url: `${BASE_URL}/regactions-mark.png` },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${BASE_URL}/blog/${article.slug}`,
        },
        keywords: article.keywords.join(", "),
        articleSection: "Annual Analysis",
        image: {
          "@type": "ImageObject",
          url: yearlyOgImage,
          width: 1200,
          height: 630,
          caption:
            "RegActions - Global Regulatory Fines & Enforcement Intelligence",
        },
      },
      extraJsonLd: yearlyFaqs.length > 0 ? [generateFaqSchema(yearlyFaqs)] : [],
    });
  }

  // 8. DB-backed hub detail pages (best-effort; skip if env not available in build)
  try {
    const { listBreachCategories, listYears, listSectors, listTopFirms } =
      await import("../server/services/hubs.js");
    const [categories, years, sectors, firms] = await Promise.all([
      listBreachCategories(),
      listYears(),
      listSectors(),
      listTopFirms(120),
    ]);

    categories.slice(0, 30).forEach((cat: any) => {
      const title = `${humanize(cat.name)} Enforcement Actions | ${cat.fineCount} actions totalling ${gbp.format(cat.totalAmount)}`;
      const description = `Explore regulatory enforcement actions tagged ${humanize(cat.name)}. ${cat.fineCount} actions totalling ${gbp.format(cat.totalAmount)} across 2013-2026.`;
      pages.push({
        path: `/breaches/${cat.slug}`,
        title,
        description,
        keywords: `${humanize(cat.name)} regulatory fines, ${humanize(cat.name)} enforcement, fines by breach`,
        ogType: "website",
        bodyContent: renderHubBody(
          title,
          description,
          [
            { label: "Breach category", value: humanize(cat.name) },
            { label: "Tracked actions", value: String(cat.fineCount) },
            { label: "Total amount", value: gbp.format(cat.totalAmount) },
          ],
          `/breaches/${cat.slug}`,
        ),
      });
    });

    years.slice(0, 25).forEach((y: any) => {
      const title = `Enforcement Actions ${y.year} | ${y.fineCount} actions totalling ${gbp.format(y.totalAmount)}`;
      const description = `Explore regulatory fines issued in ${y.year}. ${y.fineCount} actions totalling ${gbp.format(y.totalAmount)}.`;
      pages.push({
        path: `/years/${y.year}`,
        title,
        description,
        keywords: `regulatory fines ${y.year}, regulatory penalties ${y.year}, enforcement ${y.year}`,
        ogType: "website",
        bodyContent: renderHubBody(
          title,
          description,
          [
            { label: "Year", value: String(y.year) },
            { label: "Tracked actions", value: String(y.fineCount) },
            { label: "Total amount", value: gbp.format(y.totalAmount) },
          ],
          `/years/${y.year}`,
        ),
      });
    });

    sectors.slice(0, 30).forEach((s: any) => {
      const title = `Regulatory Fines for ${s.name} | ${s.fineCount} actions totalling ${gbp.format(s.totalAmount)}`;
      const description = `Explore regulatory enforcement actions for ${s.name}. ${s.fineCount} actions totalling ${gbp.format(s.totalAmount)} across 2013-2026.`;
      pages.push({
        path: `/sectors/${s.slug}`,
        title,
        description,
        keywords: `regulatory fines ${s.name}, regulatory penalties ${s.name}, fines by sector`,
        ogType: "website",
        bodyContent: renderHubBody(
          title,
          description,
          [
            { label: "Sector", value: s.name },
            { label: "Tracked actions", value: String(s.fineCount) },
            { label: "Total amount", value: gbp.format(s.totalAmount) },
          ],
          `/sectors/${s.slug}`,
        ),
      });
    });

    firms.slice(0, 120).forEach((f: any) => {
      const title = `${f.name} Enforcement History | ${f.fineCount} actions totalling ${gbp.format(f.totalAmount)}`;
      const description = `Explore regulatory enforcement actions for ${f.name}. ${f.fineCount} actions totalling ${gbp.format(f.totalAmount)} across 2013-2026.`;
      pages.push({
        path: `/firms/${f.slug}`,
        title,
        description,
        keywords: `regulatory fines ${f.name}, penalties ${f.name}, regulatory enforcement ${f.name}`,
        ogType: "website",
        bodyContent: renderHubBody(
          title,
          description,
          [
            { label: "Entity", value: f.name },
            { label: "Tracked actions", value: String(f.fineCount) },
            { label: "Total amount", value: gbp.format(f.totalAmount) },
          ],
          `/firms/${f.slug}`,
        ),
      });
    });
  } catch (error) {
    console.warn(
      "WARN: Skipping DB-backed hub pages in pre-render step:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Replace <head> content in the HTML template
// ---------------------------------------------------------------------------

function renderPage(template: string, meta: PageMeta): string {
  const fullUrl = `${BASE_URL}${meta.path}`;
  const canonicalPath = meta.path === "/" ? "/" : meta.path;
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;

  let html = template;

  // Replace <title>
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(meta.title)}</title>`,
  );

  // Replace meta[name="title"]
  html = html.replace(
    /<meta\s+name="title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="title" content="${escapeHtml(meta.title)}" />`,
  );

  // Replace meta[name="description"] — use [^>]* to avoid catastrophic backtracking
  html = html.replace(
    /<meta\s+name="description"[^>]*\/>/,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  );

  // Replace meta[name="keywords"]
  html = html.replace(
    /<meta\s+name="keywords"[^>]*\/>/,
    `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`,
  );

  // Replace canonical
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonicalUrl}" />`,
  );

  // Replace hreflang URLs (including en-us)
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="en-gb"\s+href="[^"]*"\s*\/?>/,
    `<link rel="alternate" hreflang="en-gb" href="${canonicalUrl}" />`,
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="en"\s+href="[^"]*"\s*\/?>/,
    `<link rel="alternate" hreflang="en" href="${canonicalUrl}" />`,
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="en-us"\s+href="[^"]*"\s*\/?>/,
    `<link rel="alternate" hreflang="en-us" href="${canonicalUrl}" />`,
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="x-default"\s+href="[^"]*"\s*\/?>/,
    `<link rel="alternate" hreflang="x-default" href="${canonicalUrl}" />`,
  );

  // Replace OG tags
  html = html.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${meta.ogType}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${fullUrl}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
  );
  html = html.replace(
    /<meta\s+property="og:description"[^>]*\/>/,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
  );

  // Replace Twitter tags
  html = html.replace(
    /<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:url" content="${fullUrl}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
  );
  html = html.replace(
    /<meta\s+name="twitter:description"[^>]*\/>/,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  );

  // Replace OG image and Twitter image when custom ogImage is set
  if (meta.ogImage) {
    html = html.replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:image" content="${meta.ogImage}" />`,
    );
    html = html.replace(
      /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:image" content="${meta.ogImage}" />`,
    );
  }

  // Inject SSG body content into <div id="root"> (React hydrates over it)
  if (meta.bodyContent) {
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">${meta.bodyContent}</div>`,
    );
  }

  // Replace the static @graph with per-page version (correct BreadcrumbList, WebPage, Dataset)
  const pageGraph = generatePageGraph(meta);
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n    ${JSON.stringify(pageGraph)}\n    </script>`,
  );

  // Inject JSON-LD and article meta before </head>
  const headInjections: string[] = [];

  if (meta.ogType === "article") {
    // Article meta tags
    if (meta.datePublished)
      headInjections.push(
        `<meta property="article:published_time" content="${meta.datePublished}" />`,
      );
    if (meta.dateModified)
      headInjections.push(
        `<meta property="article:modified_time" content="${meta.dateModified}" />`,
      );
    if (meta.articleSection)
      headInjections.push(
        `<meta property="article:section" content="${escapeHtml(meta.articleSection)}" />`,
      );
  }

  if (GOOGLE_SITE_VERIFICATION) {
    headInjections.push(
      `<meta name="google-site-verification" content="${escapeHtml(GOOGLE_SITE_VERIFICATION)}" />`,
    );
  }

  if (BING_SITE_VERIFICATION) {
    headInjections.push(
      `<meta name="msvalidate.01" content="${escapeHtml(BING_SITE_VERIFICATION)}" />`,
    );
  }

  // Primary JSON-LD (Article schema or FAQPage for /faq)
  if (meta.jsonLd) {
    headInjections.push(
      `<script type="application/ld+json">\n    ${JSON.stringify(meta.jsonLd)}\n    </script>`,
    );
  }

  // Extra JSON-LD blocks (e.g. FAQPage alongside Article)
  if (meta.extraJsonLd?.length) {
    for (const ld of meta.extraJsonLd) {
      headInjections.push(
        `<script type="application/ld+json">\n    ${JSON.stringify(ld)}\n    </script>`,
      );
    }
  }

  if (headInjections.length > 0) {
    html = html.replace(
      "</head>",
      `    ${headInjections.join("\n    ")}\n  </head>`,
    );
  }

  return html;
}

// ---------------------------------------------------------------------------
// Generate sitemap.xml
// ---------------------------------------------------------------------------

function generateSitemap(pages: PageMeta[]): string {
  const buildDate = todayISO();
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const page of pages) {
    const fullUrl = `${BASE_URL}${page.path}`;

    let lastmod = buildDate;
    let changefreq = "monthly";
    let priority = "0.75";

    if (page.path === "/") {
      priority = "1.0";
      changefreq = "daily";
    } else if (page.path === "/regulators") {
      priority = "0.95";
      changefreq = "daily";
    } else if (page.path === "/search") {
      priority = "0.9";
      changefreq = "daily";
    } else if (page.path === "/topics") {
      priority = "0.9";
      changefreq = "weekly";
    } else if (page.path.startsWith("/topics/")) {
      priority = "0.88";
      changefreq = "weekly";
    } else if (["/board-pack", "/features", "/uk-enforcement", "/intelligence"].includes(page.path)) {
      priority = "0.85";
      changefreq = "weekly";
    } else if (
      page.path === "/breaches" ||
      page.path === "/years" ||
      page.path === "/sectors" ||
      page.path === "/firms"
    ) {
      priority = "0.85";
      changefreq = "weekly";
    } else if (page.path.startsWith("/regulators/")) {
      // Regulator hub pages
      priority = "0.85";
      changefreq = "weekly";
    } else if (page.path === "/blog") {
      priority = "0.9";
      changefreq = "weekly";
    } else if (page.path === "/faq") {
      priority = "0.9";
      changefreq = "monthly";
    } else if (page.path === "/sitemap") {
      priority = "0.5";
      changefreq = "monthly";
    } else if (page.path === "/guide/fca-enforcement") {
      priority = "0.9";
      changefreq = "weekly";
    } else if (page.datePublished) {
      // Blog articles use their publish date
      lastmod = clampISODate(
        page.dateModified || page.datePublished,
        buildDate,
      );

      // Featured / recent articles get higher priority
      const isFeatured = blogArticles.some(
        (a) => `/blog/${a.slug}` === page.path && a.featured,
      );
      if (isFeatured) {
        priority = "0.9";
        changefreq = "weekly";
      } else if (page.path.includes("annual-review")) {
        // Yearly reviews: recent years get higher priority
        const yearMatch = page.path.match(/(\d{4})-annual-review/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;
        priority = year >= 2023 ? "0.85" : "0.75";
        changefreq = year >= 2024 ? "weekly" : "monthly";
      } else {
        priority = "0.8";
      }
    } else if (
      page.path.startsWith("/breaches/") ||
      page.path.startsWith("/sectors/")
    ) {
      priority = "0.75";
      changefreq = "monthly";
    } else if (
      page.path.startsWith("/years/") ||
      page.path.startsWith("/firms/")
    ) {
      priority = "0.75";
      changefreq = "monthly";
    }

    lines.push("  <url>");
    lines.push(`    <loc>${fullUrl}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push(`    <changefreq>${changefreq}</changefreq>`);
    lines.push(`    <priority>${priority}</priority>`);
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Generate rss.xml
// ---------------------------------------------------------------------------

function generateRss(): string {
  const buildDate = todayISO();
  const items = [
    ...blogArticles.map((a) => ({
      title: a.seoTitle,
      link: `${BASE_URL}/blog/${a.slug}`,
      guid: `${BASE_URL}/blog/${a.slug}`,
      description: a.excerpt,
      pubDate: toRfc2822(a.dateISO, buildDate),
      category: a.category,
    })),
    ...yearlyArticles.map((a) => ({
      title: a.seoTitle,
      link: `${BASE_URL}/blog/${a.slug}`,
      guid: `${BASE_URL}/blog/${a.slug}`,
      description: a.excerpt,
      pubDate: toRfc2822(a.dateISO, buildDate),
      category: "Annual Analysis",
    })),
  ].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );

  const rssItems = items
    .slice(0, 60)
    .map((item) => {
      return [
        "    <item>",
        `      <title>${escapeHtml(item.title)}</title>`,
        `      <link>${item.link}</link>`,
        `      <guid isPermaLink="true">${item.guid}</guid>`,
        `      <pubDate>${item.pubDate}</pubDate>`,
        item.category
          ? `      <category>${escapeHtml(item.category)}</category>`
          : "",
        `      <description>${escapeHtml(item.description)}</description>`,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeHtml(SITE_NAME)} Insights</title>`,
    `    <link>${BASE_URL}/blog</link>`,
    `    <description>${escapeHtml("Expert analysis of FCA enforcement actions, fines, and compliance insights.")}</description>`,
    `    <language>en-gb</language>`,
    `    <lastBuildDate>${toRfc2822(buildDate, buildDate)}</lastBuildDate>`,
    `    <atom:link href="${RSS_URL}" rel="self" type="application/rss+xml" />`,
    rssItems,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const templatePath = join(DIST, "index.html");
  if (!existsSync(templatePath)) {
    console.error("ERROR: dist/index.html not found. Run `vite build` first.");
    process.exit(1);
  }

  const template = readFileSync(templatePath, "utf-8");
  const pages = await buildPageMetas();

  console.log(`Pre-rendering ${pages.length} pages...`);

  let created = 0;
  for (const page of pages) {
    const html = renderPage(template, page);

    // Determine output path
    let outPath: string;
    if (page.path === "/") {
      // Homepage — already dist/index.html, overwrite with correct meta
      outPath = join(DIST, "index.html");
    } else {
      // e.g. /blog/some-slug → dist/blog/some-slug/index.html
      outPath = join(DIST, page.path.slice(1), "index.html");
    }

    const outDir = dirname(outPath);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    writeFileSync(outPath, html, "utf-8");
    created++;
  }

  console.log(`  Created ${created} HTML files.`);

  // Generate sitemap
  const sitemap = generateSitemap(pages);
  const sitemapPath = join(DIST, "sitemap.xml");
  writeFileSync(sitemapPath, sitemap, "utf-8");
  console.log(`  Generated sitemap.xml with ${pages.length} URLs.`);

  // Generate RSS feed
  const rss = generateRss();
  const rssPath = join(DIST, "rss.xml");
  writeFileSync(rssPath, rss, "utf-8");
  console.log(`  Generated rss.xml.`);

  console.log("Done!");
}

main().catch((error) => {
  console.error("Pre-render failed:", error);
  process.exit(1);
});
