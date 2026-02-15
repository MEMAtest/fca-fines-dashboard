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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

const BASE_URL = 'https://fcafines.memaconsultants.com';
const SITE_NAME = 'FCA Fines Dashboard';
const OG_IMAGE = `${BASE_URL}/og-image.png`;
const RSS_URL = `${BASE_URL}/rss.xml`;

// ---------------------------------------------------------------------------
// Import article data (pure TS, no JSX)
// ---------------------------------------------------------------------------

// We can't import .ts directly (no bundler), so we require the compiled output.
// However since the project uses "type": "module" and ts-node/esm, the import
// resolves the .ts source directly.
import { blogArticles, yearlyArticles } from '../src/data/blogArticles.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  return label.replace(/_/g, ' ').replace(/[-]+/g, ' ').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

interface PageMeta {
  path: string;         // e.g. '/blog/fca-fines-2025-complete-list'
  title: string;
  description: string;
  keywords: string;
  ogType: string;       // 'website' | 'article'
  datePublished?: string;
  dateModified?: string;
  articleSection?: string;
  jsonLd?: object;
}

// ---------------------------------------------------------------------------
// Build page metadata
// ---------------------------------------------------------------------------

async function buildPageMetas(): Promise<PageMeta[]> {
  const pages: PageMeta[] = [];

  // 1. Homepage
  pages.push({
    path: '/',
    title: 'FCA Fines Database & Tracker | Complete UK Financial Conduct Authority Penalties 2013-2026',
    description: 'The definitive FCA fines database tracking all Financial Conduct Authority penalties, enforcement actions and regulatory fines from 2013-2026. Analyze £4.9B+ in FCA fines with interactive charts, breach categories, and compliance insights. Updated daily.',
    keywords: 'FCA fines, FCA fines list, FCA fines database, FCA fines 2025, FCA fines 2026, FCA enforcement actions, Financial Conduct Authority fines, UK financial fines',
    ogType: 'website',
  });

  // 2. Dashboard
  pages.push({
    path: '/dashboard',
    title: 'FCA Fines Dashboard | Interactive Analytics & Search',
    description: 'Interactive FCA fines dashboard. Search all Financial Conduct Authority penalties by firm, year, amount and breach category. Export data and analyse enforcement trends.',
    keywords: 'FCA fines dashboard, FCA fines search, FCA fines tracker, FCA penalty analytics, FCA fines data',
    ogType: 'website',
  });

  // 3. Topics (hub landing)
  pages.push({
    path: '/topics',
    title: 'FCA Fines Topics | Breaches, Years, Sectors & Firm Pages',
    description:
      'Browse FCA fines by breach type, year, sector, or firm. Explore hub pages and jump into the interactive dashboard for deeper analysis.',
    keywords:
      'FCA fines topics, FCA fines by breach, FCA fines by year, FCA fines by firm, FCA fines by sector',
    ogType: 'website',
  });

  // 4. Hub list pages
  pages.push({
    path: '/breaches',
    title: 'FCA Fines by Breach Type | Market Abuse, AML, Principles and More',
    description:
      'Browse FCA fines by breach category. See which breach types drive the most penalties and jump into the dashboard with filters applied.',
    keywords: 'FCA fines by breach, market abuse FCA fines, AML FCA fines, FCA principles fines, breach category fines',
    ogType: 'website',
  });
  pages.push({
    path: '/years',
    title: 'FCA Fines by Year | 2013-2026 Annual Summaries',
    description:
      'Browse FCA fines by year. Compare enforcement totals and jump into the dashboard for each year’s full list of actions.',
    keywords: 'FCA fines by year, FCA fines 2026, FCA fines 2025, FCA enforcement by year',
    ogType: 'website',
  });
  pages.push({
    path: '/sectors',
    title: 'FCA Fines by Sector | Banks, Insurance, Individuals and More',
    description:
      'Browse FCA fines by firm category (sector). View which sectors receive the most penalties and jump into filtered dashboard views.',
    keywords: 'FCA fines by sector, FCA fines banks, FCA fines insurance, FCA fines individuals',
    ogType: 'website',
  });
  pages.push({
    path: '/firms',
    title: 'Top FCA Fine Recipients | Firms and Individuals With the Largest Penalties (2013-2026)',
    description:
      'Browse the biggest FCA fine recipients across 2013-2026. Open an entity page to see totals, largest penalties, and full enforcement history.',
    keywords:
      'top FCA fines firms, biggest FCA fines recipients, FCA fines by firm, FCA fines by individual, largest FCA penalties',
    ogType: 'website',
  });

  // 5. Blog listing
  pages.push({
    path: '/blog',
    title: 'FCA Fines Blog | Expert Analysis & Insights on Financial Conduct Authority Penalties',
    description: 'Expert analysis of FCA fines, biggest penalties, enforcement trends, and compliance guidance. Covering the 20 largest FCA fines, AML enforcement, banking sector penalties, and 2025 fines.',
    keywords: 'FCA fines blog, FCA fines analysis, FCA enforcement insights, biggest FCA fines, FCA fines 2025, FCA AML fines, FCA compliance guide',
    ogType: 'website',
  });

  // 6. Blog articles
  for (const article of blogArticles) {
    pages.push({
      path: `/blog/${article.slug}`,
      title: article.seoTitle,
      description: article.excerpt,
      keywords: article.keywords.join(', '),
      ogType: 'article',
      datePublished: article.dateISO,
      dateModified: article.dateISO,
      articleSection: article.category,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": article.seoTitle,
        "description": article.excerpt,
        "datePublished": article.dateISO,
        "dateModified": article.dateISO,
        "author": { "@type": "Organization", "name": "MEMA Consultants", "url": "https://memaconsultants.com" },
        "publisher": {
          "@type": "Organization",
          "name": SITE_NAME,
          "logo": { "@type": "ImageObject", "url": `${BASE_URL}/mema-logo.png` }
        },
        "mainEntityOfPage": { "@type": "WebPage", "@id": `${BASE_URL}/blog/${article.slug}` },
        "keywords": article.keywords.join(", "),
        "articleSection": article.category,
        "image": OG_IMAGE,
      },
    });
  }

  // 7. Yearly review articles
  for (const article of yearlyArticles) {
    pages.push({
      path: `/blog/${article.slug}`,
      title: article.seoTitle,
      description: article.excerpt,
      keywords: article.keywords.join(', '),
      ogType: 'article',
      datePublished: `${article.year}-01-01`,
      dateModified: `${article.year}-12-31`,
      articleSection: 'Annual Analysis',
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": article.seoTitle,
        "description": article.excerpt,
        "datePublished": `${article.year}-01-01`,
        "dateModified": `${article.year}-12-31`,
        "author": { "@type": "Organization", "name": "MEMA Consultants", "url": "https://memaconsultants.com" },
        "publisher": {
          "@type": "Organization",
          "name": SITE_NAME,
          "logo": { "@type": "ImageObject", "url": `${BASE_URL}/mema-logo.png` }
        },
        "mainEntityOfPage": { "@type": "WebPage", "@id": `${BASE_URL}/blog/${article.slug}` },
        "keywords": article.keywords.join(", "),
        "articleSection": "Annual Analysis",
        "image": OG_IMAGE,
      },
    });
  }

  // 8. DB-backed hub detail pages (best-effort; skip if env not available in build)
  try {
    const { listBreachCategories, listYears, listSectors, listTopFirms } = await import('../server/services/hubs.js');
    const [categories, years, sectors, firms] = await Promise.all([
      listBreachCategories(),
      listYears(),
      listSectors(),
      listTopFirms(120),
    ]);

    categories.slice(0, 30).forEach((cat: any) => {
      pages.push({
        path: `/breaches/${cat.slug}`,
        title: `${humanize(cat.name)} FCA Fines | ${cat.fineCount} actions totalling ${gbp.format(cat.totalAmount)}`,
        description: `Explore FCA enforcement actions tagged ${humanize(cat.name)}. ${cat.fineCount} actions totalling ${gbp.format(cat.totalAmount)} across 2013-2026.`,
        keywords: `FCA ${humanize(cat.name)} fines, ${humanize(cat.name)} enforcement, FCA fines by breach`,
        ogType: 'website',
      });
    });

    years.slice(0, 25).forEach((y: any) => {
      pages.push({
        path: `/years/${y.year}`,
        title: `FCA Fines ${y.year} | ${y.fineCount} actions totalling ${gbp.format(y.totalAmount)}`,
        description: `Explore FCA fines issued in ${y.year}. ${y.fineCount} actions totalling ${gbp.format(y.totalAmount)}.`,
        keywords: `FCA fines ${y.year}, FCA penalties ${y.year}, FCA enforcement ${y.year}`,
        ogType: 'website',
      });
    });

    sectors.slice(0, 30).forEach((s: any) => {
      pages.push({
        path: `/sectors/${s.slug}`,
        title: `FCA Fines for ${s.name} | ${s.fineCount} actions totalling ${gbp.format(s.totalAmount)}`,
        description: `Explore FCA enforcement actions for ${s.name}. ${s.fineCount} actions totalling ${gbp.format(s.totalAmount)} across 2013-2026.`,
        keywords: `FCA fines ${s.name}, FCA penalties ${s.name}, FCA fines by sector`,
        ogType: 'website',
      });
    });

    firms.slice(0, 120).forEach((f: any) => {
      pages.push({
        path: `/firms/${f.slug}`,
        title: `${f.name} FCA Fines | ${f.fineCount} actions totalling ${gbp.format(f.totalAmount)}`,
        description: `Explore FCA enforcement actions for ${f.name}. ${f.fineCount} actions totalling ${gbp.format(f.totalAmount)} across 2013-2026.`,
        keywords: `FCA fines ${f.name}, FCA penalties ${f.name}, FCA enforcement ${f.name}`,
        ogType: 'website',
      });
    });
  } catch (error) {
    console.warn('WARN: Skipping DB-backed hub pages in pre-render step:', error instanceof Error ? error.message : String(error));
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Replace <head> content in the HTML template
// ---------------------------------------------------------------------------

function renderPage(template: string, meta: PageMeta): string {
  const fullUrl = `${BASE_URL}${meta.path}`;
  const canonicalPath = meta.path === '/' ? '/' : meta.path;
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;

  let html = template;

  // Replace <title>
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(meta.title)}</title>`
  );

  // Replace meta[name="title"]
  html = html.replace(
    /<meta\s+name="title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="title" content="${escapeHtml(meta.title)}" />`
  );

  // Replace meta[name="description"] — use [^>]* to avoid catastrophic backtracking
  html = html.replace(
    /<meta\s+name="description"[^>]*\/>/,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`
  );

  // Replace meta[name="keywords"]
  html = html.replace(
    /<meta\s+name="keywords"[^>]*\/>/,
    `<meta name="keywords" content="${escapeHtml(meta.keywords)}" />`
  );

  // Replace canonical
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonicalUrl}" />`
  );

  // Replace hreflang URLs
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="en-gb"\s+href="[^"]*"\s*\/?>/,
    `<link rel="alternate" hreflang="en-gb" href="${canonicalUrl}" />`
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="en"\s+href="[^"]*"\s*\/?>/,
    `<link rel="alternate" hreflang="en" href="${canonicalUrl}" />`
  );
  html = html.replace(
    /<link\s+rel="alternate"\s+hreflang="x-default"\s+href="[^"]*"\s*\/?>/,
    `<link rel="alternate" hreflang="x-default" href="${canonicalUrl}" />`
  );

  // Replace OG tags
  html = html.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${meta.ogType}" />`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${fullUrl}" />`
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"[^>]*\/>/,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`
  );

  // Replace Twitter tags
  html = html.replace(
    /<meta\s+name="twitter:url"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:url" content="${fullUrl}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"[^>]*\/>/,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`
  );

  // Inject article-specific meta + JSON-LD for articles
  if (meta.ogType === 'article' && meta.jsonLd) {
    // Add article meta tags before </head>
    const articleMeta = [
      meta.datePublished ? `<meta property="article:published_time" content="${meta.datePublished}" />` : '',
      meta.dateModified ? `<meta property="article:modified_time" content="${meta.dateModified}" />` : '',
      meta.articleSection ? `<meta property="article:section" content="${escapeHtml(meta.articleSection)}" />` : '',
    ].filter(Boolean).join('\n    ');

    const jsonLdScript = `<script type="application/ld+json">\n    ${JSON.stringify(meta.jsonLd)}\n    </script>`;

    html = html.replace(
      '</head>',
      `    ${articleMeta}\n    ${jsonLdScript}\n  </head>`
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
    let changefreq = 'monthly';
    let priority = '0.75';

    if (page.path === '/') {
      priority = '1.0';
      changefreq = 'daily';
    } else if (page.path === '/dashboard') {
      priority = '0.95';
      changefreq = 'daily';
    } else if (page.path === '/topics') {
      priority = '0.9';
      changefreq = 'weekly';
    } else if (page.path === '/breaches' || page.path === '/years' || page.path === '/sectors' || page.path === '/firms') {
      priority = '0.85';
      changefreq = 'weekly';
    } else if (page.path === '/blog') {
      priority = '0.9';
      changefreq = 'weekly';
    } else if (page.datePublished) {
      // Blog articles use their publish date
      lastmod = clampISODate(page.dateModified || page.datePublished, buildDate);

      // Featured / recent articles get higher priority
      const isFeatured = blogArticles.some(a => `/blog/${a.slug}` === page.path && a.featured);
      if (isFeatured) {
        priority = '0.9';
        changefreq = 'weekly';
      } else if (page.path.includes('annual-review')) {
        // Yearly reviews: recent years get higher priority
        const yearMatch = page.path.match(/(\d{4})-annual-review/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;
        priority = year >= 2023 ? '0.85' : '0.75';
        changefreq = year >= 2024 ? 'weekly' : 'monthly';
      } else {
        priority = '0.8';
      }
    } else if (page.path.startsWith('/breaches/') || page.path.startsWith('/sectors/')) {
      priority = '0.75';
      changefreq = 'monthly';
    } else if (page.path.startsWith('/years/') || page.path.startsWith('/firms/')) {
      priority = '0.75';
      changefreq = 'monthly';
    }

    lines.push('  <url>');
    lines.push(`    <loc>${fullUrl}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push(`    <changefreq>${changefreq}</changefreq>`);
    lines.push(`    <priority>${priority}</priority>`);
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  return lines.join('\n') + '\n';
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
      pubDate: toRfc2822(`${a.year}-01-01`, buildDate),
      category: 'Annual Analysis',
    })),
  ].sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  const rssItems = items
    .slice(0, 60)
    .map((item) => {
      return [
        '    <item>',
        `      <title>${escapeHtml(item.title)}</title>`,
        `      <link>${item.link}</link>`,
        `      <guid isPermaLink="true">${item.guid}</guid>`,
        `      <pubDate>${item.pubDate}</pubDate>`,
        item.category ? `      <category>${escapeHtml(item.category)}</category>` : '',
        `      <description>${escapeHtml(item.description)}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeHtml(SITE_NAME)} Insights</title>`,
    `    <link>${BASE_URL}/blog</link>`,
    `    <description>${escapeHtml('Expert analysis of FCA enforcement actions, fines, and compliance insights.')}</description>`,
    `    <language>en-gb</language>`,
    `    <lastBuildDate>${toRfc2822(buildDate, buildDate)}</lastBuildDate>`,
    `    <atom:link href="${RSS_URL}" rel="self" type="application/rss+xml" />`,
    rssItems,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const templatePath = join(DIST, 'index.html');
  if (!existsSync(templatePath)) {
    console.error('ERROR: dist/index.html not found. Run `vite build` first.');
    process.exit(1);
  }

  const template = readFileSync(templatePath, 'utf-8');
  const pages = await buildPageMetas();

  console.log(`Pre-rendering ${pages.length} pages...`);

  let created = 0;
  for (const page of pages) {
    const html = renderPage(template, page);

    // Determine output path
    let outPath: string;
    if (page.path === '/') {
      // Homepage — already dist/index.html, overwrite with correct meta
      outPath = join(DIST, 'index.html');
    } else {
      // e.g. /blog/some-slug → dist/blog/some-slug/index.html
      outPath = join(DIST, page.path.slice(1), 'index.html');
    }

    const outDir = dirname(outPath);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    writeFileSync(outPath, html, 'utf-8');
    created++;
  }

  console.log(`  Created ${created} HTML files.`);

  // Generate sitemap
  const sitemap = generateSitemap(pages);
  const sitemapPath = join(DIST, 'sitemap.xml');
  writeFileSync(sitemapPath, sitemap, 'utf-8');
  console.log(`  Generated sitemap.xml with ${pages.length} URLs.`);

  // Generate RSS feed
  const rss = generateRss();
  const rssPath = join(DIST, 'rss.xml');
  writeFileSync(rssPath, rss, 'utf-8');
  console.log(`  Generated rss.xml.`);

  console.log('Done!');
}

main().catch((error) => {
  console.error('Pre-render failed:', error);
  process.exit(1);
});
