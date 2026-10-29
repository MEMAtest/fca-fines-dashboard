import { describe, expect, it } from "vitest";
import contractJson from "../../corrections/data/asic26252GroupReviewV1.json" with { type: "json" };
import rules from "../data/asicAmountAttributionRules.json" with { type: "json" };
import {
  isExactAsic26252ReviewMarkerSet,
  validateAsic26252CurrentRows,
  validateAsic26252GroupReviewContract,
  validateAsic26252Roster,
  type Asic26252GroupReviewContract,
} from "../../corrections/asic26252GroupReviewHelpers.js";

const contract = contractJson as Asic26252GroupReviewContract;
const groupRule = rules.groups.find((candidate) => candidate.mediaReleaseCode === "26-252MR");
if (!groupRule) throw new Error("ASIC 26-252MR source rule is missing.");

function currentRows() {
  return contract.targets.map((target) => ({
    id: target.id,
    public_case_id: target.publicCaseId,
    canonical_case_id: target.publicCaseId,
    content_hash: target.contentHash,
    firm_individual: target.firm,
    regulator: "ASIC",
    date_issued: contract.date,
    raw_amount: contract.storedGroupHeadlineAmount,
    raw_amount_gbp: contract.currentAmountGbp,
    raw_amount_eur: contract.currentAmountEur,
    amount_original: contract.storedGroupHeadlineAmount,
    currency: contract.currency,
    notice_url: contract.noticeUrl,
    source_url: contract.sourceUrl,
    amount_gbp: contract.currentAmountGbp,
    amount_eur: contract.currentAmountEur,
    amount_quality: contract.currentAmountQuality,
    requires_amount_review: contract.currentRequiresAmountReview,
    trusted_amount_gbp: contract.currentAmountGbp,
    trusted_amount_eur: contract.currentAmountEur,
    source_review_status: contract.sourceReviewStatus,
    source_content_hash: contract.sourceContentHash,
    source_link_status: "verified_detail",
    source_official_domain_match: true,
    review_status: null,
    review_reason: null,
    review_evidence_url: null,
    override_url: null,
  }));
}

function heldRows() {
  return currentRows().map((row) => ({
    ...row,
    amount_quality: contract.heldAmountQuality,
    requires_amount_review: true,
    trusted_amount_gbp: null,
    trusted_amount_eur: null,
    review_status: "required",
    review_reason: contract.reviewReason,
    review_evidence_url: contract.noticeUrl,
  }));
}

describe("ASIC 26-252MR exact-group review guard", () => {
  it("pins exactly the official 21-name roster and a source-passage fingerprint", () => {
    expect(validateAsic26252GroupReviewContract(contract)).toBe(true);
    expect(groupRule.entities).toHaveLength(21);
    expect(validateAsic26252Roster(contract, groupRule.entities)).toBe(true);
    expect(() => validateAsic26252Roster(contract, [...groupRule.entities, "Unlisted Example Pty Ltd"])).toThrow(/exact 21 named/);
    expect(() => validateAsic26252Roster(contract, groupRule.entities.slice(1))).toThrow(/exact 21 named/);
  });

  it("accepts only the exact 21 current unheld group rows with no URL override", () => {
    const rows = currentRows();
    expect(validateAsic26252CurrentRows(contract, rows)).toBe(true);
    expect(() => validateAsic26252CurrentRows(contract, rows.slice(1))).toThrow(/21 distinct physical rows/);
    expect(() => validateAsic26252CurrentRows(contract, [...rows, rows[0]!])).toThrow(/21 distinct physical rows/);
    expect(() => validateAsic26252CurrentRows(contract, rows.map((row, index) =>
      index === 0 ? { ...row, override_url: contract.noticeUrl } : row,
    ))).toThrow(/no longer matches/);
    expect(() => validateAsic26252CurrentRows(contract, rows.map((row, index) =>
      index === 0 ? { ...row, public_case_id: "00000000000000000000000000000000" } : row,
    ))).toThrow(/no longer matches/);
  });

  it("accepts the exact 21 required-review post-state idempotently and rejects altered holds", () => {
    const rows = heldRows();
    expect(validateAsic26252CurrentRows(contract, rows, "held")).toBe(true);
    const markers = contract.targets.map((target) => ({
      source_row_id: target.id,
      review_status: "required",
      reason: contract.reviewReason,
      evidence_url: contract.noticeUrl,
      reviewed_by: null,
      reviewed_at: null,
    }));
    expect(isExactAsic26252ReviewMarkerSet(contract, markers)).toBe(true);
    expect(isExactAsic26252ReviewMarkerSet(contract, markers.slice(1))).toBe(false);
    expect(isExactAsic26252ReviewMarkerSet(contract, markers.map((marker, index) =>
      index === 0 ? { ...marker, reason: "different reason" } : marker,
    ))).toBe(false);
    expect(() => validateAsic26252CurrentRows(contract, rows.map((row, index) =>
      index === 0 ? { ...row, review_reason: "other reason" } : row,
    ), "held")).toThrow(/exact required-review held state/);
    expect(() => validateAsic26252CurrentRows(contract, rows.map((row, index) =>
      index === 0 ? { ...row, amount_quality: "reported" } : row,
    ), "held")).toThrow(/exact required-review held state/);
  });
});
