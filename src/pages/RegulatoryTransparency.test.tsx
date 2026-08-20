import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RegulatoryTransparency } from "./RegulatoryTransparency.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));

describe("RegulatoryTransparency", () => {
  it("keeps the index explicitly unscored and exposes fallback evidence", () => {
    render(<RegulatoryTransparency />);

    expect(screen.getByRole("heading", { name: /Regulatory ecosystem and enforcement visibility/i })).toBeInTheDocument();
    expect(screen.getByText(/not scored while source qualification/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /How to read the evidence ladder/i })).toBeInTheDocument();
    expect(screen.getByText("Identity confirmed")).toBeInTheDocument();
    expect(screen.getByText(/Algeria · DZ/i)).toBeInTheDocument();
    expect(screen.getByText(/Bank of Algeria/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Transparency Index: not scored/i).length).toBeGreaterThan(100);
    const algeriaCard = screen.getByText(/Algeria · DZ/i).closest("article")!;
    expect(within(algeriaCard).getByRole("list", { name: /Authority summary for Algeria/i }).children).toHaveLength(2);
    expect(within(algeriaCard).getByRole("link", { name: /View full country evidence/i })).toHaveAttribute("href", "/countries/algeria");
    expect(within(algeriaCard).queryByText(/Publication candidates and qualification/i)).not.toBeInTheDocument();
    expect(within(algeriaCard).queryByText(/Provisional first-page scan signal/i)).not.toBeInTheDocument();
  });
});
