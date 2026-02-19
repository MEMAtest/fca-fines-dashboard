import { test, expect, type Page } from '@playwright/test';

test.describe('Mobile Dashboard Navigation', () => {
  async function openMobileDashboard(page: Page) {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard?year=0');

    const mobileNav = page.locator('.mobile-nav');
    await expect(mobileNav).toBeVisible();
  }

  test('compare opens the comparison modal on mobile', async ({ page }) => {
    await openMobileDashboard(page);

    await page.getByRole('button', { name: /Compare/i }).click();

    // Modal should open with a Comparison title.
    await expect(page.locator('.modal-inner')).toBeVisible();
    await expect(page.locator('.modal-header h2')).toContainText(/Comparison/);
  });

  test('share shows feedback on mobile (toast or share modal)', async ({ page }) => {
    await openMobileDashboard(page);

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

  test('menu drawer opens and closes with drawer close button', async ({ page }) => {
    await openMobileDashboard(page);

    await page.getByRole('button', { name: /Open menu/i }).click();
    const drawer = page.locator('.site-header__mobile-nav');
    await expect(drawer).toBeVisible();

    const drawerCloseButton = page.locator('.site-header__mobile-close');
    await expect(drawerCloseButton).toBeVisible();
    await drawerCloseButton.click();

    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: /Open menu/i })).toBeVisible();
  });

  test('get alerts opens the subscription modal on mobile', async ({ page }) => {
    await openMobileDashboard(page);

    await page.getByRole('button', { name: /Get alerts/i }).click();
    await expect(page.locator('.alert-subscribe-modal')).toBeVisible();
    await expect(page.locator('.alert-subscribe-modal h2')).toContainText(/Get Fine Alerts/i);
  });
});
