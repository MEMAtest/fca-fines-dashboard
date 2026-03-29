import { test, expect } from '@playwright/test';

test.describe('Enforcement Search live smoke', () => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL,
    'Live smoke runs only against an explicit deployed base URL.',
  );

  test('loads the renamed search page and returns live results for obvious queries', async ({
    page,
  }) => {
    await page.goto('/search');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Enforcement Search',
    );

    await page.getByLabel('Search enforcement actions').fill(
      'AML transaction monitoring failures',
    );
    await page.getByRole('button', { name: /^Search$/ }).click();
    await expect(page.getByText(/Found \d+ results for/i)).toBeVisible();

    await page.getByLabel('Search enforcement actions').fill(
      'Goldman Sachs enforcement',
    );
    await page.getByRole('button', { name: /^Search$/ }).click();
    await expect(page.getByText(/Found \d+ results for/i)).toBeVisible();

    await page.getByLabel('Search enforcement actions').fill(
      'transaction monitoring',
    );
    await page.getByRole('button', { name: /^Search$/ }).click();
    await expect(page.getByText(/Found \d+ results for/i)).toBeVisible();

    await page.getByLabel('Search enforcement actions').fill('the and of');
    await page.getByRole('button', { name: /^Search$/ }).click();
    await expect(page.getByText('No results found')).toBeVisible();

    await page.getByLabel('Search enforcement actions').fill(
      'zzzzzz impossible zebra compliance',
    );
    await page.getByRole('button', { name: /^Search$/ }).click();
    await expect(page.getByText('No results found')).toBeVisible();
  });
});
