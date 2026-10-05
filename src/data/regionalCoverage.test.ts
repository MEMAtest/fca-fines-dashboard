import { describe, expect, it } from "vitest";
import { getRegionalCoverageSummary } from "./regionalCoverage.js";

describe("honest regional coverage", () => {
  it("keeps Europe at 23 of 26 tracked live with named gaps", () => {
    expect(getRegionalCoverageSummary("Europe")).toMatchObject({ live: 23, pipeline: 2, internal: 1, researched: 26 });
    expect(getRegionalCoverageSummary("Europe").gaps).toEqual(["CONSOB", "Banco de Portugal", "ESMA (internal)"]);
  });

  it("publishes Mexico alongside Brazil and Argentina while keeping Chile explicit", () => {
    expect(getRegionalCoverageSummary("Latin America")).toMatchObject({ live: 3, pipeline: 1, internal: 0, researched: 4 });
    expect(getRegionalCoverageSummary("Latin America").gaps).toEqual(["Chile"]);
  });
});
