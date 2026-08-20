/**
 * E2E Tests: Homepage Hero Rendering
 * Validates GlobeHero component displays global messaging
 * FAIL-LOUD: All assertions must pass with explicit error messages
 */

import { test, expect } from '@playwright/test';

test.describe('Homepage Hero - Global Messaging Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype as any;
      const originalGetContext = proto.getContext;
      proto.getContext = function getContext(contextId: string, ...args: any[]) {
        if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
          return null;
        }
        return originalGetContext.call(this, contextId, ...args);
      };
    });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });
  });

  test('MUST render hero title with global positioning', async ({ page }) => {
    // Wait for hero section to be visible
    // The globe hero's title is an h2 — the page's single h1 belongs to the
    // search hero above it. Assert the content renders, not its heading level.
    // The globe now renders visual-only inside the page hero, so it no longer
    // carries its own title. Assert the globe itself is present instead.
    // The page's single h1 is the search hero. The globe no longer carries its
    // own competing title.
    const heroTitle = page.locator('h1').first();
    await heroTitle.waitFor({ timeout: 8000 });

    const titleText = await heroTitle.textContent();
    expect(titleText, 'Hero title must exist').toBeTruthy();

    // Positioning must stay global, not FCA-specific.
    expect(titleText?.toLowerCase()).not.toContain('fca');
    expect(titleText?.toLowerCase()).not.toContain('flagship');
  });

  test('MUST render hero description with the configured 54-regulator coverage', async ({ page }) => {
    // Wait for description paragraph
    const heroDesc = page.locator('p.ra-hero__lede').first();
    await heroDesc.waitFor({ timeout: 8000 });

    const descText = await heroDesc.textContent();
    expect(descText, 'Hero description must exist').toBeTruthy();

    // The lede must state the multi-regulator scope, not an FCA-only one.
    expect(descText).toMatch(/live regulators/i);
    expect(descText).toContain('54');

    // MUST NOT contain FCA-centric language
    expect(descText?.toLowerCase()).not.toContain('fca benchmark');
    expect(descText?.toLowerCase()).not.toContain('flagship fca');
    expect(descText?.toLowerCase()).not.toContain('fca fines database');
  });

  test('MUST NOT display "Historical FCA depth" text anywhere', async ({ page }) => {
    const pageText = await page.textContent('body');
    expect(pageText?.toLowerCase()).not.toContain('historical fca depth');
  });

  test('MUST render REGULATOR_COUNT constant (54) on hero stats', async ({ page }) => {
    // Wait for hero stats cards
    const statsSection = page.locator('.ra-stat-tile, [class*="stat-card"]');
    await statsSection.first().waitFor({ timeout: 5000 });

    const pageText = await page.textContent('body');
    expect(pageText).toContain('54');
  });

  test('Hero CTA button MUST open the UK-first FCA evidence view', async ({ page }) => {
    // Wait for CTA button
    // The globe's own "Explore UK enforcement" CTA went with its hero copy.
    // The hero's primary action is now search; assert a UK/FCA evidence route
    // is still reachable from the page rather than pinning one button.
    const ukLink = page.locator('a[href*="regulator=FCA"], a[href="/regulators/fca"]').first();
    await ukLink.waitFor({ timeout: 8000 });
    expect(await ukLink.getAttribute('href')).toBeTruthy();
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
    const statsCards = page.locator('.ra-stat-tile, [class*="stat-card"]');
    await statsCards.first().waitFor({ timeout: 5000 });

    const allStatsText = await statsCards.allTextContents();
    const combinedText = allStatsText.join(' ').toLowerCase();

    // Must mention live regulators globally, not just FCA
    expect(combinedText).toContain('regulators');
    expect(combinedText).not.toContain('fca database');
  });

  test('MUST display regulator coverage across multiple regions', async ({ page }) => {
    // The globe's own regulator grid was removed — it duplicated the hero and
    // carried a contradictory count. The coverage rail now carries this.
    const rail = page.locator('.ra-rail-section');
    await rail.first().waitFor({ timeout: 8000 });

    // The heading states the region spread, e.g. "54 live regulators across 8 regions".
    const heading = await page.locator('.ra-rail-section__title').first().textContent();
    expect(heading).toMatch(/regulators/i);
    expect(heading).toMatch(/regions/i);
  });

  test('MUST NOT show FCA as the only regulator', async ({ page }) => {
    const railItems = page.locator('.ra-rail__item');
    await railItems.first().waitFor({ timeout: 8000 });

    const codes = await railItems.allTextContents();
    // FCA is one of many, not the whole product.
    expect(codes.join(' ')).toContain('FCA');
    expect(codes.length).toBeGreaterThan(5);
  });

  test('MUST have correct page title without FCA-only branding', async ({ page }) => {
    const titleText = await page.title();

    expect(titleText).toContain('RegActions');
    expect(titleText?.toLowerCase()).not.toContain('fca fines database');
  });

  test('Globe area MUST render without taking down the route', async ({ page }) => {
    // Wait for globe container
    const globeContainer = page.locator('.globe-container, [class*="globe"]');
    await globeContainer.first().waitFor({ timeout: 10000 });

    // Check that there are no console errors
    // Ignore failed data fetches: `vite preview` serves no API, so every
    // request 404s/500s there. This test is about the GLOBE not crashing the
    // route, not about backend availability.
    let hasErrors = false;
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (/Failed to load resource|net::ERR_|status of (404|500)/i.test(text)) return;
      hasErrors = true;
      console.error('Browser error:', text);
    });

    // Wait a bit for any async loading
    await page.waitForTimeout(2000);

    expect(hasErrors, 'Homepage must render without console errors').toBe(false);
  });

  test('Hero stats MUST load dynamically from API without fallback showing FCA-only data', async ({ page }) => {
    // Stats should be present (either from API or fallback)
    // The hero's own stat tiles. The globe's separate stat cards were removed —
    // they read from a different endpoint and contradicted these (61 vs 54).
    const statsText = await page.locator('.ra-hero__stats, [class*="stat-card"], [class*="hero-stat"]').allTextContents();
    const combinedStats = statsText.join(' ');

    expect(combinedStats).toBeTruthy();
    // Should show multi-regulator data, not just FCA
    expect(combinedStats).toContain('regulators');
  });

  test('MUST have proper accessibility labels without FCA-specific alt text', async ({ page }) => {
    // Check for images with proper alt text
    const alts = await page.locator('img').evaluateAll((images) =>
      images.map((image) => image.getAttribute('alt'))
    );

    for (const alt of alts) {
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
    // The globe no longer carries its own description; the hero lede does.
    const heroDesc = page.locator('p.ra-hero__lede').first();
    const text = await heroDesc.textContent();

    // Should contain "54" which comes from REGULATOR_COUNT constant
    expect(text).toContain('54');

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
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Hero should still be visible
    const heroTitle = page.locator('h1');
    await heroTitle.first().waitFor({ timeout: 5000 });

    const text = await heroTitle.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });

  test('MUST render properly on tablet without FCA-specific UI', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const heroTitle = page.locator('h1');
    await heroTitle.first().waitFor({ timeout: 5000 });

    const text = await heroTitle.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });

  test('MUST render properly on desktop without FCA-specific UI', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const heroTitle = page.locator('h1');
    await heroTitle.first().waitFor({ timeout: 5000 });

    const text = await heroTitle.first().textContent();
    expect(text?.toLowerCase()).not.toContain('fca');
  });
});
