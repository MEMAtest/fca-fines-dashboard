import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FMANZ_TOWER_FALSE_REVIEW_REPAIR,
  exactDecimalEqual,
  validateFmanzTowerFalseReviewRepair,
  verifyFmanzTowerProjection,
  verifyFmanzTowerRequiredReview,
} from "../../corrections/fmanzTowerFalseReviewHelpers.js";
import { FMANZ_GENERIC_AMOUNT_REVIEW_REASON } from "../fmanzAmountAttribution.js";

describe("guarded Tower false-review repair", () => {
  it("pins the exact public and physical event, source digests, and generic review provenance", () => {
    expect(validateFmanzTowerFalseReviewRepair(FMANZ_TOWER_FALSE_REVIEW_REPAIR)).toBe(true);
    expect(FMANZ_TOWER_FALSE_REVIEW_REPAIR.target).toMatchObject({
      sourceRowId: "eae9082c-5786-404a-9324-7f84a0e4d9ac",
      publicCaseId: "10233696-2ef2-4b12-8f10-80ab4a110316",
      amountOriginal: "7000000.00",
      currency: "NZD",
      date: "2025-12-09",
    });
    expect(FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.reason).toBe(FMANZ_GENERIC_AMOUNT_REVIEW_REASON);
  });

  it("compares database decimals without rounding away a material fraction", () => {
    expect(exactDecimalEqual("7000000.00", "7000000.00")).toBe(true);
    expect(exactDecimalEqual("7000000.000", "7000000.00")).toBe(true);
    expect(exactDecimalEqual("7000000.004", "7000000.00")).toBe(false);
    expect(exactDecimalEqual("7000000.01", "7000000.00")).toBe(false);
  });

  it("rejects drift in the reviewed source event or exact review-row provenance", () => {
    expect(() => validateFmanzTowerFalseReviewRepair({
      ...FMANZ_TOWER_FALSE_REVIEW_REPAIR,
      bodyEvidence: { ...FMANZ_TOWER_FALSE_REVIEW_REPAIR.bodyEvidence, normalizedBodySha256: "0".repeat(64) },
    })).toThrow(/exact event and false-positive review provenance/);
    expect(() => validateFmanzTowerFalseReviewRepair({
      ...FMANZ_TOWER_FALSE_REVIEW_REPAIR,
      target: { ...FMANZ_TOWER_FALSE_REVIEW_REPAIR.target, publicCaseId: "unrelated-id" },
    })).toThrow(/exact event and false-positive review provenance/);
    expect(() => verifyFmanzTowerRequiredReview({
      source_row_id: FMANZ_TOWER_FALSE_REVIEW_REPAIR.target.sourceRowId,
      review_status: "required",
      reason: "A separate penalty or compensation may be present.",
      evidence_url: FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.evidenceUrl,
      detected_at: FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.detectedAt,
      updated_at: FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.updatedAt,
      reviewed_by: null,
      reviewed_at: null,
    })).toThrow(/exact generic false-positive row/);
    const exactReview = {
      source_row_id: FMANZ_TOWER_FALSE_REVIEW_REPAIR.target.sourceRowId,
      review_status: FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.status,
      reason: FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.reason,
      evidence_url: FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.evidenceUrl,
      detected_at: FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.detectedAt,
      updated_at: FMANZ_TOWER_FALSE_REVIEW_REPAIR.review.updatedAt,
      reviewed_by: null,
      reviewed_at: null,
    };
    expect(() => verifyFmanzTowerRequiredReview(exactReview)).not.toThrow();
    expect(() => verifyFmanzTowerRequiredReview({
      ...exactReview,
      detected_at: "2026-10-28T05:41:50.054915Z",
    })).toThrow(/exact generic false-positive row/);
  });

  it("accepts only the exact current hold or the preserved-amount cleared projection", () => {
    const target = FMANZ_TOWER_FALSE_REVIEW_REPAIR.target;
    const current = {
      id: target.sourceRowId, regulator: "FMANZ", public_case_id: target.publicCaseId,
      firm_individual: target.firm, date_issued: target.date,
      amount_original: "7000000.00", currency: "NZD", amount_quality: "aggregate_unallocated",
      requires_amount_review: true, trusted_amount_gbp: null,
      amount_review_reason: FMANZ_GENERIC_AMOUNT_REVIEW_REASON,
    };
    expect(() => verifyFmanzTowerProjection(current, "current")).not.toThrow();
    expect(() => verifyFmanzTowerProjection({ ...current, amount_original: "7000001.00" }, "current"))
      .toThrow(/exact reviewed baseline/);

    const cleared = {
      ...current, amount_quality: "derived_explicit", requires_amount_review: false,
      amount_review_reason: null, amount_gbp: "3290000.00", amount_eur: "3850000.00",
      trusted_amount_gbp: "3290000.00", trusted_amount_eur: "3850000.00",
    };
    expect(() => verifyFmanzTowerProjection(cleared, "cleared")).not.toThrow();
    expect(() => verifyFmanzTowerProjection({ ...cleared, trusted_amount_gbp: null }, "cleared"))
      .toThrow(/exact reviewed baseline/);
  });

  it("requires guarded concurrent refresh and a deliberate rollback rehearsal before writes", () => {
    const source = readFileSync(resolve("scripts/corrections/repairFmanzTowerFalseReview.ts"), "utf8");
    expect(source).toContain("REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines;");
    expect(source).toContain("REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_regulatory_fines_canonical;");
    expect(source).toContain("has_full_unique_index");
    expect(source).toContain("SELECT public.refresh_all_fines()");
    expect(source).toContain("to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') = $5::text");
    expect(source).toContain("to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') = $6::text");
    expect(source).not.toContain("detected_at = $5::timestamptz");
    expect(source).not.toContain("updated_at = $6::timestamptz");
    expect(source).toContain("FmanzTowerRepairRehearsalRollback");
    expect(source).toContain("FMANZ_TOWER_FALSE_REVIEW_APPROVED");
    expect(source).not.toContain("REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical");
  });
});
