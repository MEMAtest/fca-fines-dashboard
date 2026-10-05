import { test, expect } from '@playwright/test';

/**
 * The Enforcement Explorer keeps its filters in the URL, and a burst of changes
 * used to lose some of them: two updates landing in the same React batch were
 * both handed the same base parameters, so the last one won and the rest
 * vanished while their inputs still showed the values the user had typed.
 *
 * It reproduces only when the commit is slow enough for the burst to coalesce,
 * which is why it surfaced as an intermittent CI failure rather than a local
 * one. Throttling the CPU makes it deterministic: without the fix this fails
 * every run, with the URL collapsing to just the last filter applied.
 */
test('a burst of filter changes composes instead of competing', async ({ page }) => {
  test.setTimeout(120000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 20 });

  await page.goto('/search');
  await page.getByLabel('Minimum GBP').waitFor({ timeout: 60000 });

  await page.getByLabel('Minimum GBP').fill('2500000');
  await page.getByLabel('Maximum GBP').fill('41000000');
  await page.getByLabel('Sort').selectOption('amount_gbp:desc');

  await expect(page).toHaveURL(/minAmount=2500000/);
  await expect(page).toHaveURL(/maxAmount=41000000/);
  await expect(page).toHaveURL(/sort=amount_gbp/);
});
