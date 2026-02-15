import { test, expect } from '@playwright/test';

test.describe('SEO Meta Tags', () => {
  test.describe('Blog Article SEO Tags', () => {
    test('should have correct SEO meta tags for blog article', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Wait for React to render and useSEO to fire
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Title tag (updated by useSEO client-side)
      await expect(page).toHaveTitle(/20 Biggest FCA Fines of All Time/);

      // Meta description
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();
      expect(description!.toLowerCase()).toContain('fca fines');

      // Meta keywords
      const keywords = await page.locator('meta[name="keywords"]').getAttribute('content');
      expect(keywords).toBeTruthy();

      // Canonical URL
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toContain('/blog/20-biggest-fca-fines-of-all-time');

      // Open Graph tags
      const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
      expect(ogType).toBe('article');

      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      expect(ogTitle).toContain('FCA Fines');

      const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
      expect(ogDescription).toBeTruthy();

      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
      expect(ogUrl).toContain('/blog/20-biggest-fca-fines-of-all-time');

      const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(ogImage).toBeTruthy();

      // Article meta tags
      const articlePublished = await page.locator('meta[property="article:published_time"]').getAttribute('content');
      expect(articlePublished).toBeTruthy();

      const articleModified = await page.locator('meta[property="article:modified_time"]').getAttribute('content');
      expect(articleModified).toBeTruthy();

      const articleSection = await page.locator('meta[property="article:section"]').getAttribute('content');
      expect(articleSection).toBeTruthy();

      // Twitter Card tags
      const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
      expect(twitterCard).toBe('summary_large_image');

      const twitterTitle = await page.locator('meta[name="twitter:title"]').getAttribute('content');
      expect(twitterTitle).toContain('FCA Fines');

      const twitterDescription = await page.locator('meta[name="twitter:description"]').getAttribute('content');
      expect(twitterDescription).toBeTruthy();
    });

    test('should have JSON-LD structured data for blog article', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Wait for React to render and inject JSON-LD
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Find all JSON-LD script tags and get the Article one
      const jsonLdScripts = await page.locator('script[type="application/ld+json"]').all();
      expect(jsonLdScripts.length).toBeGreaterThanOrEqual(1);

      // Find the Article JSON-LD (injected by React injectStructuredData)
      let articleSchema = null;
      for (const script of jsonLdScripts) {
        const text = await script.textContent();
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed['@type'] === 'Article') {
            articleSchema = parsed;
            break;
          }
        }
      }

      expect(articleSchema).toBeTruthy();
      expect(articleSchema['@context']).toBe('https://schema.org');
      expect(articleSchema.headline).toBeTruthy();
      expect(articleSchema.description).toBeTruthy();
      expect(articleSchema.datePublished).toBeTruthy();
      expect(articleSchema.author).toBeTruthy();
      expect(articleSchema.publisher).toBeTruthy();
      expect(articleSchema.mainEntityOfPage).toBeTruthy();
      expect(articleSchema.keywords).toBeTruthy();
    });
  });

  test.describe('Yearly Article SEO Tags', () => {
    test('should have correct SEO meta tags for yearly article', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      // Wait for React to render
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Title tag
      await expect(page).toHaveTitle(/2024/);

      // Meta description
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();

      // Canonical URL
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toContain('/blog/fca-fines-2024-annual-review');

      // Open Graph type should be article
      const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
      expect(ogType).toBe('article');

      // Article section should be "Annual Analysis"
      const articleSection = await page.locator('meta[property="article:section"]').getAttribute('content');
      expect(articleSection).toBe('Annual Analysis');

      // Article published/modified dates should be year-based
      const articlePublished = await page.locator('meta[property="article:published_time"]').getAttribute('content');
      expect(articlePublished).toContain('2024');

      const articleModified = await page.locator('meta[property="article:modified_time"]').getAttribute('content');
      expect(articleModified).toContain('2024');
    });

    test('should have JSON-LD structured data for yearly article', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      // Wait for React to render and inject JSON-LD
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Find Article JSON-LD
      const jsonLdScripts = await page.locator('script[type="application/ld+json"]').all();
      let articleSchema = null;
      for (const script of jsonLdScripts) {
        const text = await script.textContent();
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed['@type'] === 'Article') {
            articleSchema = parsed;
            break;
          }
        }
      }

      expect(articleSchema).toBeTruthy();
      expect(articleSchema['@type']).toBe('Article');
      expect(articleSchema.datePublished).toContain('2024-01-01');
      expect(articleSchema.dateModified).toContain('2024-12-31');
      expect(articleSchema.author['@type']).toBe('Organization');
      expect(articleSchema.author.name).toBe('MEMA Consultants');
    });
  });

  test.describe('Blog Listing Page SEO Tags', () => {
    test('should have correct SEO meta tags for blog listing', async ({ page }) => {
      await page.goto('/blog');

      // Wait for blog page to render
      await expect(page.locator('h1')).toBeVisible();

      // Title tag
      await expect(page).toHaveTitle(/FCA Fines Blog/);

      // Meta description
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();
      expect(description!.toLowerCase()).toContain('fca fines');

      // Canonical URL
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toContain('/blog');

      // Open Graph type should be blog
      const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
      expect(ogType).toBe('blog');
    });
  });

  test.describe('Schema.org Microdata on Article Pages', () => {
    test('should have itemScope and itemType on article element', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Article element should have schema.org microdata
      const article = page.locator('article[itemScope][itemType="https://schema.org/Article"]');
      await expect(article).toBeVisible();

      // Headline should have itemProp
      const headline = page.locator('[itemProp="headline"]');
      await expect(headline).toBeVisible();

      // Article section should have itemProp
      const articleSection = page.locator('[itemProp="articleSection"]');
      await expect(articleSection).toBeVisible();

      // Date published should have itemProp
      const datePublished = page.locator('[itemProp="datePublished"]');
      await expect(datePublished).toBeVisible();

      // Article body should have itemProp
      const articleBody = page.locator('[itemProp="articleBody"]');
      await expect(articleBody).toBeVisible();
    });

    test('should have microdata on yearly article element', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      // Article element should have schema.org microdata
      const article = page.locator('article[itemScope][itemType="https://schema.org/Article"]');
      await expect(article).toBeVisible();

      // Article body should have itemProp
      const articleBody = page.locator('[itemProp="articleBody"]');
      await expect(articleBody).toBeVisible();
    });
  });
});
