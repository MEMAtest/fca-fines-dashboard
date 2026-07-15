import { expect, test, type Page, type Route } from "@playwright/test";

const FCA_RESULTS = [
  {
    id: "fca-2025",
    regulator: "FCA",
    regulator_full_name: "Financial Conduct Authority",
    country_code: "GB",
    country_name: "United Kingdom",
    firm_individual: "Alpha Bank plc",
    firm_category: "Banking",
    amount_original: 12000000,
    currency: "GBP",
    amount_gbp: 12000000,
    amount_eur: 14000000,
    date_issued: "2025-06-10",
    year_issued: 2025,
    month_issued: 6,
    breach_type: "AML controls",
    breach_categories: ["AML", "Governance"],
    summary: "The firm failed to maintain effective anti-money laundering controls.",
    notice_url: "https://www.fca.org.uk/news/news-stories/alpha-bank",
    source_url: "https://www.fca.org.uk/news/news-stories/alpha-bank",
    detail_url: "https://www.fca.org.uk/news/news-stories/alpha-bank",
    official_publication_url: "https://www.fca.org.uk/news/news-stories/alpha-bank",
    source_link_status: "verified_detail",
    source_link_label: "View FCA notice",
    created_at: "2025-06-11T00:00:00.000Z",
  },
  {
    id: "fca-2024",
    regulator: "FCA",
    regulator_full_name: "Financial Conduct Authority",
    country_code: "GB",
    country_name: "United Kingdom",
    firm_individual: "Beta Markets Ltd",
    firm_category: "Investment firms",
    amount_original: 4000000,
    currency: "GBP",
    amount_gbp: 4000000,
    amount_eur: 4700000,
    date_issued: "2024-04-18",
    year_issued: 2024,
    month_issued: 4,
    breach_type: "Market abuse controls",
    breach_categories: ["Market abuse"],
    summary: "The firm failed to maintain effective market abuse surveillance.",
    notice_url: "https://www.fca.org.uk/news/news-stories/beta-markets",
    source_url: "https://www.fca.org.uk/news/news-stories/beta-markets",
    detail_url: "https://www.fca.org.uk/news/news-stories/beta-markets",
    official_publication_url: "https://www.fca.org.uk/news/news-stories/beta-markets",
    source_link_status: "verified_detail",
    source_link_label: "View FCA notice",
    created_at: "2024-04-19T00:00:00.000Z",
  },
];

const SEC_RESULTS = [{
  ...FCA_RESULTS[0],
  id: "sec-2025",
  regulator: "SEC",
  regulator_full_name: "Securities and Exchange Commission",
  country_code: "US",
  country_name: "United States",
  firm_individual: "Gamma Securities Inc",
  amount_original: 2500000,
  amount_gbp: 1900000,
  amount_eur: 2200000,
  notice_url: "https://www.sec.gov/newsroom/press-releases/gamma-securities",
  source_url: "https://www.sec.gov/newsroom/press-releases/gamma-securities",
  detail_url: "https://www.sec.gov/newsroom/press-releases/gamma-securities",
  official_publication_url: "https://www.sec.gov/newsroom/press-releases/gamma-securities",
  source_link_label: "View SEC release",
}];

const JFSC_RESULTS = [
  ["jfsc-2025", "Garfield Bennett Trust Company Limited", 86803.19, "2025-07-31", 2025, 7, "garfield-bennett-trust-company-limited"],
  ["jfsc-2024", "Belasko Jersey Limited", 19211.73, "2024-09-20", 2024, 9, "belasko-jersey-limited"],
  ["jfsc-2022-a", "Lloyds Bank Corporate Markets Plc, Jersey Branch", 498000, "2022-08-04", 2022, 8, "lloyds-bank-corporate-markets-plc-jersey-branch-lbcm-jersey-branch"],
  ["jfsc-2022-b", "IQ EQ (Jersey) Limited (formerly, First Names (Jersey) Limited)", 803661.17, "2022-06-17", 2022, 6, "iq-eq-jersey-limited-formerly-first-names-jersey-limited"],
  ["jfsc-2020", "Equity Trust (Jersey) Limited", 115575, "2020-05-14", 2020, 5, "equity-trust-jersey-limited-equity"],
  ["jfsc-2019", "Sanne Fiduciary Services Limited", 381010, "2019-07-17", 2019, 7, "jfsc-enforces-first-financial-penalty-on-local-firm"],
].map(([id, firm, amount, date, year, month, slug]) => ({
  id: String(id),
  regulator: "JFSC",
  regulator_full_name: "Jersey Financial Services Commission",
  country_code: "JE",
  country_name: "Jersey",
  firm_individual: String(firm),
  firm_category: "Trust and corporate services",
  amount_original: Number(amount),
  currency: "GBP",
  amount_gbp: Number(amount),
  amount_eur: Number(amount) * 1.17,
  date_issued: String(date),
  year_issued: Number(year),
  month_issued: Number(month),
  breach_type: "Civil financial penalty",
  breach_categories: ["Governance and controls"],
  summary: "A verified civil financial penalty published by the Jersey Financial Services Commission.",
  notice_url: `https://www.jerseyfsc.org/news-and-events/${slug}/`,
  source_url: `https://www.jerseyfsc.org/news-and-events/${slug}/`,
  detail_url: `https://www.jerseyfsc.org/news-and-events/${slug}/`,
  official_publication_url: `https://www.jerseyfsc.org/news-and-events/${slug}/`,
  source_link_status: "verified_detail",
  source_link_label: "View JFSC notice",
  created_at: `${date}T00:00:00.000Z`,
}));

function getRegulator(route: Route) {
  return new URL(route.request().url()).searchParams.get("regulator") ?? "All";
}

function overviewFor(regulator: string) {
  if (regulator === "All") {
    return {
      metrics: {
        count: 3,
        total: 17900000,
        average: 5966666.67,
        median: 4000000,
        largest: 12000000,
        largestFirm: "Alpha Bank plc",
        affectedFirms: 3,
        latestDate: "2025-06-10",
      },
      yearly: [
        { key: "2024", label: "2024", year: 2024, count: 1, amount: 4000000 },
        { key: "2025", label: "2025", year: 2025, count: 2, amount: 13900000 },
      ],
      monthly: [
        { key: "2024-04", label: "Apr 24", year: 2024, month: 4, count: 1, amount: 4000000 },
        { key: "2025-06", label: "Jun 25", year: 2025, month: 6, count: 2, amount: 13900000 },
      ],
      themes: [
        { label: "AML", count: 2, amount: 13900000, share: 77.65 },
        { label: "Market abuse", count: 1, amount: 4000000, share: 22.35 },
      ],
      regulators: [
        { label: "FCA", count: 2, amount: 16000000, share: 89.39 },
        { label: "SEC", count: 1, amount: 1900000, share: 10.61 },
      ],
      sectors: [
        { label: "Banking", count: 1, amount: 12000000, share: 67.04 },
        { label: "Investment firms", count: 2, amount: 5900000, share: 32.96 },
      ],
      firms: [],
    };
  }
  if (regulator === "JFSC") {
    return {
      metrics: {
        count: 6,
        total: 1904261.09,
        average: 317376.85,
        median: 248292.5,
        largest: 803661.17,
        largestFirm: "IQ EQ (Jersey) Limited (formerly, First Names (Jersey) Limited)",
        affectedFirms: 6,
        latestDate: "2025-07-31",
      },
      yearly: [
        { key: "2019", label: "2019", year: 2019, count: 1, amount: 381010 },
        { key: "2020", label: "2020", year: 2020, count: 1, amount: 115575 },
        { key: "2022", label: "2022", year: 2022, count: 2, amount: 1301661.17 },
        { key: "2024", label: "2024", year: 2024, count: 1, amount: 19211.73 },
        { key: "2025", label: "2025", year: 2025, count: 1, amount: 86803.19 },
      ],
      monthly: [],
      themes: [{ label: "Governance and controls", count: 6, amount: 1904261.09, share: 100 }],
      regulators: [{ label: "JFSC", count: 6, amount: 1904261.09, share: 100 }],
      sectors: [{ label: "Trust and corporate services", count: 6, amount: 1904261.09, share: 100 }],
      firms: [],
    };
  }
  const isFca = regulator === "FCA";
  return {
    metrics: {
      count: isFca ? 2 : 1,
      total: isFca ? 16000000 : 1900000,
      average: isFca ? 8000000 : 1900000,
      median: isFca ? 8000000 : 1900000,
      largest: isFca ? 12000000 : 1900000,
      largestFirm: isFca ? "Alpha Bank plc" : "Gamma Securities Inc",
      affectedFirms: isFca ? 2 : 1,
      latestDate: "2025-06-10",
    },
    yearly: isFca
      ? [
          { key: "2024", label: "2024", year: 2024, count: 1, amount: 4000000 },
          { key: "2025", label: "2025", year: 2025, count: 1, amount: 12000000 },
        ]
      : [{ key: "2025", label: "2025", year: 2025, count: 1, amount: 1900000 }],
    monthly: [],
    themes: isFca
      ? [
          { label: "AML", count: 1, amount: 12000000, share: 75 },
          { label: "Market abuse", count: 1, amount: 4000000, share: 25 },
        ]
      : [{ label: "AML", count: 1, amount: 1900000, share: 100 }],
    regulators: [{ label: regulator, count: isFca ? 2 : 1, amount: isFca ? 16000000 : 1900000, share: 100 }],
    sectors: isFca
      ? [
          { label: "Banking", count: 1, amount: 12000000, share: 75 },
          { label: "Investment firms", count: 1, amount: 4000000, share: 25 },
        ]
      : [{ label: "Investment firms", count: 1, amount: 1900000, share: 100 }],
    firms: [],
  };
}

async function installWorkspaceApi(page: Page) {
  await page.route("**/api/unified/search**", async (route) => {
    const url = new URL(route.request().url());
    const regulator = getRegulator(route);
    const breachCategory = url.searchParams.get("breachCategory");
    const selectedYear = Number(url.searchParams.get("year") ?? 0);
    const baseResults = regulator === "SEC"
      ? SEC_RESULTS
      : regulator === "FCA"
        ? FCA_RESULTS
        : regulator === "JFSC"
          ? JFSC_RESULTS
          : [...FCA_RESULTS, ...SEC_RESULTS];
    const themeResults = breachCategory
      ? baseResults.filter((record) => record.breach_categories.includes(breachCategory))
      : baseResults;
    const results = selectedYear
      ? themeResults.filter((record) => record.year_issued === selectedYear)
      : themeResults;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results,
        pagination: { total: results.length, limit: 500, offset: 0, hasMore: false, pages: 1, currentPage: 1 },
        filters: { regulator, currency: "GBP" },
      }),
    });
  });
  await page.route("**/api/unified/overview**", async (route) => {
    const regulator = getRegulator(route);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overviewFor(regulator)) });
  });
}

async function saveQaScreenshot(page: Page, name: string) {
  const directory = process.env.WORKSPACE_SCREENSHOT_DIR;
  if (!directory) return;
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}

test.describe("FCA regulator workspace", () => {
  test.beforeEach(async ({ page }) => {
    await installWorkspaceApi(page);
    await page.goto("/regulators/fca");
  });

  test("shows a regulator-restricted executive summary with annual movement", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Financial Conduct Authority (FCA)" })).toBeVisible();
    await expect(page.getByText("You are viewing data for")).toBeVisible();
    await expect(page.getByText("FCA · United Kingdom")).toBeVisible();
    await expect(page.getByText("Charts and tables are restricted to this regulator.")).toBeVisible();
    await expect(page.getByText("+200.0%")).toBeVisible();
    await expect(page.getByText("2025 vs 2024")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What matters now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "FCA fines over time (GBP)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Top breach themes" })).toBeVisible();
    await saveQaScreenshot(page, "fca-workspace-desktop");
  });

  test("opens the source-linked actions behind a breach-theme bar", async ({ page }) => {
    await page.getByRole("button", { name: "AML £12m", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "AML" })).toBeVisible();
    await expect(drawer.getByText("Alpha Bank plc")).toBeVisible();
    await expect(drawer.getByRole("link", { name: /View FCA notice/i })).toHaveAttribute("href", /fca\.org\.uk/);
    await expect(drawer).toContainText("1 matching action with source evidence where available.");
  });
});

test.describe("Fines Command Centre", () => {
  test.beforeEach(async ({ page }) => {
    await installWorkspaceApi(page);
  });

  test("opens the actions represented by an analytical concern", async ({ page }) => {
    await page.goto("/fines");
    await expect(page.getByRole("heading", { level: 1, name: "Fines Command Centre" })).toBeVisible();
    await expect(page.getByText("+247.5%")).toBeVisible();
    await expect(page.getByText("2025 vs 2024")).toBeVisible();
    await saveQaScreenshot(page, "fines-command-centre-desktop");
    await page.getByRole("button", { name: "AML £13.9m", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "AML" })).toBeVisible();
    await expect(drawer.getByText("Alpha Bank plc")).toBeVisible();
    await expect(drawer.getByText("Gamma Securities Inc")).toBeVisible();
    await expect(drawer.getByRole("link", { name: /View FCA notice/i }).first()).toHaveAttribute("href", /fca\.org\.uk/);
  });

  test("supports multi-year comparison and opens the selected evidence", async ({ page }) => {
    await page.goto("/fines/compare");
    await page.getByRole("button", { name: /2025\s*£13\.9m\s*2 actions/i }).click();
    await page.getByRole("button", { name: /2024\s*£4m\s*1 action/i }).click();

    await expect(page.getByRole("button", { name: "Remove year 2025" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove year 2024" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Year 2025: £13.9m, 2 actions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Year 2024: £4m, 1 action" })).toBeVisible();
    await expect(page).toHaveURL(/years=2025%2C2024/);
    await saveQaScreenshot(page, "fines-comparison-desktop");

    await page.getByRole("button", { name: "Open selected data" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "Selected comparison data" })).toBeVisible();
    await expect(drawer.getByText("Alpha Bank plc")).toBeVisible();
    await expect(drawer.getByText("Beta Markets Ltd")).toBeVisible();
    await expect(drawer.getByText("Gamma Securities Inc")).toBeVisible();
  });

  test("keeps the Command Centre usable at a 390px mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/fines");
    await expect(page.getByRole("heading", { level: 1, name: "Fines Command Centre" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open workspace navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "AML £13.9m", exact: true })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
    await saveQaScreenshot(page, "fines-command-centre-mobile");
  });
});

test.describe("Shared regulator workspace pattern", () => {
  test.beforeEach(async ({ page }) => {
    await installWorkspaceApi(page);
  });

  test("applies the approved scoped layout to SEC", async ({ page }) => {
    await page.goto("/regulators/sec");
    await expect(page.getByRole("heading", { level: 1, name: "U.S. Securities and Exchange Commission (SEC)" })).toBeVisible();
    await expect(page.getByText("SEC · United States")).toBeVisible();
    await expect(page.getByRole("heading", { name: "SEC fines over time (GBP)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "SEC press releases" })).toHaveAttribute("href", "https://www.sec.gov/newsroom/press-releases");
    await expect(page.getByText(/All data on this page reflects FCA enforcement activity/i)).toHaveCount(0);
  });

  test("applies the approved scoped layout to the verified JFSC archive", async ({ page }) => {
    await page.goto("/regulators/jfsc");
    await expect(page.getByRole("heading", { level: 1, name: "Jersey Financial Services Commission (JFSC)" })).toBeVisible();
    await expect(page.getByText("JFSC · Jersey")).toBeVisible();
    await expect(page.getByText("6", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("£1.9m", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "JFSC fines over time (GBP)" })).toBeVisible();
    await page.getByRole("button", { name: "Governance and controls £1.9m", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Garfield Bennett Trust Company Limited")).toBeVisible();
    await expect(drawer.getByRole("link", { name: /View JFSC notice/i }).first()).toHaveAttribute("href", /jerseyfsc\.org/);
  });
});
