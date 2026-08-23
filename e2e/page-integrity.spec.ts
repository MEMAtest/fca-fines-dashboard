import { test, expect } from "@playwright/test";

/**
 * Page-integrity gate.
 *
 * This exists because the technical gates kept passing while the pages were
 * visibly wrong. Overflow was green, contrast was green, the suite was green,
 * and the homepage was still shipping two stacked footers, /breaches was still
 * listing "Market Abuse" three times, and /search was still rendering a raw
 * "&copy" in a summary. Every one of those was found by a human looking at the
 * page, which is the wrong way round.
 *
 * So: the checks that kept catching things by hand, run automatically.
 *
 *   - exactly one <h1>          (SEO, and a second one usually means a stray
 *                                page-level component got nested)
 *   - exactly one <footer>      (the duplicate-footer bug shipped on /, /blog,
 *                                /countries, /countries/cuba and /board-pack;
 *                                content footnotes belong in a <div>, not a
 *                                second contentinfo landmark)
 *   - no raw database enums     ("SYSTEMS_CONTROLS" rather than
 *                                "Systems & Controls")
 *   - no HTML entities          ("&copy" / "&amp;" surviving a scrape and
 *                                being escaped by React back into view)
 *
 * ⚠️ RUN IT AGAINST PRODUCTION TOO. `vite preview` serves no API, so every
 * data-driven surface renders empty and cannot fail the last two checks:
 *
 *   PLAYWRIGHT_BASE_URL=https://regactions.com npx playwright test \
 *     e2e/page-integrity.spec.ts --project=chromium
 *
 * Horizontal overflow has its own gate in mobile-overflow.spec.ts.
 */

const ROUTES = [
  "/",
  "/fines",
  "/fines/actions",
  "/search",
  "/blog",
  "/intelligence",
  "/countries",
  "/countries/cuba",
  "/regulators",
  "/regulators/fca",
  "/board-pack",
  "/topics",
  "/breaches",
  "/roadmap",
  "/about",
] as const;

/** Screaming snake case: three or more capitals, then at least one _WORD. */
const ENUM_SHAPED = /^[A-Z]{3,}(?:_[A-Z]+)+$/;
const HTML_ENTITY = /&(copy|amp|nbsp|quot|apos);?/i;

/**
 * Every check here needs real rows to be meaningful, and two of them cannot
 * fail without a database at all. `vite preview` serves no API, so /fines,
 * /fines/actions and /regulators/fca render their chrome with no <h1> — the
 * heading comes from the data — and the enum and entity checks pass trivially
 * because there is nothing to render.
 *
 * Rather than weaken the assertions until a data-less run goes green, the spec
 * declares itself a live gate and skips when it is not pointed at one.
 */
/**
 * These pages are slow enough that a cold or contended API makes the spec
 * report a defect that is not there. /fines pages through 5,000 rows and
 * /regulators/fca through 10,000, in sequential 500-row fetches, before the
 * heading appears — around 3s warm and over 45s when the API is cold and six
 * workers are hitting it at once.
 *
 * A real failure (a duplicate footer, a raw enum) is deterministic and fails
 * every attempt; only the load-related flake passes on retry. Without this the
 * gate cries wolf, and a gate nobody trusts is worse than no gate.
 */
test.describe.configure({ retries: 2 });

const LIVE_BASE_URL = process.env.PLAYWRIGHT_BASE_URL;
const IS_LIVE = Boolean(LIVE_BASE_URL && !/127\.0\.0\.1|localhost/.test(LIVE_BASE_URL));

for (const route of ROUTES) {
  test(`${route} renders cleanly`, async ({ page }) => {
    test.skip(
      !IS_LIVE,
      "Needs a live API. Run with PLAYWRIGHT_BASE_URL=https://regactions.com",
    );
    await page.goto(route, { waitUntil: "domcontentloaded" });

    // Wait for the heading rather than a fixed pause. /fines, /fines/actions
    // and /regulators/fca page through 5,000-10,000 rows in sequential
    // 500-row fetches before their <h1> appears — around 4s unloaded, longer
    // when several workers hit the API at once. A fixed 1.2s wait made this
    // spec fail on exactly those three routes under parallel load, which is
    // how a gate gets a reputation for crying wolf and stops being read.
    await page.waitForSelector("h1", { timeout: 45000 });

    // Several sections reveal on scroll and only lay out once seen.
    await page.evaluate(async () => {
      for (let y = 0; y < 12000; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);

    const result = await page.evaluate(
      ({ enumSrc, entitySrc }) => {
        const enumRe = new RegExp(enumSrc);
        const entityRe = new RegExp(entitySrc, "i");
        const enums: string[] = [];
        const entities: string[] = [];

        document.querySelectorAll("*").forEach((el) => {
          // Leaf elements only: a parent's textContent is its children's.
          if (el.children.length > 0) return;
          const text = (el.textContent ?? "").trim();
          if (!text) return;
          const describe = () => {
            const cls =
              typeof el.className === "string" && el.className
                ? "." + el.className.split(" ")[0]
                : "";
            return `${el.tagName.toLowerCase()}${cls}: "${text.slice(0, 60)}"`;
          };
          if (enumRe.test(text)) enums.push(describe());
          if (entityRe.test(text)) entities.push(describe());
        });

        return {
          h1: document.querySelectorAll("h1").length,
          footers: [...document.querySelectorAll("footer")].map(
            (f) => (typeof f.className === "string" ? f.className : "") || "(no class)",
          ),
          enums: [...new Set(enums)].slice(0, 5),
          entities: [...new Set(entities)].slice(0, 5),
        };
      },
      { enumSrc: ENUM_SHAPED.source, entitySrc: HTML_ENTITY.source },
    );

    expect(result.h1, `${route} should have exactly one <h1>`).toBe(1);

    expect(
      result.footers.length,
      `${route} should have exactly one <footer>, found: ${result.footers.join(", ")}`,
    ).toBe(1);

    expect(
      result.enums,
      `${route} renders raw database enums:\n  ${result.enums.join("\n  ")}\nRoute them through formatBreachCategory().`,
    ).toEqual([]);

    expect(
      result.entities,
      `${route} renders literal HTML entities:\n  ${result.entities.join("\n  ")}\nClean scraped text with cleanDisplayText().`,
    ).toEqual([]);
  });
}
