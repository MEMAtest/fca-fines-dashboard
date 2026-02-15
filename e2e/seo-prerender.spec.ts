import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST = join(__dirname, '..', 'dist');
const BASE_URL = 'https://fcafines.memaconsultants.com';

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
      expect(match![1]).toContain('FCA Fines Database');
    });

    test('should have correct canonical URL', () => {
      const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(`${BASE_URL}/`);
    });

    test('should have correct OG tags', () => {
      expect(html).toContain(`<meta property="og:url" content="${BASE_URL}/"`);
      expect(html).toContain('<meta property="og:type" content="website"');
      expect(html).toMatch(/<meta\s+property="og:title"\s+content="[^"]*FCA Fines/);
    });

    test('should have correct Twitter tags', () => {
      expect(html).toContain(`<meta name="twitter:url" content="${BASE_URL}/"`);
      expect(html).toMatch(/<meta\s+name="twitter:title"\s+content="[^"]*FCA Fines/);
    });

    test('should have hreflang tags pointing to homepage', () => {
      expect(html).toContain(`hreflang="en-gb" href="${BASE_URL}/"`);
      expect(html).toContain(`hreflang="en" href="${BASE_URL}/"`);
      expect(html).toContain(`hreflang="x-default" href="${BASE_URL}/"`);
    });
  });

  test.describe('Dashboard (dist/dashboard/index.html)', () => {
    let html: string;

    test.beforeAll(() => {
      html = readFileSync(join(DIST, 'dashboard', 'index.html'), 'utf-8');
    });

    test('should have dashboard-specific title', () => {
      const match = html.match(/<title>([^<]+)<\/title>/);
      expect(match).toBeTruthy();
      expect(match![1]).toContain('Dashboard');
    });

    test('should have canonical URL pointing to /dashboard', () => {
      const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      expect(match).toBeTruthy();
      expect(match![1]).toBe(`${BASE_URL}/dashboard`);
    });

    test('should have OG URL pointing to /dashboard', () => {
      expect(html).toContain(`<meta property="og:url" content="${BASE_URL}/dashboard"`);
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

        // Parse the article JSON-LD (last one)
        const lastJsonLd = jsonLdMatches![jsonLdMatches!.length - 1];
        const jsonContent = lastJsonLd.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
        const schema = JSON.parse(jsonContent);
        expect(schema['@type']).toBe('Article');
        expect(schema.headline).toBeTruthy();
        expect(schema.image).toBe(`${BASE_URL}/og-image.png`);
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

  test.describe('All pre-rendered files have distinct titles (no duplicates)', () => {
    test('no two pages share the same title', () => {
      const paths = [
        'index.html',
        'dashboard/index.html',
        'blog/index.html',
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
  let sitemap: string;

  test.beforeAll(() => {
    sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf-8');
  });

  test('should be valid XML with urlset root', () => {
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(sitemap).toContain('</urlset>');
  });

  test('should contain all 30 URLs', () => {
    const urlCount = (sitemap.match(/<loc>/g) || []).length;
    // Base set is: homepage, dashboard, topics + 4 hub list pages, blog listing,
    // all blog articles, and all yearly review articles.
    expect(urlCount).toBeGreaterThanOrEqual(35);
  });

  test('should contain homepage with priority 1.0', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/</loc>`);
    // Homepage should have priority 1.0
    const homepageBlock = sitemap.match(new RegExp(`<url>[\\s\\S]*?${BASE_URL}/</loc>[\\s\\S]*?</url>`));
    expect(homepageBlock).toBeTruthy();
    expect(homepageBlock![0]).toContain('<priority>1.0</priority>');
  });

  test('should contain dashboard URL', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/dashboard</loc>`);
  });

  test('should contain topics URL', () => {
    expect(sitemap).toContain(`<loc>${BASE_URL}/topics</loc>`);
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

  test('should have valid lastmod dates in YYYY-MM-DD format', () => {
    const lastmods = sitemap.match(/<lastmod>([^<]+)<\/lastmod>/g) || [];
    const urlCount = (sitemap.match(/<loc>/g) || []).length;
    expect(lastmods.length).toBe(urlCount);

    for (const lm of lastmods) {
      const date = lm.replace(/<\/?lastmod>/g, '');
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('should have valid priorities between 0 and 1', () => {
    const priorities = sitemap.match(/<priority>([^<]+)<\/priority>/g) || [];
    const urlCount = (sitemap.match(/<loc>/g) || []).length;
    expect(priorities.length).toBe(urlCount);

    for (const p of priorities) {
      const val = parseFloat(p.replace(/<\/?priority>/g, ''));
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('Homepage and Dashboard Live Routes', () => {
  test('homepage should render with correct content', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');

    // Should have the main heading
    await expect(page.locator('h1')).toBeVisible();

    // Should have navigation elements (multiple navs: header + footer)
    await expect(page.locator('nav').first()).toBeVisible();
  });

  test('dashboard should render', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');

    // Should have dashboard title
    await expect(page.locator('h1')).toBeVisible();
  });

  test('homepage should have correct document title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toContain('FCA Fines');
  });

  test('dashboard should have FCA Fines in document title', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveTitle(/Dashboard/);
  });
});
