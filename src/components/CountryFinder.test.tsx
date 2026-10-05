import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildCountryIndex } from "../data/countryView.js";
import { CountryFinder, findCountryMatches } from "./CountryFinder.js";

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

describe("CountryFinder", () => {
  const entries = buildCountryIndex();

  it("matches country names, ISO codes and common aliases", () => {
    expect(findCountryMatches(entries, "ven")[0]?.country.name).toBe("Venezuela");
    expect(findCountryMatches(entries, "GBR")[0]?.country.name).toBe("United Kingdom");
    expect(findCountryMatches(entries, "Ivory Coast")[0]?.country.name).toBe("Côte d'Ivoire");
  });

  it("autocompletes and opens the highlighted country with Enter", () => {
    render(
      <MemoryRouter initialEntries={["/countries"]}>
        <CountryFinder entries={entries} />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const input = screen.getByRole("combobox", { name: "Find a country risk report" });
    fireEvent.change(input, { target: { value: "Venez" } });
    expect(screen.getByRole("option", { name: /Venezuela/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("location")).toHaveTextContent("/countries/venezuela");
  });
});

