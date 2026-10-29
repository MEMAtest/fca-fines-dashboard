import { describe, expect, it } from "vitest";
import { deriveFmanzAmountGroup } from "../../backfill-regulatory-amount-assessments.js";
import { getFmanzCaseAmountReviewRules } from "../fmanzCaseAmountReviewRules.js";
import {
  fmanzNormalizedBodySha256,
  isReviewedFmanzAmountEvent,
} from "../fmanzAmountAttribution.js";
import { parseFmanzAmount } from "../scrapeFmanz.js";

const row = (
  firm_individual: string,
  summary: string,
  sourceUrl = "https://www.fma.govt.nz/about-us/enforcement/cases/aurora-financial-group-limited/",
  noticeUrl = sourceUrl,
  date_issued: string | null = null,
) => ({
  regulator: "FMANZ" as const,
  firm_individual,
  currency: "NZD",
  summary,
  notice_url: noticeUrl,
  source_url: sourceUrl,
  date_issued,
  raw_payload: { detail: { body: "" } },
  created_at: "2026-10-20T00:00:00Z",
});

describe("FMANZ source-group amount assessment", () => {
  it("withholds a Cigna penalty when cross-page rows are grouped under Aurora's URL", () => {
    const assessment = deriveFmanzAmountGroup([
      row("Aurora Financial Group Limited", "FMA censured Aurora; no penalty amount is stated."),
      row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
      row("The Property Crowd", "FMA suspended The Property Crowd's licence."),
    ]);

    expect(assessment).toEqual({
      amount: null,
      ambiguous: true,
      identityConflict: true,
      sourceEventReviewRequired: true,
      caseReviewReason: "Case page monetary outcome requires party/date/source review.",
    });
  });

  it("requires an exact reviewed event tuple before backfill can derive a positive FMA amount", () => {
    const assessment = deriveFmanzAmountGroup([
      row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
      row("Cigna Life Insurance New Zealand Limited", "The FMA ordered Cigna to pay a penalty of $3.5 million."),
    ]);
    expect(assessment.amount).toBeNull();
    expect(assessment.ambiguous).toBe(true);
    expect(assessment.sourceEventReviewRequired).toBe(true);
    expect(assessment.caseReviewReason).toMatch(/party\/date\/source review/);

    const censure = deriveFmanzAmountGroup([
        row("Aurora Financial Group Limited", "FMA censured Aurora for misleading KiwiSaver returns."),
    ]);
    expect(censure.amount).toBeNull();
    expect(censure.sourceEventReviewRequired).toBe(false);
  });

  it("holds the three reviewed positive parser matches for aggregate or date-continuity review", () => {
    const cases = [
      {
        firm: "Oceania Natural Limited (ONL) and associated individuals",
        date: "2024-08-06",
        url: "https://www.fma.govt.nz/about-us/enforcement/cases/onl/",
        summary: "The court ordered Zhong to pay a pecuniary penalty of $1.3 million; other respondents received separate penalties.",
      },
      {
        firm: "Rangi Wyatt Stephen Savage",
        date: "2024-05-20",
        url: "https://www.fma.govt.nz/about-us/enforcement/cases/rangi-savage/",
        summary: "The court ordered Mr Savage to pay a pecuniary penalty of $142,500.",
      },
      {
        firm: "Mark Warminger",
        date: "2017-07-31",
        url: "https://www.fma.govt.nz/about-us/enforcement/cases/warminger/",
        noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Judgements/Warminger-penalty-judgment-170630-Judgment-CIV2015-404-1727.1.pdf",
        summary: "The court ordered Mark Warminger to pay a pecuniary penalty of $400,000.",
      },
    ];

    expect(getFmanzCaseAmountReviewRules()).toHaveLength(3);
    for (const item of cases) {
      expect(parseFmanzAmount(item.summary)).not.toBeNull();
      const assessment = deriveFmanzAmountGroup([row(item.firm, item.summary, item.url, item.noticeUrl, item.date)]);
      expect(assessment.amount).toBeNull();
      expect(assessment.ambiguous).toBe(true);
      expect(assessment.identityConflict).toBe(false);
      expect(assessment.caseReviewReason).toMatch(/Withhold|penalty|appeal withdrawal/i);
    }
  });

  it("keeps Tower's explicit penalty distinct from overcharges and customer remediation", () => {
    const summary = "December 2025 Tower has been ordered to pay a $7 million penalty for misleading representations that resulted in more than $11 million in overcharges to its customers. Tower has so far carried out remediation in respect of approximately 58,000 customers and paid $9.26 million.";
    expect(parseFmanzAmount(summary)).toBe(7_000_000);

    expect(isReviewedFmanzAmountEvent({
      firm: "Tower Limited",
      date: "2025-12-09",
      amount: 7_000_000,
      currency: "NZD",
      sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/tower-limited/",
      noticeUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/tower-limited/",
      bodySha256: "f0b90b9794627305a0278a6b30d2906cbf3e39bf192ec7a7e2d0fa3797e3852b",
    })).toBe(true);
  });

  it("ignores only exact repeated Tower body sentences and holds on unique evidence changes", () => {
    const penalty = "December 2025 Tower has been ordered to pay a $7 million penalty for misleading representations that resulted in more than $11 million in overcharges to its customers.";
    const remediation = "Tower has so far carried out remediation in respect of approximately 58,000 customers and paid $9.26 million.";
    const acceptedBody = `${penalty} ${remediation} ${remediation}`;
    const currentBody = `${penalty} ${remediation}`;

    expect(fmanzNormalizedBodySha256(acceptedBody)).toBe(fmanzNormalizedBodySha256(currentBody));
    expect(fmanzNormalizedBodySha256(currentBody)).not.toBe(
      fmanzNormalizedBodySha256(`${currentBody} The court later reduced the penalty on appeal.`),
    );
    expect(fmanzNormalizedBodySha256(currentBody)).not.toBe(
      fmanzNormalizedBodySha256(`${currentBody} A separate pecuniary penalty of $1 million was imposed.`),
    );
  });

  it("uses exact held reasons before the generic reason and context-binds Rangi and Warminger", () => {
    const cblUrl = "https://www.fma.govt.nz/about-us/enforcement/cases/cbl/";
    const cblNotice = "https://www.courtsofnz.govt.nz/assets/cases/2025/2025-NZHC-295.pdf";
    const cbl = deriveFmanzAmountGroup([
      row("CBL", "The court ordered CBL to pay a penalty of $1.4 million.", cblUrl, cblNotice, "2025-06-27"),
    ]);
    expect(cbl.caseReviewReason).toMatch(/former CFO Carden Mulholland/);

    const rangiUrl = "https://www.fma.govt.nz/about-us/enforcement/cases/rangi-savage/";
    const filingDate = deriveFmanzAmountGroup([
      row("Rangi Wyatt Stephen Savage", "The court ordered Mr Savage to pay a pecuniary penalty of $142,500.", rangiUrl, rangiUrl, "2024-05-20"),
    ]);
    const laterEvent = deriveFmanzAmountGroup([
      row("Rangi Wyatt Stephen Savage", "The court ordered Mr Savage to pay a pecuniary penalty of $142,500.", rangiUrl, rangiUrl, "2025-02-01"),
    ]);
    expect(filingDate.caseReviewReason).toMatch(/filing of proceedings/);
    expect(laterEvent.caseReviewReason).toMatch(/party\/date\/source review/);
    expect(laterEvent.caseReviewReason).not.toMatch(/filed civil proceedings/);
  });
});
