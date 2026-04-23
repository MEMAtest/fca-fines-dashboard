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

  it("does not expand incidental substrings", () => {
    expect(expandFirmAliasTerms("otherwise")).toEqual(["otherwise"]);
  });
});

