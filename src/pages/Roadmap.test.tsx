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
      screen.getByRole("heading", { name: /Platform Roadmap/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("coverage-live-strip")).toBeInTheDocument();
    expect(
      screen.getByTestId("coverage-card-consob"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("coverage-card-bdi")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-card-finma")).toBeInTheDocument();
  });

  it("switches to the product roadmap filter", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^Features$/i }));

    expect(screen.getByTestId("product-card-feat-board-pack")).toBeInTheDocument();
    expect(screen.getByTestId("product-card-feat-api")).toBeInTheDocument();
    expect(
      screen.queryByTestId("coverage-card-consob"),
    ).not.toBeInTheDocument();
  });

  it("filters the coverage rail by quarter", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /^Q2 2026$/i }));

    expect(screen.getByTestId("coverage-card-consob")).toBeInTheDocument();
    expect(screen.getByTestId("coverage-card-bdi")).toBeInTheDocument();
    expect(
      screen.queryByTestId("coverage-card-cnbcz"),
    ).not.toBeInTheDocument();
  });
});
