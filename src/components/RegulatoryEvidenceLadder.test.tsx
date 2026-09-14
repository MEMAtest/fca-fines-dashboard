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
    // The four-rung diagram and its "how to read" explainer are gone from the default view.
    expect(screen.queryByRole("list", { name: "Four-level regulatory evidence ladder" })).not.toBeInTheDocument();
    expect(screen.queryByText(/How to read activity and enforcement visibility/i)).not.toBeInTheDocument();
  });

  it("does not promote a site we could not reach to a finding of no enforcement", () => {
    const country = getRegulatorySignalCountry("DZ")!;
    render(<RegulatoryEvidenceLadder country={country} />);
    // Every authority now renders as a plain status card, not an expandable "Level N" disclosure.
    for (const authority of country.authorities) {
      expect(screen.getByText(authority.name)).toBeInTheDocument();
    }
    const limited = country.authorities.filter((a) =>
      ["challenge-protected", "access-blocked", "timeout", "network-error", "http-error", "http-404"].includes(a.accessState),
    );
    if (limited.length > 0) {
      expect(screen.getAllByText(/access limitation/i).length).toBeGreaterThan(0);
    }
  });

  it("labels the enforcement-visible authorities on their own card", () => {
    const unitedKingdom = getRegulatorySignalCountry("GB")!;
    render(<RegulatoryEvidenceLadder country={unitedKingdom} />);
    const enforcementVisible = unitedKingdom.authorities.filter(
      (a) => a.evidenceLevel === "enforcement-visible" || a.evidenceLevel === "score-eligible",
    );
    if (enforcementVisible.length > 0) {
      expect(screen.getAllByText(/Classified as enforcement-visible/i).length).toBeGreaterThan(0);
    }
  });

  it("keeps every authority's identity provenance on the card", () => {
    const country = getRegulatorySignalCountry("GB")!;
    render(<RegulatoryEvidenceLadder country={country} />);
    expect(screen.getAllByText(/Identity source provenance and dates/i).length).toBe(country.authorities.length);
  });

  it("treats blocked and HTTP 404 access as an access limitation, not evidence of inactivity", () => {
    const blockedCountry = getRegulatorySignalCountry("CW")!;
    render(<RegulatoryEvidenceLadder country={blockedCountry} />);
    const authorityCards = document.querySelectorAll(".reg-evidence-authority");
    expect(authorityCards.length).toBe(blockedCountry.authorities.length);
    for (const authority of blockedCountry.authorities) {
      const card = screen.getByText(authority.name).closest(".reg-evidence-authority")!;
      expect(within(card as HTMLElement).getByText(/access limitation on this research check|reachable when checked|no public official website|not checked in this snapshot/i)).toBeInTheDocument();
    }
  });

  it("uses semantic disclosures and a responsive compact structure", () => {
    const { container } = render(<RegulatoryEvidenceLadder country={getRegulatorySignalCountry("DZ")!} compact />);
    expect(container.querySelector(".reg-evidence-ladder--compact")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Authority summary for Algeria/i }).children).toHaveLength(2);
    expect(screen.getByRole("link", { name: /View full country evidence/i })).toHaveAttribute("href", "/countries");
    expect(screen.queryByText(/Identity source provenance/i)).not.toBeInTheDocument();
  });

  it("drops the Level N rung framing from the compact card in favour of a plain status line", () => {
    const country = getRegulatorySignalCountry("DZ")!;
    const { container } = render(<RegulatoryEvidenceLadder country={country} compact />);
    // No four-rung diagram and no "Level N" text anywhere in the compact card.
    expect(screen.queryByRole("list", { name: "Four-level regulatory evidence ladder" })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Level [1234]/);
    // Each shown authority carries a plain reachability status line instead.
    const items = screen.getByRole("list", { name: /Authority summary for Algeria/i }).querySelectorAll("li");
    expect(items.length).toBe(Math.min(2, country.authorities.length));
    for (const item of items) {
      expect(item.textContent).toMatch(/reachable when checked|no public official website|not checked in this snapshot|access limitation on this research check/i);
    }
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
