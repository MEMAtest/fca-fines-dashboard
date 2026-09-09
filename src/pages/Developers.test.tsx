import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Developers } from "./Developers.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));

describe("Developers", () => {
  it("presents registered, measured API access instead of anonymous keyless access", () => {
    render(<MemoryRouter><Developers /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "RegActions Data API" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Register once, then use the full API" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tell RegActions who will use the API" })).toBeInTheDocument();
    expect(screen.getByText(/60 requests per minute/i)).toBeInTheDocument();
    expect(screen.getByText(/every accepted external request is associated with the issued key and organisation/i)).toBeInTheDocument();
    expect(screen.queryByText(/keyless/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no registration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Veravant/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start with the api/i })).toHaveAttribute("href", "#quickstart");
  });
});
