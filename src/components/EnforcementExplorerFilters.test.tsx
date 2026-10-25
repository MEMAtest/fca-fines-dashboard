import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, NavigationType, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { EnforcementExplorer, rememberCorrection, shouldAdoptLocationSearchParams } from "./EnforcementExplorer.js";
import { fetchSearchCorrection, fetchUnifiedSearch } from "../api.js";

vi.mock("../api.js", () => ({
  fetchUnifiedSearch: vi.fn().mockResolvedValue({ results: [], pagination: { total: 0 } }),
  fetchSearchCorrection: vi.fn().mockResolvedValue({}),
}));
vi.mock("../hooks/useUnifiedData.js", () => ({
  transformUnifiedRecord: vi.fn((record) => record),
}));
vi.mock("../hooks/useEvidenceBasket.js", () => ({
  useEvidenceBasket: () => ({ items: [], contains: () => false, add: vi.fn(), remove: vi.fn() }),
}));
vi.mock("../hooks/useWorkspaceOverview.js", () => ({
  useWorkspaceOverview: () => ({
    data: {
      themes: [{ label: "Financial crime" }],
      sectors: [{ label: "Cryptoassets" }],
    },
  }),
}));
vi.mock("./EvidenceModalProvider.js", () => ({
  useEvidenceModal: () => ({ openEvidence: vi.fn() }),
}));
vi.mock("./WatchFirmButton.js", () => ({ WatchFirmButton: () => null }));

function HistoryProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{location.pathname}{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>Back history</button>
      <button type="button" onClick={() => navigate(1)}>Forward history</button>
    </>
  );
}

function renderExplorer(path = "/search?year=2024") {
  return render(
    <MemoryRouter initialEntries={["/prior?origin=kept", path]} initialIndex={1}>
      <HistoryProbe />
      <Routes>
        <Route path="/search" element={<EnforcementExplorer />} />
        <Route path="/prior" element={<p>Previous page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function resultRecord(firm: string) {
  return {
    id: "case-corrected",
    canonical_case_id: "case-corrected",
    regulator: "CBI",
    regulator_full_name: "Central Bank of Ireland",
    country_code: "IE",
    country_name: "Ireland",
    firm_individual: firm,
    firm_category: "Cryptoassets",
    amount_original: 1000,
    currency: "GBP",
    amount_gbp: 1000,
    amount_eur: 1160,
    date_issued: "2025-11-06T00:00:00.000Z",
    year_issued: 2025,
    month_issued: 11,
    breach_type: "Financial crime",
    breach_categories: ["Financial crime"],
    summary: `${firm} official action`,
    notice_url: "https://example.com/notice",
    source_url: "https://example.com/source",
    requires_amount_review: false,
    amount_disclosed: true,
  };
}

function currentSearchParams() {
  const location = screen.getByTestId("location").textContent ?? "";
  return new URLSearchParams(location.split("?")[1] ?? "");
}

describe("EnforcementExplorer filter URL state", () => {
  it("retains selected controls in the URL/API request and restores them through history", async () => {
    renderExplorer();
    const controls = screen.getByLabelText("Control evidence") as HTMLSelectElement;
    fireEvent.change(controls, { target: { value: "AML_CASH_CONTROLS" } });

    await waitFor(() => {
      expect(currentSearchParams().get("control")).toBe("AML_CASH_CONTROLS");
      expect(fetchUnifiedSearch).toHaveBeenLastCalledWith(expect.objectContaining({ control: ["AML_CASH_CONTROLS"] }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Back history" }));
    await waitFor(() => expect(screen.getByText("Previous page")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Forward history" }));
    await waitFor(() => expect(currentSearchParams().get("control")).toBe("AML_CASH_CONTROLS"));
    expect((screen.getByRole("option", { name: "AML cash controls" }) as HTMLOptionElement).selected).toBe(true);
  });

  it("lets the fines checkbox override natural-language fines intent without dropping its control", async () => {
    renderExplorer("/search?q=fines%20for%20cash%20failures");
    const checkbox = screen.getByRole("checkbox", { name: /Identified fines\/penalties/ });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(currentSearchParams().get("finesOnly")).toBeNull();
      expect(currentSearchParams().get("control")).toBe("AML_CASH_CONTROLS");
      expect(currentSearchParams().get("q")).toBeNull();
      expect(fetchUnifiedSearch).toHaveBeenLastCalledWith(expect.objectContaining({
        control: ["AML_CASH_CONTROLS"],
        finesOnly: undefined,
        q: "",
      }));
    });
    expect(screen.getByRole("checkbox", { name: /Identified fines\/penalties/ })).not.toBeChecked();
  });

  it("offers control-oriented examples and clears every active filter together", async () => {
    renderExplorer("/search?q=fines%20for%20cash%20failures&control=CDD_KYC&year=2025");
    expect(screen.getByLabelText("Search enforcement evidence")).toHaveAttribute("placeholder", expect.stringContaining("specific control"));
    expect(screen.getByText(/no match does not establish that a control was absent/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    await waitFor(() => {
      expect(currentSearchParams().toString()).toBe("");
      expect(screen.getByRole("checkbox", { name: /Identified fines\/penalties/ })).not.toBeChecked();
      expect((screen.getByLabelText("Control evidence") as HTMLSelectElement).selectedOptions).toHaveLength(0);
    });
  });

  it("renders stored-summary and official-passage provenance without conflating them", async () => {
    vi.mocked(fetchUnifiedSearch).mockResolvedValueOnce({
      results: [{
        ...resultRecord("NatWest"),
        control_matches: [
          { code: "AML_CASH_CONTROLS", label: "AML cash controls", basis: "stored_summary", passage: "Cash transaction monitoring was inadequate.", matchedConcept: "AML_CASH_CONTROLS", matchReasons: ["Stored summary: cash transaction monitoring"] },
          { code: "AML_CASH_CONTROLS", label: "AML cash controls", basis: "official_passage", passage: "The firm's cash transaction controls were insufficient.", sourceUrl: "https://www.fca.org.uk/example", contentHash: "sha256:example", locator: "paragraph 12", matchedConcept: "AML_CASH_CONTROLS", matchReasons: ["Official passage (paragraph 12)"] },
        ],
      }],
      pagination: { total: 1 },
    } as any);
    renderExplorer("/search?control=AML_CASH_CONTROLS");

    expect(await screen.findByText("Stored summary match")).toBeInTheDocument();
    expect(screen.getByText("Approved official passage")).toBeInTheDocument();
    expect(screen.getByText("Cash transaction monitoring was inadequate.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open official source · paragraph 12" })).toHaveAttribute("href", "https://www.fca.org.uk/example");
  });

  it("bounds remembered corrections to the 32 most recently used scopes", () => {
    const cache = new Map<string, string>();
    for (let index = 0; index < 33; index += 1) {
      rememberCorrection(cache, `scope-${index}`, `corrected-${index}`);
    }

    expect(cache.size).toBe(32);
    expect(cache.has("scope-0")).toBe(false);
    expect(cache.get("scope-1")).toBe("corrected-1");
    expect(cache.get("scope-32")).toBe("corrected-32");
  });

  it("does not roll a pending burst back to an intermediate replace commit", () => {
    const pending = new URLSearchParams(
      "year=2025&theme=Financial+crime&sector=Cryptoassets&minAmount=2500000&maxAmount=41000000",
    );

    expect(shouldAdoptLocationSearchParams(pending, "year=2024", NavigationType.Replace)).toBe(false);
    expect(shouldAdoptLocationSearchParams(pending, "year=2025", NavigationType.Replace)).toBe(false);
    expect(shouldAdoptLocationSearchParams(pending, "year=2024", NavigationType.Pop)).toBe(true);
    expect(shouldAdoptLocationSearchParams(pending, "year=2024", NavigationType.Push)).toBe(true);
  });

  it("keeps rapid filter changes composed and restores them through back and forward", async () => {
    renderExplorer();

    act(() => {
      fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2025" } });
      fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "Financial crime" } });
      fireEvent.change(screen.getByLabelText("Sector"), { target: { value: "Cryptoassets" } });
      fireEvent.change(screen.getByLabelText("Minimum GBP"), { target: { value: "2500000" } });
      fireEvent.change(screen.getByLabelText("Maximum GBP"), { target: { value: "41000000" } });
    });

    await waitFor(() => {
      const params = currentSearchParams();
      expect(params.get("year")).toBe("2025");
      expect(params.get("theme")).toBe("Financial crime");
      expect(params.get("sector")).toBe("Cryptoassets");
      expect(params.get("minAmount")).toBe("2500000");
      expect(params.get("maxAmount")).toBe("41000000");
    });

    fireEvent.click(screen.getByRole("button", { name: "Back history" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/prior?origin=kept"));

    fireEvent.click(screen.getByRole("button", { name: "Forward history" }));
    await waitFor(() => {
      const params = currentSearchParams();
      expect(params.get("year")).toBe("2025");
      expect(params.get("theme")).toBe("Financial crime");
      expect(params.get("sector")).toBe("Cryptoassets");
      expect(params.get("minAmount")).toBe("2500000");
      expect(params.get("maxAmount")).toBe("41000000");
    });
    expect(screen.getByLabelText("Year")).toHaveValue(2025);
    expect(screen.getByLabelText("Theme")).toHaveValue("Financial crime");
    expect(screen.getByLabelText("Sector")).toHaveValue("Cryptoassets");
  });

  it("does not run the generic correction lookup for ordinary browse or nonzero results", async () => {
    renderExplorer("/search");
    await waitFor(() => expect(fetchUnifiedSearch).toHaveBeenCalled());
    expect(fetchSearchCorrection).not.toHaveBeenCalled();

    vi.mocked(fetchUnifiedSearch).mockReset().mockResolvedValue({
      results: [resultRecord("Coinbase Europe Limited")], pagination: { total: 1 },
    } as never);
    renderExplorer("/search?q=Coinbase");
    await waitFor(() => expect(screen.getByText("Coinbase Europe Limited", { exact: true })).toBeVisible());
    expect(fetchSearchCorrection).not.toHaveBeenCalled();
  });

  it("keeps a genuine empty state when the correction service has no suggestion", async () => {
    vi.mocked(fetchUnifiedSearch).mockReset().mockResolvedValue({ results: [], pagination: { total: 0 } } as never);
    vi.mocked(fetchSearchCorrection).mockReset().mockResolvedValue({ metadata: { correction: null } });
    renderExplorer("/search?q=unmatched%20firm");

    await waitFor(() => expect(fetchSearchCorrection).toHaveBeenCalledTimes(1));
    expect(screen.getByText("No actions match these filters")).toBeVisible();
    expect(screen.queryByText(/Showing results for/)).not.toBeInTheDocument();
    expect(vi.mocked(fetchUnifiedSearch)).toHaveBeenCalledTimes(1);
  });

  it("shows a meaningful failure when the correction service cannot be reached", async () => {
    vi.mocked(fetchUnifiedSearch).mockReset().mockResolvedValue({ results: [], pagination: { total: 0 } } as never);
    vi.mocked(fetchSearchCorrection).mockReset().mockRejectedValue(new Error("network unavailable"));
    renderExplorer("/search?q=unmatched%20firm");

    await waitFor(() => expect(screen.getByText(
      "The exact query returned no results, and a corrected search could not be completed.",
    )).toBeVisible());
    expect(screen.getByText("No actions match these filters")).toBeVisible();
    expect(vi.mocked(fetchUnifiedSearch)).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Showing results for/)).not.toBeInTheDocument();
  });

  it("says a corrected query also found no results when its scoped total is zero", async () => {
    vi.mocked(fetchUnifiedSearch)
      .mockReset()
      .mockResolvedValueOnce({ results: [], pagination: { total: 0 } } as never)
      .mockResolvedValueOnce({ results: [], pagination: { total: 0 } } as never);
    vi.mocked(fetchSearchCorrection).mockReset().mockResolvedValue({
      metadata: { correction: { correctedQuery: "coinbase europe limited" } },
    });
    renderExplorer("/search?q=Coinbsae%20Europe%20Limited&regulator=CBI&year=2025&sector=Cryptoassets");

    await waitFor(() => expect(screen.getByText(
      "No exact results for “Coinbsae Europe Limited”; corrected search “coinbase europe limited” also found no results.",
      { exact: true },
    )).toBeVisible());
    expect(screen.queryByText(/Showing results for/)).not.toBeInTheDocument();
    expect(screen.getByText("No actions match these filters")).toBeVisible();
    expect(screen.getByLabelText("Search enforcement evidence")).toHaveValue("Coinbsae Europe Limited");
    expect(screen.getByTestId("location")).toHaveTextContent("q=Coinbsae%20Europe%20Limited");
    expect(vi.mocked(fetchUnifiedSearch).mock.calls[1][0]).toMatchObject({
      q: "coinbase europe limited", regulator: "CBI", year: 2025, sector: "Cryptoassets",
    });
  });

  it("retries a zero-result typo with corrected q while preserving URL, filters, sort and page offset", async () => {
    vi.mocked(fetchUnifiedSearch)
      .mockReset()
      .mockResolvedValueOnce({ results: [], pagination: { total: 0 } } as never)
      .mockResolvedValueOnce({ results: [resultRecord("Coinbase Europe Limited")], pagination: { total: 1 } } as never);
    vi.mocked(fetchSearchCorrection).mockReset().mockResolvedValue({
      metadata: { correction: { correctedQuery: "coinbase europe limited" } },
    });
    renderExplorer("/search?q=Coinbsae%20Europe%20Limited&regulator=CBI&year=2025&theme=Financial%20crime&sector=Cryptoassets&minAmount=100&maxAmount=500&sort=firm_individual&order=asc&page=2");

    const notice = 'No exact results for “Coinbsae Europe Limited”. Showing results for “coinbase europe limited”.';
    await waitFor(() => expect(screen.getByText(notice, { exact: true })).toBeVisible());
    expect(screen.getByText(notice, { exact: true })).toHaveAttribute("role", "status");
    expect(screen.getByLabelText("Search enforcement evidence")).toHaveValue("Coinbsae Europe Limited");
    expect(screen.getByText("Coinbase Europe Limited", { exact: true })).toBeVisible();
    expect(screen.getByText("1 results", { exact: true })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("q=Coinbsae%20Europe%20Limited");

    const retry = vi.mocked(fetchUnifiedSearch).mock.calls[1][0];
    expect(retry).toMatchObject({
      q: "coinbase europe limited",
      regulator: "CBI",
      year: 2025,
      breachCategory: "Financial crime",
      sector: "Cryptoassets",
      minAmount: 100,
      maxAmount: 500,
      sortBy: "firm_individual",
      order: "asc",
      limit: 50,
      offset: 50,
    });
    expect(vi.mocked(fetchSearchCorrection).mock.calls[0][0]).toMatchObject({
      q: "Coinbsae Europe Limited", regulator: "CBI", year: 2025,
    });
  });

  it("does not let a cancelled correction request overwrite a newer query", async () => {
    let resolveCorrection!: (value: { metadata: { correction: { correctedQuery: string } } }) => void;
    vi.mocked(fetchUnifiedSearch)
      .mockReset()
      .mockResolvedValueOnce({ results: [], pagination: { total: 0 } } as never)
      .mockResolvedValueOnce({ results: [resultRecord("Coinbase Europe Limited")], pagination: { total: 1 } } as never);
    vi.mocked(fetchSearchCorrection).mockReset().mockReturnValueOnce(new Promise((resolve) => { resolveCorrection = resolve; }) as never);
    renderExplorer("/search?q=Coinbsae");

    await waitFor(() => expect(fetchSearchCorrection).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Search enforcement evidence"), { target: { value: "Coinbase" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("Coinbase Europe Limited", { exact: true })).toBeVisible());
    resolveCorrection({ metadata: { correction: { correctedQuery: "stale corrected query" } } });
    await waitFor(() => expect(screen.getByLabelText("Search enforcement evidence")).toHaveValue("Coinbase"));
    expect(screen.queryByText(/Showing results for “stale corrected query”/)).not.toBeInTheDocument();
    expect(vi.mocked(fetchUnifiedSearch)).toHaveBeenCalledTimes(2);
  });
});
