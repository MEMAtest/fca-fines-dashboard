import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { EvidenceModalProvider } from "../components/EvidenceModalProvider.js";
import { TopicCluster } from "./TopicCluster.js";

vi.mock("../hooks/useSEO.js", () => ({
  useSEO: vi.fn(),
  injectStructuredData: vi.fn(() => vi.fn()),
}));

vi.mock("../hooks/useUnifiedData.js", () => ({
  useUnifiedData: vi.fn(({ year }: { year: number }) => ({
    fines: year === 2026 ? [{
      id: "fca-2026-1",
      canonical_case_id: "fca-2026-1",
      fine_reference: "FCA-2026-1",
      firm_individual: "Example Bank plc",
      firm_category: "Banking",
      regulator: "FCA",
      final_notice_url: "https://www.fca.org.uk/publication/final-notices/example-bank-2026.pdf",
      summary: "Systems and controls failings",
      breach_type: "Systems and controls",
      breach_categories: ["Systems and controls"],
      amount: 12_000_000,
      date_issued: "2026-03-12",
      year_issued: 2026,
      month_issued: 3,
      requires_amount_review: false,
    }] : [{
      id: "fca-2025-1",
      fine_reference: "FCA-2025-1",
      firm_individual: "Previous Bank plc",
      firm_category: "Banking",
      regulator: "FCA",
      final_notice_url: "https://www.fca.org.uk/publication/final-notices/previous-bank-2025.pdf",
      summary: "Previous penalty",
      breach_type: "Conduct",
      breach_categories: ["Conduct"],
      amount: 6_000_000,
      date_issued: "2025-04-10",
      year_issued: 2025,
      month_issued: 4,
      requires_amount_review: false,
    }],
    stats: null,
    loading: false,
    error: null,
  })),
}));

describe("FCA fines 2026 topic report", () => {
  it("renders the current answer, monthly total and official evidence paths", () => {
    render(
      <MemoryRouter initialEntries={["/topics/fca-fines-2026"]}>
        <EvidenceModalProvider>
          <Routes>
            <Route path="/topics/:slug" element={<TopicCluster />} />
          </Routes>
        </EvidenceModalProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "How much has the FCA fined firms and individuals in 2026?" })).toBeInTheDocument();
    expect(screen.getAllByText("£12m").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "FCA fines by month in 2026" })).toBeInTheDocument();
    expect(screen.getAllByText("Example Bank plc").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /FCA 2026 fines page/i })).toHaveAttribute("href", "https://www.fca.org.uk/news/news-stories/2026-fines");
    expect(screen.getByRole("link", { name: "Complete FCA fines database" })).toHaveAttribute("href", "/regulators/fca");
    expect(screen.getByRole("link", { name: "View evidence" })).toHaveAttribute("href", "https://www.fca.org.uk/publication/final-notices/example-bank-2026.pdf");
  });
});
