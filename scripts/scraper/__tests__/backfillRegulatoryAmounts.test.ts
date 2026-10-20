import { describe, expect, it } from "vitest";
import { deriveFmanzAmountGroup } from "../../backfill-regulatory-amount-assessments.js";

const row = (firm_individual: string, summary: string) => ({
  regulator: "FMANZ" as const,
  firm_individual,
  currency: "NZD",
  summary,
  notice_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aurora-financial-group-limited/",
  source_url: "https://www.fma.govt.nz/about-us/enforcement/cases/aurora-financial-group-limited/",
  created_at: "2026-10-20T00:00:00Z",
});

describe("FMANZ source-group amount assessment", () => {
  it("withholds a Cigna penalty when cross-page rows are grouped under Aurora's URL", () => {
    const assessment = deriveFmanzAmountGroup([
      row("Aurora Financial Group Limited", "FMA censured Aurora; no penalty amount is stated."),
      row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
      row("The Property Crowd", "FMA suspended The Property Crowd's licence."),
    ]);

    expect(assessment).toEqual({ amount: null, ambiguous: true, identityConflict: true });
  });

  it("keeps a single-entity explicit penalty and leaves a single-entity censure undisclosed", () => {
    expect(
      deriveFmanzAmountGroup([
        row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
        row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
      ]),
    ).toEqual({ amount: 3_500_000, ambiguous: false, identityConflict: false });

    expect(
      deriveFmanzAmountGroup([
        row("Aurora Financial Group Limited", "FMA censured Aurora for misleading KiwiSaver returns."),
      ]),
    ).toEqual({ amount: null, ambiguous: false, identityConflict: false });
  });
});
