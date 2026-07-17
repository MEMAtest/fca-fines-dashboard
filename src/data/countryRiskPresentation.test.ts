import { describe, expect, it } from "vitest";
import { computeCountryRiskV2 } from "./countryRiskV2.js";
import {
  buildCountryRiskPublicExplanation,
  latestCountryRiskSourceCheck,
  publicCountryRiskStatusLabel,
} from "./countryRiskPresentation.js";

describe("country-risk consumer presentation", () => {
  it("turns publication states into plain language", () => {
    expect(publicCountryRiskStatusLabel("complete")).toBe("Full information available");
    expect(publicCountryRiskStatusLabel("provisional")).toBe("Some information unavailable");
    expect(publicCountryRiskStatusLabel("insufficient-data")).toBe("Not enough information to score");
  });

  it("explains a provisional FATF floor without technical status codes", () => {
    const explanation = buildCountryRiskPublicExplanation(
      computeCountryRiskV2("VG", { asOf: new Date("2026-07-17T12:00:00.000Z") }),
    );
    expect(explanation.statusLabel).toBe("Some information unavailable");
    expect(explanation.missingInformation).toContain(
      "Government effectiveness and rule of law information is unavailable.",
    );
    expect(explanation.floorMessages).toContain(
      "FATF grey-list status means the score cannot be lower than 6.0. This minimum set the final score.",
    );
  });

  it("distinguishes a verified sanctions zero from missing evidence", () => {
    const explanation = buildCountryRiskPublicExplanation(
      computeCountryRiskV2("GB", { asOf: new Date("2026-07-17T12:00:00.000Z") }),
    );
    expect(explanation.sanctionsZeroExplanation).toContain("complete UN, UK, EU and US review");
    expect(explanation.sanctionsZeroExplanation).toContain("may still appear on sanctions lists");
  });

  it("returns the latest valid source retrieval date", () => {
    expect(latestCountryRiskSourceCheck([
      {
        id: "fatf-lists",
        name: "FATF",
        sourceUrl: "https://example.test/fatf",
        scored: true,
        cadence: "weekly",
        state: "current",
        effectiveAt: "2026-06-19",
        retrievedAt: "2026-07-16",
        sha256: "a",
        note: "",
      },
      {
        id: "sanctions-regimes",
        name: "Sanctions",
        sourceUrl: "https://example.test/sanctions",
        scored: true,
        cadence: "daily",
        state: "current",
        effectiveAt: "2026-07-17",
        retrievedAt: "2026-07-17T09:00:00.000Z",
        sha256: "b",
        note: "",
      },
    ])).toBe("2026-07-17T09:00:00.000Z");
  });
});
