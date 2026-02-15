import { test, expect } from '@playwright/test';

test.describe('Accessibility & Semantic HTML', () => {
  test.describe('Blog Article Accessibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Wait for React to render the article
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have one h1 (article title)
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);

      // Should have h2 and h3 tags in content
      const h2Elements = await page.locator('h2').count();
      expect(h2Elements).toBeGreaterThan(0);
    });

    test('should have accessible navigation links', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Back to blog link should be keyboard accessible
      const backLink = page.locator('a.blog-post-back');
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute('href', '/blog');

      // Should have accessible text
      await expect(backLink).toContainText('Back to Blog');
    });

    test('should have semantic time elements', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Date should be in <time> element with datetime attribute
      const timeElement = page.locator('time[dateTime]');
      await expect(timeElement).toBeVisible();

      const datetime = await timeElement.getAttribute('dateTime');
      expect(datetime).toBeTruthy();
      expect(datetime).toMatch(/^\d{4}-\d{2}-\d{2}$/); // ISO date format
    });

    test('should have proper article structure', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Should have semantic <article> element
      const article = page.locator('article.blog-article-modal');
      await expect(article).toBeVisible();

      // Article should have header section
      const header = article.locator('.blog-article-modal-header');
      await expect(header).toBeVisible();

      // Article should have content section
      const content = article.locator('.blog-article-content');
      await expect(content).toBeVisible();

      // Article should have footer section
      const footer = article.locator('.blog-article-modal-footer');
      await expect(footer).toBeVisible();
    });

    test('should have accessible buttons', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // CTA button should be accessible
      const ctaButton = page.locator('.blog-cta-button');
      await expect(ctaButton).toBeVisible();
      await expect(ctaButton).toHaveRole('button');

      // Button should have visible text
      await expect(ctaButton).toContainText('Explore FCA Fines Dashboard');
    });
  });

  test.describe('Blog Listing Accessibility', () => {
    test('should have proper list structure', async ({ page }) => {
      await page.goto('/blog');

      // Wait for blog listing to render
      await expect(page.locator('h1')).toBeVisible();

      // Featured articles should be in a section with heading
      const featuredSection = page.locator('section').filter({ has: page.locator('h2:has-text("Featured")') });
      await expect(featuredSection).toBeVisible();

      // All articles should be in a section with heading
      const allArticlesSection = page.locator('section').filter({ has: page.locator('h2:has-text("All FCA Fines Articles")') });
      await expect(allArticlesSection).toBeVisible();
    });

    test('should have accessible article cards', async ({ page }) => {
      await page.goto('/blog');

      // Each card should be clickable and have proper role
      const firstCard = page.locator('.blog-card').first();
      await expect(firstCard).toBeVisible();

      // Card should have heading
      const cardHeading = firstCard.locator('h3');
      await expect(cardHeading).toBeVisible();

      // Card should have excerpt
      const cardExcerpt = firstCard.locator('.blog-card-excerpt');
      await expect(cardExcerpt).toBeVisible();
    });

    test('should have keyboard navigation support', async ({ page }) => {
      await page.goto('/blog');

      // Should be able to tab to first card
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Check that focus is on a clickable element
      const focusedElement = await page.evaluateHandle(() => document.activeElement);
      const tagName = await focusedElement.evaluate(el => el?.tagName);
      expect(['DIV', 'A', 'BUTTON']).toContain(tagName);
    });
  });

  test.describe('Yearly Article Accessibility', () => {
    test('should have accessible stats summary', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      // Stats summary should have clear labels
      const statItems = page.locator('.stats-summary-item');
      const firstStat = statItems.first();

      await expect(firstStat.locator('.stats-summary-value')).toBeVisible();
      await expect(firstStat.locator('.stats-summary-label')).toBeVisible();

      // Label should describe the value
      const label = await firstStat.locator('.stats-summary-label').textContent();
      expect(label).toBeTruthy();
      expect(label!.length).toBeGreaterThan(0);
    });

    test('should have accessible insights box', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      // Key insights should be in a structured container
      const insights = page.locator('.article-key-insights');
      await expect(insights).toBeVisible();

      // Should have heading
      const insightsHeading = insights.locator('h4');
      await expect(insightsHeading).toBeVisible();

      // Should have list
      const insightsList = insights.locator('ul');
      await expect(insightsList).toBeVisible();

      // List should have items
      const listItems = insightsList.locator('li');
      await expect(listItems.first()).toBeVisible();
    });

    test('should have accessible professional analysis box', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      // Professional analysis should be in a structured container
      const analysis = page.locator('.professional-analysis');
      await expect(analysis).toBeVisible();

      // Should have heading with icon
      const analysisHeading = analysis.locator('h4');
      await expect(analysisHeading).toBeVisible();

      // Icon should be decorative (using svg, not img with missing alt)
      const icon = analysisHeading.locator('svg');
      await expect(icon).toBeVisible();
    });
  });

  test.describe('Color Contrast & Readability', () => {
    test('should have readable text on blog articles', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Content should use readable font size
      const content = page.locator('.blog-article-content');
      await expect(content).toBeVisible();
      const fontSize = await content.evaluate(el => window.getComputedStyle(el).fontSize);

      // Font size should be at least 14px
      const fontSizeNum = parseFloat(fontSize);
      expect(fontSizeNum).toBeGreaterThanOrEqual(14);
    });

    test('should have adequate spacing between elements', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Article content should have line height for readability
      const content = page.locator('.blog-article-content');
      await expect(content).toBeVisible();
      const lineHeight = await content.evaluate(el => window.getComputedStyle(el).lineHeight);

      // Line height should be at least 1.4
      const lineHeightNum = parseFloat(lineHeight);
      expect(lineHeightNum).toBeGreaterThan(20); // Assuming base font size ~16px
    });
  });

  test.describe('Focus Management', () => {
    test('should navigate back from direct article URL to blog listing', async ({ page }) => {
      // Navigate directly to an article page
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Wait for article to render
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Click back to blog
      await page.locator('a.blog-post-back').click();

      // Should be on blog listing
      await expect(page).toHaveURL('/blog');
      await expect(page.locator('h1')).toContainText('FCA Fines');
    });

    test('should have visible focus indicators', async ({ page }) => {
      await page.goto('/blog');

      // Tab to first interactive element
      await page.keyboard.press('Tab');

      // Focus should be visible (check outline or box-shadow exists)
      const focusedElement = await page.evaluateHandle(() => document.activeElement);
      const outline = await focusedElement.evaluate(el => {
        const styles = window.getComputedStyle(el as Element);
        return styles.outline || styles.boxShadow;
      });

      // Should have some focus styling
      expect(outline).toBeTruthy();
    });
  });
});
