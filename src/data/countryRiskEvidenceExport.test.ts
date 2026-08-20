import { describe, expect, it } from "vitest";
import {
  buildCountryRiskEvidenceBundle,
  countryRiskEvidenceCsv,
  countryRiskEvidenceRows,
} from "./countryRiskEvidenceExport.js";

describe("country-risk public evidence exports", () => {
  it("builds lossless JSON evidence and flattened CSV rows", () => {
    const bundle = buildCountryRiskEvidenceBundle("CD", new Date("2026-08-06T12:00:00.000Z"));
    expect(bundle).not.toBeNull();
    expect(bundle!.result).toMatchObject({ score: 7.6, band: "very-high", status: "complete" });
    expect(bundle!.evidence.sanctions.coverage).toHaveLength(4);
    expect(bundle!.assurance).toMatchObject({
      scoreIsPublicBaseline: true,
      contextualSignalsScored: false,
      missingEvidenceTreatedAsZero: false,
    });
    const rows = countryRiskEvidenceRows(bundle!);
    expect(rows).toContainEqual(expect.objectContaining({ section: "fatf-action", key: "increased-monitoring" }));
    expect(rows).toContainEqual(expect.objectContaining({ section: "context", key: "transparency-cpi", scored: "false" }));
    const csv = countryRiskEvidenceCsv(bundle!);
    expect(csv).toContain('"pillar","sanctions","6.4"');
    expect(csv).toContain('"context","transparency-cpi"');
  });

  it("returns null for an unknown jurisdiction", () => {
    expect(buildCountryRiskEvidenceBundle("ZZ")).toBeNull();
  });

  it("exports v3 pillars, beneficial ownership and legal overlays", () => {
    const bundle = buildCountryRiskEvidenceBundle("VE", new Date("2026-08-20T00:00:00.000Z"), "v3");
    expect(bundle?.methodologyVersion).toBe("3.0.0");
    expect(bundle?.v3?.pillars).toHaveProperty("effectiveness");
    expect(bundle?.v3?.beneficialOwnership).toHaveProperty("formula");
    const rows = countryRiskEvidenceRows(bundle!);
    expect(rows).toContainEqual(expect.objectContaining({ section: "beneficial-ownership", key: "score" }));
    expect(rows).toContainEqual(expect.objectContaining({ section: "overlay", key: "sanctions", scored: "false" }));
  });
});
