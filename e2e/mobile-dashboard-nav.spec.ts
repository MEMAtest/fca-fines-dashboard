import { test, expect } from '@playwright/test';

test.describe('Mobile Dashboard Navigation', () => {
  test('compare opens the comparison modal on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard?year=0');

    const mobileNav = page.locator('.mobile-nav');
    await expect(mobileNav).toBeVisible();

    await page.getByRole('button', { name: /Compare/i }).click();

    // Modal should open with a Comparison title.
    await expect(page.locator('.modal-inner')).toBeVisible();
    await expect(page.locator('.modal-header h2')).toContainText(/Comparison/);
  });

  test('share shows feedback on mobile (toast or share modal)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard?year=0');

    const mobileNav = page.locator('.mobile-nav');
    await expect(mobileNav).toBeVisible();

    await page.getByRole('button', { name: /Share/i }).click();

    // In headless runs, navigator.share is usually unavailable. We accept either:
    // - a toast indicating the link was copied, or
    // - the manual share modal.
    const toast = page.locator('.toast');
    const shareModal = page.locator('.modal-header h2', { hasText: 'Share This View' });
    const toastVisible = await toast.first().isVisible().catch(() => false);
    if (!toastVisible) {
      await expect(shareModal).toBeVisible();
    }
  });
});
