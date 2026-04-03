import { describe, expect, it } from "vitest";
import {
  DAILY_LIVE_REGULATOR_CODES,
  BLOG_REGULATOR_CODES,
  EUROPE_EEA_COVERAGE_PHASES,
  FRAGILE_LIVE_REGULATOR_CODES,
  INTERNAL_REGULATOR_NAV_ITEMS,
  LIVE_REGULATOR_NAV_ITEMS,
  LOWER_CONFIDENCE_LIVE_REGULATOR_CODES,
  PIPELINE_REGULATOR_NAV_ITEMS,
  PUBLIC_EU_REGULATOR_CODES,
  PUBLIC_REGULATOR_CODES,
  getRegulatorCoverage,
  isValidRegulatorCode,
} from "./regulatorCoverage.js";

describe("regulatorCoverage", () => {
  it("includes published regulators in live public navigation", () => {
    expect(PUBLIC_REGULATOR_CODES).toContain("FCA");
    expect(PUBLIC_REGULATOR_CODES).toContain("DFSA");
    expect(PUBLIC_REGULATOR_CODES).toContain("SEC");
    expect(PUBLIC_REGULATOR_CODES).not.toContain("ESMA");
    expect(PUBLIC_REGULATOR_CODES).not.toContain("CVM");
    expect(PUBLIC_REGULATOR_CODES).not.toContain("FDIC");
    expect(PUBLIC_REGULATOR_CODES).not.toContain("FRB");
  });

  it("keeps blog generation limited to live enabled regulators", () => {
    expect(BLOG_REGULATOR_CODES).toContain("FCA");
    expect(BLOG_REGULATOR_CODES).not.toContain("DFSA");
    expect(BLOG_REGULATOR_CODES).not.toContain("ECB");
  });

  it("resolves live regulators case-insensitively for shared rendering", () => {
    const coverage = getRegulatorCoverage("dfsa");

    expect(coverage).not.toBeNull();
    expect(coverage?.code).toBe("DFSA");
    expect(coverage?.stage).toBe("live");
  });

  it("only treats live regulators as valid routed hubs", () => {
    expect(isValidRegulatorCode("FCA")).toBe(true);
    expect(isValidRegulatorCode("DFSA")).toBe(true);
    expect(isValidRegulatorCode("SEC")).toBe(true);
    expect(isValidRegulatorCode("FDIC")).toBe(false);
    expect(isValidRegulatorCode("ESMA")).toBe(false);
  });

  it("derives European live regulators from shared metadata", () => {
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("BaFin");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("CBI");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("ECB");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("ESMA");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("FINMA");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("CONSOB");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("SFC");
  });

  it("keeps the current live roster aligned with the shared exports", () => {
    expect(LIVE_REGULATOR_NAV_ITEMS).toHaveLength(17);
    expect(INTERNAL_REGULATOR_NAV_ITEMS).toHaveLength(1);
    expect(PIPELINE_REGULATOR_NAV_ITEMS).toHaveLength(33);
    expect(PUBLIC_REGULATOR_CODES).toHaveLength(LIVE_REGULATOR_NAV_ITEMS.length);
    expect(getRegulatorCoverage("ESMA")?.stage).toBe("internal");
    expect(getRegulatorCoverage("CVM")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("CNBV")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("CMF")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("FINMA")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("SESC")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("FDIC")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("FRB")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("OSC")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("CONSOB")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("BDI")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("ACPR")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("CSSF")?.stage).toBe("pipeline");
  });

  it("flags lower-confidence live regulators separately from the stable daily set", () => {
    expect(LOWER_CONFIDENCE_LIVE_REGULATOR_CODES).toEqual([
      "DFSA",
      "CBUAE",
      "JFSC",
      "CIRO",
    ]);
    expect(FRAGILE_LIVE_REGULATOR_CODES).toEqual(
      LOWER_CONFIDENCE_LIVE_REGULATOR_CODES,
    );
    expect(DAILY_LIVE_REGULATOR_CODES).toContain("FCA");
    expect(DAILY_LIVE_REGULATOR_CODES).toContain("SEC");
    expect(DAILY_LIVE_REGULATOR_CODES).toContain("SFC");
    expect(DAILY_LIVE_REGULATOR_CODES).not.toContain("DFSA");
    expect(getRegulatorCoverage("DFSA")?.operationalConfidence).toBe("lower");
    expect(getRegulatorCoverage("DFSA")?.automationLevel).toBe("curated_archive");
    expect(getRegulatorCoverage("DFSA")?.feedContract.collectionMethod).toBe(
      "Curated official-document archive ingestion",
    );
    expect(getRegulatorCoverage("JFSC")?.automationLevel).toBe("sparse_source");
    expect(getRegulatorCoverage("JFSC")?.feedContract.zeroResultPolicy).toBe(
      "sparse_source",
    );
    expect(getRegulatorCoverage("SEC")?.operationalConfidence).toBe("standard");
    expect(getRegulatorCoverage("SEC")?.automationLevel).toBe("automated");
  });

  it("keeps global targets in pipeline until their datasets are genuinely live", () => {
    ["HKMA", "ASIC", "MAS", "OCC", "FSCA", "FMANZ", "CSRC", "FDIC", "FRB", "CMASA"].forEach(
      (code) => {
        expect(PUBLIC_REGULATOR_CODES).not.toContain(code);
        expect(getRegulatorCoverage(code)?.stage).toBe("pipeline");
      },
    );
    expect(getRegulatorCoverage("hkma")?.dashboardEnabled).toBe(false);
    expect(getRegulatorCoverage("occ")?.dashboardEnabled).toBe(false);
    expect(getRegulatorCoverage("fdic")?.dashboardEnabled).toBe(false);
    expect(getRegulatorCoverage("frb")?.dashboardEnabled).toBe(false);
    expect(getRegulatorCoverage("fsca")?.region).toBe("Africa");
  });

  it("keeps the wider global set queued alongside the new Canada regulator", () => {
    ["TWFSC", "CVM", "CNBV", "CMF", "OSC"].forEach((code) => {
      expect(PUBLIC_REGULATOR_CODES).not.toContain(code);
      expect(getRegulatorCoverage(code)?.stage).toBe("pipeline");
    });

    expect(getRegulatorCoverage("twfsc")?.country).toBe("Taiwan");
    expect(getRegulatorCoverage("cvm")?.country).toBe("Brazil");
    expect(getRegulatorCoverage("cnbv")?.country).toBe("Mexico");
    expect(getRegulatorCoverage("cmf")?.country).toBe("Chile");
    expect(getRegulatorCoverage("osc")?.country).toBe("Canada");
  });

  it("groups the Europe and EEA rollout into three explicit phases", () => {
    expect(EUROPE_EEA_COVERAGE_PHASES).toHaveLength(3);
    expect(EUROPE_EEA_COVERAGE_PHASES[0]?.codes).toEqual([
      "CONSOB",
      "BDI",
      "FINMA",
      "ACPR",
      "CSSF",
      "FSMA",
      "FMAAT",
    ]);
    expect(EUROPE_EEA_COVERAGE_PHASES[1]?.codes).toContain("CMVM");
    expect(EUROPE_EEA_COVERAGE_PHASES[1]?.codes).toContain("BDP");
    expect(EUROPE_EEA_COVERAGE_PHASES[1]?.codes).toContain("FTNO");
    expect(EUROPE_EEA_COVERAGE_PHASES[2]?.codes).toEqual(["MFSA", "IVASS"]);
    expect(getRegulatorCoverage("FINMA")?.rolloutPhase).toBe(1);
    expect(getRegulatorCoverage("CONSOB")?.countryCluster).toBe("Italy");
    expect(getRegulatorCoverage("BDI")?.countryCluster).toBe("Italy");
    expect(getRegulatorCoverage("FTNO")?.regionCluster).toBe("EEA");
  });
});
