import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Developers } from "./Developers.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));

describe("Developers", () => {
  it("presents a documentation-first quickstart and the commercial-use boundary", () => {
    render(<MemoryRouter><Developers /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "RegActions Data API" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Make a country-risk request" })).toBeInTheDocument();
    expect(screen.getByText(/paid client assessment, commercial service or internal business workflow/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start with the api/i })).toHaveAttribute("href", "#quickstart");
  });
});
