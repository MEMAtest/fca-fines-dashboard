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

function renderPage() {
  return render(<MemoryRouter><BoardIntelligence /></MemoryRouter>);
}

describe("BoardIntelligence quick pack", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { value: createLocalStorageMock(), configurable: true });
  });

  it("renders a no-account builder without the old NorthStar profile toolbar", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /Create a committee-ready regulatory board pack/i })).toBeInTheDocument();
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

  it("opens a privacy-aware lead gate with optional marketing consent", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Organisation name/i), { target: { value: "Acme Payments Ltd" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Create and download PDF|Create board pack/i })[0]);
    expect(screen.getByRole("heading", { name: /Download your board pack/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Your name/i)).toBeRequired();
    expect(screen.getByLabelText(/Work email/i)).toBeRequired();
    expect(screen.getByText(/This is optional/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
  });
});
