import { describe, expect, it } from "vitest";
import { isKnownMalformedAfmEntity } from "../../corrections/afmQuality.js";

describe("AFM legacy remediation predicate", () => {
  it("matches only the confirmed malformed visible entity forms", () => {
    expect(isKnownMalformedAfmEntity("AFM fines BDO for exam fraud")).toBe(true);
    expect(isKnownMalformedAfmEntity("duurzaam financieel welzijn in Nederland. &copy")).toBe(true);
    expect(isKnownMalformedAfmEntity("consumenten Digitalisering Duurzaamheid Marktmisbru")).toBe(true);
    expect(isKnownMalformedAfmEntity("BDO Accountants & Adviseurs")).toBe(false);
  });
});
