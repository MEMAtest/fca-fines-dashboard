import { test, expect } from '@playwright/test';

/**
 * Country-vs-country compare pages (roadmap item 11) + item-14 country-page
 * signals (FATF mutual-evaluation line, BO-register line).
 *
 * These run against the dev server (client-side React), so they exercise the
 * SAME buildCompareView/buildCountryView the prerender uses.
 */

test.describe('Country compare pages', () => {
  test('renders a curated pair with both countries + verdict', async ({ page }) => {
    await page.goto('/countries/compare/panama-vs-united-states');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Panama');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('United States');
    // Deterministic verdict line.
    await expect(page.locator('.cxc-verdict')).toContainText(/assessed risk|withheld|higher-risk/);
    // Side-by-side table has the expected indicator rows.
    await expect(page.locator('.cxc-grid')).toContainText('RegActions risk score');
    await expect(page.locator('.cxc-grid')).toContainText('FATF status');
    await expect(page.locator('.cxc-grid')).toContainText('BO register');
    // Both full-report links present.
    await expect(page.locator('.cxc-reportlink[href="/countries/panama"]')).toBeVisible();
    await expect(page.locator('.cxc-reportlink[href="/countries/united-states"]')).toBeVisible();
    await page.screenshot({ path: '/tmp/d2_compare_curated.png', fullPage: true });
  });

  test('renders an un-prerendered pair via client navigation', async ({ page }) => {
    // Kenya-vs-Nigeria is a valid pair; whether or not it is in the curated set,
    // the React route must render it client-side.
    await page.goto('/countries/compare/kenya-vs-nigeria');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kenya');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nigeria');
    await expect(page.locator('.cxc-grid')).toBeVisible();
    await page.screenshot({ path: '/tmp/d2_compare_uncurated.png', fullPage: true });
  });

  test('canonicalises b-vs-a to a-vs-b', async ({ page }) => {
    // united-states-vs-panama should redirect to panama-vs-united-states.
    await page.goto('/countries/compare/united-states-vs-panama');
    await expect(page).toHaveURL(/\/countries\/compare\/panama-vs-united-states$/);
  });

  test('peer-card "Compare ->" link navigates to a compare page', async ({ page }) => {
    await page.goto('/countries/malta');
    // The peer list "Compare ->" links are revealed on hover via CSS. Hover the
    // owning row to reveal, then click. A curated Compare link always exists in
    // the peer card.
    const firstPeerRow = page.locator('.cx-peerc__list > li').filter({ has: page.locator('.cx-peer__compare') }).first();
    await firstPeerRow.scrollIntoViewIfNeeded();
    await firstPeerRow.hover();
    const compareLink = firstPeerRow.locator('.cx-peer__compare');
    await expect(compareLink).toBeVisible();
    await compareLink.click();
    await expect(page).toHaveURL(/\/countries\/compare\/[a-z-]+-vs-[a-z-]+$/);
    await expect(page.locator('.cxc-grid')).toBeVisible();
    await page.screenshot({ path: '/tmp/d2_peer_compare_nav.png', fullPage: true });
  });
});

test.describe('Country page item-14 signals + height', () => {
  test('shows the FATF mutual-evaluation line and BO-register line', async ({ page }) => {
    await page.goto('/countries/malta');
    await expect(page.locator('.cx-regf')).toContainText(/Last mutual evaluation: \d{4}/);
    await expect(page.locator('.cx-regf')).toContainText(/BO register/);
    await page.screenshot({ path: '/tmp/d2_country_signals.png', fullPage: true });
  });

  test('country page height stays within budget (<= ~1750px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/countries/united-states');
    // Let layout settle (lazy map, fonts).
    await page.waitForTimeout(1200);
    const height = await page.evaluate(() => {
      const wrap = document.querySelector('.cx-ws-wrap');
      return wrap ? (wrap as HTMLElement).getBoundingClientRect().height : document.body.scrollHeight;
    });
    // Log for the report and assert the budget.
    console.log('country page .cx-ws-wrap height:', height);
    expect(height).toBeLessThanOrEqual(1800);
  });
});
