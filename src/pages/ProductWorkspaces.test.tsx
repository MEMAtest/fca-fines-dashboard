import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FinesWorkspace } from "./FinesWorkspace.js";
import { RegulatorWorkspace } from "./RegulatorWorkspace.js";
import { fetchWorkspaceRecords } from "../utils/fetchWorkspaceRecords.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));
vi.mock("../hooks/useWorkspaceOverview.js", () => ({
  useWorkspaceOverview: vi.fn(() => ({ data: null, loading: false, error: null })),
}));
vi.mock("../utils/fetchWorkspaceRecords.js", () => ({
  fetchWorkspaceRecords: vi.fn(async () => ({ records, total: records.length, truncated: false })),
}));

const records = [
  {
    id: "fca-1", fine_reference: "FCA-1", firm_individual: "Alpha Bank", firm_category: "Banking", regulator: "FCA", final_notice_url: "https://example.com/alpha", summary: "AML systems and controls failures", breach_type: "Financial crime", breach_categories: ["AML"], amount: 12_000_000, date_issued: "2025-04-12", year_issued: 2025, month_issued: 4,
  },
  {
    id: "fca-2", fine_reference: "FCA-2", firm_individual: "Beta Markets", firm_category: "Investment firm", regulator: "FCA", final_notice_url: "https://example.com/beta", summary: "Market conduct failings", breach_type: "Market abuse", breach_categories: ["Market abuse"], amount: 4_000_000, date_issued: "2024-02-10", year_issued: 2024, month_issued: 2,
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
  it("opens the underlying data when a Command Centre table row is selected", () => {
    render(<MemoryRouter initialEntries={["/fines"]}><FinesWorkspace view="overview" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Fines Command Centre/i })).toBeInTheDocument();
    const rowLabel = screen.getAllByText("Alpha Bank").find((element) => element.tagName === "STRONG");
    expect(rowLabel).toBeDefined();
    fireEvent.click(rowLabel!);
    expect(screen.getByRole("dialog", { name: /Alpha Bank/i })).toBeInTheDocument();
    expect(screen.getByText(/Underlying enforcement actions/i)).toBeInTheDocument();
  });

  it("supports guided multi-selection with a three-year limit", () => {
    render(<MemoryRouter initialEntries={["/fines/compare"]}><FinesWorkspace view="compare" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Guided comparison/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /2025/i }));
    fireEvent.click(screen.getByRole("button", { name: /2024/i }));
    expect(screen.getByRole("button", { name: "Remove year 2025" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove year 2024" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comparison summary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Year 2025.*£14\.5m.*2 actions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Year 2024.*£4m.*1 action/i })).toBeInTheDocument();
  });

  it("loads the complete canonical evidence set when a sector tile is selected", async () => {
    render(<MemoryRouter initialEntries={["/fines/analytics"]}><FinesWorkspace view="analytics" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Banking.*1 action/i }));
    expect(fetchWorkspaceRecords).toHaveBeenCalledWith(expect.objectContaining({ sector: "Banking" }));
  });

  it("uses the canonical regulator executive-summary layout", () => {
    render(<MemoryRouter initialEntries={["/regulators/fca"]}><Routes><Route path="/regulators/:regulatorCode" element={<RegulatorWorkspace view="overview" />} /></Routes></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Financial Conduct Authority \(FCA\)/i })).toBeInTheDocument();
    expect(screen.getByText(/All data on this page reflects FCA enforcement activity/i)).toBeInTheDocument();
    expect(screen.getByText(/You are viewing data for/i)).toBeInTheDocument();
    expect(screen.getByText("FCA · United Kingdom")).toBeInTheDocument();
    expect(screen.getByText("+200.0%")).toBeInTheDocument();
    expect(screen.getByText("2025 vs 2024")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /What matters now/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Top breach themes/i })).toBeInTheDocument();
  });

  it("labels secondary destinations accurately and preserves a return path", () => {
    render(<MemoryRouter initialEntries={["/fines/analytics?year=2025"]}><FinesWorkspace view="analytics" /></MemoryRouter>);

    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Data Hub" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Regulator directory" })).toHaveAttribute("href", "/regulators");
    expect(screen.getByRole("link", { name: "Methodology" })).toHaveAttribute("href", "/countries/methodology");
    expect(screen.getByRole("link", { name: "Board Pack" })).toHaveAttribute(
      "href",
      "/board-pack?from=%2Ffines%2Fanalytics%3Fyear%3D2025&fromLabel=Fines+workspace",
    );
  });
});
