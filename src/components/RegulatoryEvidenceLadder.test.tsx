import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getRegulatorySignalCountry } from "../data/regulatorySignal.js";
import { EvidenceLadderLegend, RegulatoryEvidenceLadder, countryEvidenceLevel } from "./RegulatoryEvidenceLadder.js";

describe("RegulatoryEvidenceLadder", () => {
  it("keeps blocked access separate from enforcement absence", () => {
    const country = getRegulatorySignalCountry("DZ")!;
    render(<RegulatoryEvidenceLadder country={country} />);

    expect(screen.getByText(/Transparency Index: not scored/i)).toBeInTheDocument();
    expect(screen.getAllByText(/The access limitation describes this research check only/i)).toHaveLength(2);
    expect(screen.getAllByText(/does not establish that the authority has no enforcement activity/i)).toHaveLength(2);
    expect(screen.getByText(/Alternative official publication URL/i)).toBeInTheDocument();
  });

  it("shows observed enforcement as a separate country-level signal", () => {
    const country = getRegulatorySignalCountry("GB")!;
    render(<RegulatoryEvidenceLadder country={country} />);

    expect(countryEvidenceLevel(country)).toBe(4);
    expect(screen.getByText(/752 observed actions/i)).toBeInTheDocument();
    expect(screen.getByText(/The ladder describes evidence availability, not regulatory quality/i)).toBeInTheDocument();
  });

  it("renders the compact no-JS-friendly authority disclosure", () => {
    const country = getRegulatorySignalCountry("DZ")!;
    render(<RegulatoryEvidenceLadder country={country} compact />);

    expect(screen.getByText(/Show all 3 mapped authorities and mandates/i)).toBeInTheDocument();
    expect(screen.getByText(/How to read enforcement visibility/i)).toBeInTheDocument();
  });

  it("renders all four ladder definitions", () => {
    render(<EvidenceLadderLegend />);
    expect(screen.getByText("Regulator identified")).toBeInTheDocument();
    expect(screen.getByText("Official engagement visible")).toBeInTheDocument();
    expect(screen.getByText("Official publication route")).toBeInTheDocument();
    expect(screen.getByText("Observed enforcement feed")).toBeInTheDocument();
  });
});
