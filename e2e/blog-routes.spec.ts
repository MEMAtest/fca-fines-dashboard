import { test, expect } from '@playwright/test';

test.describe('Blog Routes - Individual Article Pages', () => {
  test.describe('Blog Article Routes', () => {
    const blogArticleSlugs = [
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

    for (const slug of blogArticleSlugs) {
      test(`should render blog article: ${slug}`, async ({ page }) => {
        await page.goto(`/blog/${slug}`);

        // Page should load successfully
        await expect(page).toHaveURL(`/blog/${slug}`);

        // Should have article title
        await expect(page.locator('h1.blog-post-title')).toBeVisible();

        // Should have back to blog navigation
        await expect(page.locator('a.blog-post-back')).toBeVisible();
        await expect(page.locator('a.blog-post-back')).toContainText('Back to Blog');

        // Should have article metadata (category, date, read time)
        await expect(page.locator('.blog-card-category')).toBeVisible();
        await expect(page.locator('.blog-card-meta')).toBeVisible();

        // Should have article content
        await expect(page.locator('.blog-article-content')).toBeVisible();

        // Should have footer with keywords and CTA
        await expect(page.locator('.blog-article-keywords')).toBeVisible();
        await expect(page.locator('.blog-cta-button')).toBeVisible();
      });
    }

    test('should render article-specific charts for largest-fca-fines-history', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Wait for article to load
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Check for article-specific charts section
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should have Top20FinesChart and Top20BreachTypesChart
      // Charts render in Recharts containers
      const chartContainers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartContainers).toHaveCount(2);
    });

    test('should render article-specific charts for fca-fines-2025', async ({ page }) => {
      await page.goto('/blog/fca-fines-2025-complete-list');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Check for 2025-specific charts
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should have Fines2025MonthlyChart and Fines2025BreachChart
      const chartContainers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartContainers).toHaveCount(2);
    });

    test('should render article-specific charts for fca-aml-fines', async ({ page }) => {
      await page.goto('/blog/fca-aml-fines-anti-money-laundering');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Check for AML-specific charts
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should have AMLFinesChart and AMLTrendChart
      const chartContainers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartContainers).toHaveCount(2);
    });
  });

  test.describe('Yearly Article Routes', () => {
    const yearlyArticleSlugs = [
      { slug: 'fca-fines-2013-annual-review', year: 2013 },
      { slug: 'fca-fines-2014-annual-review', year: 2014 },
      { slug: 'fca-fines-2015-annual-review', year: 2015 },
      { slug: 'fca-fines-2016-annual-review', year: 2016 },
      { slug: 'fca-fines-2017-annual-review', year: 2017 },
      { slug: 'fca-fines-2018-annual-review', year: 2018 },
      { slug: 'fca-fines-2019-annual-review', year: 2019 },
      { slug: 'fca-fines-2020-annual-review', year: 2020 },
      { slug: 'fca-fines-2021-annual-review', year: 2021 },
      { slug: 'fca-fines-2022-annual-review', year: 2022 },
      { slug: 'fca-fines-2023-annual-review', year: 2023 },
      { slug: 'fca-fines-2024-annual-review', year: 2024 },
      { slug: 'fca-fines-2025-annual-review', year: 2025 },
    ];

    for (const { slug, year } of yearlyArticleSlugs) {
      test(`should render yearly article: ${slug}`, async ({ page }) => {
        await page.goto(`/blog/${slug}`);

        // Page should load successfully
        await expect(page).toHaveURL(`/blog/${slug}`);

        // Should have article title
        await expect(page.locator('h1.blog-post-title')).toBeVisible();

        // Should have "Annual Analysis" category
        await expect(page.locator('.blog-card-category')).toContainText('Annual Analysis');

        // Should have year in the meta
        await expect(page.locator('.blog-card-meta')).toContainText(`${year} Review`);

        // Should have stats summary for years with data
        const statsSummary = page.locator('.stats-summary-row');
        await expect(statsSummary).toBeVisible();

        // Stats should show Total Fines, Actions, Average Fine, Largest Fine
        await expect(page.locator('.stats-summary-label')).toHaveCount(4);

        // Should have executive summary section
        await expect(page.locator('h2').filter({ hasText: 'Executive Summary' })).toBeVisible();

        // Should have regulatory context section
        await expect(page.locator('h2').filter({ hasText: 'Regulatory Context' })).toBeVisible();

        // Should have key insights box
        await expect(page.locator('.article-key-insights')).toBeVisible();

        // Should have looking ahead section
        await expect(page.locator('h2').filter({ hasText: 'Looking Ahead' })).toBeVisible();

        // Should have footer with keywords and CTA
        await expect(page.locator('.blog-article-keywords')).toBeVisible();
        await expect(page.locator('.blog-cta-button')).toBeVisible();
      });
    }

    test('should render charts on yearly articles', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have monthly fines chart
      const monthlyChart = page.locator('.recharts-wrapper').first();
      await expect(monthlyChart).toBeVisible();

      // Should have yearly charts grid with breach category and top firms
      const yearlyChartsGrid = page.locator('.yearly-charts-grid');
      await expect(yearlyChartsGrid).toBeVisible();

      // Should have year-over-year comparison chart
      const yearComparisonChart = page.locator('.recharts-wrapper').last();
      await expect(yearComparisonChart).toBeVisible();
    });
  });

  test.describe('404 for Invalid Slugs', () => {
    test('should show 404 page for non-existent blog article', async ({ page }) => {
      await page.goto('/blog/non-existent-article-slug');

      // Should show "Article Not Found" message
      await expect(page.locator('h1')).toContainText('Article Not Found');
      await expect(page.getByText("The article you're looking for doesn't exist")).toBeVisible();

      // Should have link back to blog listing
      await expect(page.locator('a').filter({ hasText: 'Browse All Articles' })).toBeVisible();

      // Should still have back to blog nav
      await expect(page.locator('a.blog-post-back')).toBeVisible();
    });

    test('should show 404 page for invalid year slug', async ({ page }) => {
      await page.goto('/blog/fca-fines-1999-annual-review');

      // Should show "Article Not Found" message
      await expect(page.locator('h1')).toContainText('Article Not Found');
    });
  });
});
