import { describe, expect, it } from "vitest";
import { expandFirmAliasTerms, normalizeAliasTerm } from "./firmAliases.js";

describe("firm aliases", () => {
  it("normalizes diacritics for alias matching", () => {
    expect(normalizeAliasTerm("Kristo Käärmann")).toBe("kristo kaarmann");
  });

  it("expands Wise queries to known entity and individual aliases", () => {
    const aliases = expandFirmAliasTerms("wise aml");

    expect(aliases).toContain("Wise Payments Limited");
    expect(aliases).toContain("Wise Nuqud Ltd");
    expect(aliases).toContain("Kristo Käärmann");
  });

  it("expands ASCII surname searches to the accented Wise individual alias", () => {
    const aliases = expandFirmAliasTerms("kaarmann");

    expect(aliases).toContain("Kristo Kaarmann");
    expect(aliases).toContain("Kristo Käärmann");
    expect(aliases).toContain("Wise Payments Limited");
  });

  it("does not expand incidental substrings", () => {
    expect(expandFirmAliasTerms("otherwise")).toEqual(["otherwise"]);
  });
});
