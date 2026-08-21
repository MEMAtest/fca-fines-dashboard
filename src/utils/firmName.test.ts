import { describe, expect, it } from "vitest";
import { cleanDisplayText, displayFirmName } from "./firmName.js";

/**
 * Regression cover for the one entity that survived the site-wide sweep.
 *
 * A production scan of 15 routes x 4 widths found exactly one visible HTML
 * entity left on the site: an AFM row on /search whose summary read
 * "duurzaam financieel welzijn in Nederland. &copy fined EUR0 by AFM for
 * Pagina niet gevonden". The firm name was already cleaned by
 * `displayFirmName`; the summary was not, because it is rendered raw at ~15
 * call sites. It is now cleaned once in `transformUnifiedRecord`.
 */
describe("cleanDisplayText", () => {
  it("strips the truncated entity that reached production", () => {
    expect(cleanDisplayText("duurzaam financieel welzijn in Nederland. &copy")).toBe(
      "duurzaam financieel welzijn in Nederland.",
    );
  });

  it("decodes the entities that carry meaning", () => {
    expect(cleanDisplayText("Smith &amp; Co fined &quot;repeatedly&quot;")).toBe(
      'Smith & Co fined "repeatedly"',
    );
  });

  it("keeps prose punctuation that displayFirmName removes", () => {
    // The only intended difference between the two functions.
    expect(cleanDisplayText("The firm was fined.")).toBe("The firm was fined.");
    expect(displayFirmName("Acme Ltd.")).toBe("Acme Ltd");
  });

  it("is null-safe and idempotent", () => {
    expect(cleanDisplayText(null)).toBe("");
    expect(cleanDisplayText(undefined)).toBe("");
    const once = cleanDisplayText("A &amp;nbsp; B");
    expect(cleanDisplayText(once)).toBe(once);
  });
});
