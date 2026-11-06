import { describe, expect, it } from "vitest";
import { buildCountryRiskEvidenceBundle, countryRiskEvidenceCsv, countryRiskEvidenceRows } from "./countryRiskEvidenceExport.js";
import { buildRegulatorySignalEvidence, regulatorySignalEvidenceCsv } from "./regulatorySignalExport.js";

describe("API CSV exports guard formula injection", () => {
  it("country-risk evidence CSV prefixes a hostile value", () => {
    const bundle = buildCountryRiskEvidenceBundle("GB")!;
    const rows = countryRiskEvidenceRows(bundle);
    expect(rows.length).toBeGreaterThan(0);
    (bundle as unknown as { country: { name: string } }).country.name = "=HYPERLINK(\"x\")";
    const csv = countryRiskEvidenceCsv(bundle);
    expect(csv).not.toMatch(/(^|,)"=/m);
  });
  it("regulatory-signal evidence CSV prefixes a hostile authority name", () => {
    const evidence = buildRegulatorySignalEvidence("GB")!;
    evidence.ecosystem.authorities[0].name = "@SUM(1)";
    evidence.country.name = "=1+1";
    const csv = regulatorySignalEvidenceCsv(evidence);
    expect(csv).toContain(`"'@SUM(1)"`);
    expect(csv).toContain(`"'=1+1"`);
  });
});
