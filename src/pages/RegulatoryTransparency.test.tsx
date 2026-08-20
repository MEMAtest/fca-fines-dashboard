import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegulatoryTransparency } from "./RegulatoryTransparency.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));

describe("RegulatoryTransparency", () => {
  it("keeps the index explicitly unscored and exposes fallback evidence", () => {
    render(<RegulatoryTransparency />);

    expect(screen.getByRole("heading", { name: /Regulatory ecosystem and enforcement visibility/i })).toBeInTheDocument();
    expect(screen.getByText(/not assessed while source qualification/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /How to read the evidence ladder/i })).toBeInTheDocument();
    expect(screen.getByText("Regulator identified")).toBeInTheDocument();
    expect(screen.getByText(/Algeria · DZ/i)).toBeInTheDocument();
    expect(screen.getByText(/Bank of Algeria/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Transparency Index: not scored/i).length).toBeGreaterThan(100);
  });
});
