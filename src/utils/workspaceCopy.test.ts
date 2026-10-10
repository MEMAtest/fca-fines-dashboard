import { describe, expect, it } from "vitest";
import { buildLeadingThemeInsight, buildScopeInsight, formatScopedAmount, formatWorkspaceActionCount, NO_ACTIONS_LOADED_COPY } from "./workspaceAnalytics.js";

describe("workspace copy", () => {
  it("never prints raw theme codes in insights", () => {
    const text = buildScopeInsight("SARB", "monetary_penalty", 4, 1_000_000);
    expect(text).toContain("monetary penalty");
    expect(text).not.toContain("monetary_penalty");
    expect(buildLeadingThemeInsight("SUPERVISORY_SANCTION", 57.4, 4)).toBe("Supervisory Sanction accounts for 57.4% of classified fine value.");
    expect(buildLeadingThemeInsight("aml_cft", 10, 4)).toContain("AML CFT");
  });

  it("is honest when a regulator has no loaded actions", () => {
    const text = buildScopeInsight("FIC", undefined, 0, 0);
    expect(text).toContain(NO_ACTIONS_LOADED_COPY);
    expect(text).not.toMatch(/£0|no dominant theme|0 actions/);
    expect(formatScopedAmount(0, 0)).toBe("—");
    expect(formatScopedAmount(25_000, 1)).toBe("£25k");
    expect(buildLeadingThemeInsight(undefined, undefined, 0)).toMatch(/No actions are loaded/);
  });

  it("pluralises action counts", () => {
    expect(formatWorkspaceActionCount(1)).toBe("1 action");
    expect(formatWorkspaceActionCount(2)).toBe("2 actions");
  });
});
