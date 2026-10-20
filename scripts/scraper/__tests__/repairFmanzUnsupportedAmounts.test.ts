import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  assertSameSnapshot,
  assertSameKeyedPublicProjectionSnapshot,
  completeFmanzRepairTransaction,
  expectedRepairReason,
  FmanzRehearsalRollback,
  filterFmanzNonTargetOverrides,
  normalizeDbTimestampToReviewedPrecision,
  requireFmanzRepairDbPins,
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

  it("pins baseline counts to FMANZ while still preserving other regulators globally", () => {
    const allNonTargetOverrides = [
      { regulator: "FMANZ", evidence_url: "https://www.fma.govt.nz/other" },
      { regulator: "FCA", evidence_url: "https://www.fca.org.uk/other" },
    ];
    expect(filterFmanzNonTargetOverrides(allNonTargetOverrides)).toEqual([allNonTargetOverrides[0]]);
    expect(() => assertSameSnapshot(
      "global non-target overrides",
      allNonTargetOverrides,
      allNonTargetOverrides.slice(0, 1),
    )).toThrow(/must roll back/);
  });

  it("requires both non-empty trimmed database target pins before opening a connection", () => {
    expect(() => requireFmanzRepairDbPins({ REGACTIONS_EXPECTED_DB_HOST: "db.example" } as NodeJS.ProcessEnv)).toThrow(/both non-empty/);
    expect(() => requireFmanzRepairDbPins({ REGACTIONS_EXPECTED_DB_HOST: "host", REGACTIONS_EXPECTED_DB_NAME: "  " } as NodeJS.ProcessEnv)).toThrow(/both non-empty/);
    expect(() => requireFmanzRepairDbPins({ REGACTIONS_EXPECTED_DB_HOST: " host ", REGACTIONS_EXPECTED_DB_NAME: " db " } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("normalizes SQL microsecond timestamps to the reviewed millisecond precision", () => {
    expect(normalizeDbTimestampToReviewedPrecision("2026-10-10T23:05:33.485000Z"))
      .toBe("2026-10-10T23:05:33.485Z");
    expect(normalizeDbTimestampToReviewedPrecision("2026-07-15T07:40:18.132231Z"))
      .toBe("2026-07-15T07:40:18.132Z");
    expect(() => normalizeDbTimestampToReviewedPrecision("not-a-timestamp")).toThrow(/Unexpected database timestamp format/);
  });

  it("compares public snapshots by stable composite identity, not database row order", () => {
    const before = [
      { regulator: "FCA", source_row_id: "row-b", public_case_id: "public-1", amount: "20" },
      { regulator: "FCA", source_row_id: "row-a", public_case_id: "public-1", amount: "10" },
    ];
    expect(() => assertSameKeyedPublicProjectionSnapshot("public projection", before, [...before].reverse())).not.toThrow();
    expect(() => assertSameKeyedPublicProjectionSnapshot("public projection", before, [
      { ...before[0]!, amount: "21" }, before[1]!,
    ])).toThrow(/changedFields/);
  });

  it("retains and checks another regulator row that collides with an FMANZ target public ID", () => {
    const before = [
      { regulator: "FMANZ", source_row_id: "fma-row", public_case_id: "shared-id", amount: "old-target" },
      { regulator: "OTHER", source_row_id: "other-row", public_case_id: "shared-id", amount: "10" },
    ];
    const after = [before[0]!, { ...before[1]!, amount: "11" }];
    expect(() => assertSameKeyedPublicProjectionSnapshot("global projection", before, after)).toThrow(/changedFields/);

    const operator = fs.readFileSync("scripts/corrections/repairFmanzUnsupportedAmounts.ts", "utf8");
    expect(operator.match(/WHERE NOT \(upper\(regulator\) = 'FMANZ' AND public_case_id = ANY\(\$1::text\[\]\)\)/g)).toHaveLength(2);
    expect(operator).not.toContain("WHERE public_case_id <> ALL($1::text[])");
    expect(operator).toContain("summary.postchecks = {");
    expect(operator).toContain("nonTargetPublicProjection: {");
    expect(operator).toContain("keyedNonTargetProjection: {");
    expect(operator).toContain('status: "passed"');
  });

  it("bounds keyed projection failure detail to three mismatches", () => {
    const before = Array.from({ length: 5 }, (_, i) => ({
      regulator: "FCA", source_row_id: `row-${i}`, public_case_id: "same-public-id", amount: String(i),
    }));
    const after = before.map((row) => ({ ...row, amount: "changed" }));
    let message = "";
    try {
      assertSameKeyedPublicProjectionSnapshot("public projection", before, after);
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }
    expect(message).toContain("2 additional row differences omitted");
    expect((message.match(/"kind":"changed"/g) ?? [])).toHaveLength(3);
  });

  it("forces rehearsal completion to throw and prevents the transaction callback from returning", () => {
    const summary = { changedRows: 3, postchecks: "passed" };
    expect(() => completeFmanzRepairTransaction("rehearse", summary)).toThrow(FmanzRehearsalRollback);
    try {
      completeFmanzRepairTransaction("rehearse", summary);
    } catch (error) {
      expect(error).toBeInstanceOf(FmanzRehearsalRollback);
      expect((error as FmanzRehearsalRollback).summary).toEqual(summary);
    }
    expect(completeFmanzRepairTransaction("apply", summary)).toEqual(summary);
    expect(completeFmanzRepairTransaction("dry-run", summary)).toEqual(summary);
  });
});
