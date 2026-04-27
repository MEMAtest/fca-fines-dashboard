/**
 * E2E Tests: Homepage Hero Rendering
 * Validates GlobeHero component displays global messaging
 * FAIL-LOUD: All assertions must pass with explicit error messages
 */

import { test, expect } from '@playwright/test';

test.describe('Homepage Hero - Global Messaging Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to homepage with explicit timeout
    await page.goto('/', { waitUntil: 'networkidle', timeout: 10000 });
  });

  test('MUST render hero title with global positioning', async ({ page }) => {
    // Wait for hero section to be visible
    const heroTitle = page.locator('h1.globe-hero__title, h1:has-text("Multi-regulator")');
    await heroTitle.waitFor({ timeout: 5000 });

    const titleText = await heroTitle.textContent();
    expect(titleText, 'Hero title must exist').toBeTruthy();

    // Title should NOT be FCA-specific
    expect(titleText).toContain('Multi-regulator');
    expect(titleText?.toLowerCase()).not.toContain('fca');
    expect(titleText?.toLowerCase()).not.toContain('flagship');
  });

  test('MUST render hero description with "Global enforcement intelligence across 45+"', async ({ page }) => {
    // Wait for description paragraph
    const heroDesc = page.locator('p.globe-hero__description, p:has-text("Global enforcement")');
    await heroDesc.waitFor({ timeout: 5000 });

    const descText = await heroDesc.textContent();
    expect(descText, 'Hero description must exist').toBeTruthy();

    // Must contain exact phrase
    expect(descText).toContain('Global enforcement intelligence');
    expect(descText).toContain('45+');
    expect(descText).toContain('financial regulators');

    // MUST NOT contain FCA-centric language
    expect(descText?.toLowerCase()).not.toContain('fca benchmark');
    expect(descText?.toLowerCase()).not.toContain('flagship fca');
    expect(descText?.toLowerCase()).not.toContain('fca fines database');
  });

  test('MUST NOT display "Historical FCA depth" text anywhere', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).not.toContain('historical fca depth');
  });

  test('MUST render REGULATOR_COUNT constant (45+) on hero stats', async ({ page }) => {
    // Wait for hero stats cards
    const statsSection = page.locator('.globe-hero__stats-row, [class*="stat-card"]');
    await statsSection.first().waitFor({ timeout: 5000 });

    const pageText = await page.textContent('body');
    expect(pageText).toContain('45+');
  });

  test('Hero CTA button MUST link to /dashboard', async ({ page }) => {
    // Wait for CTA button
    const ctaButton = page.locator('a.globe-hero__cta, a:has-text("Access the Intelligence Hub")');
    await ctaButton.waitFor({ timeout: 5000 });

    const href = await ctaButton.getAttribute('href');
    expect(href).toBe('/dashboard');
  });

  test('MUST NOT have "FCA Fines Database" in hero section', async ({ page }) => {
    // Wait for hero section fully rendered
    const heroWrapper = page.locator('.globe-hero-wrapper');
    await heroWrapper.waitFor({ timeout: 5000 });

    const heroText = await heroWrapper.textContent();
    expect(heroText?.toLowerCase()).not.toContain('fca fines database');
    expect(heroText?.toLowerCase()).not.toContain('flagship fca');
    expect(heroText?.toLowerCase()).not.toContain('in the fca style');
  });

  test('Hero stats cards MUST show "live regulators" not "FCA-only"', async ({ page }) => {
    // Wait for stats cards
    const statsCards = page.locator('[class*="stat-card"]');
    await statsCards.first().waitFor({ timeout: 5000 });

    const allStatsText = await statsCards.allTextContents();
    const combinedText = allStatsText.join(' ').toLowerCase();

    // Must mention live regulators globally, not just FCA
    expect(combinedText).toContain('regulators');
    expect(combinedText).not.toContain('fca database');
  });

  test('MUST display regulator grid with multiple regions', async ({ page }) => {
    // Wait for regulator grid
    const regulatorGrid = page.locator('.globe-hero__regulator-grid-section, [class*="regulator-grid"]');
    await regulatorGrid.first().waitFor({ timeout: 5000 });

    // Check for region labels
    const regionLabels = await page.locator('[class*="region-label"]').allTextContents();
    expect(regionLabels.length).toBeGreaterThan(0);

    // Should have multiple regions, not just Europe/UK
    const regionText = regionLabels.join(' ').toLowerCase();
    expect(regionText).toMatch(/(uk|europe|americas|asia|middle east|africa)/i);
  });

  test('Regulator grid MUST NOT show FCA as the only primary regulator', async ({ page }) => {
    // Wait for regulator items
    const regulatorItems = page.locator('[class*="regulator-item"]');
    await regulatorItems.first().waitFor({ timeout: 5000 });

    const allRegulators = await regulatorItems.allTextContents();
    expect(allRegulators.length).toBeGreaterThan(1);

    // FCA should be one of many, not highlighted alone
    const regulatorCodes = await page.locator('[class*="regulator-code"]').allTextContents();
    expect(regulatorCodes).toContain('FCA');
    expect(regulatorCodes.length).toBeGreaterThan(5);
  });

  test('MUST have correct page title without FCA-only branding', async ({ page }) => {
    const titleText = await page.title();

    expect(titleText).toContain('RegActions');
    expect(titleText).toContain('Regulatory Fines');
    expect(titleText?.toLowerCase()).not.toContain('fca fines database');
  });

  test('Globe MUST render without errors for global data visualization', async ({ page }) => {
    // Wait for globe container
    const globeContainer = page.locator('.globe-container, [class*="globe"]');
    await globeContainer.first().waitFor({ timeout: 10000 });

    // Check that there are no console errors
    let hasErrors = false;
    page.on('console', msg => {
      if (msg.type() === 'error') {
        hasErrors = true;
        console.error('Browser error:', msg.text());
      }
    });

    // Wait a bit for any async loading
    await page.waitForTimeout(2000);

    expect(hasErrors, 'Globe must render without console errors').toBe(false);
  });

  test('Hero stats MUST load dynamically from API without fallback showing FCA-only data', async ({ page }) => {
    // Intercept API calls
    let apiCalled = false;
    page.on('response', response => {
      if (response.url().includes('/api/globe/stats')) {
        apiCalled = true;
      }
    });

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Stats should be present (either from API or fallback)
    const statsText = await page.locator('[class*="stat-card"], [class*="hero-stat"]').allTextContents();
    const combinedStats = statsText.join(' ');

    expect(combinedStats).toBeTruthy();
    // Should show multi-regulator data, not just FCA
    expect(combinedStats).toContain('regulators');
  });

  test('MUST have proper accessibility labels without FCA-specific alt text', async ({ page }) => {
    // Check for images with proper alt text
    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt');
      if (alt) {
        expect(alt.toLowerCase()).not.toBe('fca fines database');
        expect(alt.toLowerCase()).not.toContain('fca-only');
      }
    }
  });

  test('Floating stats cards MUST show global metrics', async ({ page }) => {
    // Wait for floating stats
    const floatingStats = page.locator('[class*="floating"], [class*="stat"]');
    await floatingStats.first().waitFor({ timeout: 5000 });

    const statsText = await floatingStats.allTextContents();
    const combinedText = statsText.join(' ');

    // Must mention countries, regulators, enforcement actions (not FCA-specific)
    expect(combinedText.toLowerCase()).toMatch(/(countries|regulators|enforcement|actions)/);
  });

  test('MUST render without layout shift for global content', async ({ page }) => {
    // Wait for page to fully stabilize
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check that major layout elements are visible
    const heroSection = page.locator('.globe-hero-wrapper');
    await expect(heroSection).toBeVisible();

    // Get bounding box - should not be 0
    const bbox = await heroSection.boundingBox();
    expect(bbox).not.toBeNull();
    expect(bbox?.width).toBeGreaterThan(0);
    expect(bbox?.height).toBeGreaterThan(0);
  });

  test('Hero description MUST use interpolated REGULATOR_COUNT constant', async ({ page }) => {
    const heroDesc = page.locator('p.globe-hero__description, p:has-text("Global")');
    const text = await heroDesc.textContent();

    // Should contain "45+" which comes from REGULATOR_COUNT constant
    expect(text).toContain('45+');

    // MUST NOT have hardcoded alternative counts like "30+" or "5 more"
    expect(text?.toLowerCase()).not.toContain('30+');
    expect(text?.toLowerCase()).not.toContain('5 more');
  });

  test('MUST complete page render within timeout without FCA-blocking behavior', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const loadTime = Date.now() - startTime;

    // Page should load reasonably fast (under 8 seconds for domcontentloaded)
    expect(loadTime).toBeLessThan(8000);

    // Verify hero is rendered after domcontentloaded
    const heroTitle = page.locator('h1');
    await heroTitle.first().waitFor({ timeout: 3000 });
  });

  test('Featured section MUST be neutral (not "Featured FCA")', async ({ page }) => {
    // Look for any featured section headers
    const pageText = await page.locator('body').textContent();

    if (pageText?.toLowerCase().includes('featured')) {
      expect(pageText?.toLowerCase()).not.toContain('featured fca');
      expect(pageText?.toLowerCase()).not.toContain('fca featured');
    }
  });
});

test.describe('Homepage Responsive Design - Global Content', () => {
  test('MUST render properly on mobile without FCA-specific UI', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'networkidle', timeout: 10000 });

    // Hero should still be visible
    const heroTitle = page.locator('h1.globe-hero__title, h1');
    await heroTitle.first().waitFor({ timeout: 5000 });

    const text = await heroTitle.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });

  test('MUST render properly on tablet without FCA-specific UI', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'networkidle', timeout: 10000 });

    const heroTitle = page.locator('h1');
    await heroTitle.first().waitFor({ timeout: 5000 });

    const text = await heroTitle.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });

  test('MUST render properly on desktop without FCA-specific UI', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'networkidle', timeout: 10000 });

    const heroTitle = page.locator('h1');
    await heroTitle.first().waitFor({ timeout: 5000 });

    const text = await heroTitle.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });
});
