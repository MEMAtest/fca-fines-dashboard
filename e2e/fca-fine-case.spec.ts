import { expect, test } from "@playwright/test";

const CASE_ID = "4cbe8dbf-7d2e-48f5-a472-9a04a83bf12a";
const CASE_PATH = `/fca-fines/2025/alpha-bank-plc/${CASE_ID}`;

const caseRecord = {
  caseId: CASE_ID,
  canonicalPath: CASE_PATH,
  regulator: "FCA",
  firm: "Alpha Bank plc",
  firmSlug: "alpha-bank-plc",
  amount: 12_000_000,
  dateIssued: "2025-06-10",
  year: 2025,
  month: 6,
  summary: "The firm failed to maintain effective anti-money laundering controls.",
  breach: "AML controls",
  categories: ["AML", "Governance"],
  sourceUrl: "https://www.fca.org.uk/news/news-stories/alpha-bank",
  noticeUrl: "https://www.fca.org.uk/news/news-stories/alpha-bank",
  listingSourceUrl: "https://www.fca.org.uk/news/search-results",
  resolvedSourceUrl: "https://www.fca.org.uk/news/news-stories/alpha-bank",
  sourceStatus: "verified_detail",
  sourceCheckedAt: "2026-07-20T09:00:00.000Z",
  sourceHttpStatus: 200,
  sourceOfficialDomainMatch: true,
  sourceContentHash: "sha256-example",
  sourceLastVerifiedAt: "2026-07-20T09:00:00.000Z",
  sourceNextCheckAt: "2026-07-27T09:00:00.000Z",
  sourceConsecutiveFailures: 0,
  sourceReviewStatus: "clear",
  sourceReviewReason: null,
  amountQuality: "verified",
  requiresAmountReview: false,
  amountVerificationUrl: null,
  amountOverrideReason: null,
  duplicateCount: 1,
  createdAt: "2025-06-11T00:00:00.000Z",
  quality: {
    indexable: true,
    reasons: [],
    warnings: [],
    summaryWordCount: 10,
    evidenceStrength: "verified",
  },
  relatedCases: [],
};

test.describe("individual FCA fine case", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/fca-fines/${CASE_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: caseRecord }),
      });
    });
  });

  test("renders the evidence-first case and keeps the official source behind review", async ({ page }) => {
    await page.goto(CASE_PATH);

    await expect(page.getByRole("heading", { level: 1, name: "Alpha Bank plc" })).toBeVisible();
    await expect(page.getByText("£12,000,000")).toBeVisible();
    await expect(page.getByText(caseRecord.summary)).toBeVisible();
    await expect(page.getByText("Verified FCA case notice")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page.getByRole("link", { name: "AML controls", exact: true })).toHaveAttribute("href", "/breaches/aml-controls");

    await page.getByRole("button", { name: /Review source evidence/i }).click();
    const dialog = page.getByRole("dialog", { name: "Alpha Bank plc" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Open official source/i })).toHaveAttribute(
      "href",
      caseRecord.resolvedSourceUrl,
    );
  });

  test("remains readable without horizontal overflow on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(CASE_PATH);

    await expect(page.getByRole("heading", { level: 1, name: "Alpha Bank plc" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});
