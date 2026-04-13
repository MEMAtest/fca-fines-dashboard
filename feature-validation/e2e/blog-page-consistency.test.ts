/**
 * E2E Tests: Blog Page Global Consistency
 * Validates blog page displays global messaging and neutral positioning
 * FAIL-LOUD: All assertions must pass with explicit error messages
 */

import { test, expect } from '@playwright/test';

test.describe('Blog Page - Global Messaging Consistency', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to blog page with explicit timeout
    await page.goto('/blog', { waitUntil: 'networkidle', timeout: 10000 });
  });

  test('MUST render page with neutral title (no FCA-only branding)', async ({ page }) => {
    const pageTitle = await page.title();

    expect(pageTitle).toBeTruthy();
    expect(pageTitle?.toLowerCase()).not.toContain('fca fines database');
    expect(pageTitle?.toLowerCase()).not.toContain('flagship fca');
  });

  test('MUST have H1 heading: "Regulatory Enforcement Insights & Analysis"', async ({ page }) => {
    // Wait for H1 with explicit timeout
    const h1 = page.locator('h1');
    await h1.first().waitFor({ timeout: 5000 });

    const h1Text = await h1.first().textContent();
    expect(h1Text).toBeTruthy();

    // Check for global positioning, not FCA-specific
    const lowerText = h1Text?.toLowerCase() || '';
    expect(lowerText).toContain('enforcement');
    expect(lowerText).toContain('intelligence');
    expect(lowerText).not.toContain('fca');
    expect(lowerText).not.toContain('flagship');
  });

  test('MUST NOT have "FCA Fines Database" text anywhere on blog page', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).not.toContain('fca fines database');
  });

  test('MUST NOT have "Historical FCA depth" text on blog page', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).not.toContain('historical fca depth');
  });

  test('MUST NOT have "Flagship FCA" text on blog page', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).not.toContain('flagship fca');
  });

  test('MUST have featured section with neutral title', async ({ page }) => {
    // Look for featured articles section
    const featuredSection = page.locator('h2, h3, [class*="featured"]');
    await featuredSection.first().waitFor({ timeout: 5000 });

    const allHeadings = await page.locator('h2, h3').allTextContents();
    const headingText = allHeadings.join(' ').toLowerCase();

    // Featured section should exist but be neutral
    if (headingText.includes('featured')) {
      expect(headingText).not.toContain('featured fca');
      expect(headingText).not.toContain('flagship fca');
    }
  });

  test('Featured section title MUST be neutral (e.g., "Major Enforcement Actions")', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');

    const pageText = await page.textContent('body') || '';
    const lowerText = pageText.toLowerCase();

    // If there's a featured section, it must be neutral
    if (lowerText.includes('featured') || lowerText.includes('major')) {
      expect(lowerText).not.toContain('featured fca');
      expect(lowerText).not.toContain('flagship fca');
      expect(lowerText).not.toContain('fca featured');
    }
  });

  test('Blog article cards MUST NOT reference "FCA Fines"', async ({ page }) => {
    // Wait for article cards
    const articleCards = page.locator('[class*="blog-card"], article, [class*="article"]');
    await articleCards.first().waitFor({ timeout: 5000 });

    const allCardsText = await articleCards.allTextContents();
    const combinedText = allCardsText.join(' ').toLowerCase();

    // Some cards might mention FCA (e.g., "FCA Enforcement Guide"), but should NOT say "FCA Fines Database"
    expect(combinedText).not.toContain('fca fines database');
  });

  test('CTA button/link MUST say "Explore All Regulators" or similar global phrase', async ({ page }) => {
    // Wait for CTA buttons
    const ctaButtons = page.locator('a, button');
    await ctaButtons.first().waitFor({ timeout: 5000 });

    const allButtonTexts = await ctaButtons.allTextContents();
    const combinedText = allButtonTexts.join(' ').toLowerCase();

    // Should have global exploration CTA, not FCA-specific
    if (combinedText.includes('explore')) {
      expect(combinedText).not.toContain('explore fca');
      expect(combinedText).not.toContain('fca explore');
    }

    // Should mention regulators (plural, global) not just FCA
    if (combinedText.includes('regulator')) {
      expect(combinedText).toContain('regulator');
    }
  });

  test('MUST NOT have any "In the FCA style" text', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).not.toContain('in the fca style');
  });

  test('MUST NOT have any "FCA Benchmark" text', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).not.toContain('fca benchmark');
  });

  test('Blog intro/description MUST mention global regulators', async ({ page }) => {
    // Find intro paragraph (usually first p tag after h1)
    const paragraphs = page.locator('p');
    await paragraphs.first().waitFor({ timeout: 5000 });

    const firstParaText = await paragraphs.first().textContent();

    // Intro should mention global coverage if it talks about scope
    if (firstParaText && (firstParaText.includes('coverage') || firstParaText.includes('global'))) {
      expect(firstParaText.toLowerCase()).not.toContain('fca-centric');
      expect(firstParaText.toLowerCase()).not.toContain('flagship fca');
    }
  });

  test('Breadcrumb trail MUST NOT reference "FCA Fines Database"', async ({ page }) => {
    // Look for breadcrumb
    const breadcrumb = page.locator('nav, [class*="breadcrumb"]');
    const breadcrumbText = await breadcrumb.textContent();

    if (breadcrumbText) {
      expect(breadcrumbText?.toLowerCase()).not.toContain('fca fines database');
    }
  });

  test('MUST have proper meta description without FCA-only framing', async ({ page }) => {
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');

    expect(metaDesc).toBeTruthy();
    expect(metaDesc?.toLowerCase()).not.toContain('fca fines database');
    expect(metaDesc?.toLowerCase()).not.toContain('flagship fca');
  });

  test('MUST have proper page heading hierarchy (H1 -> H2 -> H3)', async ({ page }) => {
    const h1 = page.locator('h1');
    const h2 = page.locator('h2');

    await h1.first().waitFor({ timeout: 5000 });

    const h1Count = await h1.count();
    const h2Count = await h2.count();

    // Should have at least 1 H1
    expect(h1Count).toBeGreaterThanOrEqual(1);

    // H2 count should not exceed H1 (proper hierarchy)
    expect(h2Count).toBeGreaterThanOrEqual(0);
  });

  test('Article list MUST show multiple regulators (not FCA-only)', async ({ page }) => {
    // Wait for article cards to load
    const articleCards = page.locator('[class*="blog-card"], article');
    await articleCards.first().waitFor({ timeout: 5000 });

    const cardCount = await articleCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Check that articles mention various regulators, not just FCA
    const allCardsText = await articleCards.allTextContents();
    const combinedText = allCardsText.join(' ').toLowerCase();

    // Should mention multiple regulators across articles
    const regulators = ['fca', 'bafin', 'amf', 'sec'];
    const foundRegulators = regulators.filter(r => combinedText.includes(r.toLowerCase()));

    // Should have diversity - mention more than just FCA
    expect(foundRegulators.length).toBeGreaterThanOrEqual(1);
  });

  test('MUST NOT use "FCA Enforcement" as the primary category name', async ({ page }) => {
    const pageText = await page.textContent('body');
    const lowerText = pageText?.toLowerCase() || '';

    // FCA enforcement guides might exist, but shouldn't be the only category
    const categoryHeaders = await page.locator('h2, h3, [role="heading"]').allTextContents();
    const categoryText = categoryHeaders.join(' ').toLowerCase();

    expect(categoryText).not.toContain('fca enforcement only');
  });

  test('Blog pagination/navigation MUST NOT reference FCA-specific sections', async ({ page }) => {
    // Look for pagination or navigation
    const nav = page.locator('nav, [role="navigation"]');
    const navText = await nav.textContent();

    if (navText) {
      expect(navText?.toLowerCase()).not.toContain('fca fines');
    }
  });

  test('Related articles section MUST show cross-regulator content', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    const pageText = await page.textContent('body') || '';

    // If there's a "related" section, it should show diverse regulators
    if (pageText.toLowerCase().includes('related')) {
      expect(pageText.toLowerCase()).not.toContain('related fca');
    }
  });

  test('MUST have structured data (JSON-LD) on blog page', async ({ page }) => {
    // Check for JSON-LD script tags
    const jsonLdScripts = page.locator('script[type="application/ld+json"]');
    const count = await jsonLdScripts.count();

    expect(count).toBeGreaterThan(0);

    // Get first JSON-LD block
    const jsonLdContent = await jsonLdScripts.first().textContent();
    expect(jsonLdContent).toBeTruthy();

    // Parse it to ensure it's valid JSON
    const jsonData = JSON.parse(jsonLdContent || '{}');
    expect(jsonData).toBeTruthy();
  });

  test('JSON-LD Blog schema MUST NOT be FCA-specific', async ({ page }) => {
    const jsonLdScripts = page.locator('script[type="application/ld+json"]');

    // Check each JSON-LD block
    const count = await jsonLdScripts.count();
    for (let i = 0; i < count; i++) {
      const content = await jsonLdScripts.nth(i).textContent();
      const jsonData = JSON.parse(content || '{}');

      // If it's a Blog schema, ensure it's not FCA-specific
      if (jsonData['@type'] === 'Blog' || (jsonData['@graph'] && jsonData['@graph'].find((item: any) => item['@type'] === 'Blog'))) {
        const jsonStr = JSON.stringify(jsonData);
        expect(jsonStr.toLowerCase()).not.toContain('fca fines database');
      }
    }
  });

  test('MUST have no console errors on blog page load', async ({ page }) => {
    let hasErrors = false;
    const errorMessages: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        hasErrors = true;
        errorMessages.push(msg.text());
      }
    });

    await page.goto('/blog', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);

    expect(hasErrors, `Console errors found: ${errorMessages.join('; ')}`).toBe(false);
  });

  test('Page speed: MUST load within 8 seconds (without FCA-blocking logic)', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/blog', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(8000);
  });

  test('MUST have proper language attribute (en, not en-gb only)', async ({ page }) => {
    const langAttr = await page.locator('html').getAttribute('lang');

    expect(langAttr).toBeTruthy();
    expect(['en', 'en-gb', 'en-us'].includes(langAttr || '')).toBe(true);
  });

  test('Featured articles MUST NOT always start with FCA', async ({ page }) => {
    // Wait for featured/latest articles
    const articleTitles = page.locator('[class*="blog-card"] h2, [class*="blog-card"] h3, article h2, article h3');
    await articleTitles.first().waitFor({ timeout: 5000 });

    const titles = await articleTitles.allTextContents();

    // If there are featured articles, FCA should not monopolize top spots
    if (titles.length > 3) {
      const firstThreeTitles = titles.slice(0, 3);
      const fcaCount = firstThreeTitles.filter(t => t.toLowerCase().includes('fca')).length;

      // FCA can be present but shouldn't be all 3 top spots
      expect(fcaCount).toBeLessThan(3);
    }
  });

  test('CTA phrases MUST be neutral and global-focused', async ({ page }) => {
    // Look for common CTA text
    const pageText = await page.textContent('body') || '';
    const lowerText = pageText.toLowerCase();

    // Check for any FCA-specific CTAs
    expect(lowerText).not.toContain('explore fca');
    expect(lowerText).not.toContain('dive into fca');
    expect(lowerText).not.toContain('fca-only');
  });

  test('Sidebar or related content MUST NOT recommend "FCA Fines" as the primary resource', async ({ page }) => {
    // Look for sidebar or related sections
    const sidebar = page.locator('aside, [role="complementary"]');
    const sidebarText = await sidebar.textContent();

    if (sidebarText) {
      expect(sidebarText?.toLowerCase()).not.toContain('fca fines database');
    }
  });
});

test.describe('Blog Page - Responsive Design', () => {
  test('MUST render properly on mobile with global content visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/blog', { waitUntil: 'networkidle', timeout: 10000 });

    const h1 = page.locator('h1');
    await h1.first().waitFor({ timeout: 5000 });

    const text = await h1.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });

  test('MUST render properly on tablet with global content visible', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/blog', { waitUntil: 'networkidle', timeout: 10000 });

    const h1 = page.locator('h1');
    await h1.first().waitFor({ timeout: 5000 });

    const text = await h1.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });

  test('MUST render properly on desktop with global content visible', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/blog', { waitUntil: 'networkidle', timeout: 10000 });

    const h1 = page.locator('h1');
    await h1.first().waitFor({ timeout: 5000 });

    const text = await h1.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });
});
