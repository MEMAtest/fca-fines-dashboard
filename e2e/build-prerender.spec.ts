import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test.describe('Build & Pre-rendering', () => {
  const DIST_DIR = join(__dirname, '..', 'dist');

  test.describe('Pre-rendered HTML Files', () => {
    test('should have pre-rendered homepage', () => {
      const homepagePath = join(DIST_DIR, 'index.html');
      expect(existsSync(homepagePath)).toBe(true);

      const html = readFileSync(homepagePath, 'utf-8');

      // Should have correct meta tags
      expect(html).toContain('FCA Fines Database');
      expect(html).toContain('<meta name="description"');
      expect(html).toContain('og:type');
    });

    test('should have pre-rendered dashboard page', () => {
      const dashboardPath = join(DIST_DIR, 'dashboard', 'index.html');
      expect(existsSync(dashboardPath)).toBe(true);

      const html = readFileSync(dashboardPath, 'utf-8');
      expect(html).toContain('FCA Fines Dashboard');
    });

    test('should have pre-rendered blog listing page', () => {
      const blogPath = join(DIST_DIR, 'blog', 'index.html');
      expect(existsSync(blogPath)).toBe(true);

      const html = readFileSync(blogPath, 'utf-8');
      expect(html).toContain('FCA Fines Blog');
    });

    test('should have pre-rendered blog article: 20-biggest-fca-fines-of-all-time', () => {
      const articlePath = join(DIST_DIR, 'blog', '20-biggest-fca-fines-of-all-time', 'index.html');
      expect(existsSync(articlePath)).toBe(true);

      const html = readFileSync(articlePath, 'utf-8');

      // Should have article-specific meta tags
      expect(html).toContain('20 Biggest FCA Fines of All Time');
      expect(html).toContain('og:type" content="article"');
      expect(html).toContain('article:published_time');
      expect(html).toContain('application/ld+json');

      // Should have Article JSON-LD structured data (last JSON-LD block)
      const jsonLdMatches = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g);
      expect(jsonLdMatches).toBeTruthy();
      expect(jsonLdMatches!.length).toBeGreaterThanOrEqual(2);

      // The article-specific JSON-LD is the last one
      const lastMatch = jsonLdMatches![jsonLdMatches!.length - 1];
      const jsonContent = lastMatch.replace(/<script[^>]*>\s*/, '').replace(/\s*<\/script>/, '');
      const jsonLd = JSON.parse(jsonContent);
      expect(jsonLd['@type']).toBe('Article');
      expect(jsonLd.headline).toBeTruthy();
    });

    test('should have pre-rendered blog article: fca-fines-2025-complete-list', () => {
      const articlePath = join(DIST_DIR, 'blog', 'fca-fines-2025-complete-list', 'index.html');
      expect(existsSync(articlePath)).toBe(true);

      const html = readFileSync(articlePath, 'utf-8');
      expect(html).toContain('FCA Fines 2025');
      expect(html).toContain('og:type" content="article"');
    });

    test('should have pre-rendered yearly article: 2024', () => {
      const articlePath = join(DIST_DIR, 'blog', 'fca-fines-2024-annual-review', 'index.html');
      expect(existsSync(articlePath)).toBe(true);

      const html = readFileSync(articlePath, 'utf-8');

      // Should have year-specific content
      expect(html).toContain('2024');
      expect(html).toContain('Annual Analysis');
      expect(html).toContain('article:section" content="Annual Analysis"');

      // Should have Article JSON-LD with year dates (last JSON-LD block)
      const jsonLdMatches = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g);
      expect(jsonLdMatches).toBeTruthy();
      expect(jsonLdMatches!.length).toBeGreaterThanOrEqual(2);

      const lastMatch = jsonLdMatches![jsonLdMatches!.length - 1];
      const jsonContent = lastMatch.replace(/<script[^>]*>\s*/, '').replace(/\s*<\/script>/, '');
      const jsonLd = JSON.parse(jsonContent);
      expect(jsonLd.datePublished).toBe('2024-01-01');
      expect(jsonLd.dateModified).toBe('2024-12-31');
    });

    test('should have pre-rendered all 10 blog articles', () => {
      const blogArticles = [
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
      ];

      for (const slug of blogArticles) {
        const articlePath = join(DIST_DIR, 'blog', slug, 'index.html');
        expect(existsSync(articlePath)).toBe(true);
      }
    });

    test('should have pre-rendered all 13 yearly articles', () => {
      const years = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

      for (const year of years) {
        const articlePath = join(DIST_DIR, 'blog', `fca-fines-${year}-annual-review`, 'index.html');
        expect(existsSync(articlePath)).toBe(true);
      }
    });
  });

  test.describe('Sitemap.xml', () => {
    test('should have generated sitemap.xml', () => {
      const sitemapPath = join(DIST_DIR, 'sitemap.xml');
      expect(existsSync(sitemapPath)).toBe(true);

      const sitemap = readFileSync(sitemapPath, 'utf-8');

      // Should be valid XML
      expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

      // Should have homepage
      expect(sitemap).toContain('<loc>https://fcafines.memaconsultants.com/</loc>');

      // Should have dashboard
      expect(sitemap).toContain('<loc>https://fcafines.memaconsultants.com/dashboard</loc>');

      // Should have blog listing
      expect(sitemap).toContain('<loc>https://fcafines.memaconsultants.com/blog</loc>');
    });

    test('should have all 28 blog article URLs in sitemap', () => {
      const sitemapPath = join(DIST_DIR, 'sitemap.xml');
      const sitemap = readFileSync(sitemapPath, 'utf-8');

      // 10 blog articles + 13 yearly articles = 23 blog URLs
      // Plus homepage, dashboard, blog listing = 28 total URLs

      // Count <url> tags
      const urlMatches = sitemap.match(/<url>/g);
      expect(urlMatches).toBeTruthy();
      expect(urlMatches!.length).toBe(28);

      // Check some specific blog URLs
      expect(sitemap).toContain('https://fcafines.memaconsultants.com/blog/20-biggest-fca-fines-of-all-time');
      expect(sitemap).toContain('https://fcafines.memaconsultants.com/blog/fca-fines-2025-complete-list');
      expect(sitemap).toContain('https://fcafines.memaconsultants.com/blog/fca-fines-2024-annual-review');
      expect(sitemap).toContain('https://fcafines.memaconsultants.com/blog/fca-fines-2013-annual-review');
    });

    test('should have correct priority and changefreq in sitemap', () => {
      const sitemapPath = join(DIST_DIR, 'sitemap.xml');
      const sitemap = readFileSync(sitemapPath, 'utf-8');

      // Homepage should have priority 1.0 and daily changefreq
      const homepageUrl = sitemap.match(/<url>[\s\S]*?<loc>https:\/\/fcafines\.memaconsultants\.com\/<\/loc>[\s\S]*?<\/url>/);
      expect(homepageUrl).toBeTruthy();
      expect(homepageUrl![0]).toContain('<priority>1.0</priority>');
      expect(homepageUrl![0]).toContain('<changefreq>daily</changefreq>');

      // Dashboard should have priority 0.95 and daily changefreq
      const dashboardUrl = sitemap.match(/<url>[\s\S]*?<loc>https:\/\/fcafines\.memaconsultants\.com\/dashboard<\/loc>[\s\S]*?<\/url>/);
      expect(dashboardUrl).toBeTruthy();
      expect(dashboardUrl![0]).toContain('<priority>0.95</priority>');

      // Blog listing should have priority 0.9
      const blogUrl = sitemap.match(/<url>[\s\S]*?<loc>https:\/\/fcafines\.memaconsultants\.com\/blog<\/loc>[\s\S]*?<\/url>/);
      expect(blogUrl).toBeTruthy();
      expect(blogUrl![0]).toContain('<priority>0.9</priority>');
    });

    test('should have lastmod dates in sitemap', () => {
      const sitemapPath = join(DIST_DIR, 'sitemap.xml');
      const sitemap = readFileSync(sitemapPath, 'utf-8');

      // Should have <lastmod> tags
      const lastmodMatches = sitemap.match(/<lastmod>/g);
      expect(lastmodMatches).toBeTruthy();
      expect(lastmodMatches!.length).toBe(28);

      // Date format should be YYYY-MM-DD
      expect(sitemap).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    });
  });

  test.describe('robots.txt', () => {
    test('should have robots.txt with blog allowed', () => {
      const robotsPath = join(DIST_DIR, 'robots.txt');
      expect(existsSync(robotsPath)).toBe(true);

      const robots = readFileSync(robotsPath, 'utf-8');

      // Should allow blog
      expect(robots).toContain('Allow: /blog/');

      // Should have sitemap reference
      expect(robots).toContain('Sitemap:');
      expect(robots).toContain('sitemap.xml');
    });
  });
});
