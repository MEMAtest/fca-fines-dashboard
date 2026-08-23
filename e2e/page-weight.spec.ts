import { test, expect } from "@playwright/test";

/**
 * JavaScript weight budget.
 *
 * This exists because nobody noticed the homepage was shipping 3.4 MB of
 * JavaScript. 1,740 KB of it was react-globe.gl pulling `three` behind it, and
 * another 985 KB was the body of every article on the site, imported so the
 * front page could render three preview cards. Neither showed up in any gate,
 * any test, or any review. It surfaced only because someone asked how the site
 * was doing.
 *
 * Overflow and integrity are asserted elsewhere. Weight was the dimension with
 * no gate at all, so a regression could sit there indefinitely.
 *
 * The budgets are deliberately loose — roughly 40% above what each route
 * currently ships. This is a tripwire for something megabyte-scale going wrong,
 * not a ratchet to be tuned on every commit. If a change genuinely needs more,
 * raise the number here and say why in the commit.
 *
 * ⚠️ LIVE ONLY. `vite preview` serves no API, so data-driven routes load fewer
 * chunks and the numbers flatter themselves:
 *
 *   PLAYWRIGHT_BASE_URL=https://regactions.com npx playwright test \
 *     e2e/page-weight.spec.ts --project=chromium
 */

/** Route, and the ceiling in kilobytes of uncompressed JavaScript on the wire. */
const BUDGETS: Array<[route: string, kb: number]> = [
  ["/", 1000],
  ["/fines", 1200],
  ["/search", 1200],
  // 1,607 KB today, and most of it is real: /countries scores all 214
  // jurisdictions in the browser, so it pulls the FATF ratings table, the
  // sanctions catalogue and the governance series. That is a fair cost for what
  // the page does. Moving the computation server-side is the fix if it ever
  // needs one; until then this holds the line rather than pretending.
  ["/countries", 1800],
  ["/regulators/fca", 1200],
];

const LIVE_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const IS_LIVE = Boolean(LIVE_BASE_URL && !/127\.0\.0\.1|localhost/.test(LIVE_BASE_URL));

for (const [route, budgetKb] of BUDGETS) {
  test(`${route} stays under ${budgetKb} KB of JavaScript`, async ({ page }) => {
    test.skip(!IS_LIVE, "Needs the live site. Run with PLAYWRIGHT_BASE_URL=https://regactions.com");

    const files: Array<[string, number]> = [];
    page.on("response", async (response) => {
      if (!/\.js(\?|$)/.test(response.url())) return;
      try {
        const body = await response.body();
        files.push([response.url().split("/").pop() ?? "?", body.length]);
      } catch {
        // A redirected or cancelled response has no body to measure.
      }
    });

    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 45000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2500);

    const totalKb = Math.round(files.reduce((sum, [, size]) => sum + size, 0) / 1024);
    const heaviest = files
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([name, size]) => `  ${Math.round(size / 1024)} KB  ${name}`)
      .join("\n");

    expect(
      totalKb,
      `${route} ships ${totalKb} KB of JavaScript, over its ${budgetKb} KB budget.\nHeaviest chunks:\n${heaviest}`,
    ).toBeLessThanOrEqual(budgetKb);
  });
}
