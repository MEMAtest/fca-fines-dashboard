import { describe, expect, it } from "vitest";
import { getRegionalCoverageSummary } from "./regionalCoverage.js";

describe("honest regional coverage", () => {
  it("keeps Europe at 23 of 26 tracked live with named gaps", () => {
    expect(getRegionalCoverageSummary("Europe")).toMatchObject({ live: 23, pipeline: 2, internal: 1, researched: 26 });
    expect(getRegionalCoverageSummary("Europe").gaps).toEqual(["CONSOB", "Banco de Portugal", "ESMA (internal)"]);
  });

  it("publishes Mexico, Brazil (CVM, BCB), Argentina and both Chilean regulators as live, naming known gaps", () => {
    expect(getRegionalCoverageSummary("Latin America")).toMatchObject({ live: 6, pipeline: 0, internal: 0, researched: 6 });
    expect(getRegionalCoverageSummary("Latin America").gaps).toEqual(["Colombia", "Peru"]);
  });
});

describe("sources that are not machine-accessible", () => {
  it("names each blocked regulator as not tracked and never as covered", async () => {
    const { NOT_MACHINE_ACCESSIBLE_SOURCES } = await import("./regionalCoverage.js");
    const names = NOT_MACHINE_ACCESSIBLE_SOURCES.map((item) => item.regulator);
    expect(names).toEqual(expect.arrayContaining(["FSC Mauritius", "CMA Saudi Arabia", "SEC Philippines", "SEC Thailand"]));
    for (const item of NOT_MACHINE_ACCESSIBLE_SOURCES) {
      expect(item.reason).toMatch(/not tracked|not available|not published/i);
    }
  });
});
