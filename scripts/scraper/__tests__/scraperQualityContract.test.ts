import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveScraperQualityContract } from "../lib/scraperQualityContract.js";
import { extractRegulatorCode } from "../lib/runScraper.js";

describe("regulator-specific scraper quality contracts", () => {
  it("uses stricter continuity for standard automated sources", () => {
    const contract = resolveScraperQualityContract("FCA");
    expect(contract).toMatchObject({
      regulatorCode: "FCA",
      sourceClass: "automated",
      cadence: "daily",
      allowZeroRecords: false,
      maximumPreparedCountDropFraction: 0.35,
    });
    expect(contract.minimumPreparedRecords).toBeGreaterThan(0);
  });

  it("routes fragile sources through a wider but still fail-closed continuity lane", () => {
    const contract = resolveScraperQualityContract("IOMFSA");
    expect(contract.cadence).toBe("fragile");
    expect(contract.maximumPreparedCountDropFraction).toBe(0.55);
    expect(contract.allowZeroRecords).toBe(false);
  });

  it("allows zero only for the explicitly sparse JFSC source", () => {
    expect(resolveScraperQualityContract("JFSC")).toMatchObject({
      sourceClass: "sparse_source",
      allowZeroRecords: true,
      minimumPreparedRecords: 0,
    });
  });

  it("keeps low-frequency complete archives fail-closed on zero records", () => {
    for (const code of ["AMMC", "IOMFSA", "HKMA"]) {
      const contract = resolveScraperQualityContract(code);
      expect(contract).toMatchObject({
        sourceClass: "low_frequency",
        allowZeroRecords: false,
      });
      expect(contract.minimumPreparedRecords).toBeGreaterThan(0);
    }
  });

  it("fails closed when a runner has no registered regulator contract", () => {
    expect(() => resolveScraperQualityContract("UNKNOWN")).toThrow("No regulator feed contract");
  });

  it("rejects contradictory or unsafe overrides", () => {
    expect(() => resolveScraperQualityContract("FCA", { maximumPreparedCountDropFraction: 1 }))
      .toThrow("below 1");
    expect(() => resolveScraperQualityContract("FCA", { allowZeroRecords: true, minimumPreparedRecords: 1 }))
      .toThrow("zero-record contract");
  });

  it("has a registered contract for every shared-runner scraper", () => {
    const directory = resolve(process.cwd(), "scripts/scraper");
    const uncovered: string[] = [];
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(resolve(directory, file), "utf8");
      let cursor = source.indexOf("runScraper({");
      while (cursor >= 0) {
        const block = source.slice(cursor, cursor + 700);
        const nameMatch = block.match(/name:\s*(["'])(.*?)\1/);
        const name = nameMatch?.[2];
        const explicitCode = block.match(/regulatorCode:\s*["']([^"']+)["']/)?.[1];
        if (!name) uncovered.push(`${file}: missing static runner name`);
        else {
          const code = explicitCode || extractRegulatorCode(name);
          try {
            resolveScraperQualityContract(code);
          } catch {
            uncovered.push(`${file}: ${code}`);
          }
        }
        cursor = source.indexOf("runScraper({", cursor + 1);
      }
    }
    expect(uncovered).toEqual([]);
  });
});
