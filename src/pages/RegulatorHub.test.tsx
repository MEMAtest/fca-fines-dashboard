import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RegulatorHub } from "./RegulatorHub.js";

vi.mock("../hooks/useUnifiedData.js", () => ({
  useUnifiedData: vi.fn(() => ({
    fines: [],
    loading: false,
    error: null,
  })),
}));

vi.mock("../hooks/useSEO.js", () => ({
  useSEO: vi.fn(),
  injectStructuredData: vi.fn(() => () => {}),
}));

function renderRegulatorHub(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/regulators/:regulatorCode" element={<RegulatorHub />} />
        <Route path="/404" element={<div>Page not found</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RegulatorHub", () => {
  it("renders live hub pages even when the regulator dashboard is disabled", () => {
    renderRegulatorHub("/regulators/bdi");

    expect(
      screen.getByRole("heading", { name: /banca d'italia/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument();
  });

  it("redirects invalid regulator codes to the 404 route", () => {
    renderRegulatorHub("/regulators/not-a-real-regulator");

    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });
});
