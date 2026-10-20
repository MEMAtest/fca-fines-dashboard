import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  assertSameSnapshot,
  expectedRepairReason,
  validateFmanzAmountRepairManifest,
  verifyFmanzRepairOverrides,
  verifyFmanzRepairPublicRows,
  verifyFmanzRepairSourceRows,
  type FmanzAmountRepairManifest,
  type FmanzRepairOverrideRow,
  type FmanzRepairPublicRow,
  type FmanzRepairSourceRow,
} from "../../corrections/fmanzUnsupportedAmountHelpers.js";

const manifest = JSON.parse(fs.readFileSync(
  "scripts/scraper/data/fmanzUnsupportedAmountCorrections.json",
  "utf8",
)) as FmanzAmountRepairManifest;

function targetOverride(index: number, repaired = false): FmanzRepairOverrideRow {
  const item = manifest.corrections[index]!;
  const old = item.expectedOverride;
  return {
    regulator: "FMANZ",
    evidence_url: item.evidenceUrl,
    amount_original: repaired ? null : old.amountOriginal,
    currency: old.currency,
    amount_gbp: repaired ? null : old.amountGbp,
    amount_eur: repaired ? null : old.amountEur,
    verification_url: old.verificationUrl,
    reason: repaired ? expectedRepairReason(item, manifest.sourcePreview.sha256) : old.reason,
    quality_status: repaired ? "not_disclosed" : old.qualityStatus,
    verified_at: repaired ? "2026-10-20T23:00:00.000Z" : old.verifiedAt,
    created_at: old.createdAt,
    updated_at: repaired ? "2026-10-20T23:00:00.000Z" : old.updatedAt,
  };
}

function sourceRows(): FmanzRepairSourceRow[] {
  return manifest.corrections.flatMap((item) => item.sourceRows.map((source) => ({
    id: source.id,
    content_hash: source.contentHash,
    regulator: "FMANZ",
    firm_individual: item.firm,
    date_issued: item.preview.dateIssued,
    source_url: item.officialSourceUrl,
    final_notice_url: item.officialSourceUrl,
    currency: "NZD",
    amount: null,
    amount_gbp: null,
    entry_title: item.firm,
    entry_date: item.preview.dateIssued,
    entry_detail_url: item.officialSourceUrl,
    detail_title: item.firm,
    detail_date: item.preview.dateIssued,
  })));
}

function publicRows(repaired = false): FmanzRepairPublicRow[] {
  return manifest.corrections.map((item) => ({
    public_case_id: item.publicCaseId,
    canonical_case_id: item.canonicalCaseId,
    firm_individual: item.firm,
    date_issued: item.preview.dateIssued,
    notice_url: item.officialSourceUrl,
    source_url: item.officialSourceUrl,
    amount_original: repaired ? null : item.expectedOverride.amountOriginal,
    amount_gbp: repaired ? null : item.expectedOverride.amountGbp,
    amount_eur: repaired ? null : item.expectedOverride.amountEur,
    currency: "NZD",
    amount_quality: repaired ? "not_disclosed" : "derived_explicit",
  }));
}

describe("FMANZ unsupported derived amount repair", () => {
  it("pins exactly the three current official preview rows and their prior override values", () => {
    expect(() => validateFmanzAmountRepairManifest(manifest)).not.toThrow();
    expect(manifest.corrections.map((item) => item.firm)).toEqual([
      "Aurora Financial Group Limited", "The Property Crowd", "Prem Gounder",
    ]);
    expect(manifest.corrections.every((item) => item.preview.amount === null)).toBe(true);
  });

  it("rejects a changed evidence digest, a non-null source amount, or an unexpected source row", () => {
    expect(() => validateFmanzAmountRepairManifest({
      ...manifest,
      sourcePreview: { ...manifest.sourcePreview, sha256: "tampered" },
    })).toThrow(/pinned source and baseline evidence/);

    const rows = sourceRows();
    rows[0]!.amount = "3500000.00";
    expect(() => verifyFmanzRepairSourceRows(rows, manifest)).toThrow(/no longer matches/);
    expect(() => verifyFmanzRepairSourceRows(rows.slice(1), manifest)).toThrow(/Expected 6 exact/);
  });

  it("requires source row identity, date, and URL to agree with the reviewed entity", () => {
    const rows = sourceRows();
    rows[0]!.detail_title = "Cigna Life Insurance New Zealand Limited";
    expect(() => verifyFmanzRepairSourceRows(rows, manifest)).toThrow(/identity, date, URL/);
  });

  it("accepts only the exact old override state or all-three repaired state", () => {
    expect(verifyFmanzRepairOverrides(manifest.corrections.map((_, index) => targetOverride(index)), manifest)).toBe(false);
    expect(verifyFmanzRepairOverrides(manifest.corrections.map((_, index) => targetOverride(index, true)), manifest)).toBe(true);
    expect(() => verifyFmanzRepairOverrides([
      targetOverride(0, true), targetOverride(1), targetOverride(2),
    ], manifest)).toThrow(/partially applied/);
  });

  it("guards the exact public projections while preserving their stable public IDs", () => {
    expect(verifyFmanzRepairPublicRows(publicRows(), manifest)).toBe(false);
    const repaired = publicRows(true);
    repaired.forEach((row) => { row.canonical_case_id = "changed-by-null-amount"; });
    expect(verifyFmanzRepairPublicRows(repaired, manifest)).toBe(true);
    repaired[0]!.amount_gbp = "1645000.00";
    expect(() => verifyFmanzRepairPublicRows(repaired, manifest)).toThrow(/differs from both/);
  });

  it("refuses manual verified overrides and any altered old amount or reason", () => {
    const manual = manifest.corrections.map((_, index) => targetOverride(index));
    manual[0]!.quality_status = "verified_override";
    expect(() => verifyFmanzRepairOverrides(manual, manifest)).toThrow(/Manual verified override/);

    const changed = manifest.corrections.map((_, index) => targetOverride(index));
    changed[1]!.amount_original = "1.00";
    expect(() => verifyFmanzRepairOverrides(changed, manifest)).toThrow(/differs from both/);
  });

  it("provides a generic exact-snapshot assertion for public IDs and non-target overrides", () => {
    expect(() => assertSameSnapshot("public ID set", ["a", "b"], ["a", "b"])).not.toThrow();
    expect(() => assertSameSnapshot("override snapshot", ["unchanged"], ["changed"])).toThrow(/must roll back/);
  });
});
