import { describe, expect, it } from "vitest";
import {
  DAILY_LIVE_REGULATOR_CODES,
  BLOG_REGULATOR_CODES,
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
    expect(PUBLIC_REGULATOR_CODES).toContain("ESMA");
    expect(PUBLIC_REGULATOR_CODES).toContain("CVM");
    expect(PUBLIC_REGULATOR_CODES).toContain("FDIC");
    expect(PUBLIC_REGULATOR_CODES).toContain("FRB");
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
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("ESMA");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("FINMA");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("SFC");
  });

  it("keeps the current live roster aligned with the shared exports", () => {
    expect(LIVE_REGULATOR_NAV_ITEMS).toHaveLength(34);
    expect(INTERNAL_REGULATOR_NAV_ITEMS).toEqual([]);
    expect(PIPELINE_REGULATOR_NAV_ITEMS).toEqual([]);
    expect(PUBLIC_REGULATOR_CODES).toHaveLength(LIVE_REGULATOR_NAV_ITEMS.length);
    expect(getRegulatorCoverage("ESMA")?.stage).toBe("live");
    expect(getRegulatorCoverage("CVM")?.stage).toBe("live");
    expect(getRegulatorCoverage("CNBV")?.stage).toBe("live");
    expect(getRegulatorCoverage("CMF")?.stage).toBe("live");
    expect(getRegulatorCoverage("FINMA")?.stage).toBe("live");
    expect(getRegulatorCoverage("SESC")?.stage).toBe("live");
    expect(getRegulatorCoverage("FDIC")?.stage).toBe("live");
    expect(getRegulatorCoverage("FRB")?.stage).toBe("live");
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
    expect(getRegulatorCoverage("SEC")?.operationalConfidence).toBe("standard");
  });

  it("keeps newly promoted global regulators public while preserving dashboard gating", () => {
    ["HKMA", "ASIC", "MAS", "OCC", "FSCA", "FMANZ", "CSRC", "FDIC", "FRB", "CMASA"].forEach(
      (code) => {
        expect(PUBLIC_REGULATOR_CODES).toContain(code);
        expect(getRegulatorCoverage(code)?.stage).toBe("live");
      },
    );
    expect(getRegulatorCoverage("hkma")?.dashboardEnabled).toBe(true);
    expect(getRegulatorCoverage("occ")?.dashboardEnabled).toBe(true);
    expect(getRegulatorCoverage("fdic")?.dashboardEnabled).toBe(false);
    expect(getRegulatorCoverage("frb")?.dashboardEnabled).toBe(false);
    expect(getRegulatorCoverage("fsca")?.region).toBe("Africa");
  });

  it("keeps the wider global set in public navigation once promoted", () => {
    ["TWFSC", "CVM", "CNBV", "CMF"].forEach((code) => {
      expect(PUBLIC_REGULATOR_CODES).toContain(code);
      expect(getRegulatorCoverage(code)?.stage).toBe("live");
    });

    expect(getRegulatorCoverage("twfsc")?.country).toBe("Taiwan");
    expect(getRegulatorCoverage("cvm")?.country).toBe("Brazil");
    expect(getRegulatorCoverage("cnbv")?.country).toBe("Mexico");
    expect(getRegulatorCoverage("cmf")?.country).toBe("Chile");
  });
});
