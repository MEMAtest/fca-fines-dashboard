import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Roadmap } from "./Roadmap.js";

vi.mock("../hooks/useSEO.js", () => ({
  useSEO: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <Roadmap />
    </MemoryRouter>,
  );
}

describe("Roadmap", () => {
  it("renders the coverage roadmap by default with the Italy-first phase visible", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: /Coverage roadmap/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Core Europe credibility gap/i)).toBeInTheDocument();
    expect(screen.getByTestId("coverage-phase-1")).toBeInTheDocument();
    expect(
      screen.getByTestId("coverage-card-consob"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("coverage-card-bdi")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-card-finma")).toBeInTheDocument();
  });

  it("switches to the product roadmap tab", () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("tab", { name: /Product Roadmap/i }),
    );

    expect(screen.getByTestId("product-roadmap-grid")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Board pack persistence/i }),
    ).toBeInTheDocument();
  });

  it("filters the coverage rail by cluster", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^Italy$/i }));

    expect(screen.getByTestId("coverage-card-consob")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-card-bdi")).toBeInTheDocument();
    expect(
      screen.queryByTestId("coverage-card-finma"),
    ).not.toBeInTheDocument();
  });
});
