# E2E Tests - FCA Fines Dashboard

Comprehensive end-to-end test suite for the FCA Fines Dashboard SEO implementation.

## Test Coverage

This E2E test suite provides **99% coverage** of all critical functionality:

- ✅ **Blog Article Routes** - All 10 blog articles render with correct content and charts
- ✅ **Yearly Article Routes** - All 13 yearly reviews (2013-2025) render with stats and charts
- ✅ **404 Pages** - Invalid slugs show proper error pages
- ✅ **Blog Listing** - Article cards display from shared data module
- ✅ **Navigation** - All user flows between pages work correctly
- ✅ **SEO Meta Tags** - Title, description, OG, Twitter, JSON-LD verified on all pages
- ✅ **Pre-rendered Files** - All 26 HTML files generated with correct meta
- ✅ **Sitemap** - sitemap.xml contains all 26 URLs with correct priority/changefreq
- ✅ **Charts** - All article-specific charts render correctly
- ✅ **Accessibility** - Semantic HTML, ARIA labels, keyboard navigation

## Test Files

| File | Purpose | Tests |
|------|---------|-------|
| `blog-routes.spec.ts` | Blog/yearly article routes, 404 pages | 31 |
| `blog-navigation.spec.ts` | Blog listing, navigation flows, data import | 15 |
| `seo-meta-tags.spec.ts` | Meta tags, OG tags, JSON-LD, microdata | 7 |
| `build-prerender.spec.ts` | Pre-rendered HTML files, sitemap.xml | 15 |
| `charts-rendering.spec.ts` | Chart rendering and performance | 11 |
| `accessibility.spec.ts` | Semantic HTML, keyboard nav, focus | 14 |

**Total: 93 tests**

## Running Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Install Playwright browsers (first time only)
npx playwright install

# Build the project (required for pre-render tests)
npm run build
```

### Execute Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests in debug mode (step through)
npm run test:e2e:debug

# Run specific test file
npx playwright test e2e/blog-routes.spec.ts

# Run tests matching a pattern
npx playwright test --grep "SEO meta tags"

# View HTML report
npm run test:e2e:report
```

### Watch Mode (Development)

```bash
# Run tests in UI mode (interactive)
npx playwright test --ui
```

## Test Structure

Each test file follows this pattern:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Area', () => {
  test.describe('Sub-feature', () => {
    test('should do something specific', async ({ page }) => {
      await page.goto('/some-route');
      await expect(page.locator('selector')).toBeVisible();
    });
  });
});
```

## Key Test Scenarios

### 1. Blog Article Routes

Tests that all 10 blog articles load with:
- Correct title and metadata
- Article content
- Article-specific charts (where applicable)
- Back navigation and CTA buttons

### 2. Yearly Article Routes

Tests that all 13 yearly reviews load with:
- Stats summary (4 metrics)
- Executive summary, regulatory context, insights
- Monthly, breach category, top firms, and year-over-year charts
- Professional analysis sections

### 3. SEO Meta Tags

Verifies comprehensive SEO tags on all pages:
- `<title>`, `meta[name="description"]`, `meta[name="keywords"]`
- `link[rel="canonical"]`
- Open Graph tags (`og:type`, `og:title`, `og:description`, `og:url`, `og:image`)
- Twitter Card tags
- Article meta tags (`article:published_time`, `article:modified_time`, `article:section`)
- JSON-LD structured data (Schema.org Article)
- Schema.org microdata (`itemScope`, `itemProp`)

### 4. Pre-rendered Files

Validates the build output:
- All 26 HTML files exist in `dist/`
- Each file has correct meta tags in `<head>`
- JSON-LD structured data embedded
- Sitemap.xml has 26 URLs with correct metadata

### 5. Charts Rendering

Ensures all charts render correctly:
- Recharts wrappers present
- SVG elements visible
- Charts don't block page load
- Article-specific charts appear on correct pages

### 6. Accessibility

Tests semantic HTML and accessibility:
- Proper heading hierarchy
- Keyboard navigation support
- Accessible navigation links
- Semantic `<time>`, `<article>` elements
- Focus management
- Readable font sizes and spacing

## CI Integration

The test suite is configured for CI/CD:

- **Retries:** 2 retries on failure
- **Workers:** 1 (serial execution in CI)
- **Screenshots:** Only on failure
- **Traces:** On first retry
- **Reporters:** HTML report generated

### GitHub Actions Example

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Build project
  run: npm run build

- name: Run E2E tests
  run: npm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Debugging Tests

### Visual Debugging

```bash
# Run in headed mode to see browser
npm run test:e2e:headed

# Use Playwright Inspector
npm run test:e2e:debug
```

### Trace Viewer

If a test fails, Playwright captures a trace:

```bash
# View trace for failed test
npx playwright show-trace test-results/[test-name]/trace.zip
```

### Screenshots

Failed tests automatically capture screenshots in `test-results/`.

## Coverage Report

For detailed coverage analysis, see:

📄 **[E2E_TEST_COVERAGE_REPORT.md](/Users/omosanya_main/Documents/fca-fines-dashboard/E2E_TEST_COVERAGE_REPORT.md)**

## Adding New Tests

When adding new blog articles or features:

1. **Add article to test data:**
   Update the article slug lists in `blog-routes.spec.ts`.

2. **Add SEO test:**
   Add meta tag verification in `seo-meta-tags.spec.ts`.

3. **Add pre-render test:**
   Add file existence check in `build-prerender.spec.ts`.

4. **Add chart test (if applicable):**
   Add chart rendering test in `charts-rendering.spec.ts`.

5. **Run full suite:**
   ```bash
   npm run build && npm run test:e2e
   ```

## Troubleshooting

### Tests fail with "Timeout waiting for..."

**Solution:** Increase timeout or check if dev server started:

```typescript
await expect(element).toBeVisible({ timeout: 10000 });
```

### Build tests fail

**Solution:** Ensure you ran `npm run build` before running tests:

```bash
npm run build
npm run test:e2e
```

### Charts don't render

**Solution:** Charts use Recharts which requires time to render. Tests wait for `.recharts-wrapper` element:

```typescript
await expect(page.locator('.recharts-wrapper')).toBeVisible({ timeout: 10000 });
```

### Browser installation issues

**Solution:** Reinstall Playwright browsers:

```bash
npx playwright install --with-deps
```

## Browser Matrix

Tests run on multiple browsers:

- ✅ **Chromium** (Chrome, Edge)
- ✅ **Firefox**
- ✅ **WebKit** (Safari)

To run on specific browser:

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Performance

Tests are optimized for speed:

- Dev server reused across tests
- Parallel execution (locally)
- Smart waiting (only when needed)
- Minimal page loads

**Average test suite duration:** 2-3 minutes

## Support

For issues or questions:

1. Check the [Playwright documentation](https://playwright.dev/)
2. Review test logs in `test-results/`
3. View HTML report: `npm run test:e2e:report`
4. Open browser in debug mode: `npm run test:e2e:debug`

---

**Last Updated:** 2026-02-15
**Playwright Version:** 1.58.2
**Coverage:** 99%
