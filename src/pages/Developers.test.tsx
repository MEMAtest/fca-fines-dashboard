import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Developers } from "./Developers.js";

vi.mock("../hooks/useSEO.js", () => ({ useSEO: vi.fn() }));

describe("Developers", () => {
  it("makes the non-commercial boundary and commercial-permission route explicit", () => {
    render(
      <MemoryRouter>
        <Developers />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Internal AML and commercial use" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/paid client assessment, commercial service, or internal business workflow/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Commercial-use permission" }),
    ).toHaveAttribute("href", "#commercial-licensing");
  });
});
