import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertCignaProjectionPreserved,
  exactDecimalEqual,
  fmanzOverrideBaselineSelect,
  sha256StableJson,
  snapshotKeyedProjection,
  targetCignaOverrideSelect,
  updateCignaOverrideAndRefresh,
  validateFmanzCignaAmountManifest,
  verifyCignaOverrideState,
  verifyCignaTargetRawRow,
  verifyPinnedFmanzCignaArtifacts,
  type CignaOverrideRow,
  type FmanzCignaAmountManifest,
} from "../../corrections/fmanzCignaAmountRepairHelpers.js";
import { completeFmanzRepairTransaction, FmanzRehearsalRollback } from "../../corrections/fmanzUnsupportedAmountHelpers.js";

const manifest = JSON.parse(readFileSync(resolve("scripts/scraper/data/fmanzCignaAmountCorrection20261021.json"), "utf8")) as FmanzCignaAmountManifest;

function oldOverride(): CignaOverrideRow {
  const row = manifest.expectedOldOverride;
  return {
    regulator: row.regulator, evidence_url: row.evidenceUrl, amount_original: row.amountOriginal,
    currency: row.currency, amount_gbp: row.amountGbp, amount_eur: row.amountEur,
    verification_url: row.verificationUrl, reason: row.reason, quality_status: row.qualityStatus,
    verified_at: "2026-10-10T23:05:33.485000Z", created_at: "2026-07-15T07:40:18.132231Z",
    updated_at: "2026-10-10T23:05:33.661000Z",
  };
}

function newOverride(): CignaOverrideRow {
  const row = manifest.expectedOverride;
  return {
    regulator: row.regulator, evidence_url: manifest.expectedOldOverride.evidenceUrl, amount_original: row.amountOriginal,
    currency: row.currency, amount_gbp: row.amountGbp, amount_eur: row.amountEur,
    verification_url: row.verificationUrl, reason: row.reason, quality_status: row.qualityStatus,
    verified_at: "2026-10-21T12:34:56.123456Z", created_at: "2026-07-15T07:40:18.132231Z",
    updated_at: "2026-10-21T12:34:56.123456Z",
  };
}

function projected(amounts: { original: string; gbp: string; eur: string; quality: string; verification: string; reason: string }) {
  return {
    id: manifest.targetRow.rawId,
    regulator: "FMANZ",
    public_case_id: manifest.targetRow.publicCaseId,
    canonical_case_id: manifest.targetRow.canonicalCaseId,
    firm_individual: manifest.targetRow.firm,
    date_issued: manifest.targetRow.date,
    amount_original: amounts.original,
    amount_gbp: amounts.gbp,
    amount_eur: amounts.eur,
    trusted_amount_gbp: amounts.gbp,
    trusted_amount_eur: amounts.eur,
    currency: "NZD",
    amount_quality: amounts.quality,
    amount_verification_url: amounts.verification,
    amount_override_reason: amounts.reason,
    summary: "unchanged summary",
  };
}

describe("guarded Cigna exact amount override operator", () => {
  it("pins the reviewed source, raw identity, exact amount, and existing conversion method", () => {
    expect(validateFmanzCignaAmountManifest(manifest)).toBe(true);
    expect(Math.round(Number(manifest.expectedOverride.amountOriginal) * 47) / 100).toBe(1680250);
    expect(Math.round(Number(manifest.expectedOverride.amountOriginal) * 55) / 100).toBe(1966250);
    expect(manifest.source.releaseUrl).toBe("https://www.fma.govt.nz/news/all-releases/media-releases/cigna-to-pay-3-5-million-penalty/");
  });

  it("fails closed on unavailable or altered pinned artifacts without reading external evidence files", () => {
    expect(() => verifyPinnedFmanzCignaArtifacts(manifest, () => {
      throw new Error("fixture artifact unavailable");
    })).toThrow(/pinned Cigna .* evidence is unavailable/i);
    expect(() => verifyPinnedFmanzCignaArtifacts(manifest, () => Buffer.from("tampered fixture")))
      .toThrow(/pinned Cigna .* evidence hash changed/i);
  });

  it("accepts only the exact previous override or exact complete corrected state", () => {
    expect(verifyCignaOverrideState([oldOverride()], manifest)).toBe("old");
    expect(verifyCignaOverrideState([newOverride()], manifest)).toBe("new");
    expect(() => verifyCignaOverrideState([oldOverride(), newOverride()], manifest)).toThrow(/one unique/);

    const manual = { ...oldOverride(), amount_original: "3575000.00" };
    expect(() => verifyCignaOverrideState([manual], manifest)).toThrow(/both the exact reviewed old state/);
    const partial = { ...newOverride(), amount_eur: "1925000.00" };
    expect(() => verifyCignaOverrideState([partial], manifest)).toThrow(/both the exact reviewed old state/);
    const timestampDrift = { ...newOverride(), updated_at: "2026-10-21T12:34:57.123456Z" };
    expect(() => verifyCignaOverrideState([timestampDrift], manifest)).toThrow(/both the exact reviewed old state/);
    const submillisecondTimestampDrift = { ...newOverride(), updated_at: "2026-10-21T12:34:56.123999Z" };
    expect(() => verifyCignaOverrideState([submillisecondTimestampDrift], manifest)).toThrow(/both the exact reviewed old state/);
  });

  it("guards the raw record on ID, content hash, firm, date, source, notice, amount, and currency", () => {
    const target = manifest.targetRow;
    const row = {
      id: target.rawId, content_hash: target.contentHash, regulator: "FMANZ", firm_individual: target.firm,
      date_issued: target.date, source_url: target.sourceUrl, final_notice_url: target.noticeUrl,
      amount: target.rawAmount, currency: target.currency,
    };
    expect(() => verifyCignaTargetRawRow(row, manifest)).not.toThrow();
    expect(() => verifyCignaTargetRawRow({ ...row, content_hash: "0".repeat(64) }, manifest)).toThrow(/exact reviewed raw ID/);
    expect(() => verifyCignaTargetRawRow({ ...row, amount: "3575000.00" }, manifest)).toThrow(/exact reviewed raw ID/);
  });

  it("compares compact full-row hashes by stable composite identity and only permits the exact target amount fields to change", () => {
    const oldRow = projected({
      original: "3500000.00", gbp: "1645000.00", eur: "1925000.00", quality: "derived_explicit",
      verification: manifest.expectedOldOverride.verificationUrl, reason: manifest.expectedOldOverride.reason,
    });
    const correctedRow = projected({
      original: "3575000.00", gbp: "1680250.00", eur: "1966250.00", quality: "verified_override",
      verification: manifest.expectedOverride.verificationUrl, reason: manifest.expectedOverride.reason,
    });
    const other = { regulator: "FCA", source_row_id: "other-row", public_case_id: "other-case", row_hash: "other", row: { id: "other" } };
    const targetKey = { regulator: "FMANZ", source_row_id: manifest.targetRow.rawId, public_case_id: manifest.targetRow.publicCaseId };
    const before = snapshotKeyedProjection([
      { ...other },
      { ...targetKey, row_hash: sha256StableJson(oldRow), row: oldRow },
    ]);
    const after = snapshotKeyedProjection([
      { ...other },
      { ...targetKey, row_hash: sha256StableJson(correctedRow), row: correctedRow },
    ]);
    // Use a minimal test pin for compact fixture cardinality.
    const fixtureManifest = { ...manifest, pins: { ...manifest.pins, candidate: { ...manifest.pins.candidate, beforeGlobalPublicRows: 2 } } };
    expect(() => assertCignaProjectionPreserved(before, after, fixtureManifest)).not.toThrow();

    const alteredOther = snapshotKeyedProjection([
      { ...other, row_hash: "changed" },
      { ...targetKey, row_hash: sha256StableJson(correctedRow), row: correctedRow },
    ]);
    expect(() => assertCignaProjectionPreserved(before, alteredOther, fixtureManifest)).toThrow(/Non-target public projection row changed/);
    const alteredTarget = snapshotKeyedProjection([
      { ...other },
      { ...targetKey, row_hash: "changed", row: { ...correctedRow, summary: "unexpected edit" } },
    ]);
    expect(() => assertCignaProjectionPreserved(before, alteredTarget, fixtureManifest)).toThrow(/unexpected field/);

    const numberOld = { ...oldRow, amount_original: 3500000, amount_gbp: 1645000, amount_eur: 1925000,
      trusted_amount_gbp: 1645000, trusted_amount_eur: 1925000 };
    const numberNew = { ...correctedRow, amount_original: 3575000, amount_gbp: 1680250, amount_eur: 1966250,
      trusted_amount_gbp: 1680250, trusted_amount_eur: 1966250 };
    const numericBefore = snapshotKeyedProjection([{ ...other }, { ...targetKey, row_hash: "old-number", row: numberOld }]);
    const numericAfter = snapshotKeyedProjection([{ ...other }, { ...targetKey, row_hash: "new-number", row: numberNew }]);
    expect(() => assertCignaProjectionPreserved(numericBefore, numericAfter, fixtureManifest)).not.toThrow();
    expect(exactDecimalEqual(3500000, "3500000.00")).toBe(true);
    expect(exactDecimalEqual("3500000.001", "3500000.00")).toBe(false);
  });

  it("updates exactly one old override before refreshing trusted projections and rolls back rehearsal", async () => {
    const calls: string[] = [];
    const fakeTx = {
      unsafe: vi.fn(async (query: string, _values?: unknown[]) => {
        calls.push(query.includes("UPDATE public.regulatory_amount_overrides") ? "update" : "refresh");
        return query.includes("UPDATE public.regulatory_amount_overrides") ? [{ evidence_url: "ok" }] : [];
      }),
    };
    await updateCignaOverrideAndRefresh(fakeTx as unknown as Parameters<typeof updateCignaOverrideAndRefresh>[0], manifest);
    expect(calls).toEqual(["update", "refresh"]);
    const [updateSql, updateParams] = fakeTx.unsafe.mock.calls[0]!;
    expect(updateSql).toContain("created_at) = $18::timestamptz");
    expect(updateSql).toContain("quality_status = $16");
    expect(updateSql).toContain("verified_at = transaction_timestamp()");
    expect(updateSql).not.toMatch(/SET\s+evidence_url\s*=/i);
    expect(updateSql).toContain("WHERE regulator = $8 AND evidence_url = $9");
    expect(updateParams).toHaveLength(19);
    expect(updateParams?.[8]).toBe(manifest.expectedOldOverride.evidenceUrl);
    expect(updateParams?.[0]).toBe(manifest.expectedOverride.amountOriginal);
    expect(updateParams?.[4]).toBe(manifest.expectedOverride.verificationUrl);

    const summary = { postchecks: { passed: true } };
    expect(() => completeFmanzRepairTransaction("rehearse", summary)).toThrow(FmanzRehearsalRollback);
    try {
      completeFmanzRepairTransaction("rehearse", summary);
    } catch (error) {
      expect(error).toBeInstanceOf(FmanzRehearsalRollback);
      expect((error as FmanzRehearsalRollback).summary).toEqual(summary);
    }
  });

  it("uses a scalar old evidence-key bind for the target and scopes baseline reads to FMANZ", () => {
    const targetSelect = targetCignaOverrideSelect(manifest);
    expect(targetSelect.query).toContain("WHERE regulator = 'FMANZ' AND evidence_url = $1");
    expect(targetSelect.query).not.toContain("ANY(");
    expect(targetSelect.values).toEqual([manifest.expectedOldOverride.evidenceUrl]);
    expect(fmanzOverrideBaselineSelect).toContain("FROM public.regulatory_amount_overrides WHERE regulator = 'FMANZ'");
  });

  it("never refreshes if the guarded update misses, and propagates refresh failure for transaction rollback", async () => {
    const missedCalls: string[] = [];
    const missedTx = {
      unsafe: vi.fn(async (query: string) => {
        missedCalls.push(query.includes("UPDATE public.regulatory_amount_overrides") ? "update" : "refresh");
        return [];
      }),
    };
    await expect(updateCignaOverrideAndRefresh(missedTx as unknown as Parameters<typeof updateCignaOverrideAndRefresh>[0], manifest))
      .rejects.toThrow(/did not affect exactly one/);
    expect(missedCalls).toEqual(["update"]);

    const failedRefreshCalls: string[] = [];
    const failedRefreshTx = {
      unsafe: vi.fn(async (query: string) => {
        failedRefreshCalls.push(query.includes("UPDATE public.regulatory_amount_overrides") ? "update" : "refresh");
        if (query.includes("UPDATE public.regulatory_amount_overrides")) return [{ evidence_url: "ok" }];
        throw new Error("refresh failed");
      }),
    };
    await expect(updateCignaOverrideAndRefresh(failedRefreshTx as unknown as Parameters<typeof updateCignaOverrideAndRefresh>[0], manifest))
      .rejects.toThrow("refresh failed");
    expect(failedRefreshCalls).toEqual(["update", "refresh"]);
  });

  it("keeps the DB operator read-only by default and refreshes only after an exact update", () => {
    const script = readFileSync(resolve("scripts/corrections/repairFmanzCignaAmount.ts"), "utf8");
    expect(script).toContain('if (mode === "dry-run") await tx.unsafe("SET TRANSACTION READ ONLY")');
    expect(script).toContain("verifyPinnedFmanzCignaArtifacts(FMANZ_CIGNA_AMOUNT_REPAIR);");
    expect(script.indexOf("verifyPinnedFmanzCignaArtifacts(FMANZ_CIGNA_AMOUNT_REPAIR);")).toBeLessThan(script.indexOf("const connection = resolveConnectionString();"));
    expect(script).toContain("LOCK TABLE public.regulatory_amount_overrides IN SHARE ROW EXCLUSIVE MODE");
    expect(script).not.toContain("assertTargetPublicRow(publicTargetBefore");
    expect(script).toContain("SELECT pg_advisory_xact_lock(72140331)");
    expect(script).toContain("await updateCignaOverrideAndRefresh(tx, FMANZ_CIGNA_AMOUNT_REPAIR)");
    expect(script.indexOf("await updateCignaOverrideAndRefresh(tx, FMANZ_CIGNA_AMOUNT_REPAIR)")).toBeLessThan(script.indexOf("summary.postchecks ="));
    expect(script.indexOf("summary.postchecks =")).toBeLessThan(script.indexOf("return completeFmanzRepairTransaction(mode, summary)"));
    expect(script).not.toMatch(/DELETE\s+FROM\s+public\.(?:eu_fines|regulatory_amount_overrides)/i);
  });
});
