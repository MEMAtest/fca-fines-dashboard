import { describe, expect, it } from "vitest";
import { extractAmfAmount } from "../scrapeAmf.js";

describe("AMF amount extraction", () => {
  it("does not add assets under management to the financial penalty", () => {
    expect(
      extractAmfAmount([
        "The Enforcement Committee imposed a financial penalty of €600,000 on X. The company managed nearly €1.5 billion of assets under management.",
      ]),
    ).toBe(600_000);
  });

  it("sums multiple fines only when they share the operative sanction clause", () => {
    expect(
      extractAmfAmount([
        "The Committee imposed fines of €400,000 and €100,000 respectively on the company and its director.",
      ]),
    ).toBe(500_000);
  });
});
