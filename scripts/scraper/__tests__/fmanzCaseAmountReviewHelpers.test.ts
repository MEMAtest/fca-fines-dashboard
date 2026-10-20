import { describe, expect, it } from "vitest";
import contractJson from "../data/fmanzCaseAmountReviews20261021.json" with { type: "json" };
import {
  completeFmanzRepairTransaction,
  FmanzRehearsalRollback,
} from "../../corrections/fmanzUnsupportedAmountHelpers.js";
import {
  assertFmanzReviewProjectionPreserved,
  fmanzCaseAmountReviewReason,
  validateFmanzCaseAmountReviewContract,
  verifyFmanzCaseReviewPublicRows,
  verifyFmanzCaseReviewRows,
  verifyFmanzCaseReviewSourceRows,
  type FmanzCaseAmountReviewContract,
} from "../../corrections/fmanzCaseAmountReviewHelpers.js";

const contract = contractJson as FmanzCaseAmountReviewContract;

describe("FMANZ source-event amount review contract", () => {
  it("rehearsal cannot return through a commit path", () => {
    expect(() => completeFmanzRepairTransaction("rehearse", { postchecks: { passed: true } }))
      .toThrow(FmanzRehearsalRollback);
    expect(() => completeFmanzRepairTransaction("apply", { postchecks: { passed: true } }))
      .not.toThrow();
  });

  it("pins ten raw cases while allowing the separately evidenced CBL raw/candidate discrepancy", () => {
    expect(validateFmanzCaseAmountReviewContract(contract)).toBe(true);
    expect(contract.heldRows).toHaveLength(10);
    expect(contract.heldRows.filter((row) => row.rawAmount !== row.candidateAmount).map((row) => row.rawId))
      .toEqual(["62cbe544-5f28-42f2-a148-0afd6610fe83"]);
    expect(contract.expectedExistingPublicIds).toHaveLength(8);
    expect(contract.expectedNotYetPublicIds).toHaveLength(2);
  });

  it("rejects row-set drift and an unreviewed amount discrepancy", () => {
    expect(() => validateFmanzCaseAmountReviewContract({ ...contract, heldRows: contract.heldRows.slice(1) }))
      .toThrow(/ten-row v2 evidence set/);
    const changed = structuredClone(contract);
    changed.heldRows[0]!.candidateAmount = "1.00";
    expect(() => validateFmanzCaseAmountReviewContract(changed)).toThrow(/amount discrepancies/);
  });

  it("verifies target raw rows by hash, firm, date, amount, currency, and both URLs", () => {
    const target = contract.heldRows[0]!;
    const stored = {
      id: target.rawId,
      content_hash: target.contentHash,
      regulator: "FMANZ",
      firm_individual: target.firm,
      date_issued: target.date,
      source_url: target.sourceUrl,
      final_notice_url: target.noticeUrl,
      amount: target.rawAmount,
      currency: target.currency,
    };
    expect(() => verifyFmanzCaseReviewSourceRows([stored], { ...contract, heldRows: [target] } as FmanzCaseAmountReviewContract)).not.toThrow();
    expect(() => verifyFmanzCaseReviewSourceRows([{ ...stored, content_hash: "0".repeat(64) }], { ...contract, heldRows: [target] } as FmanzCaseAmountReviewContract))
      .toThrow(/exact reviewed raw identity/);
    expect(() => verifyFmanzCaseReviewSourceRows([{ ...stored, amount: "1400000.00" }], { ...contract, heldRows: [target] } as FmanzCaseAmountReviewContract))
      .toThrow(/exact reviewed raw identity/);
  });

  it("accepts only an empty or exact ten-row required review state", () => {
    expect(verifyFmanzCaseReviewRows([], contract)).toBe("empty");
    const rows = contract.heldRows.map((row) => ({
      source_row_id: row.rawId,
      review_status: "required",
      reason: fmanzCaseAmountReviewReason(row),
      evidence_url: row.evidenceUrl,
    }));
    expect(verifyFmanzCaseReviewRows(rows, contract)).toBe("already-exact");
    expect(() => verifyFmanzCaseReviewRows(rows.slice(1), contract)).toThrow(/partial/);
    expect(() => verifyFmanzCaseReviewRows([{ ...rows[0]!, review_status: "approved" }, ...rows.slice(1)], contract))
      .toThrow(/exact proposed required review/);
  });

  it("pins the eight currently visible baseline rows separately from the two not-yet-public rows", () => {
    const rows = contract.expectedExistingPublicRows.map((target) => ({
      id: target.id,
      public_case_id: target.publicCaseId,
      canonical_case_id: target.canonicalCaseId,
      firm_individual: target.firm,
      date_issued: target.date,
      amount_original: target.amount,
      amount_gbp: target.amountGbp,
      currency: target.currency,
      notice_url: target.noticeUrl,
      source_url: target.sourceUrl,
      amount_quality: "derived_explicit",
      requires_amount_review: null,
    }));
    expect(() => verifyFmanzCaseReviewPublicRows(rows, contract)).not.toThrow();
    expect(() => verifyFmanzCaseReviewPublicRows(rows.slice(1), contract)).toThrow(/eight visible/);
    expect(() => verifyFmanzCaseReviewPublicRows(rows.map((row, index) => index ? row : { ...row, amount_original: "1400000.00" }), contract))
      .toThrow(/baseline identity or amount fields/);
    const reviewed = rows.map((row) => {
      const target = contract.heldRows.find((held) => held.publicCaseId === row.public_case_id)!;
      return {
        ...row,
        amount_quality: "aggregate_unallocated",
        requires_amount_review: true,
        amount_review_reason: fmanzCaseAmountReviewReason(target),
        trusted_amount_gbp: null,
        trusted_amount_eur: null,
      };
    });
    expect(() => verifyFmanzCaseReviewPublicRows(reviewed, contract, true)).not.toThrow();
    expect(() => verifyFmanzCaseReviewPublicRows(reviewed.map((row, index) => index ? row : { ...row, amount_original: null }), contract, true))
      .toThrow(/baseline identity or amount fields/);
  });

  it("allows only trusted-amount review fields to change and never masks a colliding other-regulator ID", () => {
    const before = contract.expectedExistingPublicRows.map((target) => ({
      regulator: "FMANZ",
      source_row_id: target.id,
      public_case_id: target.publicCaseId,
      row: {
        id: target.id,
        regulator: "FMANZ",
        public_case_id: target.publicCaseId,
        firm_individual: target.firm,
        amount_original: Number(target.amount),
        amount_gbp: Number(target.amountGbp),
        amount_quality: "derived_explicit",
        requires_amount_review: null,
        amount_review_reason: null,
        trusted_amount_gbp: Number(target.amountGbp),
        trusted_amount_eur: 123,
      },
    }));
    const collision = {
      regulator: "ANOTHER_REGULATOR",
      source_row_id: "other-source-row",
      public_case_id: contract.expectedExistingPublicIds[0]!,
      row: { fullRowSha256: "a".repeat(64) },
    };
    const withCollision = [...before, collision];
    const after = withCollision.map((entry) => {
      const target = entry.regulator === "FMANZ"
        ? contract.heldRows.find((held) => held.publicCaseId === entry.public_case_id)
        : null;
      return target ? {
        ...entry,
        row: {
          ...entry.row,
          amount_quality: "aggregate_unallocated",
          requires_amount_review: true,
          amount_review_reason: fmanzCaseAmountReviewReason(target),
          trusted_amount_gbp: null,
          trusted_amount_eur: null,
        },
      } : entry;
    });
    expect(() => assertFmanzReviewProjectionPreserved(withCollision, after, contract)).not.toThrow();
    const changedCollision = after.map((entry) => entry === after[after.length - 1]
      ? { ...entry, row: { fullRowSha256: "b".repeat(64) } }
      : entry);
    expect(() => assertFmanzReviewProjectionPreserved(withCollision, changedCollision, contract))
      .toThrow(/Non-target public projection changed/);
    const changedTarget = after.map((entry) => entry.regulator === "FMANZ" && entry.public_case_id === contract.expectedExistingPublicIds[0]
      ? { ...entry, row: { ...entry.row, amount_original: 999 } }
      : entry);
    expect(() => assertFmanzReviewProjectionPreserved(withCollision, changedTarget, contract))
      .toThrow(/outside the exact trusted-amount review fields/);
  });
});
