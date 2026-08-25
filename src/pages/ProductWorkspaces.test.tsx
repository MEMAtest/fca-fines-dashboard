import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FinesWorkspace } from "./FinesWorkspace.js";
import { RegulatorWorkspace } from "./RegulatorWorkspace.js";
import { fetchWorkspaceRecords } from "../utils/fetchWorkspaceRecords.js";
import { EvidenceModalProvider } from "../components/EvidenceModalProvider.js";
import { useSEO } from "../hooks/useSEO.js";

vi.mock("../hooks/useSEO.js", () => ({
  useSEO: vi.fn(),
  injectStructuredData: vi.fn(() => () => undefined),
}));
vi.mock("../hooks/useWorkspaceOverview.js", () => ({
  useWorkspaceOverview: vi.fn(() => ({ data: null, loading: false, error: null })),
}));
vi.mock("../utils/fetchWorkspaceRecords.js", () => ({
  fetchWorkspaceRecords: vi.fn(async () => ({ records, total: records.length, truncated: false })),
}));
vi.mock("../api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api.js")>();
  return {
    ...actual,
    fetchUnifiedOverview: vi.fn(async (params: {
      year?: number | number[];
      regulator?: string | string[];
      breachCategory?: string | string[];
    }) => {
      const years = params.year == null
        ? []
        : Array.isArray(params.year)
          ? params.year
          : [params.year];
      const regulators = params.regulator == null
        ? []
        : Array.isArray(params.regulator)
          ? params.regulator
          : [params.regulator];
      const themes = params.breachCategory == null
        ? []
        : Array.isArray(params.breachCategory)
          ? params.breachCategory
          : [params.breachCategory];
      const matching = records.filter((record) =>
        (!years.length || years.includes(record.year_issued)) &&
        (!regulators.length || regulators.includes(record.regulator)) &&
        (!themes.length || record.breach_categories.some((item) => themes.includes(item))),
      );
      return {
        metrics: {
          count: matching.length,
          total: matching.reduce((sum, record) => sum + record.amount, 0),
          average: 0,
          median: 0,
          largest: 0,
          largestFirm: "",
          affectedFirms: 0,
          latestDate: null,
        },
        yearly: [],
        monthly: [],
        themes: [],
        regulators: [],
        sectors: [],
        firms: [],
      };
    }),
  };
});

const records = [
  {
    id: "fca-1", canonical_case_id: "b40e17fe-6592-450e-934c-80b4a427f87a", fine_reference: "FCA-1", firm_individual: "Alpha Bank", firm_category: "Banking", regulator: "FCA", final_notice_url: "https://example.com/alpha", summary: "AML systems and controls failures", breach_type: "Financial crime", breach_categories: ["AML"], amount: 12_000_000, date_issued: "2025-04-12", year_issued: 2025, month_issued: 4,
  },
  {
    id: "fca-2", canonical_case_id: "789af44d-c44b-4536-a574-ae10dd6a8d0e", fine_reference: "FCA-2", firm_individual: "Beta Markets", firm_category: "Investment firm", regulator: "FCA", final_notice_url: "https://example.com/beta", summary: "Market conduct failings", breach_type: "Market abuse", breach_categories: ["Market abuse"], amount: 4_000_000, date_issued: "2024-02-10", year_issued: 2024, month_issued: 2,
  },
  {
    id: "sec-1", fine_reference: "SEC-1", firm_individual: "Gamma Securities", firm_category: "Broker", regulator: "SEC", final_notice_url: "https://example.com/gamma", summary: "Disclosure failings", breach_type: "Disclosure", breach_categories: ["Disclosure"], amount: 2_500_000, date_issued: "2025-06-01", year_issued: 2025, month_issued: 6,
  },
];

vi.mock("../hooks/useUnifiedData.js", () => ({
  useUnifiedData: vi.fn(({ regulator }: { regulator: string }) => ({
    fines: regulator === "All" ? records : records.filter((record) => record.regulator === regulator),
    stats: null,
    loading: false,
    error: null,
  })),
}));

describe("product workspaces", () => {
  it("assigns the broad regulatory-fines intent to the global database route", () => {
    render(<MemoryRouter initialEntries={["/fines"]}><EvidenceModalProvider><FinesWorkspace view="overview" /></EvidenceModalProvider></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Regulatory Fines Database" })).toBeInTheDocument();
    expect(useSEO).toHaveBeenCalledWith(expect.objectContaining({
      title: "Regulatory Fines Database | Global Enforcement Actions | RegActions",
      canonicalPath: "/fines",
      keywords: expect.stringContaining("regulatory fines database"),
    }));
  });

  it("opens the underlying data when a Command Centre table row is selected", () => {
    render(<MemoryRouter initialEntries={["/fines"]}><EvidenceModalProvider><FinesWorkspace view="overview" /></EvidenceModalProvider></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Regulatory Fines Database/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Alpha Bank FCA fine case" })).toHaveAttribute(
      "href",
      "/fca-fines/2025/alpha-bank/b40e17fe-6592-450e-934c-80b4a427f87a",
    );
    const rowLabel = screen.getAllByText("Alpha Bank").find((element) => element.tagName === "STRONG");
    expect(rowLabel).toBeDefined();
    fireEvent.click(rowLabel!);
    const drawer = screen.getByRole("dialog", { name: /Alpha Bank/i });
    expect(drawer).toBeInTheDocument();
    expect(screen.getByText(/Underlying enforcement actions/i)).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole("button", { name: /View evidence/i }));
    expect(screen.getByText("RegActions evidence summary")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open official source/i })).toHaveAttribute(
      "href",
      "https://example.com/alpha",
    );
    fireEvent.click(screen.getByRole("button", { name: "Return to results" }));
    expect(drawer).toBeInTheDocument();
  });

  it("no longer leads with a shortcut row", () => {
    // Removed on purpose. Seven links sat between the heading and any data, and
    // three of them were FCA-specific on a page of global enforcement. They
    // belong on the FCA regulator page, which still carries them.
    render(<MemoryRouter initialEntries={["/fines"]}><EvidenceModalProvider><FinesWorkspace view="overview" /></EvidenceModalProvider></MemoryRouter>);
    expect(screen.queryByRole("navigation", { name: "Enforcement research shortcuts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "FCA fines database" })).toBeNull();
  });

  it("supports guided multi-selection with exact server-side summaries", async () => {
    render(<MemoryRouter initialEntries={["/fines/compare"]}><EvidenceModalProvider><FinesWorkspace view="compare" /></EvidenceModalProvider></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Compare regulatory fines/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /2025/i }));
    fireEvent.click(screen.getByRole("button", { name: /2024/i }));
    expect(screen.getByRole("button", { name: "Remove year 2025" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove year 2024" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comparison summary" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Year 2025.*£14\.5m.*2 actions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Year 2024.*£4m.*1 action/i })).toBeInTheDocument();
  });

  it("loads the complete canonical evidence set when a sector tile is selected", async () => {
    render(<MemoryRouter initialEntries={["/fines/analytics"]}><EvidenceModalProvider><FinesWorkspace view="analytics" /></EvidenceModalProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Banking.*1 action/i }));
    expect(fetchWorkspaceRecords).toHaveBeenCalledWith(expect.objectContaining({ sector: "Banking" }));
  });

  it("charts enforcement activity and summarises the latest month", () => {
    // Was twelve identical month cards, which had to be compared by eye. The
    // chart replaces them; the click-through to a month's evidence now happens
    // on a bar, which jsdom cannot dispatch, so it is covered by the live gate
    // rather than asserted here.
    render(<MemoryRouter initialEntries={["/fines/actions"]}><EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Enforcement activity" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Monthly breakdown" })).toBeNull();
    expect(screen.getByRole("group", { name: "Chart series" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Penalties" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What changed?" })).toBeInTheDocument();
  });

  it("splits the regulator's action from the subject matter in the table", () => {
    // breach_type holds the raw notice headline, so both columns come from
    // breach_categories via splitBreachCategories.
    render(<MemoryRouter initialEntries={["/fines/actions"]}><EvidenceModalProvider><FinesWorkspace view="actions" /></EvidenceModalProvider></MemoryRouter>);
    const table = screen.getByRole("table", { name: "" }) ?? screen.getAllByRole("table")[0];
    expect(table).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Entity" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Outcome" })).toBeInTheDocument();
  });

  it("uses the canonical regulator executive-summary layout", () => {
    render(<MemoryRouter initialEntries={["/regulators/fca"]}><EvidenceModalProvider><Routes><Route path="/regulators/:regulatorCode" element={<RegulatorWorkspace view="overview" />} /></Routes></EvidenceModalProvider></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "FCA Fines Database and Enforcement Actions" })).toBeInTheDocument();
    expect(useSEO).toHaveBeenCalledWith(expect.objectContaining({
      title: "FCA Fines Database: Latest Penalties & Final Notices | RegActions",
      canonicalPath: "/regulators/fca",
    }));
    expect(screen.getByText(/Financial Conduct Authority enforcement activity and official-source evidence/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "FCA fines in 2026" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View the 2026 monthly report/i })).toHaveAttribute("href", "/topics/fca-fines-2026");
    expect(screen.getByRole("link", { name: /official fines page/i })).toHaveAttribute("href", "https://www.fca.org.uk/news/news-stories/2026-fines");
    expect(screen.getByText(/You are viewing data for/i)).toBeInTheDocument();
    expect(screen.getByText("FCA · United Kingdom")).toBeInTheDocument();
    expect(screen.getByText("+200.0%")).toBeInTheDocument();
    expect(screen.getByText("2025 vs 2024")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /What matters now/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Top breach themes/i })).toBeInTheDocument();
  });

  it("labels secondary destinations accurately and preserves a return path", () => {
    render(<MemoryRouter initialEntries={["/fines/analytics?year=2025"]}><EvidenceModalProvider><FinesWorkspace view="analytics" /></EvidenceModalProvider></MemoryRouter>);

    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Data Hub" })).not.toBeInTheDocument();
    // Every secondary destination renders outside ProductWorkspaceShell, so all
    // three carry the return trail that powers their "Back to …" link. Board
    // Pack used to be the only one, leaving the other two as dead ends.
    const trail = "from=%2Ffines%2Fanalytics%3Fyear%3D2025&fromLabel=Fines+workspace";
    expect(screen.getByRole("link", { name: "Regulator directory" })).toHaveAttribute(
      "href",
      `/regulators?${trail}`,
    );
    expect(screen.getByRole("link", { name: "Methodology" })).toHaveAttribute(
      "href",
      `/methodology/enforcement?${trail}`,
    );
    expect(screen.getByRole("link", { name: "Board Pack" })).toHaveAttribute(
      "href",
      `/board-pack?${trail}`,
    );
  });

  it("adds decision-useful concentration, distribution and heatmap analytics", () => {
    render(<MemoryRouter initialEntries={["/fines/analytics"]}><EvidenceModalProvider><FinesWorkspace view="analytics" /></EvidenceModalProvider></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Fine concentration" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Penalty-size distribution" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monthly enforcement heatmap" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Outlier cases" })).toBeInTheDocument();
  });
});
