import { describe, expect, it } from "vitest";
import { CONTROL_DISCOVERY_REGULATOR_CODES } from "./controlDiscoveryScope.js";

describe("control discovery regulator scope", () => {
  it("normalizes live public and UK enforcement codes", () => {
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).toContain("BAFIN");
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).toContain("ICO");
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).toContain("PRA");
  });

  it("excludes internal and pipeline-only codes", () => {
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).not.toContain("FCA_FINES");
    expect(CONTROL_DISCOVERY_REGULATOR_CODES).not.toContain("APRA");
  });
});
