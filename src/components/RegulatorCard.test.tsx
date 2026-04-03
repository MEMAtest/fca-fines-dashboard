import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import RegulatorCard from "./RegulatorCard.js";

describe("RegulatorCard", () => {
  it("renders a linked regulator card with a decorative mark and visible code", () => {
    render(
      <MemoryRouter>
        <RegulatorCard
          code="FCA"
          name="Financial Conduct Authority"
          country="United Kingdom"
          coverage="2013-2026"
          primaryStatValue={308}
          primaryStatLabel="Actions tracked"
          secondaryStatValue="High"
          secondaryStatLabel="Data quality"
          to="/regulators/fca"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /Financial Conduct Authority/ }),
    ).toHaveAttribute("href", "/regulators/fca");
    expect(screen.getByText("FCA")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Financial Conduct Authority/ })).toBeNull();
  });
});
