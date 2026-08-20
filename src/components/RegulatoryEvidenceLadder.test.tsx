import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getRegulatorySignalCountry } from "../data/regulatorySignal.js";
import {
  EvidenceLadderLegend,
  RegulatoryEvidenceLadder,
  authorityEvidenceLevel,
  countryEvidenceLevel,
} from "./RegulatoryEvidenceLadder.js";

describe("RegulatoryEvidenceLadder", () => {
  it("uses the authority schema for Curaçao identity-only evidence", () => {
    const country = getRegulatorySignalCountry("CW")!;
    expect(country.authorities.every((authority) => authority.evidenceLevel === "identity-confirmed")).toBe(true);
    expect(country.authorities.every((authority) => authorityEvidenceLevel(authority) === 1)).toBe(true);
    expect(countryEvidenceLevel(country)).toBe(1);

    render(<RegulatoryEvidenceLadder country={country} />);
    expect(screen.getByRole("heading", { name: "Level 1: Identity confirmed" })).toBeInTheDocument();
    expect(screen.getAllByText(/No publication candidate is qualified/i)).toHaveLength(2);
    expect(screen.queryByText(/Level 2: Regulatory activity visible/i)).not.toBeInTheDocument();
  });

  it("does not promote Algeria's external-unqualified candidate", () => {
    const country = getRegulatorySignalCountry("DZ")!;
    expect(countryEvidenceLevel(country)).toBe(1);
    render(<RegulatoryEvidenceLadder country={country} />);

    expect(screen.getAllByText("Unqualified publication candidate").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Research candidate only/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Official authority-owned enforcement route")).not.toBeInTheDocument();
    expect(screen.queryByText(/Alternative official publication URL/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/activity remains unknown/i).length).toBeGreaterThan(0);
  });

  it("keeps Barbados at identity-only when qualified routes have zero observations", () => {
    const country = getRegulatorySignalCountry("BB")!;
    expect(country.authorities.every((authority) => authority.evidenceLevel === "identity-confirmed")).toBe(true);
    expect(countryEvidenceLevel(country)).toBe(1);
    render(<RegulatoryEvidenceLadder country={country} />);

    expect(screen.getByRole("heading", { name: "Level 1: Identity confirmed" })).toBeInTheDocument();
    expect(screen.getAllByText("Official authority-owned enforcement route").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not a validated engagement frequency/i).length).toBeGreaterThan(0);
  });

  it("separates qualified, unqualified and external official candidates", () => {
    const unitedKingdom = getRegulatorySignalCountry("GB")!;
    const { unmount } = render(<RegulatoryEvidenceLadder country={unitedKingdom} />);
    expect(screen.getAllByText("Official authority-owned enforcement route").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unqualified publication candidate").length).toBeGreaterThan(0);
    expect(screen.getByText(/Monetary Policy Report - July 2026/i)).toBeInTheDocument();
    unmount();

    render(<RegulatoryEvidenceLadder country={getRegulatorySignalCountry("TN")!} />);
    expect(screen.getAllByText("External official context").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cannot establish local regulatory activity or enforcement visibility/i).length).toBeGreaterThan(0);
  });

  it("treats blocked and HTTP 404 access as unknown", () => {
    const blockedCountry = getRegulatorySignalCountry("CW")!;
    render(<RegulatoryEvidenceLadder country={blockedCountry} />);
    const activityRegions = screen.getAllByRole("region", { name: /Provisional activity observation/i });
    expect(activityRegions).toHaveLength(2);
    for (const region of activityRegions) {
      expect(within(region).getAllByText("Unknown").length).toBeGreaterThan(0);
      expect(within(region).getByText(/Source access was limited/i)).toBeInTheDocument();
    }
  });

  it("uses semantic disclosures and a responsive compact structure", () => {
    const { container } = render(<RegulatoryEvidenceLadder country={getRegulatorySignalCountry("DZ")!} compact />);
    expect(container.querySelector(".reg-evidence-ladder--compact")).toBeInTheDocument();
    expect(screen.getByText(/How to read activity and enforcement visibility/i).closest("details")).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: /Provisional activity observation/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Scan contract and precision/i).length).toBeGreaterThan(0);
  });

  it("renders all four schema-level definitions without exposing a score", () => {
    render(<EvidenceLadderLegend />);
    expect(screen.getByRole("list", { name: "Four-level regulatory evidence ladder" })).toBeInTheDocument();
    expect(screen.getByText("Identity confirmed")).toBeInTheDocument();
    expect(screen.getByText("Regulatory activity visible")).toBeInTheDocument();
    expect(screen.getByText("Enforcement visible")).toBeInTheDocument();
    expect(screen.getByText("Score eligible")).toBeInTheDocument();
    expect(screen.getByText(/no authority currently does/i)).toBeInTheDocument();
  });
});
