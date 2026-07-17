import { test, expect } from "@playwright/test";

// Wave E3 verification: country-risk changes page, filters, per-country card, RSS.
// Runs against a static preview of the built dist (PLAYWRIGHT_BASE_URL).

test.describe("Country risk changes surface (Wave E3)", () => {
  test("changes page renders real FATF and tax-list events grouped by date", async ({ page }) => {
    await page.goto("/countries/changes");
    await expect(page.locator("h1.cx-chg__title")).toHaveText(/What changed in country risk/i);

    // Real derived events, not placeholders.
    await expect(page.getByText("Iraq added to the FATF grey list")).toBeVisible();
    await expect(page.getByText(/on the EU tax blacklist/i).first()).toBeVisible();

    // Grouped, reverse-chronological date headings exist.
    const dateGroups = page.locator(".cx-chg__group");
    expect(await dateGroups.count()).toBeGreaterThan(1);

    await page.screenshot({ path: "/tmp/e3_changes_page.png", fullPage: true });
  });

  test("kind filters narrow the feed", async ({ page }) => {
    await page.goto("/countries/changes");
    const rows = page.locator(".cx-chg-row");
    // Wait for hydration to render the timeline before counting.
    await expect(rows.first()).toBeVisible();
    const totalRows = await rows.count();
    expect(totalRows).toBeGreaterThan(0);

    // Filter to FATF listing only.
    await page.getByRole("button", { name: /FATF listing/i }).click();
    await expect(page.locator(".cx-chg-tag--fatf").first()).toBeVisible();
    // No sanctions rows should remain under the FATF filter.
    await expect(page.locator(".cx-chg-tag--sanctions")).toHaveCount(0);
    const fatfRows = await page.locator(".cx-chg-row").count();
    expect(fatfRows).toBeLessThan(totalRows);
    expect(fatfRows).toBeGreaterThan(0);

    await page.screenshot({ path: "/tmp/e3_changes_filtered.png", fullPage: true });

    // Reset to all.
    await page.getByRole("button", { name: /^All/ }).click();
    expect(await page.locator(".cx-chg-row").count()).toBe(totalRows);
  });

  test("subscribe form is present with double opt-in note", async ({ page }) => {
    await page.goto("/countries/changes");
    await expect(page.locator(".cx-chg-sub input[type=email]")).toBeVisible();
    await expect(page.getByText(/Double opt-in/i)).toBeVisible();
  });

  test("a country WITH events shows the Recent developments card", async ({ page }) => {
    // Iraq was added to the FATF grey list this cycle — it has events.
    await page.goto("/countries/iraq");
    const card = page.locator(".cx-chg-card");
    await expect(card).toBeVisible();
    await expect(card.getByText(/Recent developments/i)).toBeVisible();
    await expect(card.getByRole("link", { name: /All country-risk changes/i })).toBeVisible();
    await page.screenshot({ path: "/tmp/e3_country_with_card.png", fullPage: true });
  });

  test("a country WITHOUT events omits the card entirely", async ({ page }) => {
    // Canada has no derived per-country change event.
    await page.goto("/countries/canada");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".cx-chg-card")).toHaveCount(0);
    await page.screenshot({ path: "/tmp/e3_country_no_card.png", fullPage: true });
  });

  test("changes.xml validates as an RSS feed", async ({ request }) => {
    const res = await request.get("/changes.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("<?xml");
    expect(body).toContain("<rss");
    expect(body).toContain("<channel>");
    expect(body).toContain("RegActions Country Risk Changes");
    // At least the FATF, sanctions and EU tax categories appear.
    expect(body).toContain("<category>FATF listing</category>");
    expect(body).toContain("<category>Sanctions</category>");
    expect(body).toContain("<category>EU tax list</category>");
    const itemCount = (body.match(/<item>/g) || []).length;
    expect(itemCount).toBeGreaterThan(5);
  });

  test("countries page links to the changes page", async ({ page }) => {
    await page.goto("/countries");
    await expect(page.getByRole("link", { name: /What changed/i }).first()).toBeVisible();
  });
});
