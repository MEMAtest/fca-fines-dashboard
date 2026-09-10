import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/country-risk-source-assurance.yml", "utf8");

describe("FATF source-assurance workflow", () => {
  it("keeps drift and source unavailability as distinct verifier outcomes", () => {
    expect(workflow).toContain("1) outcome=drift");
    expect(workflow).toContain("2) outcome=unavailable");
    expect(workflow).toContain("3) outcome=error");
    expect(workflow).toContain("if: steps.fatf_lists.outputs.outcome == 'unavailable'");
    expect(workflow).not.toContain("if: steps.fatf_lists.outcome == 'failure'");
  });

  it("persists every unsuccessful attempt and blocks drift promotion", () => {
    expect(workflow).toContain("npm run country-risk:persist-fatf-attempt");
    expect(workflow).toContain("always() && steps.fatf_lists.outputs.outcome != 'verified'");
    expect(workflow).toContain("steps.fatf_lists.outputs.outcome == 'drift'");
    expect(workflow).toContain("Block promotion when FATF drift or an unexpected verifier error is detected");
  });
});
