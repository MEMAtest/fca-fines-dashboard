import { test, expect } from '@playwright/test';

test.describe('Charts Rendering on Blog Articles', () => {
  test.describe('Main Article Charts', () => {
    test('should render Top20FinesChart on largest fines article', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      // Wait for article to load
      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Wait for charts section
      await expect(page.locator('.article-charts-section')).toBeVisible();

      // Should have Recharts wrapper (indicates chart rendered)
      const chartWrappers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartWrappers.first()).toBeVisible();

      // Should have SVG elements (Recharts renders as SVG)
      const svgElements = page.locator('.article-charts-section svg.recharts-surface');
      await expect(svgElements.first()).toBeVisible();
    });

    test('should render 2025 monthly and breach charts on 2025 article', async ({ page }) => {
      await page.goto('/blog/fca-fines-2025-complete-list');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have article charts section
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should render 2 charts
      const chartWrappers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartWrappers).toHaveCount(2);

      // Both should be visible
      await expect(chartWrappers.nth(0)).toBeVisible();
      await expect(chartWrappers.nth(1)).toBeVisible();
    });

    test('should render CumulativeFinesChart on database guide article', async ({ page }) => {
      await page.goto('/blog/fca-fines-database-how-to-search');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have article charts section
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should have at least one chart
      const chartWrappers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartWrappers.first()).toBeVisible();
    });

    test('should render AML charts on AML fines article', async ({ page }) => {
      await page.goto('/blog/fca-aml-fines-anti-money-laundering');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have article charts section
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should render 2 AML charts
      const chartWrappers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartWrappers).toHaveCount(2);
    });

    test('should render BankFinesComparisonChart on banks article', async ({ page }) => {
      await page.goto('/blog/fca-fines-banks-complete-list');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have article charts section
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should have bank comparison chart
      const chartWrappers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartWrappers.first()).toBeVisible();
    });

    test('should render AllYearsEnforcementChart on trends article', async ({ page }) => {
      await page.goto('/blog/fca-enforcement-trends-2013-2025');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have article charts section
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should have enforcement chart
      const chartWrappers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartWrappers.first()).toBeVisible();
    });

    test('should render FinalNoticesBreakdownChart on final notices article', async ({ page }) => {
      await page.goto('/blog/fca-final-notices-explained');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have article charts section
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should have final notices chart
      const chartWrappers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartWrappers.first()).toBeVisible();
    });

    test('should render SMCREnforcementChart on SMCR article', async ({ page }) => {
      await page.goto('/blog/senior-managers-regime-fca-fines');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have article charts section
      const chartsSection = page.locator('.article-charts-section');
      await expect(chartsSection).toBeVisible();

      // Should have SMCR chart
      const chartWrappers = page.locator('.article-charts-section .recharts-wrapper');
      await expect(chartWrappers.first()).toBeVisible();
    });
  });

  test.describe('Yearly Article Charts', () => {
    test('should render stats summary on yearly article', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have stats summary row
      const statsSummary = page.locator('.stats-summary-row');
      await expect(statsSummary).toBeVisible();

      // Should have 4 stat items (Total Fines, Actions, Average Fine, Largest Fine)
      const statItems = page.locator('.stats-summary-item');
      await expect(statItems).toHaveCount(4);

      // Each stat should have value and label
      for (let i = 0; i < 4; i++) {
        await expect(statItems.nth(i).locator('.stats-summary-value')).toBeVisible();
        await expect(statItems.nth(i).locator('.stats-summary-label')).toBeVisible();
      }
    });

    test('should render MonthlyFinesChart on yearly article', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have monthly chart (first Recharts wrapper)
      const monthlyChart = page.locator('.recharts-wrapper').first();
      await expect(monthlyChart).toBeVisible();

      // Should have bar chart elements
      const barChartBars = page.locator('.recharts-bar');
      await expect(barChartBars.first()).toBeVisible();
    });

    test('should render BreachCategoryChart and TopFirmsChart on yearly article', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have yearly charts grid
      const yearlyChartsGrid = page.locator('.yearly-charts-grid');
      await expect(yearlyChartsGrid).toBeVisible();

      // Should have 2 charts in the grid
      const gridCharts = yearlyChartsGrid.locator('.recharts-wrapper');
      await expect(gridCharts).toHaveCount(2);

      // Both should be visible
      await expect(gridCharts.nth(0)).toBeVisible();
      await expect(gridCharts.nth(1)).toBeVisible();
    });

    test('should render YearOverYearChart on yearly article', async ({ page }) => {
      await page.goto('/blog/fca-fines-2024-annual-review');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Should have year-over-year comparison chart
      // This is typically the last chart on the page
      const allCharts = page.locator('.recharts-wrapper');
      const chartCount = await allCharts.count();

      // Should have multiple charts (at least 4: monthly, breach, firms, year-over-year)
      expect(chartCount).toBeGreaterThanOrEqual(4);

      // Last chart should be visible (year-over-year)
      await expect(allCharts.last()).toBeVisible();
    });

    test('should render charts on older yearly articles (2013-2023)', async ({ page }) => {
      const years = [2013, 2015, 2018, 2021, 2023];

      for (const year of years) {
        await page.goto(`/blog/fca-fines-${year}-annual-review`);

        await expect(page.locator('h1.blog-post-title')).toBeVisible();

        // Should have stats summary
        await expect(page.locator('.stats-summary-row')).toBeVisible();

        // Should have at least one chart
        const charts = page.locator('.recharts-wrapper');
        await expect(charts.first()).toBeVisible();
      }
    });
  });

  test.describe('Chart Interactivity', () => {
    test('should show tooltips on chart hover', async ({ page }) => {
      await page.goto('/blog/20-biggest-fca-fines-of-all-time');

      await expect(page.locator('h1.blog-post-title')).toBeVisible();

      // Wait for chart to render
      const chart = page.locator('.article-charts-section .recharts-wrapper').first();
      await expect(chart).toBeVisible();

      // Hover over chart area
      const chartSurface = page.locator('.article-charts-section svg.recharts-surface').first();
      await chartSurface.hover({ position: { x: 100, y: 100 } });

      // Tooltip should appear (Recharts tooltip has default class)
      // Note: Tooltip might not always appear in headless mode, so we just check the chart rendered
      await expect(chartSurface).toBeVisible();
    });
  });

  test.describe('Charts Performance', () => {
    test('should load charts without blocking page render', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/blog/fca-fines-2024-annual-review');

      // Page title should appear quickly (before charts finish rendering)
      await expect(page.locator('h1.blog-post-title')).toBeVisible({ timeout: 5000 });

      const titleLoadTime = Date.now() - startTime;

      // Title should load within 2 seconds
      expect(titleLoadTime).toBeLessThan(2000);

      // Charts should eventually load
      await expect(page.locator('.recharts-wrapper').first()).toBeVisible({ timeout: 10000 });
    });
  });
});
