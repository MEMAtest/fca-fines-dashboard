import { test, expect } from '@playwright/test';

test.describe('Blog Navigation', () => {
  test.describe('Blog Listing Page', () => {
    test('should render blog listing page', async ({ page }) => {
      await page.goto('/blog');

      // Wait for the page to load
      await expect(page.locator('h1')).toBeVisible();

      // Should have main heading
      await expect(page.locator('h1')).toContainText('Regulatory Insights');

      // Should have description
      await expect(page.locator('.blog-hero-subtitle')).toContainText('Expert analysis');

      // Should have intelligence hub structure
      await expect(page.locator('.insights-sidebar')).toBeVisible();
      await expect(page.locator('.insights-search')).toBeVisible();

      // Should have right rail modules
      await expect(page.locator('h2').filter({ hasText: 'Trending topics' })).toBeVisible();
    });

    test('should display blog article cards with metadata', async ({ page }) => {
      await page.goto('/blog');

      // Should have multiple blog cards
      const blogCards = page.locator('.insights-article-card');
      await expect(blogCards.first()).toBeVisible();
      // With 40+ total articles (14 hardcoded + 26 regulator blogs), page 1 shows featured + paginated
      const cardCount = await blogCards.count();
      expect(cardCount).toBeGreaterThanOrEqual(9); // Grid shows 9 cards plus the lead story

      // First card should have required elements
      const firstCard = page.locator('.insights-article-card').first();
      await expect(firstCard.locator('.blog-card-category')).toBeVisible();
      await expect(firstCard.locator('h3')).toBeVisible();
      await expect(firstCard.locator('.blog-card-excerpt')).toBeVisible();
      await expect(firstCard.locator('.blog-card-meta')).toBeVisible();
    });

    test('should show the latest published article as the lead story', async ({ page }) => {
      await page.goto('/blog');

      const leadCard = page.locator('.insights-lead-card');
      await expect(leadCard).toBeVisible();
      await expect(leadCard.locator('h2')).toContainText(
        'DekaBank Deutsche Girozentrale',
      );
    });

    test('should filter insights by July 2026', async ({ page }) => {
      await page.goto('/blog');

      await page.getByRole('button', { name: 'July 2026' }).click();
      await expect(page).toHaveURL(/month=2026-07/);
      await expect(page.locator('.insights-lead-card h2')).toContainText(
        'DekaBank Deutsche Girozentrale',
      );
      await expect(page.locator('.insights-results-bar')).toContainText(
        '4',
      );
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

    test('should navigate to article when blog card is clicked', async ({ page }) => {
      await page.goto('/blog');

      // Wait for cards to load
      await expect(page.locator('.blog-card').first()).toBeVisible();

      // Click first blog card
      const firstCard = page.locator('.insights-lead-card').first();
      await Promise.all([
        page.waitForURL(/\/blog\/[^/]+$/),
        firstCard.click(),
      ]);

      // Article should render
      await expect(page.locator('h1.blog-post-title')).toBeVisible();
    });

    test('should navigate to yearly article when yearly card is clicked', async ({ page }) => {
      await page.goto('/blog');

      // Wait for yearly cards to load
      await expect(page.locator('.yearly-card').first()).toBeVisible();

      // Click first yearly card
      const firstYearlyCard = page.locator('.yearly-card').first();
      await Promise.all([
        page.waitForURL(/\/blog\/fca-fines-\d{4}-annual-review$/),
        firstYearlyCard.click(),
      ]);

      await expect(page.locator('h1.blog-post-title')).toBeVisible();
      await expect(page.locator('.blog-card-category')).toContainText('Annual Analysis');
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

    test('should navigate from article to data hub via CTA button', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Wait for article to render
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Click "Explore RegActions Data Hub" button
      await page.locator('.blog-cta-button').click();

      // Should navigate to the canonical public data hub
      await expect(page).toHaveURL('/regulators');
    });

    test('should redirect singular payments article slug to canonical plural slug', async ({ page }) => {
      await page.goto('/blog/payments-firm-fca-aml-enforcement');

      await expect(page).toHaveURL('/blog/payments-firms-fca-aml-enforcement');
      await expect(page.locator('h1.blog-post-title')).toContainText(
        "FCA Payments Enforcement: Why It's Permissions, Not Fines",
      );
    });
  });

  test.describe('Blog Data Import from Shared Module', () => {
    test('should render blog articles from shared data module with regulator blogs', async ({ page }) => {
      await page.goto('/blog');

      // Wait for cards to render
      await expect(page.locator('.blog-card').first()).toBeVisible();

      // Should have multiple blog article cards (40+ total: 14 hardcoded + 26 regulator blogs)
      // Page 1 shows featured + first page of regular articles
      const blogCards = page.locator('.insights-article-card');
      const cardCount = await blogCards.count();
      expect(cardCount).toBeGreaterThanOrEqual(9); // Grid shows 9 cards plus the lead story

      // First few cards should have valid content (no undefined/null)
      const cardsToCheck = Math.min(cardCount, 5);
      for (let i = 0; i < cardsToCheck; i++) {
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

  test.describe('Blog Intelligence Hub', () => {
    test('should render the filtering rails on blog page', async ({ page }) => {
      await page.goto('/blog');

      // Wait for blog page to load
      await expect(page.locator('h1')).toBeVisible();

      await expect(page.locator('.insights-sidebar')).toBeVisible();
      await expect(page.locator('.insights-right-rail')).toBeVisible();
      await expect(page.locator('.insights-view-toggle')).toBeVisible();
    });

    test('should expose topic pathways for retention and SEO journeys', async ({ page }) => {
      await page.goto('/blog');

      const pathways = page.locator('.insights-pathways');
      await expect(pathways).toBeVisible();
      await expect(pathways.locator('h2')).toContainText(
        'Explore enforcement themes by use case',
      );
      await expect(pathways.locator('.insights-pathway-card')).toHaveCount(4);

      await expect(
        pathways.getByRole('link', { name: /FCA regulator hub/i }),
      ).toHaveAttribute('href', '/regulators/fca');
      await expect(
        pathways.getByRole('link', { name: /Global AML comparison/i }),
      ).toHaveAttribute('href', '/blog/global-aml-enforcement-comparison-2026');
      await expect(
        pathways.getByRole('link', { name: /Create board pack/i }),
      ).toHaveAttribute('href', '/board-pack');
      await expect(
        pathways.getByRole('link', { name: /MEMA compliance support/i }),
      ).toHaveAttribute('href', 'https://memaconsultants.com');
    });
  });
});
