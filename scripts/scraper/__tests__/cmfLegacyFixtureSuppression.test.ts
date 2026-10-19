import { describe, expect, it } from "vitest";
import {
  assertCmfLegacyFixtureApplyApproval,
  CMF_LEGACY_FIXTURE_SOURCE_URL,
  CMF_LEGACY_FIXTURE_TARGET,
  validateCmfLegacyFixtureManifest,
  verifyCmfLegacyFixtureRows,
  type CmfLegacyFixture,
  type CmfStoredFixtureRow,
} from "../../corrections/cmfLegacyFixtureSuppressionHelpers.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const manifestPath = join(dirname(fileURLToPath(import.meta.url)), "../data/cmfLegacyFixtureSuppressions.json");
const CMF_LEGACY_FIXTURE_MANIFEST = JSON.parse(readFileSync(manifestPath, "utf8")) as CmfLegacyFixture[];

const storedRows: CmfStoredFixtureRow[] = CMF_LEGACY_FIXTURE_MANIFEST.map((fixture) => ({
  id: fixture.id,
  regulator: "CMF",
  firm_individual: fixture.firmIndividual,
  date_issued: fixture.dateIssued,
  amount: fixture.amount,
  currency: "CLP",
  final_notice_url: null,
  source_url: CMF_LEGACY_FIXTURE_SOURCE_URL,
}));

describe("reviewed CMF legacy test fixture correction", () => {
  it("contains exactly the three reviewed identifiers", () => {
    expect(CMF_LEGACY_FIXTURE_MANIFEST.map((item) => item.id)).toEqual([
      "1b3d1067-c71c-4f00-9aa0-176f78d4324e",
      "1d52d808-3c07-4559-bcc0-86a5eb4936b2",
      "bcd84901-1ebf-4d30-a41e-7812e574a119",
    ]);
    expect(() => validateCmfLegacyFixtureManifest(CMF_LEGACY_FIXTURE_MANIFEST.slice(0, 2))).toThrow(/exactly the three/);
  });

  it("keeps suppression dry-default and requires both explicit approval guards", () => {
    expect(() => assertCmfLegacyFixtureApplyApproval(undefined, undefined)).toThrow(/APPROVED=true/);
    expect(() => assertCmfLegacyFixtureApplyApproval("true", "CMF")).toThrow(new RegExp(CMF_LEGACY_FIXTURE_TARGET));
    expect(() => assertCmfLegacyFixtureApplyApproval("true", CMF_LEGACY_FIXTURE_TARGET)).not.toThrow();
  });

  it("accepts only the exact CMF rows, native amounts, generic fixture URL and null final notice", () => {
    expect(() => verifyCmfLegacyFixtureRows(storedRows, CMF_LEGACY_FIXTURE_MANIFEST)).not.toThrow();
    expect(() => verifyCmfLegacyFixtureRows(storedRows.slice(0, 2), CMF_LEGACY_FIXTURE_MANIFEST)).toThrow(/expected exactly 3 stored rows/);
    for (const patch of [
      { regulator: "FCA" },
      { firm_individual: "Different firm" },
      { date_issued: "2024-06-19" },
      { amount: 1 },
      { currency: "USD" },
      { source_url: "https://www.cmfchile.cl/some-official-case" },
      { final_notice_url: "https://www.cmfchile.cl/final-notice.pdf" },
    ]) {
      const mismatch = storedRows.map((row, index) => index === 0 ? { ...row, ...patch } : row);
      expect(() => verifyCmfLegacyFixtureRows(mismatch, CMF_LEGACY_FIXTURE_MANIFEST)).toThrow(/identity mismatch/);
    }
  });
});
