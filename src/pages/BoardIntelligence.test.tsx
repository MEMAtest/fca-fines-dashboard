import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardIntelligence } from "./BoardIntelligence.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));
vi.mock("../hooks/useUnifiedData.js", () => ({
  useUnifiedData: vi.fn(() => ({
    fines: [
      {
        id: "1",
        fine_reference: "FCA-1",
        firm_individual: "NorthBridge Wealth Ltd",
        firm_category: "Payments",
        regulator: "FCA",
        regulator_full_name: "Financial Conduct Authority",
        final_notice_url: "https://example.com/notice",
        summary: "The firm failed to maintain effective transaction monitoring and senior manager oversight.",
        breach_type: "AML controls",
        breach_categories: ["AML", "Governance"],
        amount: 32_000_000,
        date_issued: "2025-06-10",
        year_issued: 2025,
        month_issued: 6,
        country_code: "GB",
        country_name: "United Kingdom",
      },
    ],
    stats: null,
    loading: false,
    error: null,
  })),
}));

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

function renderPage(initialEntry = "/board-pack") {
  return render(<MemoryRouter initialEntries={[initialEntry]}><BoardIntelligence /></MemoryRouter>);
}

describe("BoardIntelligence quick pack", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: createLocalStorageMock(), configurable: true });
  });

  it("renders a no-account builder without the old NorthStar profile toolbar", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Create a committee-ready enforcement brief/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Build your pack/i })).toBeInTheDocument();
    expect(screen.queryByText(/Active profile/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NorthStar Compliance Profile/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No account is required/i)).toBeInTheDocument();
  });

  it("updates the live preview as the organisation changes", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Organisation name/i), { target: { value: "Acme Payments Ltd" } });
    expect(screen.getAllByRole("heading", { name: "Acme Payments Ltd" }).length).toBeGreaterThan(0);
  });

  it("keeps contact details optional while exposing direct PDF download", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Organisation name/i), { target: { value: "Acme Payments Ltd" } });
    expect(screen.getByRole("button", { name: /^Download PDF$/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/No account is required/i)).toBeInTheDocument();
  });

  it("supports explicit region selection", () => {
    renderPage();
    const apac = screen.getByRole("button", { name: "APAC" });
    fireEvent.click(apac);
    expect(apac).toHaveClass("is-selected");
  });

  it("keeps readiness unassessed until every optional control response is supplied", () => {
    renderPage();
    expect(screen.getAllByText("Unassessed").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Add control evidence" }));
    const controlSelectors = screen.getAllByRole("combobox", { name: /Control status for/i });
    expect(controlSelectors.length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`0 of ${controlSelectors.length} controls assessed`, "i")).length).toBeGreaterThan(0);
    controlSelectors.forEach((select) => fireEvent.change(select, { target: { value: "evidenced" } }));
    expect(screen.getAllByText(new RegExp(`${controlSelectors.length} of ${controlSelectors.length} controls assessed`, "i")).length).toBeGreaterThan(0);
  });

  it("shows evidence selected elsewhere as a distinct Board Pack section", () => {
    window.localStorage.setItem("regactions-evidence-basket-v1", JSON.stringify([{
      id: "case-selected-1",
      entity: "Selected Payments Ltd",
      regulator: "FCA",
      dateIssued: "2025-03-04",
      amount: 1_000_000,
      currency: "GBP",
      breachType: "AML controls",
      categories: ["AML"],
      summary: "Selected public case",
      sourceStatus: "official_unverified",
      sourceLabel: "Official source requires verification",
      directSourceUrl: "https://www.fca.org.uk/news/example",
      listingSourceUrl: null,
      surface: "enforcement_search",
    }]));
    renderPage();
    expect(screen.getByText("1", { selector: ".board-quick__basket-summary strong" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cases selected for this pack" })).toBeInTheDocument();
    expect(screen.getAllByText(/FCA: Selected Payments Ltd/i).length).toBeGreaterThan(0);
  });

  it("opens a privacy-aware optional advisory form", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Organisation name/i), { target: { value: "Acme Payments Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: /Request tailored support/i }));
    expect(screen.getByRole("heading", { name: /Request tailored board advisory/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Your name/i)).toBeRequired();
    expect(screen.getByLabelText(/Work email/i)).toBeRequired();
    expect(screen.getByLabelText("Organisation", { exact: true })).toHaveValue("Acme Payments Ltd");
    expect(screen.getByText(/This is optional/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
  });

  it("returns users to the workspace that opened the builder", () => {
    renderPage("/board-pack?from=%2Fregulators%2Ffca%2Fanalytics&fromLabel=FCA+workspace");
    expect(screen.getByRole("link", { name: /Back to FCA workspace/i })).toHaveAttribute(
      "href",
      "/regulators/fca/analytics",
    );
  });
});
