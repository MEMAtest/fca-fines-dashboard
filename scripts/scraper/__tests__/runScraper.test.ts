import { describe, expect, it } from "vitest";
import { extractRegulatorCode } from "../lib/runScraper.js";

describe("runScraper regulator attribution", () => {
  it("extracts canonical codes from ordinary acronym-led scraper names", () => {
    expect(extractRegulatorCode("🇺🇸 SEC Press Release Enforcement Scraper")).toBe(
      "SEC",
    );
    expect(extractRegulatorCode("🇩🇪 BaFin Enforcement Actions Scraper")).toBe(
      "BaFin",
    );
  });

  it("maps long regulator display names to canonical codes", () => {
    expect(extractRegulatorCode("🇮🇹 Banca d'Italia Sanctions Scraper")).toBe(
      "BDI",
    );
    expect(
      extractRegulatorCode("🇨🇿 Czech National Bank Final Decisions Scraper"),
    ).toBe("CNBCZ");
    expect(
      extractRegulatorCode("🇸🇪 Finansinspektionen Sanctions Scraper"),
    ).toBe("FISE");
  });
});
