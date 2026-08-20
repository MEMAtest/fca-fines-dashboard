import { test, expect } from "@playwright/test";

/**
 * Horizontal-overflow gate.
 *
 * The redesign prototype is desktop-only — zero media queries and a hard
 * `min-width: 1180px` — so implementing it screen by screen risks pushing pages
 * wider than a phone viewport. That is not hypothetical: `/countries/:slug`
 * shipped 85px of overflow (a 282px button row in a non-wrapping flex row) and
 * `/countries` shipped 18px (a grid item forcing its track past its container
 * because grid items default to `min-width: auto`).
 *
 * A page wider than the viewport renders zoomed out on a phone — every font
 * shrinks and the whole layout looks broken, which is how both bugs were
 * reported.
 *
 * This must stay green at every stage of the redesign.
 *
 * ⚠️ RUN IT AGAINST PRODUCTION TOO, not just the local build.
 * `vite preview` serves no API, so data tables render EMPTY and cannot
 * overflow. Three routes (/fines, /fines/actions, /regulators/fca) passed
 * locally and then overflowed by 45-101px at 320px on the deployed site, purely
 * because real rows loaded. After deploying:
 *
 *   PLAYWRIGHT_BASE_URL=https://regactions.com npx playwright test \
 *     e2e/mobile-overflow.spec.ts --project=chromium
 */

const ROUTES = [
  ["home", "/"],
  ["fines", "/fines"],
  ["fines actions", "/fines/actions"],
  ["explorer", "/search"],
  ["research", "/blog"],
  ["briefing", "/intelligence"],
  ["countries", "/countries"],
  ["country report", "/countries/united-states"],
  ["regulator hub", "/regulators/fca"],
  ["regulators", "/regulators"],
  ["board pack", "/board-pack"],
  ["topics", "/topics"],
  ["about", "/about"],
] as const;

/** 320 = iPhone SE, 375 = iPhone mini, 390 = iPhone 14/15, 768 = tablet. */
const WIDTHS = [320, 375, 390, 768] as const;

for (const [label, route] of ROUTES) {
  for (const width of WIDTHS) {
    test(`${label} has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(route, { waitUntil: "networkidle" });
      // Client-rendered content settles after the initial paint.
      await page.waitForTimeout(1200);

      const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = doc.scrollWidth - doc.clientWidth;
        const offenders: string[] = [];
        if (overflow > 0) {
          document.querySelectorAll("*").forEach((el) => {
            const box = el.getBoundingClientRect();
            if (box.right > doc.clientWidth + 1 && box.width > 0) {
              const cls =
                typeof el.className === "string"
                  ? el.className.split(" ").filter(Boolean).slice(0, 2).join(".")
                  : "";
              offenders.push(
                `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} (right=${Math.round(box.right)}, w=${Math.round(box.width)})`,
              );
            }
          });
        }
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          // De-duplicate and cap: the widest few identify the cause.
          offenders: [...new Set(offenders)].slice(0, 6),
        };
      });

      expect(
        scrollWidth,
        `${route} overflows by ${scrollWidth - clientWidth}px at ${width}px.\nWidest offenders:\n  ${offenders.join("\n  ")}`,
      ).toBeLessThanOrEqual(clientWidth);
    });
  }
}
