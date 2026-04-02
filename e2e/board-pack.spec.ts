import { expect, test, type Route } from "@playwright/test";

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

test.describe("Board Pack", () => {
  test("renders the board pack route and generated sections", async ({
    page,
  }) => {
    await page.route("**/api/unified/search**", fulfillBoardPackSearch);
    await page.goto("/board-pack");

    await expect(
      page.getByRole("heading", { level: 1, name: "Board Pack" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("heading", {
          level: 2,
          name: "NorthStar Compliance Profile",
        })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Executive summary" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Exposure overview" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Board challenge agenda" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Appendix" })).toBeVisible();

    const slideHeadings = await page.locator("section h2").allTextContents();
    expect(slideHeadings).toEqual(
      expect.arrayContaining([
        "Executive summary",
        "Why now",
        "Exposure overview",
        "Key exposure themes",
        "Peer cases worth taking to the board",
        "Implications for the firm",
        "Board challenge agenda",
        "Immediate next steps",
        "Appendix",
      ]),
    );
  });

  test("regenerates the pack for a renamed firm profile", async ({ page }) => {
    await page.route("**/api/unified/search**", fulfillBoardPackSearch);
    await page.goto("/board-pack");

    await page.getByRole("button", { name: "Refine profile" }).click();
    await page.getByLabel("Firm or profile name").fill("NorthStar Payments");
    await page.getByRole("button", { name: "Generate board pack" }).click();

    await expect(
      page
        .getByRole("heading", {
          level: 2,
          name: "NorthStar Payments",
        })
        .first(),
    ).toBeVisible();
  });

  test("supports print and working-copy mode", async ({ page }) => {
    await page.route("**/api/unified/search**", fulfillBoardPackSearch);
    await page.addInitScript(() => {
      (window as unknown as { __printCount?: number }).__printCount = 0;
      window.print = () => {
        (window as unknown as { __printCount: number }).__printCount += 1;
      };
    });
    await page.goto("/board-pack");

    await page.getByRole("button", { name: "Refine profile" }).click();
    await page.getByLabel("Audience mode").selectOption("working");
    await page.getByLabel("MEMA advisory note").fill(
      "Escalate control evidence before the next committee cycle.",
    );
    await page.getByRole("button", { name: "Generate board pack" }).click();

    await page.getByRole("button", { name: "Print / Save PDF" }).click();
    await expect(
      page.getByRole("heading", { name: "MEMA advisory note" }),
    ).toBeVisible();
    await expect(
      page.getByLabel(/Control status for/i).first(),
    ).toBeVisible();

    const printCount = await page.evaluate(
      () => (window as unknown as { __printCount: number }).__printCount,
    );
    expect(printCount).toBe(1);
  });

  test("loads a saved board-pack snapshot from local storage", async ({
    page,
  }) => {
    await page.route("**/api/unified/search**", fulfillBoardPackSearch);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "board-pack-saved-profiles-v1",
        JSON.stringify([
          {
            id: "saved-1",
            label: "NorthStar Board Pack",
            updatedAt: "2026-04-01T10:00:00.000Z",
            profile: {
              firmName: "NorthStar Board Pack",
              archetypeId: "retail-bank",
              boardFocus: "assurance",
              priorityRegulators: ["FCA", "ECB"],
              focusRegions: ["UK", "Europe"],
              priorityThemeIds: [
                "aml-controls",
                "governance-accountability",
                "systems-and-controls",
              ],
            },
            settings: {
              viewMode: "board",
              brandingMode: "client-ready",
              clientLabel: "NorthStar plc",
              confidentialityLabel: "Board Use Only",
              analystNote: "Use this pack for the April committee pack.",
              templateId: "committee-core",
            },
          },
        ]),
      );
    });

    await page.goto("/board-pack");
    await page.getByRole("button", { name: /^Load$/ }).click();

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "NorthStar Board Pack",
      }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Prepared for NorthStar plc/i).first()).toBeVisible();
  });
});
