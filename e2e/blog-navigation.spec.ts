import { test, expect } from '@playwright/test';

test.describe('Blog Navigation', () => {
  test.describe('Blog Listing Page', () => {
    test('should render blog listing page', async ({ page }) => {
      await page.goto('/blog');

      // Wait for the page to load
      await expect(page.locator('h1')).toBeVisible();

      // Should have main heading
      await expect(page.locator('h1')).toContainText('FCA Fines');

      // Should have description
      await expect(page.getByText(/Expert analysis/i)).toBeVisible();

      // Should have featured articles section
      await expect(page.locator('h2').filter({ hasText: 'Featured' })).toBeVisible();

      // Should have all articles section
      await expect(page.locator('h2').filter({ hasText: 'All FCA Fines Articles' })).toBeVisible();
    });

    test('should display blog article cards with metadata', async ({ page }) => {
      await page.goto('/blog');

      // Should have multiple blog cards
      const blogCards = page.locator('.blog-card');
      await expect(blogCards.first()).toBeVisible();
      await expect(blogCards).toHaveCount(12); // 12 blog articles

      // First card should have required elements
      const firstCard = blogCards.first();
      await expect(firstCard.locator('.blog-card-category')).toBeVisible();
      await expect(firstCard.locator('h3')).toBeVisible();
      await expect(firstCard.locator('.blog-card-excerpt')).toBeVisible();
      await expect(firstCard.locator('.blog-card-meta')).toBeVisible();
    });

    test('should display yearly review cards', async ({ page }) => {
      await page.goto('/blog');

      // Should have yearly review section
      await expect(page.locator('h2').filter({ hasText: /FCA Fines by Year/ })).toBeVisible();

      // Should have yearly cards
      const yearlyCards = page.locator('.yearly-card');
      await expect(yearlyCards.first()).toBeVisible();

      // Cards should show year and stats
      const firstYearlyCard = yearlyCards.first();
      await expect(firstYearlyCard.locator('.yearly-card-year')).toBeVisible();
      await expect(firstYearlyCard.locator('.yearly-card-stats')).toBeVisible();
    });

    test('should open modal when blog card is clicked', async ({ page }) => {
      await page.goto('/blog');

      // Wait for cards to load
      await expect(page.locator('.blog-card').first()).toBeVisible();

      // Click first blog card
      const firstCard = page.locator('.blog-card').first();
      await firstCard.click();

      // Should open a modal (URL stays at /blog)
      await expect(page).toHaveURL('/blog');

      // Modal should contain article content
      await expect(page.locator('.blog-article-modal')).toBeVisible();
    });

    test('should open modal when yearly card is clicked', async ({ page }) => {
      await page.goto('/blog');

      // Wait for yearly cards to load
      await expect(page.locator('.yearly-card').first()).toBeVisible();

      // Click first yearly card
      const firstYearlyCard = page.locator('.yearly-card').first();
      await firstYearlyCard.click();

      // Should open a modal (URL stays at /blog)
      await expect(page).toHaveURL('/blog');

      // Modal should show annual analysis content
      const modal = page.locator('.blog-article-modal');
      await expect(modal).toBeVisible();
      await expect(modal.locator('.blog-card-category')).toContainText('Annual Analysis');
    });
  });

  test.describe('Direct Article URL Access', () => {
    test('should load blog article directly via URL', async ({ page }) => {
      await page.goto('/blog/fca-fines-2025-complete-list');

      // Should load article directly (full page, not modal)
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Back button should work
      await page.locator('a.blog-post-back').click();
      await expect(page).toHaveURL('/blog');
    });

    test('should load yearly article directly via URL', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      // Should load article directly
      await expect(page.locator('h1.blog-post-title')).toBeVisible();
      await expect(page.locator('.blog-card-category')).toContainText('Annual Analysis');
    });

    test('should navigate from article to dashboard via CTA button', async ({ page }) => {
      // Visit homepage first to pass RequireHomepageVisit guard
      await page.goto('/');
      await expect(page.locator('h1')).toBeVisible();

      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Wait for article to render
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Click "Explore FCA Fines Dashboard" button
      await page.locator('.blog-cta-button').click();

      // Should navigate to dashboard
      await expect(page).toHaveURL('/dashboard');
    });
  });

  test.describe('Blog Data Import from Shared Module', () => {
    test('should render all 12 blog articles from shared data module', async ({ page }) => {
      await page.goto('/blog');

      // Wait for cards to render
      await expect(page.locator('.blog-card').first()).toBeVisible();

      // Should have exactly 12 blog article cards
      const blogCards = page.locator('.blog-card');
      await expect(blogCards).toHaveCount(12);

      // All cards should have valid content (no undefined/null)
      for (let i = 0; i < 12; i++) {
        const card = blogCards.nth(i);
        await expect(card.locator('h3')).not.toBeEmpty();
        await expect(card.locator('.blog-card-excerpt')).not.toBeEmpty();
      }
    });

    test('should render all 13 yearly articles from shared data module', async ({ page }) => {
      await page.goto('/blog');

      // Wait for yearly cards to render
      await expect(page.locator('.yearly-card').first()).toBeVisible();

      // Should have exactly 13 yearly review cards (2013-2025)
      const yearlyCards = page.locator('.yearly-card');
      const count = await yearlyCards.count();
      expect(count).toBe(13);

      // All cards should have valid content
      for (let i = 0; i < Math.min(count, 5); i++) {
        const card = yearlyCards.nth(i);
        await expect(card.locator('.yearly-card-year')).not.toBeEmpty();
      }
    });
  });

  test.describe('Blog 3D Visualization', () => {
    test('should render 3D visualization on blog page', async ({ page }) => {
      await page.goto('/blog');

      // Wait for blog page to load
      await expect(page.locator('h1')).toBeVisible();

      // Should have hero visualization container
      const vizContainer = page.locator('.blog-hero-visualization');
      await expect(vizContainer).toBeVisible();
    });
  });
});
