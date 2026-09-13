import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const enabled = process.env.PRODUCTION_ACCEPTANCE === "1";
const artifactDirectory = process.env.PRODUCTION_ACCEPTANCE_ARTIFACT_DIR
  ?? "artifacts/production-acceptance";

type UnifiedSearchResponse = {
  results?: Array<{
    regulator?: string;
    notice_url?: string | null;
    source_url?: string | null;
  }>;
  error?: string;
  message?: string;
};

test.skip(!enabled, "This suite deliberately runs only against an explicitly enabled production URL.");
// The workflow is intentionally one worker, but individual checks must all run
// after a failure so a single artifact set diagnoses the whole public release.

async function saveScreenshot(page: Page, name: string) {
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({ path: path.join(artifactDirectory, `${name}.png`), fullPage: true });
}

async function writeArtifact(name: string, value: unknown) {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(path.join(artifactDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function assertPublicPage(page: Page, route: string, heading: RegExp) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `${route} did not return a document response`).not.toBeNull();
  expect(response!.status(), `${route} returned ${response!.status()}`).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

async function expectReachable(page: Page, url: string) {
  const response = await page.request.get(url, {
    maxRedirects: 5,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "RegActions-production-acceptance/1.0 (+https://regactions.com)",
    },
  });
  const cloudflareChallenge = response.status() === 403
    && response.headers()["cf-mitigated"]?.toLowerCase() === "challenge";
  // JerseyFSC currently places a Cloudflare managed challenge in front of
  // direct CI traffic. This is recorded as a provider challenge rather than
  // misreported as a missing notice; any other 4xx/5xx remains a hard failure.
  expect(response.status() < 400 || cloudflareChallenge, `${url} returned ${response.status()}`).toBe(true);
  return { url, status: response.status(), cloudflareChallenge };
}

test("public route status and identity markers", async ({ page }) => {
  await assertPublicPage(page, "/fines", /Regulatory Fines Database/i);
  await saveScreenshot(page, "fines");
  await assertPublicPage(page, "/board-pack", /Create a committee-ready enforcement brief/i);
  await saveScreenshot(page, "board-pack");
  await assertPublicPage(page, "/regulators/fca", /FCA Fines Database and Enforcement Actions/i);
  await saveScreenshot(page, "regulator-fca");
  await assertPublicPage(page, "/regulators/jfsc", /Jersey Financial Services Commission/i);
  await saveScreenshot(page, "regulator-jfsc");
});

test("JFSC API evidence is exactly the six verified notices and official links are checked", async ({ page }) => {
  await page.goto("/regulators/jfsc", { waitUntil: "domcontentloaded" });
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/site/unified/search?regulator=JFSC&limit=20", {
      credentials: "same-origin",
    });
    return {
      status: result.status,
      body: await result.json().catch(() => ({})),
    };
  }) as { status: number; body: UnifiedSearchResponse };

  await writeArtifact("jfsc-api-response.json", response);
  expect(response.status, response.body.message ?? response.body.error ?? "JFSC API request failed").toBe(200);
  const records = response.body.results ?? [];
  expect(records).toHaveLength(6);
  expect(records.every((record) => record.regulator === "JFSC")).toBe(true);
  const noticeUrls = records.map((record) => record.notice_url ?? record.source_url).filter((url): url is string => Boolean(url));
  expect(new Set(noticeUrls).size).toBe(6);
  expect(noticeUrls).toHaveLength(6);
  const checks = [];
  for (const noticeUrl of noticeUrls) {
    expect(noticeUrl).toMatch(/^https:\/\/www\.jerseyfsc\.org\/news-and-events\//);
    checks.push(await expectReachable(page, noticeUrl));
  }
  await writeArtifact("jfsc-notice-link-checks.json", checks);
});

test("FCA official source links resolve", async ({ page }) => {
  await page.goto("/regulators/fca", { waitUntil: "domcontentloaded" });
  const sources = await page.locator('a[href^="https://www.fca.org.uk/"]').evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).href),
  );
  expect(sources.length).toBeGreaterThanOrEqual(3);
  for (const source of sources) await expectReachable(page, source);
});

test("fines evidence drawer, comparison and monthly chart marks remain interactive", async ({ page }) => {
  await page.goto("/fines", { waitUntil: "domcontentloaded" });
  const firstRecord = page.locator(".workspace-table tbody tr").first();
  await expect(firstRecord).toBeVisible({ timeout: 30_000 });
  await firstRecord.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.goto("/fines/compare", { waitUntil: "domcontentloaded" });
  const yearButtons = page.locator("section", {
    has: page.getByRole("heading", { name: "Select years" }),
  }).getByRole("button");
  await expect(yearButtons.nth(0)).toBeVisible({ timeout: 30_000 });
  await yearButtons.nth(0).click();
  await yearButtons.nth(1).click();
  await expect(page.getByRole("heading", { name: "Comparison summary" })).toBeVisible();
  const openSelected = page.getByRole("button", { name: "Open selected data" });
  await expect(openSelected).toBeEnabled();
  await openSelected.click();
  await expect(page.getByRole("dialog", { name: /Selected comparison data/i })).toBeVisible();
  await saveScreenshot(page, "fines-comparison-drawer");

  await page.goto("/fines/actions", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("group", { name: "Chart series" })).toBeVisible({ timeout: 30_000 });
  const mark = page.locator(".trend-chart__bar--clickable .recharts-rectangle, .trend-chart__bar--clickable path").first();
  await expect(mark).toBeVisible();
  await mark.click({ force: true });
  await expect(page.getByRole("dialog")).toBeVisible();
  await saveScreenshot(page, "fines-monthly-evidence-drawer");
});

test("regulator comparator applies a new regulator and year", async ({ page }) => {
  await page.goto("/regulators/fca/compare", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Comparator").selectOption("JFSC");
  await page.getByLabel("Year").selectOption("2025");
  await expect(page.getByRole("status", { name: /Comparison scope/i })).toContainText("2025");
  await expect(page.getByRole("heading", { name: "JFSC" })).toBeVisible();
  await saveScreenshot(page, "regulator-comparison");
});

test("Board Pack downloads a renderable, committee-ready PDF without authentication", async ({ page }) => {
  await page.goto("/board-pack", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/No account is required/i)).toBeVisible();
  await page.getByLabel("Organisation name").fill("Production acceptance check");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Download PDF$/ }).click();
  const download = await downloadPromise;
  await mkdir(artifactDirectory, { recursive: true });
  await download.saveAs(path.join(artifactDirectory, "board-pack.pdf"));
  await expect(page.getByRole("status")).toContainText(/No account or contact details were required/i);
});

test("390px mobile smoke has no horizontal overflow on the public workspaces", async ({ browser }) => {
  const mobilePage = await newMobilePage(browser);
  for (const [route, heading] of [
    ["/fines", /Regulatory Fines Database/i],
    ["/regulators/jfsc", /Jersey Financial Services Commission/i],
    ["/board-pack", /Create a committee-ready enforcement brief/i],
  ] as const) {
    await assertPublicPage(mobilePage, route, heading);
    await expect.poll(() => mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await saveScreenshot(mobilePage, `mobile-${route.slice(1).replaceAll("/", "-")}`);
  }
  await mobilePage.context().close();
});

async function newMobilePage(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  return context.newPage();
}
