import { expect, test, type Route } from "@playwright/test";
import {
  DEFAULT_BOARD_PACK_SETTINGS,
  DEFAULT_BOARD_PROFILE,
} from "../src/data/boardIntelligence.js";
import { buildBoardPack } from "../src/utils/boardIntelligence.js";

const BOARD_PACK_RESULTS = {
  results: [
    {
      id: "1",
      regulator: "FCA",
      regulator_full_name: "Financial Conduct Authority",
      country_code: "GB",
      country_name: "United Kingdom",
      firm_individual: "NorthBridge Wealth Ltd",
      firm_category: "Payments",
      amount_original: 32000000,
      currency: "GBP",
      amount_gbp: 32000000,
      amount_eur: 37000000,
      date_issued: "2025-06-10",
      year_issued: 2025,
      month_issued: 6,
      breach_type: "AML controls",
      breach_categories: ["AML", "Governance"],
      summary:
        "The firm failed to maintain effective transaction monitoring and senior managers oversight.",
      notice_url: "https://example.com/notice",
      source_url: "https://example.com/source",
      detail_url: "https://example.com/detail",
      official_publication_url: "https://example.com/pub",
      source_link_status: "verified_detail",
      source_link_label: "View notice",
      created_at: "2025-06-11T00:00:00.000Z",
    },
    {
      id: "2",
      regulator: "SEBI",
      regulator_full_name: "Securities and Exchange Board of India",
      country_code: "IN",
      country_name: "India",
      firm_individual: "Lion City Remittance Pte Ltd",
      firm_category: "Payments",
      amount_original: 18500000,
      currency: "INR",
      amount_gbp: 18500000,
      amount_eur: 21400000,
      date_issued: "2025-02-10",
      year_issued: 2025,
      month_issued: 2,
      breach_type: "Financial crime controls",
      breach_categories: ["AML", "Sanctions"],
      summary:
        "Counter terrorist financing escalation and sanctions screening controls were not operating effectively.",
      notice_url: "https://example.com/notice-2",
      source_url: "https://example.com/source-2",
      detail_url: "https://example.com/detail-2",
      official_publication_url: "https://example.com/pub-2",
      source_link_status: "verified_detail",
      source_link_label: "View notice",
      created_at: "2025-02-11T00:00:00.000Z",
    },
    {
      id: "3",
      regulator: "BaFin",
      regulator_full_name: "Federal Financial Supervisory Authority",
      country_code: "DE",
      country_name: "Germany",
      firm_individual: "NordWest Broker GmbH",
      firm_category: "Broker dealer",
      amount_original: 12500000,
      currency: "EUR",
      amount_gbp: 10700000,
      amount_eur: 12500000,
      date_issued: "2024-09-02",
      year_issued: 2024,
      month_issued: 9,
      breach_type: "Market abuse",
      breach_categories: ["Market abuse", "Reporting"],
      summary:
        "Market manipulation surveillance and books and records controls were not calibrated effectively.",
      notice_url: "https://example.com/notice-3",
      source_url: "https://example.com/source-3",
      detail_url: "https://example.com/detail-3",
      official_publication_url: "https://example.com/pub-3",
      source_link_status: "verified_detail",
      source_link_label: "View notice",
      created_at: "2024-09-03T00:00:00.000Z",
    },
  ],
  pagination: {
    total: 3,
    limit: 5000,
    offset: 0,
    hasMore: false,
    pages: 1,
    currentPage: 1,
  },
  filters: {
    regulator: null,
    country: null,
    year: null,
    minAmount: null,
    maxAmount: null,
    breachCategory: null,
    currency: "GBP",
    firmName: null,
  },
};

async function fulfillBoardPackSearch(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(BOARD_PACK_RESULTS),
  });
}

test.describe("Quick Board Pack", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/unified/search**", fulfillBoardPackSearch);
    await page.goto("/board-pack");
  });

  test("renders a no-account builder with a live committee preview", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: /Create a committee-ready enforcement brief/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build your pack" })).toBeVisible();
    await expect(page.getByText(/No account is required/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Executive takeaways" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Exposure drivers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "APAC" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download PDF$/ })).toBeVisible();
  });

  test("updates the profile, region and regulator scope immediately", async ({ page }) => {
    await page.getByLabel("Organisation name").fill("NorthStar Payments");
    await page.getByRole("button", { name: "APAC" }).click();
    await page.getByRole("button", { name: "FCA", exact: true }).click();

    await expect(page.getByRole("heading", { name: "NorthStar Payments" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "APAC" })).toHaveClass(/is-selected/);
  });

  test("downloads the PDF directly without posting a lead", async ({ page }) => {
    let leadRequests = 0;
    await page.route("**/api/board-pack/leads", async (route) => {
      leadRequests += 1;
      await route.fulfill({ status: 500, body: "not expected" });
    });
    await page.getByLabel("Organisation name").fill("NorthStar Payments");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Download PDF$/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("northstar-payments-regactions-board-pack.pdf");
    if (process.env.BOARD_PACK_PDF_QA_PATH) {
      await download.saveAs(process.env.BOARD_PACK_PDF_QA_PATH);
    }
    expect(leadRequests).toBe(0);
    await expect(page.getByRole("status")).toContainText(/No account or contact details were required/i);
  });

  test("keeps the advisory request separate and privacy-aware", async ({ page }) => {
    await page.route("**/api/board-pack/leads", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ persisted: true, notificationStatus: "queued" }),
      });
    });
    await page.getByLabel("Organisation name").fill("NorthStar Payments");
    await page.getByRole("button", { name: /Request tailored support/i }).click();
    await expect(page.getByRole("heading", { name: /Request tailored board advisory/i })).toBeVisible();
    await expect(page.getByText(/PDF remains available without this form/i)).toBeVisible();

    await page.getByLabel("Your name").fill("Alex Morgan");
    await page.getByLabel("Work email").fill("alex@example.com");
    await page.getByLabel("Organisation", { exact: true }).fill("NorthStar Payments");
    await page.getByLabel(/I have read the privacy notice/i).check();
    await page.getByRole("button", { name: /Send advisory request/i }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("status")).toContainText(/recorded.*queued/i);
  });
});

test.describe("Shared Board Pack", () => {
  test("is immutable, read-only and excluded from indexing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const snapshot = {
      schemaVersion: 1,
      payload: {
        schemaVersion: 1,
        label: "NorthStar assurance snapshot",
        currency: "GBP",
        firmProfile: {
          ...DEFAULT_BOARD_PROFILE,
          firmName: "NorthStar Payments",
          archetypeId: "payments-fintech",
          priorityRegulators: ["FCA"],
          focusRegions: ["UK"],
          priorityThemeIds: ["aml-controls"],
        },
        presentationSettings: DEFAULT_BOARD_PACK_SETTINGS,
        analystNote: "Prepared for the July risk committee. <img src=x onerror=alert(1)>",
        evidenceLocators: [],
        assuranceMode: true,
        controlStatuses: {},
      },
      result: buildBoardPack([], {
        ...DEFAULT_BOARD_PROFILE,
        firmName: "NorthStar Payments",
        archetypeId: "payments-fintech",
        priorityRegulators: ["FCA"],
        focusRegions: ["UK"],
        priorityThemeIds: ["aml-controls"],
      }, []),
      generatedAt: "2026-07-24T12:00:00.000Z",
      applicationCommit: "test-commit",
      sourceRevision: 3,
    };
    await page.route("**/api/board-pack/shares/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "X-Robots-Tag": "noindex, nofollow, noarchive" },
        body: JSON.stringify({
          snapshot,
          snapshot_hash: "a".repeat(64),
        }),
      });
    });

    await page.goto(`/board-pack/shared/${"S".repeat(43)}`);

    await expect(page.getByText("Read-only shared snapshot")).toBeVisible();
    await expect(page.getByRole("heading", { name: "NorthStar assurance snapshot" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "NorthStar Payments" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Control status for/i })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow, noarchive",
    );
    await expect(page.getByText(/immutable snapshot cannot edit the owner/i)).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390);
  });
});
