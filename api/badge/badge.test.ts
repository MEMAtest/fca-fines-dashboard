import { describe, expect, it } from "vitest";
import { escapeXml, parseBadgeIso2 } from "./[iso2].js";

describe("badge input hardening", () => {
  it("rejects hostile or malformed codes before any lookup", () => {
    for (const bad of ["GB/../..", "%00", "AAA", "", "1B", "G B", "İR", "gb.svg.svg", "<svg>"]) {
      expect(parseBadgeIso2(bad), bad).toBeNull();
    }
  });

  it("accepts real codes in any case, with or without .svg", () => {
    expect(parseBadgeIso2("gb")).toBe("GB");
    expect(parseBadgeIso2("IR.svg")).toBe("IR");
    expect(parseBadgeIso2("ci.SVG")).toBe("CI");
  });

  it("escapes every XML-significant character", () => {
    expect(escapeXml(`Côte d'Ivoire & <friends> "quoted"`)).toBe(
      "Côte d&apos;Ivoire &amp; &lt;friends&gt; &quot;quoted&quot;",
    );
  });
});
