import puppeteer, { type Browser, type Page } from "puppeteer";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

export interface BrowserHtmlClient {
  get(
    url: string,
    options?: {
      readySelector?: string;
      timeoutMs?: number;
    },
  ): Promise<string>;
  close(): Promise<void>;
}

export function isManagedChallengeHtml(html: string) {
  return /just a moment|enable javascript and cookies to continue|cf-chl|cf-mitigated/i.test(
    html,
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUsableHtml(
  page: Page,
  readySelector: string | undefined,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const html = await page.content();
    const challengeActive = isManagedChallengeHtml(html);
    const selectorReady = readySelector ? Boolean(await page.$(readySelector)) : true;

    if (!challengeActive && selectorReady) {
      return html;
    }

    await sleep(1_000);
  }

  throw new Error(
    `Browser challenge did not clear within ${timeoutMs}ms${
      readySelector ? ` or selector ${readySelector} did not appear` : ""
    }`,
  );
}

export async function createBrowserHtmlClient(): Promise<BrowserHtmlClient> {
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const page = await browser.newPage();
  await page.setUserAgent(DEFAULT_USER_AGENT);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-GB,en;q=0.9",
  });

  return {
    async get(url, options = {}) {
      const timeoutMs = options.timeoutMs ?? 60_000;
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      return waitForUsableHtml(page, options.readySelector, timeoutMs);
    },
    async close() {
      await page.close().catch(() => undefined);
      await browser.close();
    },
  };
}
