import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { fetchUKEnforcementSearch } from "../api.js";
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
        <RegulatorRouteControl />
        <Routes>
          <Route path="/uk-enforcement" element={<UKEnforcement />} />
        </Routes>
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
});
