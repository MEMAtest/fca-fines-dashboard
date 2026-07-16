import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { fetchUKEnforcementSearch } from "../api.js";
import { EvidenceModalProvider } from "../components/EvidenceModalProvider.js";
import { UKEnforcement } from "./UKEnforcement.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));
vi.mock("../api.js", () => ({
  fetchUKEnforcementSearch: vi.fn(async () => ({ results: [] })),
  fetchUKEnforcementStats: vi.fn(async () => ({
    summary: { count: 0, total: 0, currency: "GBP" },
    byDomain: [],
    byRegulator: [],
  })),
}));

function RegulatorRouteControl() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/uk-enforcement?regulator=PRA&q=")}>Open PRA source</button>
  );
}

describe("UKEnforcement routing", () => {
  it("resynchronises the selected regulator when the query string changes", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/uk-enforcement"]}>
        <EvidenceModalProvider>
          <RegulatorRouteControl />
          <Routes>
            <Route path="/uk-enforcement" element={<UKEnforcement />} />
          </Routes>
        </EvidenceModalProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open PRA source" }));

    await waitFor(() => expect(screen.getByLabelText("Regulator")).toHaveValue("PRA"));
    await waitFor(() => expect(fetchUKEnforcementSearch).toHaveBeenCalledWith(
      expect.objectContaining({ regulator: "PRA" }),
    ));
    expect(container.querySelector(".uk-enforcement__skyline img")).toHaveAttribute(
      "src",
      "/images/london-skyline-uk-enforcement.jpg",
    );
  });

  it("opens case evidence in RegActions before exposing the regulator source", async () => {
    vi.mocked(fetchUKEnforcementSearch).mockResolvedValueOnce({
      results: [{
        id: "fca-alpha",
        regulator: "FCA",
        regulator_full_name: "Financial Conduct Authority",
        source_domain: "financial_conduct",
        country_code: "GB",
        country_name: "United Kingdom",
        firm_individual: "Alpha Bank plc",
        firm_category: "Banking",
        amount_original: 12_000_000,
        currency: "GBP",
        amount_gbp: 12_000_000,
        amount_eur: 14_000_000,
        display_amount: 12_000_000,
        date_issued: "2025-06-10",
        year_issued: 2025,
        month_issued: 6,
        breach_type: "AML controls",
        breach_categories: ["AML", "Governance"],
        summary: "The firm failed to maintain effective anti-money laundering controls.",
        notice_url: "https://www.fca.org.uk/news/news-stories/alpha-bank",
        source_url: "https://www.fca.org.uk/news/search-results",
        source_window_note: null,
        aliases: [],
        source_layer: "official",
        created_at: "2025-06-11T00:00:00.000Z",
        updated_at: "2025-06-11T00:00:00.000Z",
      }],
    } as never);

    render(
      <MemoryRouter initialEntries={["/uk-enforcement"]}>
        <EvidenceModalProvider>
          <Routes>
            <Route path="/uk-enforcement" element={<UKEnforcement />} />
          </Routes>
        </EvidenceModalProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Alpha Bank plc" }));

    expect(screen.getByRole("dialog", { name: "Alpha Bank plc" })).toBeInTheDocument();
    expect(screen.getByText("Verified regulator notice")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open official source/i })).toHaveAttribute(
      "href",
      "https://www.fca.org.uk/news/news-stories/alpha-bank",
    );
  });
});
