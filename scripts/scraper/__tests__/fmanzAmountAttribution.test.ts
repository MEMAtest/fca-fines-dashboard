import { describe, expect, it } from "vitest";
import {
  FMANZ_GENERIC_AMOUNT_REVIEW_REASON,
  getFmanzAmountReviewReason,
  getFmanzExactHeldAmountEvent,
  getReviewedFmanzAmountEvents,
  isReviewedFmanzAmountEvent,
} from "../fmanzAmountAttribution.js";
import { AMOUNT_REVIEW_OVERRIDE_FILTER_SQL } from "../lib/amountSanity.js";

describe("FMANZ exact source-event amount attribution", () => {
  const approved = getReviewedFmanzAmountEvents()[0]!;

  it("accepts an exact reviewed positive tuple with the unchanged official body digest", () => {
    expect(isReviewedFmanzAmountEvent(approved)).toBe(true);
  });

  it("accepts Tower's independently pinned duplicate-sentence-only body normalization", () => {
    const tower = getReviewedFmanzAmountEvents().find((event) => event.firm === "Tower Limited")!;
    const currentBody = {
      ...tower,
      bodySha256: "5c66be59e049f0a2636a4624ba44679c1f2d6b661659f8b04a8d4675005da2d3",
      normalizedBodySha256: "8812a73542c053f3c05415560c766e1b07f07c7caf89459dbc1bcfce857bb1a5",
    };
    expect(tower.bodySha256).toBe("f0b90b9794627305a0278a6b30d2906cbf3e39bf192ec7a7e2d0fa3797e3852b");
    expect(isReviewedFmanzAmountEvent(currentBody)).toBe(true);
    expect(getFmanzAmountReviewReason(currentBody)).toBeNull();

    for (const uniqueChange of [
      { ...currentBody, normalizedBodySha256: "0".repeat(64) },
      { ...currentBody, amount: 7_000_001 },
      { ...currentBody, date: "2025-12-10" },
      { ...currentBody, firm: "Tower Holdings" },
    ]) {
      expect(isReviewedFmanzAmountEvent(uniqueChange)).toBe(false);
      expect(getFmanzAmountReviewReason(uniqueChange)).toBe(FMANZ_GENERIC_AMOUNT_REVIEW_REASON);
    }
  });

  it("holds changed body text, a new date, a changed amount, or another notice identity for review", () => {
    for (const changed of [
      { ...approved, bodySha256: "0".repeat(64) },
      { ...approved, date: "2026-02-10" },
      { ...approved, amount: approved.amount + 1 },
      { ...approved, sourceUrl: "https://example.org/wrong" },
      { ...approved, noticeUrl: "https://www.fma.govt.nz/another-case/" },
    ]) {
      expect(isReviewedFmanzAmountEvent(changed)).toBe(false);
      expect(getFmanzAmountReviewReason(changed)).toBe(FMANZ_GENERIC_AMOUNT_REVIEW_REASON);
    }
    expect(FMANZ_GENERIC_AMOUNT_REVIEW_REASON).toMatch(/party\/date\/source review/);
  });

  it("uses the announcement case date as the reviewed tuple without requiring a judgment-date rewrite", () => {
    const aiaAnnouncement = getReviewedFmanzAmountEvents().find((event) => event.firm === "AIA");
    expect(aiaAnnouncement).toMatchObject({ date: "2022-09-30", amount: 700_000 });
    expect(isReviewedFmanzAmountEvent(aiaAnnouncement!)).toBe(true);
  });

  it("allows source-event review to supersede only derived FMANZ URL overrides", () => {
    expect(AMOUNT_REVIEW_OVERRIDE_FILTER_SQL).toContain("upper(e.regulator) = 'FMANZ'");
    expect(AMOUNT_REVIEW_OVERRIDE_FILTER_SQL).toContain("o.quality_status <> 'verified_override'");
    expect(AMOUNT_REVIEW_OVERRIDE_FILTER_SQL).toContain("NOT (");
    expect(AMOUNT_REVIEW_OVERRIDE_FILTER_SQL).toContain("o.evidence_url = public.normalise_regulatory_evidence_url(");
  });

  it("gives an exact known case-review rule precedence over the generic tuple hold", () => {
    expect(getFmanzAmountReviewReason(approved, "Reviewed exact event-specific reason.")).toBe(
      "Reviewed exact event-specific reason.",
    );
  });

  it("routes exact held events to the same curated reason and evidence URL as the review contract", () => {
    const held = getFmanzExactHeldAmountEvent({
      firm: "Westpac",
      date: "2025-05-02",
      amount: 3_250_000,
      currency: "NZD",
      sourceUrl: "https://www.fma.govt.nz/about-us/enforcement/cases/westpac/",
      noticeUrl: "https://www.fma.govt.nz/assets/Enforcement/Enforceable-undertakings/Westpac-CC-and-FMA-EU.pdf",
      bodySha256: "not-used-for-held-event-match",
    });
    expect(held?.evidenceUrl).toBe(
      "https://www.fma.govt.nz/news/all-releases/media-releases/westpac-to-pay-3-25-million-penalty-for-misleading-customers/",
    );
    expect(held?.reason).toContain("Candidate amount and date are confirmed");
  });
});
