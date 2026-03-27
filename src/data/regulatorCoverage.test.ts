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
    expect(isValidRegulatorCode("ESMA")).toBe(false);
  });

  it("derives European live regulators from shared metadata", () => {
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("BaFin");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("CBI");
    expect(PUBLIC_EU_REGULATOR_CODES).toContain("ECB");
    expect(PUBLIC_EU_REGULATOR_CODES).not.toContain("SFC");
  });

  it("keeps the intended live roster isolated from internal and pipeline regulators", () => {
    expect(LIVE_REGULATOR_NAV_ITEMS).toHaveLength(17);
    expect(INTERNAL_REGULATOR_NAV_ITEMS.map((coverage) => coverage.code)).toEqual(
      ["ESMA"],
    );
    expect(getRegulatorCoverage("ESMA")?.stage).toBe("internal");
    expect(getRegulatorCoverage("CVM")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("FDIC")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("FRB")?.stage).toBe("pipeline");
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

  it("adds the next prestige regulators to the validated pipeline backlog", () => {
    expect(
      PIPELINE_REGULATOR_NAV_ITEMS.map((coverage) => coverage.code),
    ).toEqual(
      expect.arrayContaining([
        "HKMA",
        "ASIC",
        "MAS",
        "OCC",
        "FINMA",
        "SESC",
        "FSCA",
        "FMANZ",
        "CSRC",
        "FDIC",
        "FRB",
        "CMASA",
      ]),
    );
    expect(getRegulatorCoverage("hkma")?.stage).toBe("pipeline");
    expect(getRegulatorCoverage("occ")?.dashboardEnabled).toBe(false);
    expect(getRegulatorCoverage("fsca")?.region).toBe("Africa");
  });

  it("keeps the newest global pipeline regulators out of live navigation", () => {
    expect(
      PIPELINE_REGULATOR_NAV_ITEMS.map((coverage) => coverage.code),
    ).toEqual(expect.arrayContaining(["TWFSC", "CVM", "CNBV", "CMF"]));
    expect(
      PIPELINE_REGULATOR_NAV_ITEMS.every(
        (coverage) => coverage.stage === "pipeline",
      ),
    ).toBe(true);

    ["TWFSC", "CVM", "CNBV", "CMF"].forEach((code) => {
      expect(PUBLIC_REGULATOR_CODES).not.toContain(code);
      expect(getRegulatorCoverage(code)?.stage).toBe("pipeline");
    });

    expect(getRegulatorCoverage("twfsc")?.country).toBe("Taiwan");
    expect(getRegulatorCoverage("cvm")?.country).toBe("Brazil");
    expect(getRegulatorCoverage("cnbv")?.country).toBe("Mexico");
    expect(getRegulatorCoverage("cmf")?.country).toBe("Chile");
  });
});
