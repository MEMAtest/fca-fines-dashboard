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

  it("avoids concurrent database writers in weekly and all-lanes runs", () => {
    expect(workflow).toContain("group: country-risk-source-assurance-writers");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("queue: max");
    expect(workflow).toContain(
      "if: (github.event_name == 'schedule' && github.event.schedule == '17 5 * * *') || inputs.lane == 'daily'",
    );
    expect(workflow).toContain("needs: sanctions-weekly-fragile-evidence");
    expect(workflow).toContain(
      "if: always() && ((github.event_name == 'schedule' && github.event.schedule == '31 7 1 * *') || inputs.lane == 'monthly' || inputs.lane == 'all')",
    );
    expect(workflow).toMatch(/source-health:\n    name: Country risk source health and alerting\n    if: always\(\)/);
  });
});
