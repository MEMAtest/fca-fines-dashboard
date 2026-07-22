import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST = join(__dirname, '..', 'dist');
const BASE_URL = 'https://regactions.com';

function rootHtml(html: string) {
  const match = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script>/);
  return match?.[1] || '';
}

function h1Count(html: string) {
  return (html.match(/<h1\b/gi) || []).length;
}

function crawlableInternalLinks(html: string) {
  return Array.from(html.matchAll(/<a\s+[^>]*href="([^"]+)"/g))
    .map((match) => match[1])
    .filter((href) => href.startsWith('/') || href.startsWith(BASE_URL));
}

function readSitemapUrlsets() {
  return [
    'sitemap-core.xml',
    'sitemap-fca-fines.xml',
    'sitemap-regulators.xml',
    'sitemap-editorial.xml',
    'sitemap-country-risk.xml',
    'sitemap-entities.xml',
  ]
    .filter((filename) => existsSync(join(DIST, filename)))
    .map((filename) => readFileSync(join(DIST, filename), 'utf-8'))
    .join('\n');
}

/**
 * These tests verify the build-time pre-rendered HTML files in dist/
 * have correct SEO meta tags. They read static files directly (no server needed).
 */
test.describe('Pre-rendered HTML SEO Meta Tags', () => {
  test.describe('Homepage (dist/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'index.html'), 'utf-8');
    });

    test('should have correct title', () => {
      const match = html.match(/<title>([^<]+)<\/title>/);
      expect(match).toBeTruthy();
      expect(match![1]).toContain('RegActions');
    });

    test('should have correct canonical URL', () => {
      const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(`${BASE_URL}/`);
    });

    test('should have correct OG tags', () => {
      expect(html).toContain(`<meta property="og:url" content="${BASE_URL}/"`);
      expect(html).toContain('<meta property="og:type" content="website"');
      expect(html).toMatch(/<meta\s+property="og:title"\s+content="[^"]*RegActions/);
    });

    test('should have correct Twitter tags', () => {
      expect(html).toContain(`<meta name="twitter:url" content="${BASE_URL}/"`);
      expect(html).toMatch(/<meta\s+name="twitter:title"\s+content="[^"]*RegActions/);
    });

    test('should have the single-locale x-default hreflang', () => {
      expect(html).not.toContain('hreflang="en-gb"');
      expect(html).not.toContain('hreflang="en"');
      expect(html).toContain(`hreflang="x-default" href="${BASE_URL}/"`);
    });

    test('should expose crawlable body content before hydration', () => {
      expect(rootHtml(html).trim().length).toBeGreaterThan(500);
      expect(rootHtml(html)).not.toBe('');
      expect(h1Count(rootHtml(html))).toBe(1);
      expect(rootHtml(html)).toContain('Global Regulatory Fines & Enforcement Intelligence');
      expect(rootHtml(html)).toContain('/regulators');
      expect(rootHtml(html)).toContain('/search');
      expect(rootHtml(html)).toContain('/board-pack');
      expect(crawlableInternalLinks(rootHtml(html)).length).toBeGreaterThanOrEqual(8);
    });
  });

  test.describe('Data hub (dist/regulators/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'regulators', 'index.html'), 'utf-8');
    });

    test('should have data-hub-specific title', () => {
      const match = html.match(/<title>([^<]+)<\/title>/);
      expect(match).toBeTruthy();
      expect(match![1]).toContain('Data Hub');
    });

    test('should have canonical URL pointing to /regulators', () => {
      const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(`${BASE_URL}/regulators`);
    });

    test('should have OG URL pointing to /regulators', () => {
      expect(html).toContain(`<meta property="og:url" content="${BASE_URL}/regulators"`);
    });
  });

  test.describe('FCA fines landing page (dist/regulators/fca/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'regulators', 'fca', 'index.html'), 'utf-8');
    });

    test('should own the broad FCA fines query with an answer-first static body', () => {
      expect(html).toContain('<title>FCA Fines: Latest Penalties, Totals and Enforcement Actions | RegActions</title>');
      const body = rootHtml(html);
      expect(body).toContain('<h1 class="blog-post-title">FCA Fines and Enforcement Actions</h1>');
      expect(body).toContain('How much has the FCA fined firms and individuals in 2026?');
      expect(body).toContain('/topics/fca-fines-2026');
      expect(body).toContain('https://www.fca.org.uk/news/news-stories/2026-fines');
    });
  });

  test.describe('Topics (dist/topics/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'topics', 'index.html'), 'utf-8');
    });

    test('should have topics-specific canonical URL', () => {
      const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(`${BASE_URL}/topics`);
    });

    test('should have OG URL pointing to /topics', () => {
      expect(html).toContain(`<meta property="og:url" content="${BASE_URL}/topics"`);
    });

    test('should expose editorial topic cluster links before hydration', () => {
      const body = rootHtml(html);
      expect(body).toContain('/topics/fca-fines-2026');
      expect(body).toContain('/topics/aml-enforcement');
      expect(body).toContain('/topics/consumer-duty-enforcement');
      expect(body).toContain('/topics/market-abuse-enforcement');
      expect(body).toContain('/topics/board-reporting-governance');
    });
  });

  test.describe('Blog listing (dist/blog/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'blog', 'index.html'), 'utf-8');
    });

    test('should have blog-specific title', () => {
      const match = html.match(/<title>([^<]+)<\/title>/);
      expect(match).toBeTruthy();
      expect(match![1]).toContain('Blog');
    });

    test('should have canonical URL pointing to /blog', () => {
      const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(`${BASE_URL}/blog`);
    });

    test('should have og:type website', () => {
      expect(html).toContain('<meta property="og:type" content="website"');
    });

    test('should expose crawlable insight links before hydration', () => {
      const body = rootHtml(html);
      expect(body.trim().length).toBeGreaterThan(1000);
      expect(h1Count(body)).toBe(1);
      expect(body).toContain('Regulatory Insights');
      expect(body).toContain('/blog/wealth-managers-consumer-duty-enforcement');
      expect(body).toContain("Wealth Managers: Why You&#39;re at the Front");
      expect(body).not.toContain('/blog/biggest-fine-h1-2026-forensic');
      expect(body).not.toContain('DekaBank Deutsche Girozentrale');
      expect(body).toContain('/regulators');
      expect(body).toContain('/search');
      expect(body).toContain('/board-pack');
      expect(body).toContain('/topics/fca-fines-2026');
      expect(body).toContain('/topics/aml-enforcement');
      expect(body).toContain('/topics/consumer-duty-enforcement');
      expect(body).toContain('/topics/market-abuse-enforcement');
      expect(body).toContain('https://memaconsultants.com');

      const articleLinks = crawlableInternalLinks(body).filter((href) =>
        href.startsWith('/blog/'),
      );
      expect(new Set(articleLinks).size).toBeGreaterThanOrEqual(12);
    });

    test('should generate branded hero and social artwork for the lead article', () => {
      const slug = 'wealth-managers-consumer-duty-enforcement';
      for (const suffix of ['hero', 'square', 'portrait']) {
        expect(existsSync(join(DIST, 'blog', 'images', `${slug}-${suffix}.png`))).toBe(true);
      }
      expect(existsSync(join(DIST, 'og', `${slug}.png`))).toBe(true);
    });
  });

  test.describe('Topic clusters (dist/topics/*/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'topics', 'aml-enforcement', 'index.html'), 'utf-8');
    });

    test('should have cluster-specific canonical URL', () => {
      const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(`${BASE_URL}/topics/aml-enforcement`);
    });

    test('should expose crawlable cluster articles and actions', () => {
      const body = rootHtml(html);
      expect(body).toContain('AML Enforcement');
      expect(body).toContain('/blog/global-aml-enforcement-comparison-2026');
      expect(body).toContain('/blog/fca-aml-fines-anti-money-laundering');
      expect(body).toContain('/board-pack');
      expect(body).toContain('https://memaconsultants.com');
    });
  });

  test.describe('FCA fines 2026 report (dist/topics/fca-fines-2026/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'topics', 'fca-fines-2026', 'index.html'), 'utf-8');
    });

    test('should answer the query and expose source-linked paths before hydration', () => {
      const body = rootHtml(html);
      expect(body).toContain('How much has the FCA fined firms and individuals in 2026?');
      expect(body).toContain('Monthly breakdown');
      expect(body).toContain('https://www.fca.org.uk/news/news-stories/2026-fines');
      expect(body).toContain('/regulators/fca');
      expect(body).toContain('/fines/actions?regulator=FCA&amp;year=2026');
    });

    test('should publish Dataset structured data', () => {
      expect(html).toContain('"@type":"Dataset"');
      expect(html).toContain('FCA fines issued in 2026');
    });
  });

  test.describe('FCA fine case prerender inventory', () => {
    test('should publish only indexable case pages in the dedicated sitemap', () => {
      const index = readFileSync(join(DIST, 'sitemap.xml'), 'utf-8');
      const caseSitemapPath = join(DIST, 'sitemap-fca-fines.xml');
      if (!existsSync(caseSitemapPath)) {
        expect(index).not.toContain('/sitemap-fca-fines.xml');
        return;
      }

      expect(index).toContain(`${BASE_URL}/sitemap-fca-fines.xml`);
      const caseSitemap = readFileSync(caseSitemapPath, 'utf-8');
      const caseUrls = Array.from(caseSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1]);
      expect(caseUrls.length).toBeGreaterThan(0);

      const representativeUrl = new URL(caseUrls[0]);
      expect(representativeUrl.pathname).toMatch(/^\/fca-fines\/\d{4}\/[a-z0-9-]+\/[^/]+$/);
      const html = readFileSync(join(DIST, representativeUrl.pathname.slice(1), 'index.html'), 'utf-8');
      expect(html).toContain(`<link rel="canonical" href="${representativeUrl.href}" />`);
      expect(html).not.toContain('name="robots" content="noindex, follow"');
      expect(html).toContain('Official evidence');
      expect(html).toContain('https://www.fca.org.uk/');
      expect(crawlableInternalLinks(rootHtml(html))).toEqual(expect.arrayContaining([
        '/regulators/fca',
        `/years/${representativeUrl.pathname.split('/')[2]}`,
      ]));
    });
  });

  test.describe('Blog article pages have unique meta', () => {
    const articleSlugs = [
      { slug: '20-biggest-fca-fines-of-all-time', titleContains: 'Biggest FCA Fines' },
      { slug: 'fca-fines-2025-complete-list', titleContains: 'FCA Fines 2025' },
      { slug: 'fca-aml-fines-anti-money-laundering', titleContains: 'AML' },
    ];

    for (const { slug, titleContains } of articleSlugs) {
      test(`${slug} should have unique title containing "${titleContains}"`, () => {
        const html = readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf-8');
        const match = html.match(/<title>([^<]+)<\/title>/);
        expect(match).toBeTruthy();
        expect(match![1]).toContain(titleContains);
      });

      test(`${slug} should have correct canonical URL`, () => {
        const html = readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf-8');
        const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
        expect(match).toBeTruthy();
        expect(match![1]).toBe(`${BASE_URL}/blog/${slug}`);
      });

      test(`${slug} should have og:type article`, () => {
        const html = readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf-8');
        expect(html).toContain('<meta property="og:type" content="article"');
      });

      test(`${slug} should have article:published_time meta`, () => {
        const html = readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf-8');
        expect(html).toMatch(/<meta\s+property="article:published_time"\s+content="\d{4}-\d{2}-\d{2}"/);
      });

      test(`${slug} should have Article JSON-LD schema`, () => {
        const html = readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf-8');
        // Find the article-specific JSON-LD (not the site-wide one)
        const jsonLdMatches = html.match(/<script\s+type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g);
        expect(jsonLdMatches).toBeTruthy();
        expect(jsonLdMatches!.length).toBeGreaterThanOrEqual(2); // site-wide + article

        const schema = jsonLdMatches!
          .map((script) =>
            JSON.parse(script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim()),
          )
          .find((block) => block['@type'] === 'Article');
        expect(schema).toBeTruthy();
        expect(schema['@type']).toBe('Article');
        expect(schema.headline).toBeTruthy();
        expect(schema.image?.url).toBe(`${BASE_URL}/og/${slug}.png`);
      });
    }
  });

  test.describe('Yearly review articles have unique meta', () => {
    const yearlyArticles = [
      { slug: 'fca-fines-2025-annual-review', year: 2025 },
      { slug: 'fca-fines-2021-annual-review', year: 2021 },
      { slug: 'fca-fines-2013-annual-review', year: 2013 },
    ];

    for (const { slug, year } of yearlyArticles) {
      test(`${slug} should have year ${year} in title`, () => {
        const html = readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf-8');
        const match = html.match(/<title>([^<]+)<\/title>/);
        expect(match).toBeTruthy();
        expect(match![1]).toContain(`${year}`);
      });

      test(`${slug} should have annual review canonical`, () => {
        const html = readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf-8');
        const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
        expect(match![1]).toBe(`${BASE_URL}/blog/${slug}`);
      });

      test(`${slug} should have article:section "Annual Analysis"`, () => {
        const html = readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf-8');
        expect(html).toContain('<meta property="article:section" content="Annual Analysis"');
      });
    }
  });

  test.describe('FAQ page (dist/faq/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'faq', 'index.html'), 'utf-8');
    });

    test('should have correct title under 65 chars', () => {
      const match = html.match(/<title>([^<]+)<\/title>/);
      expect(match).toBeTruthy();
      expect(match![1]).toContain('Regulatory Fines FAQ');
      expect(match![1].length).toBeLessThanOrEqual(65);
    });

    test('should have meta description under 160 chars', () => {
      const match = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1].length).toBeLessThanOrEqual(160);
      expect(match![1]).toContain('45+');
    });

    test('should have correct canonical URL', () => {
      const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(`${BASE_URL}/faq`);
    });

    test('should have OG tags', () => {
      expect(html).toContain(`<meta property="og:url" content="${BASE_URL}/faq"`);
      expect(html).toContain('<meta property="og:type" content="website"');
    });

    test('should have global keywords', () => {
      const match = html.match(/<meta\s+name="keywords"\s+content="([^"]+)"/);
      expect(match).toBeTruthy();
      const keywords = match![1].toLowerCase();
      expect(keywords).toContain('bafin');
      expect(keywords).toContain('sec');
      expect(keywords).toContain('asic');
    });

    test('should have FAQPage JSON-LD schema', () => {
      const jsonLdMatches = html.match(/<script\s+type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g);
      expect(jsonLdMatches).toBeTruthy();

      // Find FAQPage schema
      let hasFaqPage = false;
      for (const block of jsonLdMatches!) {
        const content = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
        try {
          const schema = JSON.parse(content);
          if (schema['@type'] === 'FAQPage') {
            hasFaqPage = true;
            expect(schema.mainEntity.length).toBeGreaterThanOrEqual(30);
          }
          if (schema['@graph']) {
            const faqNode = schema['@graph'].find((n: any) => n['@type'] === 'FAQPage');
            if (faqNode) {
              hasFaqPage = true;
              expect(faqNode.mainEntity.length).toBeGreaterThanOrEqual(30);
            }
          }
        } catch {
          // skip invalid JSON-LD
        }
      }
      expect(hasFaqPage).toBe(true);
    });
  });

  test.describe('All pre-rendered files have distinct titles (no duplicates)', () => {
    test('no two pages share the same title', () => {
      const paths = [
        'index.html',
        'regulators/index.html',
        'blog/index.html',
        'faq/index.html',
        'blog/20-biggest-fca-fines-of-all-time/index.html',
        'blog/fca-fines-2025-complete-list/index.html',
        'blog/fca-fines-2021-annual-review/index.html',
        'blog/fca-fines-2024-annual-review/index.html',
      ];

      const titles: string[] = [];
      for (const p of paths) {
        const html = readFileSync(join(DIST, p), 'utf-8');
        const match = html.match(/<title>([^<]+)<\/title>/);
        expect(match).toBeTruthy();
        titles.push(match![1]);
      }

      // All titles should be unique
      const unique = new Set(titles);
      expect(unique.size).toBe(titles.length);
    });
  });
});

test.describe('Sitemap Validation', () => {
  let sitemapIndex: string;
  let sitemap: string;

  test.beforeAll(() => {
    sitemapIndex = readFileSync(join(DIST, 'sitemap.xml'), 'utf-8');
    sitemap = readSitemapUrlsets();
  });

  test('should have an index with section-specific URL sets', () => {
    expect(sitemapIndex).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemapIndex).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemapIndex).toContain(`<loc>${BASE_URL}/sitemap-core.xml</loc>`);
    expect(sitemapIndex).toContain(`<loc>${BASE_URL}/sitemap-regulators.xml</loc>`);
    expect(sitemapIndex).toContain(`<loc>${BASE_URL}/sitemap-editorial.xml</loc>`);
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  test('should contain all 30 URLs', () => {
    const urlCount = (sitemap.match(/<loc>/g) || []).length;
    // Base set is: homepage, data hub, topics + 4 hub list pages, blog listing,
    // all blog articles, and all yearly review articles.
    expect(urlCount).toBeGreaterThanOrEqual(35);
  });

  test('should contain the homepage without ignored priority hints', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/</loc>`);
    expect(sitemap).not.toContain('<priority>');
    expect(sitemap).not.toContain('<changefreq>');
  });

  test('should contain data hub URL and exclude legacy dashboard canonical', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/regulators</loc>`);
    expect(sitemap).not.toContain(`<loc>${BASE_URL}/dashboard</loc>`);
  });

  test('should contain topics URL', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/topics</loc>`);
  });

  test('should contain editorial topic cluster URLs', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/topics/fca-fines-2026</loc>`);
    expect(sitemap).toContain(`<loc>${BASE_URL}/topics/aml-enforcement</loc>`);
    expect(sitemap).toContain(`<loc>${BASE_URL}/topics/consumer-duty-enforcement</loc>`);
    expect(sitemap).toContain(`<loc>${BASE_URL}/topics/market-abuse-enforcement</loc>`);
    expect(sitemap).toContain(`<loc>${BASE_URL}/topics/board-reporting-governance</loc>`);
  });

  test('should contain hub list URLs', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/breaches</loc>`);
    expect(sitemap).toContain(`<loc>${BASE_URL}/years</loc>`);
    expect(sitemap).toContain(`<loc>${BASE_URL}/sectors</loc>`);
    expect(sitemap).toContain(`<loc>${BASE_URL}/firms</loc>`);
  });

  test('should contain blog listing URL', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/blog</loc>`);
  });

  test('should contain all 10 blog article URLs', () => {
    const blogSlugs = [
      '20-biggest-fca-fines-of-all-time',
      'fca-fines-2025-complete-list',
      'fca-fines-database-how-to-search',
      'fca-aml-fines-anti-money-laundering',
      'fca-fines-banks-complete-list',
      'fca-enforcement-trends-2013-2025',
      'fca-final-notices-explained',
      'senior-managers-regime-fca-fines',
      'fca-fines-january-2026',
      'fca-enforcement-outlook-february-2026',
      'fca-fines-february-2026',
      'fca-fines-individuals-personal-accountability',
      'fca-fines-march-2026',
      'fca-fines-insurance-sector',
    ];

    for (const slug of blogSlugs) {
      expect(sitemap).toContain(`<loc>${BASE_URL}/blog/${slug}</loc>`);
    }
  });

  test('should contain all 13 yearly review URLs (2013-2025)', () => {
    for (let year = 2013; year <= 2025; year++) {
      expect(sitemap).toContain(`<loc>${BASE_URL}/blog/fca-fines-${year}-annual-review</loc>`);
    }
  });

  test('should have valid W3C lastmod dates', () => {
    const lastmods = sitemap.match(/<lastmod>([^<]+)<\/lastmod>/g) || [];
    const urlCount = (sitemap.match(/<loc>/g) || []).length;
    expect(lastmods.length).toBeGreaterThan(0);
    expect(lastmods.length).toBeLessThan(urlCount);

    for (const lm of lastmods) {
      const date = lm.replace(/<\/?lastmod>/g, '');
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('should not promote noindex pages in URL sets', () => {
    expect(sitemap).not.toContain('/404</loc>');
  });
});

test.describe('Homepage and Data Hub Live Routes', () => {
  test('homepage should render with correct content', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');

    // Should have the main heading
    await expect(page.locator('h1')).toBeVisible();

    // Should have navigation elements (multiple navs: header + footer)
    await expect(page.locator('nav').first()).toBeVisible();
  });

  test('legacy dashboard route should redirect to the fines workspace', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/fines');

    await expect(page).toHaveTitle(/RegActions|Fines/);
  });

  test('homepage should have correct document title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toContain('RegActions');
  });

  test('dashboard should redirect to fines and keep a workspace title', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/fines');
    await expect(page).toHaveTitle(/RegActions|Dashboard|Fines/);
  });
});
