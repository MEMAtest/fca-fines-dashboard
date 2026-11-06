import { describe, expect, it } from "vitest";
import { isOfficialRegulatorySource, registryOfficialHosts } from "./editorialWorkflow.js";
import { REGULATOR_COVERAGE } from "../../src/data/regulatorCoverage.js";

describe("official source allowlist derives from the regulator registry", () => {
  it("accepts every covered regulator's (unconstrained) official source host", () => {
    const missing: string[] = [];
    for (const [code, coverage] of Object.entries(REGULATOR_COVERAGE)) {
      for (const source of coverage.officialSources ?? []) {
        if (source.pathPrefix) continue;
        if (!isOfficialRegulatorySource(source.url)) missing.push(`${code} ${source.url}`);
      }
    }
    expect(missing).toEqual([]);
    expect(registryOfficialHosts().length).toBeGreaterThan(40);
  });
  it("accepts hosts the old hand list missed and still rejects look-alikes", () => {
    for (const url of [
      "https://ofac.treasury.gov/recent-actions/20260518",
      "https://www.fi.se/en/published/sanctions/",
      "https://www.frc.org.uk/news-and-events/news/2026/x",
      "https://www.fss.or.kr/eng/main.do",
    ]) expect(isOfficialRegulatorySource(url), url).toBe(true);
    expect(isOfficialRegulatorySource("https://bingx.com/news/x")).toBe(false);
    expect(isOfficialRegulatorySource("https://fca.org.uk.evil.example/x")).toBe(false);
  });
});
