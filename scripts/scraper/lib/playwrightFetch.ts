/**
 * Minimal Playwright-backed HTML fetcher for sources whose WAF rejects plain
 * datacentre HTTP requests but serves normally to a real browser (e.g. Isle of
 * Man FSA, which returns "Request Rejected" to axios/curl but 200 to Chromium).
 *
 * Kept deliberately small and dependency-lazy: `playwright` is imported at call
 * time so scrapers that never touch a browser incur no launch cost.
 */

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface PlaywrightHtmlClient {
  get(
    url: string,
    options?: {
      readySelector?: string;
      timeoutMs?: number;
    },
  ): Promise<string>;
  close(): Promise<void>;
}

export async function createPlaywrightHtmlClient(): Promise<PlaywrightHtmlClient> {
  const { chromium } = await import("playwright");
  const headless = process.env.SCRAPER_BROWSER_HEADLESS !== "false";
  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    locale: "en-GB",
  });
  const page = await context.newPage();

  return {
    async get(url, options = {}) {
      const timeoutMs = options.timeoutMs ?? 60_000;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

      if (options.readySelector) {
        await page.waitForSelector(options.readySelector, { timeout: timeoutMs });
      }

      return page.content();
    },
    async close() {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}
