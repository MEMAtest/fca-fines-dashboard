import { describe, expect, it } from "vitest";
import { deriveFmanzAmountGroup } from "../../backfill-regulatory-amount-assessments.js";
import { getFmanzCaseAmountReviewRules } from "../fmanzCaseAmountReviewRules.js";
import { parseFmanzAmount } from "../scrapeFmanz.js";

const row = (
  firm_individual: string,
  summary: string,
  sourceUrl = "https://www.fma.govt.nz/about-us/enforcement/cases/aurora-financial-group-limited/",
  noticeUrl = sourceUrl,
) => ({
  regulator: "FMANZ" as const,
  firm_individual,
  currency: "NZD",
  summary,
  notice_url: noticeUrl,
  source_url: sourceUrl,
  created_at: "2026-10-20T00:00:00Z",
});

describe("FMANZ source-group amount assessment", () => {
  it("withholds a Cigna penalty when cross-page rows are grouped under Aurora's URL", () => {
    const assessment = deriveFmanzAmountGroup([
      row("Aurora Financial Group Limited", "FMA censured Aurora; no penalty amount is stated."),
      row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
      row("The Property Crowd", "FMA suspended The Property Crowd's licence."),
    ]);

    expect(assessment).toEqual({ amount: null, ambiguous: true, identityConflict: true, caseReviewReason: null });
  });

  it("keeps a single-entity explicit penalty and leaves a single-entity censure undisclosed", () => {
    expect(
      deriveFmanzAmountGroup([
        row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
        row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
      ]),
    ).toEqual({ amount: 3_500_000, ambiguous: false, identityConflict: false, caseReviewReason: null });

    expect(
      deriveFmanzAmountGroup([
        row("Aurora Financial Group Limited", "FMA censured Aurora for misleading KiwiSaver returns."),
      ]),
    ).toEqual({ amount: null, ambiguous: false, identityConflict: false, caseReviewReason: null });
  });

  it("holds the three reviewed positive parser matches for aggregate or date-continuity review", () => {
    const cases = [
      {
        firm: "Oceania Natural Limited (ONL) and associated individuals",
        url: "https://www.fma.govt.nz/about-us/enforcement/cases/onl/",
        summary: "The court ordered Zhong to pay a pecuniary penalty of $1.3 million; other respondents received separate penalties.",
      },
      {
        firm: "Rangi Wyatt Stephen Savage",
        url: "https://www.fma.govt.nz/about-us/enforcement/cases/rangi-savage/",
        summary: "The court ordered Mr Savage to pay a pecuniary penalty of $142,500.",
      },
      {
        firm: "Mark Warminger",
        url: "https://www.fma.govt.nz/about-us/enforcement/cases/warminger/",
        noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Judgements/Warminger-penalty-judgment-170630-Judgment-CIV2015-404-1727.1.pdf",
        summary: "The court ordered Mark Warminger to pay a pecuniary penalty of $400,000.",
      },
    ];

    expect(getFmanzCaseAmountReviewRules()).toHaveLength(3);
    for (const item of cases) {
      expect(parseFmanzAmount(item.summary)).not.toBeNull();
      const assessment = deriveFmanzAmountGroup([row(item.firm, item.summary, item.url, item.noticeUrl)]);
      expect(assessment.amount).toBeNull();
      expect(assessment.ambiguous).toBe(true);
      expect(assessment.identityConflict).toBe(false);
      expect(assessment.caseReviewReason).toMatch(/withhold|Withhold/i);
    }
  });
});
