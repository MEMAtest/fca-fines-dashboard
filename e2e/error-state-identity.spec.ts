import { test, expect } from '@playwright/test';

/**
 * A page whose data fails to load must still say what page it is.
 *
 * The regulator workspace replaced itself with a bare "Unable to load
 * regulatory data" card, so the reader lost every clue about which regulator
 * they were looking at, and page-integrity, which waits for an <h1>, timed out
 * and reported a rendering failure rather than the data failure that happened.
 */
test('the regulator workspace keeps its identity when the data fails', async ({ page }) => {
  await page.route('**/api/site/unified/search**', (route) => route.abort());

  await page.goto('/regulators/fca');

  await expect(page.locator('h1')).toHaveText(/FCA Fines Database and Enforcement Actions/);
  await expect(page.getByRole('alert')).toContainText(/Unable to load regulatory data/);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
