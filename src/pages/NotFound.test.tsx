import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NotFound } from "./NotFound.js";

describe("NotFound", () => {
  it("renders a site-wide 404 message and homepage link", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /page not found/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/regulator code in the url is invalid/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /return to homepage/i }),
    ).toHaveAttribute("href", "/");
  });
});
