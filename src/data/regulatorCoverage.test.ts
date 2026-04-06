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
  hasPublicRegulatorHub,
  isValidRegulatorCode,
} from "./regulatorCoverage.js";

describe("regulatorCoverage", () => {
  it("includes published regulators in live public navigation", () => {
    expect(PUBLIC_REGULATOR_CODES).toContain("FCA");
    expect(PUBLIC_REGULATOR_CODES).toContain("DFSA");
    expect(PUBLIC_REGULATOR_CODES).toContain("SEC");
    expect(PUBLIC_REGULATOR_CODES).toContain("BDI");
    expect(PUBLIC_REGULATOR_CODES).toContain("ACPR");
    expect(PUBLIC_REGULATOR_CODES).toContain("CSSF");
    expect(PUBLIC_REGULATOR_CODES).toContain("FSMA");
    expect(PUBLIC_REGULATOR_CODES).toContain("FISE");
    expect(PUBLIC_REGULATOR_CODES).toContain("FTDK");
    expect(PUBLIC_REGULATOR_CODES).toContain("FTNO");
    expect(PUBLIC_REGULATOR_CODES).toContain("CNBCZ");
    expect(PUBLIC_REGULATOR_CODES).toContain("CYSEC");
    expect(PUBLIC_REGULATOR_CODES).toContain("FINFSA");
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

  it("treats all live regulators as valid public hubs", () => {
    expect(hasPublicRegulatorHub("FCA")).toBe(true);
    expect(hasPublicRegulatorHub("BDI")).toBe(true);
    expect(hasPublicRegulatorHub("ACPR")).toBe(true);
    expect(hasPublicRegulatorHub("CSSF")).toBe(true);
    expect(hasPublicRegulatorHub("FDIC")).toBe(false);
    expect(hasPublicRegulatorHub("ESMA")).toBe(false);
  });

  it("only treats dashboard-enabled live regulators as valid dashboard routes", () => {
    expect(isValidRegulatorCode("FCA")).toBe(true);
    expect(isValidRegulatorCode("DFSA")).toBe(true);
    expect(isValidRegulatorCode("SEC")).toBe(true);
    expect(isValidRegulatorCode("BDI")).toBe(false);
    expect(isValidRegulatorCode("FDIC")).toBe(false);
    expect(isValidRegulatorCode("ESMA")).toBe(false);
  });

  it("derives European live regulators from shared metadata", () => {
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("BaFin");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("CBI");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("ECB");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("BDI");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("ACPR");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("CSSF");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("FSMA");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("FISE");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("FTDK");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("FTNO");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("CNBCZ");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("CYSEC");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("FINFSA");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("ESMA");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("FINMA");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("CONSOB");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("SFC");
  });

  it("keeps the current live roster aligned with the shared exports", () => {
    expect(LIVE_REGULATOR_NAV_ITEMS).toHaveLength(27);
    expect(INTERNAL_REGULATOR_NAV_ITEMS).toHaveLength(1);
    expect(PIPELINE_REGULATOR_NAV_ITEMS).toHaveLength(23);
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
    expect(getRegulatorCoverage("BDI")?.stage).toBe("live");
    expect(getRegulatorCoverage("ACPR")?.stage).toBe("live");
    expect(getRegulatorCoverage("CSSF")?.stage).toBe("live");
    expect(getRegulatorCoverage("FSMA")?.stage).toBe("live");
    expect(getRegulatorCoverage("FISE")?.stage).toBe("live");
    expect(getRegulatorCoverage("FTDK")?.stage).toBe("live");
    expect(getRegulatorCoverage("CYSEC")?.stage).toBe("live");
    expect(getRegulatorCoverage("FINFSA")?.stage).toBe("live");
    expect(getRegulatorCoverage("FTNO")?.stage).toBe("live");
    expect(getRegulatorCoverage("CNBCZ")?.stage).toBe("live");
    expect(getRegulatorCoverage("FINMA")?.count).toBe(0);
    expect(getRegulatorCoverage("BDI")?.count).toBe(153);
    expect(getRegulatorCoverage("ACPR")?.count).toBe(75);
    expect(getRegulatorCoverage("CSSF")?.count).toBe(163);
    expect(getRegulatorCoverage("FSMA")?.count).toBe(182);
    expect(getRegulatorCoverage("FISE")?.count).toBe(39);
    expect(getRegulatorCoverage("FTDK")?.count).toBe(51);
    expect(getRegulatorCoverage("CYSEC")?.count).toBe(1116);
    expect(getRegulatorCoverage("FINFSA")?.count).toBe(44);
    expect(getRegulatorCoverage("FTNO")?.count).toBe(40);
    expect(getRegulatorCoverage("CNBCZ")?.count).toBe(1742);
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
