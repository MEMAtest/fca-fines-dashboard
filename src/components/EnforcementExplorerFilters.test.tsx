import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { EnforcementExplorer, shouldAdoptLocationSearchParams } from "./EnforcementExplorer.js";

vi.mock("../api.js", () => ({
  fetchUnifiedSearch: vi.fn().mockResolvedValue({ results: [], pagination: { total: 0 } }),
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

function renderExplorer() {
  return render(
    <MemoryRouter initialEntries={["/prior?origin=kept", "/search?year=2024"]} initialIndex={1}>
      <HistoryProbe />
      <Routes>
        <Route path="/search" element={<EnforcementExplorer />} />
        <Route path="/prior" element={<p>Previous page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function currentSearchParams() {
  const location = screen.getByTestId("location").textContent ?? "";
  return new URLSearchParams(location.split("?")[1] ?? "");
}

describe("EnforcementExplorer filter URL state", () => {
  it("does not roll a pending burst back to an intermediate replace commit", () => {
    const pending = new URLSearchParams(
      "year=2025&theme=Financial+crime&sector=Cryptoassets&minAmount=2500000&maxAmount=41000000",
    );

    expect(shouldAdoptLocationSearchParams(pending, "year=2024", "REPLACE")).toBe(false);
    expect(shouldAdoptLocationSearchParams(pending, "year=2025", "REPLACE")).toBe(false);
    expect(shouldAdoptLocationSearchParams(pending, "year=2024", "POP")).toBe(true);
    expect(shouldAdoptLocationSearchParams(pending, "year=2024", "PUSH")).toBe(true);
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
});
