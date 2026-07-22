import { expect, test } from '@playwright/test';

test.describe('Topic Clusters', () => {
  test('should render AML enforcement cluster with core links', async ({ page }) => {
    await page.goto('/topics/aml-enforcement');

    await expect(page.locator('h1')).toContainText('AML Enforcement');
    await expect(page.getByRole('heading', { name: 'Core articles' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Global AML Enforcement Comparison 2026/i }),
    ).toHaveAttribute('href', '/blog/global-aml-enforcement-comparison-2026');
    await expect(
      page.getByRole('link', { name: /Create AML board pack/i }),
    ).toHaveAttribute('href', '/board-pack');
    await expect(
      page.getByRole('link', { name: /MEMA AML support/i }),
    ).toHaveAttribute('href', 'https://memaconsultants.com');
  });

  test('should expose editorial clusters from the topics hub', async ({ page }) => {
    await page.goto('/topics');

    await expect(
      page.getByRole('heading', { name: 'Editorial Topic Clusters' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /FCA Fines 2026/i }),
    ).toHaveAttribute('href', '/topics/fca-fines-2026');
    await expect(
      page.getByRole('link', { name: /Market Abuse Enforcement/i }),
    ).toHaveAttribute('href', '/topics/market-abuse-enforcement');
  });

  test('should render the FCA 2026 answer and source pathways', async ({ page }) => {
    await page.goto('/topics/fca-fines-2026');

    await expect(page.getByRole('heading', { name: 'How much has the FCA fined firms and individuals in 2026?' })).toBeVisible();
    await expect(page.getByRole('link', { name: /FCA 2026 fines page/i })).toHaveAttribute('href', 'https://www.fca.org.uk/news/news-stories/2026-fines');
    await expect(page.getByRole('link', { name: 'Complete FCA fines database' })).toHaveAttribute('href', '/regulators/fca');
  });
});
