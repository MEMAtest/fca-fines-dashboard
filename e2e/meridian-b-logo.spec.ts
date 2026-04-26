import { test, expect, type Page } from '@playwright/test';

test.describe('Meridian B Logo Redesign', () => {
  test.describe('Logo Rendering in SiteHeader', () => {
    test('should render the LogoLockup inside the header logo link', async ({ page }) => {
      await page.goto('/');

      // The site-header__logo link wraps the LogoLockup
      const logoLink = page.locator('a.site-header__logo');
      await expect(logoLink).toBeVisible();

      // LogoLockup renders an inline-flex <span> containing the SVG mark + wordmark
      const lockup = logoLink.locator('span').first();
      await expect(lockup).toBeVisible();
    });

    test('should render the Meridian SVG mark with globe elements', async ({ page }) => {
      await page.goto('/');

      const logoLink = page.locator('a.site-header__logo');
      const svg = logoLink.locator('svg');
      await expect(svg).toBeVisible();

      // The Meridian B mark has: circle (globe), ellipse (meridian), path (equator),
      // circle (accent dot), circle (halo)
      const circles = svg.locator('circle');
      const circleCount = await circles.count();
      // 3 circles: globe outline (r=18), accent dot (r=3.2), halo (r=6.5)
      expect(circleCount).toBe(3);

      const ellipses = svg.locator('ellipse');
      await expect(ellipses).toHaveCount(1);

      const paths = svg.locator('path');
      await expect(paths).toHaveCount(1);
    });

    test('should render the split-accent wordmark with "Reg" and "Actions"', async ({ page }) => {
      await page.goto('/');

      const logoLink = page.locator('a.site-header__logo');

      // The Wordmark component renders a <span> containing "Reg" + <span>Actions</span>
      // Get the full text content of the logo link
      const fullText = await logoLink.textContent();
      expect(fullText).toContain('Reg');
      expect(fullText).toContain('Actions');
      expect(fullText).toContain('RegActions');

      // The accent span for "Actions" should have a distinct color (BRAND.teal = #0FA77D)
      const accentSpan = logoLink.locator('span span span');
      const accentColor = await accentSpan.evaluate(
        (el) => window.getComputedStyle(el).color,
      );
      // The teal accent should NOT be the same as the navy base color
      // BRAND.teal = #0FA77D renders as rgb(15, 167, 125) approximately
      expect(accentColor).not.toBe('rgb(11, 31, 42)'); // Not navy
    });

    test('should render the SVG mark at 32px size in the header', async ({ page }) => {
      await page.goto('/');

      const logoLink = page.locator('a.site-header__logo');
      const svg = logoLink.locator('svg');

      const width = await svg.getAttribute('width');
      const height = await svg.getAttribute('height');
      expect(width).toBe('32');
      expect(height).toBe('32');
    });

    test('should render the mark with correct viewBox', async ({ page }) => {
      await page.goto('/');

      const svg = page.locator('a.site-header__logo svg');
      const viewBox = await svg.getAttribute('viewBox');
      expect(viewBox).toBe('0 0 48 48');
    });
  });

  test.describe('Logo Navigation', () => {
    test('should navigate to homepage when clicking the logo from another page', async ({ page }) => {
      // Navigate to a non-home page first
      await page.goto('/blog');
      await expect(page.locator('h1')).toBeVisible();

      // Click the logo
      const logoLink = page.locator('a.site-header__logo');
      await logoLink.click();

      // Should navigate to root
      await expect(page).toHaveURL('/');
    });

    test('should have href pointing to "/" on the logo link', async ({ page }) => {
      await page.goto('/');

      const logoLink = page.locator('a.site-header__logo');
      const href = await logoLink.getAttribute('href');
      expect(href).toBe('/');
    });

    test('should navigate to homepage when clicking logo from a regulator page', async ({ page }) => {
      await page.goto('/regulators');
      await expect(page.locator('.site-header__logo')).toBeVisible();

      await page.locator('a.site-header__logo').click();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Favicon', () => {
    test('should serve /favicon.svg with correct content-type', async ({ request }) => {
      const response = await request.get('/favicon.svg');
      expect(response.status()).toBe(200);

      const contentType = response.headers()['content-type'];
      // SVG content-type can be image/svg+xml or application/xml
      expect(contentType).toMatch(/svg\+xml|xml/);
    });

    test('should reference favicon.svg in the HTML head', async ({ page }) => {
      await page.goto('/');

      const faviconLink = page.locator('link[rel="icon"][type="image/svg+xml"]');
      const href = await faviconLink.getAttribute('href');
      expect(href).toBe('/favicon.svg');
    });

    test('should contain Meridian B mark elements in favicon SVG', async ({ request }) => {
      const response = await request.get('/favicon.svg');
      const svgContent = await response.text();

      // Favicon has the navy rounded-rect background
      expect(svgContent).toContain('rx="10"');
      expect(svgContent).toContain('fill="#0B1F2A"');

      // Has globe circle, meridian ellipse, equator path
      expect(svgContent).toContain('<circle');
      expect(svgContent).toContain('<ellipse');
      expect(svgContent).toContain('<path');

      // Has the cyan accent dot for the favicon variant
      expect(svgContent).toContain('#19C9E6');
    });
  });

  test.describe('Static Assets', () => {
    test('should serve /regactions-mark.svg with 200 status', async ({ request }) => {
      const response = await request.get('/regactions-mark.svg');
      expect(response.status()).toBe(200);

      const contentType = response.headers()['content-type'];
      expect(contentType).toMatch(/svg\+xml|xml/);
    });

    test('should serve /regactions-mark.png with 200 status', async ({ request }) => {
      const response = await request.get('/regactions-mark.png');
      expect(response.status()).toBe(200);

      const contentType = response.headers()['content-type'];
      expect(contentType).toMatch(/image\/png/);
    });

    test('should serve /regactions-favicon.png with 200 status', async ({ request }) => {
      const response = await request.get('/regactions-favicon.png');
      expect(response.status()).toBe(200);

      const contentType = response.headers()['content-type'];
      expect(contentType).toMatch(/image\/png/);
    });

    test('should serve /regactions-icon-512.png with 200 status', async ({ request }) => {
      const response = await request.get('/regactions-icon-512.png');
      expect(response.status()).toBe(200);

      const contentType = response.headers()['content-type'];
      expect(contentType).toMatch(/image\/png/);
    });

    test('regactions-mark.svg should contain Meridian B globe mark', async ({ request }) => {
      const response = await request.get('/regactions-mark.svg');
      const svgContent = await response.text();

      // Meridian B: globe circle at r=18, meridian ellipse at rx=7 ry=18
      expect(svgContent).toContain('r="18"');
      expect(svgContent).toContain('rx="7"');
      expect(svgContent).toContain('ry="18"');

      // Navy stroke color
      expect(svgContent).toContain('#0B1F2A');

      // Teal accent dot
      expect(svgContent).toContain('#0FA77D');
    });
  });

  test.describe('PWA Manifest', () => {
    test('should serve /manifest.json with 200 status', async ({ request }) => {
      const response = await request.get('/manifest.json');
      expect(response.status()).toBe(200);
    });

    test('should return valid JSON with correct name', async ({ request }) => {
      const response = await request.get('/manifest.json');
      const manifest = await response.json();

      expect(manifest.name).toBe('RegActions');
      expect(manifest.short_name).toBe('RegActions');
    });

    test('should have correct theme_color matching BRAND.navy', async ({ request }) => {
      const response = await request.get('/manifest.json');
      const manifest = await response.json();

      expect(manifest.theme_color).toBe('#0B1F2A');
      expect(manifest.background_color).toBe('#0B1F2A');
    });

    test('should have 192px and 512px icon entries', async ({ request }) => {
      const response = await request.get('/manifest.json');
      const manifest = await response.json();

      expect(manifest.icons).toBeDefined();
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

      // Find the 192px icon
      const icon192 = manifest.icons.find(
        (icon: any) => icon.sizes === '192x192',
      );
      expect(icon192).toBeTruthy();
      expect(icon192.src).toBe('/regactions-favicon.png');
      expect(icon192.type).toBe('image/png');

      // Find the 512px icon
      const icon512 = manifest.icons.find(
        (icon: any) => icon.sizes === '512x512',
      );
      expect(icon512).toBeTruthy();
      expect(icon512.src).toBe('/regactions-icon-512.png');
      expect(icon512.type).toBe('image/png');
    });

    test('should have SVG favicon icon entry', async ({ request }) => {
      const response = await request.get('/manifest.json');
      const manifest = await response.json();

      const svgIcon = manifest.icons.find(
        (icon: any) => icon.type === 'image/svg+xml',
      );
      expect(svgIcon).toBeTruthy();
      expect(svgIcon.src).toBe('/favicon.svg');
      expect(svgIcon.sizes).toBe('any');
    });

    test('manifest icon assets should all be reachable', async ({ request }) => {
      const response = await request.get('/manifest.json');
      const manifest = await response.json();

      for (const icon of manifest.icons) {
        const iconResponse = await request.get(icon.src);
        expect(
          iconResponse.status(),
          `Icon ${icon.src} should return 200`,
        ).toBe(200);
      }
    });

    test('should be linked from the HTML head', async ({ page }) => {
      await page.goto('/');

      const manifestLink = page.locator('link[rel="manifest"]');
      const href = await manifestLink.getAttribute('href');
      expect(href).toBe('/manifest.json');
    });
  });

  test.describe('Apple Touch Icon', () => {
    test('should have apple-touch-icon link in HTML head', async ({ page }) => {
      await page.goto('/');

      const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
      await expect(appleTouchIcon).toHaveCount(1);

      const href = await appleTouchIcon.getAttribute('href');
      expect(href).toBe('/regactions-favicon.png');
    });

    test('apple-touch-icon asset should be reachable', async ({ page, request }) => {
      await page.goto('/');

      const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
      const href = await appleTouchIcon.getAttribute('href');
      expect(href).toBeTruthy();

      const response = await request.get(href!);
      expect(response.status()).toBe(200);

      const contentType = response.headers()['content-type'];
      expect(contentType).toMatch(/image\/png/);
    });
  });

  test.describe('Accessibility', () => {
    test('should have aria-hidden="true" on the logo SVG mark', async ({ page }) => {
      await page.goto('/');

      const svg = page.locator('a.site-header__logo svg');
      const ariaHidden = await svg.getAttribute('aria-hidden');
      expect(ariaHidden).toBe('true');
    });

    test('logo link should be keyboard-focusable', async ({ page }) => {
      await page.goto('/');

      // Try up to 5 tabs to reach the logo link — different browsers
      // may have skip links, address bar focus, or other focusable elements first
      let reachedLogo = false;
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        const href = await page.evaluate(() => {
          const active = document.activeElement;
          if (active instanceof HTMLAnchorElement) {
            return active.getAttribute('href');
          }
          return null;
        });
        if (href === '/') {
          reachedLogo = true;
          break;
        }
      }

      // Fallback: verify the logo link itself accepts focus programmatically
      if (!reachedLogo) {
        await page.locator('a.site-header__logo').focus();
        const href = await page.evaluate(() => {
          const active = document.activeElement;
          return active instanceof HTMLAnchorElement ? active.getAttribute('href') : null;
        });
        reachedLogo = href === '/';
      }
      expect(reachedLogo).toBe(true);
    });

    test('logo SVG should not be announced by screen readers', async ({ page }) => {
      await page.goto('/');

      const svg = page.locator('a.site-header__logo svg');

      // aria-hidden="true" ensures the SVG is hidden from assistive tech
      await expect(svg).toHaveAttribute('aria-hidden', 'true');

      // Should NOT have a role="img" — it is purely decorative
      const role = await svg.getAttribute('role');
      expect(role).toBeNull();
    });

    test('logo link should have accessible text content', async ({ page }) => {
      await page.goto('/');

      const logoLink = page.locator('a.site-header__logo');

      // The wordmark provides accessible text: "RegActions"
      const text = await logoLink.textContent();
      expect(text).toBeTruthy();
      expect(text!.trim()).toContain('RegActions');
    });
  });

  test.describe('Responsive: Mobile Viewport', () => {
    async function openMobileHome(page: Page) {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
    }

    test('should render the logo at mobile width (375px)', async ({ page }) => {
      await openMobileHome(page);

      const logoLink = page.locator('a.site-header__logo');
      await expect(logoLink).toBeVisible();

      // The SVG mark should still be visible
      const svg = logoLink.locator('svg');
      await expect(svg).toBeVisible();
    });

    test('should render the wordmark text at mobile width', async ({ page }) => {
      await openMobileHome(page);

      const logoLink = page.locator('a.site-header__logo');
      const text = await logoLink.textContent();
      expect(text).toContain('RegActions');
    });

    test('logo should not overflow the header at mobile width', async ({ page }) => {
      await openMobileHome(page);

      const header = page.locator('.site-header__inner');
      const headerBox = await header.boundingBox();
      expect(headerBox).toBeTruthy();

      const logoLink = page.locator('a.site-header__logo');
      const logoBox = await logoLink.boundingBox();
      expect(logoBox).toBeTruthy();

      // Logo should fit within the header bounds (with some tolerance for padding)
      expect(logoBox!.x).toBeGreaterThanOrEqual(0);
      expect(logoBox!.x + logoBox!.width).toBeLessThanOrEqual(
        headerBox!.x + headerBox!.width + 1,
      );
    });

    test('logo and hamburger should both be visible at mobile width', async ({ page }) => {
      await openMobileHome(page);

      const logoLink = page.locator('a.site-header__logo');
      await expect(logoLink).toBeVisible();

      const hamburger = page.locator('.site-header__hamburger');
      await expect(hamburger).toBeVisible();
    });

    test('logo navigation should work at mobile width', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/blog');
      await expect(page.locator('h1')).toBeVisible();

      await page.locator('a.site-header__logo').click();
      await expect(page).toHaveURL('/');
    });
  });

  test.describe('Brand Consistency', () => {
    test('should use BRAND.navy (#0B1F2A) as the primary logo color', async ({ page }) => {
      await page.goto('/');

      // The SVG mark strokes use BRAND.navy
      const svg = page.locator('a.site-header__logo svg');
      const outerCircle = svg.locator('circle').first();
      const stroke = await outerCircle.getAttribute('stroke');
      expect(stroke).toBe('#0B1F2A');
    });

    test('should use BRAND.teal (#0FA77D) as the accent dot color', async ({ page }) => {
      await page.goto('/');

      const svg = page.locator('a.site-header__logo svg');
      // The accent dot is the circle with fill (not stroke)
      const circles = svg.locator('circle');
      const circleCount = await circles.count();

      let foundTealFill = false;
      for (let i = 0; i < circleCount; i++) {
        const fill = await circles.nth(i).getAttribute('fill');
        if (fill === '#0FA77D') {
          foundTealFill = true;
          break;
        }
      }
      expect(foundTealFill).toBe(true);
    });

    test('should maintain consistent logo across page navigations', async ({ page }) => {
      // Navigate to homepage
      await page.goto('/');
      const homeLogoText = await page.locator('a.site-header__logo').textContent();
      const homeSvgViewBox = await page
        .locator('a.site-header__logo svg')
        .getAttribute('viewBox');

      // Navigate to blog — wait for network idle to avoid navigation interruption
      await page.goto('/blog', { waitUntil: 'networkidle' });
      const blogLogoText = await page.locator('a.site-header__logo').textContent();
      const blogSvgViewBox = await page
        .locator('a.site-header__logo svg')
        .getAttribute('viewBox');

      // Navigate to search — wait for network idle to avoid navigation interruption
      await page.goto('/search', { waitUntil: 'networkidle' });
      const searchLogoText = await page.locator('a.site-header__logo').textContent();
      const searchSvgViewBox = await page
        .locator('a.site-header__logo svg')
        .getAttribute('viewBox');

      // Logo should be identical on all pages
      expect(homeLogoText).toBe(blogLogoText);
      expect(homeLogoText).toBe(searchLogoText);
      expect(homeSvgViewBox).toBe(blogSvgViewBox);
      expect(homeSvgViewBox).toBe(searchSvgViewBox);
    });
  });
});
