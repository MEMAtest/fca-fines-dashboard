import { test, expect, type Page, type Route } from '@playwright/test';
import { buildMockSearchResponse } from './search-fixtures.js';

async function fulfillSearch(route: Route) {
  const url = new URL(route.request().url());
  const body = buildMockSearchResponse(url.searchParams);

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function openSearch(page: Page) {
  await page.route('**/api/search**', fulfillSearch);
  await page.goto('/search');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Enforcement Search',
  );
}

async function submitSearch(page: Page, query: string) {
  await page.getByLabel('Search enforcement actions').fill(query);
  await page.getByRole('button', { name: /^Search$/ }).click();
}

test.describe('Enforcement Search', () => {
  test('renders the renamed search page without legacy AI positioning', async ({
    page,
  }) => {
    await openSearch(page);

    await expect(page.getByText(/Natural Language Search/i)).toHaveCount(0);
    await expect(page.getByText(/Powered by AI/i)).toHaveCount(0);
    await expect(page.getByText(/Popular searches:/i)).toBeVisible();
    await expect(
      page.getByText(/Search by firm name, regulator, or enforcement theme/i),
    ).toBeVisible();
  });

  test('returns results for AML transaction monitoring failures', async ({
    page,
  }) => {
    await openSearch(page);
    await submitSearch(page, 'AML transaction monitoring failures');

    await expect(page.getByText(/Found \d+ results for/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Omda Exchange/i })).toBeVisible();
    await expect(
      page.getByText(/The Central Bank of the UAE revoked the licence of Omda Exchange/i),
    ).toBeVisible();
    await expect(page.getByText(/No results found/i)).toHaveCount(0);
  });

  test('auto-runs a suggested query when a chip is clicked', async ({ page }) => {
    await openSearch(page);

    await page
      .getByRole('button', { name: 'Goldman Sachs enforcement' })
      .first()
      .click();

    await expect(page.getByLabel('Search enforcement actions')).toHaveValue(
      'Goldman Sachs enforcement',
    );
    await expect(
      page.getByRole('heading', { name: /Goldman Sachs & Co\. LLC/i }),
    ).toBeVisible();
  });

  test('prioritizes firm-name searches cleanly', async ({ page }) => {
    await openSearch(page);
    await submitSearch(page, 'Goldman Sachs enforcement');

    const firstResultTitle = page.locator('h3').first();
    await expect(firstResultTitle).toContainText('Goldman Sachs & Co. LLC');
  });

  test('supports breach-theme searches', async ({ page }) => {
    await openSearch(page);
    await submitSearch(page, 'market manipulation insider trading');

    await expect(
      page.getByRole('heading', { name: /NordWest Broker GmbH/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/market manipulation surveillance failures/i),
    ).toBeVisible();
  });

  test('returns results for short transaction monitoring theme queries', async ({
    page,
  }) => {
    await openSearch(page);
    await submitSearch(page, 'transaction monitoring');

    await expect(page.getByText(/Found \d+ results for/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Omda Exchange/i })).toBeVisible();
  });

  test('returns focused smcr results', async ({ page }) => {
    await openSearch(page);
    await submitSearch(page, 'SMCR');

    await expect(
      page.getByRole('heading', { name: /NorthBridge Wealth Ltd/i }),
    ).toBeVisible();
    await expect(
      page.getByText('Senior Managers and Certification Regime failures', {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('returns aml cft results for counter terrorist financing queries', async ({
    page,
  }) => {
    await openSearch(page);
    await submitSearch(page, 'counter terrorist financing');

    await expect(
      page.getByRole('heading', { name: /Lion City Remittance Pte Ltd/i }),
    ).toBeVisible();
  });

  test('supports acronym expansion for AML queries', async ({ page }) => {
    await openSearch(page);
    await submitSearch(page, 'anti money laundering');

    await expect(page.getByText(/Found \d+ results for/i)).toBeVisible();

    await page.getByLabel('Search enforcement actions').fill('AML failures');
    await page.getByRole('button', { name: /^Search$/ }).click();

    await expect(page.getByText(/Found \d+ results for/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /AML Case 20 Ltd/i })).toBeVisible();
  });

  test('submits the country filter as a canonical country code', async ({
    page,
  }) => {
    const requestedCountries: string[] = [];
    await page.route('**/api/search**', async (route) => {
      const url = new URL(route.request().url());
      requestedCountries.push(url.searchParams.get('country') ?? '');
      await fulfillSearch(route);
    });

    await page.goto('/search');
    await page.getByRole('button', { name: /Show Filters/i }).click();
    await page.getByLabel('Filter by country').selectOption('DE');
    await submitSearch(page, 'Germany compliance failures');

    expect(requestedCountries.at(-1)).toBe('DE');
    await expect(
      page.getByRole('heading', { name: /NordWest Broker GmbH/i }),
    ).toBeVisible();
  });

  test('applies regulator filters to the rendered result set', async ({ page }) => {
    await openSearch(page);
    await page.getByRole('button', { name: /Show Filters/i }).click();
    await page.getByLabel('Filter by regulator').selectOption('SEC');
    await submitSearch(page, 'LPL Financial');

    await expect(page.getByRole('heading', { name: /LPL Financial LLC/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Coinbase Europe Limited/i }),
    ).toHaveCount(0);
  });

  test('applies year filters correctly', async ({ page }) => {
    await openSearch(page);
    await page.getByRole('button', { name: /Show Filters/i }).click();
    await page.getByLabel('Filter by year').selectOption('2026');
    await submitSearch(page, 'SEBI anti money laundering');

    await expect(
      page.getByRole('heading', { name: /Streetgains Research Services/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Coinbase Europe Limited/i }),
    ).toHaveCount(0);
  });

  test('applies minimum amount filters', async ({ page }) => {
    await openSearch(page);
    await page.getByRole('button', { name: /Show Filters/i }).click();
    await page.getByLabel(/Min Amount \(GBP\)/i).fill('10000000');
    await submitSearch(page, 'AML');

    await expect(page.getByRole('heading', { name: /LPL Financial LLC/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Coinbase Europe Limited/i }),
    ).toHaveCount(0);
  });

  test('paginates broad AML results', async ({ page }) => {
    await openSearch(page);
    await submitSearch(page, 'AML');

    await expect(page.getByText(/Page 1 of/i)).toBeVisible();
    await page.getByRole('button', { name: /Next/i }).click();
    await expect(page.getByText(/Page 2 of/i)).toBeVisible();
    await page.getByRole('button', { name: /Previous/i }).click();
    await expect(page.getByText(/Page 1 of/i)).toBeVisible();
  });

  test('clears filters without clearing the current query', async ({ page }) => {
    await openSearch(page);
    await page.getByLabel('Search enforcement actions').fill('AML');
    await page.getByRole('button', { name: /Show Filters/i }).click();
    await page.getByLabel('Filter by regulator').selectOption('SEC');
    await page.getByLabel('Filter by country').selectOption('US');
    await page.getByRole('button', { name: /Clear All Filters/i }).click();

    await expect(page.getByLabel('Filter by regulator')).toHaveValue('');
    await expect(page.getByLabel('Filter by country')).toHaveValue('');
    await expect(page.getByLabel('Search enforcement actions')).toHaveValue('AML');
  });

  test('renders the new empty state for no-match queries', async ({ page }) => {
    await openSearch(page);
    await submitSearch(page, 'zzzzzz impossible zebra compliance');

    await expect(page.getByText('No results found')).toBeVisible();
    await expect(
      page.getByText(/Try a broader firm name, regulator, or enforcement theme/i),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Clear filters/i })).toHaveCount(0);
  });

  test('does not return noisy matches for stopword-only queries', async ({ page }) => {
    await openSearch(page);
    await submitSearch(page, 'the and of');

    await expect(page.getByText('No results found')).toBeVisible();
    await expect(
      page.getByText(/Try a broader firm name, regulator, or enforcement theme/i),
    ).toBeVisible();
  });

  test('shows an error banner when the API fails', async ({ page }) => {
    await page.route('**/api/search**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Search failed',
          message: 'Injected failure for E2E coverage',
        }),
      });
    });

    await page.goto('/search');
    await submitSearch(page, 'AML');

    await expect(page.getByText(/Injected failure for E2E coverage/i)).toBeVisible();
  });

  test('supports keyboard submission', async ({ page }) => {
    await openSearch(page);
    await page.getByLabel('Search enforcement actions').fill('Coinbase Europe AML');
    await page.getByLabel('Search enforcement actions').press('Enter');

    await expect(
      page.getByRole('heading', { name: /Coinbase Europe Limited/i }),
    ).toBeVisible();
  });

  test('remains usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearch(page);
    await submitSearch(page, 'AML transaction monitoring failures');

    await expect(page.getByRole('button', { name: /^Search$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Omda Exchange/i })).toBeVisible();
  });
});
