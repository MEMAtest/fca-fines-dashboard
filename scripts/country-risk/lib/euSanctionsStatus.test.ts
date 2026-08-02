import { describe, expect, it } from "vitest";
import { assessEuRegimeStatus } from "./euSanctionsStatus.js";

describe("EU sanctions regime status reconciliation", () => {
  it("keeps a currently catalogued regime active when its expiry field lags a renewal", () => {
    expect(assessEuRegimeStatus(
      new Date("2026-07-30T22:00:00Z"),
      new Date("2026-08-02T00:00:00Z"),
    )).toEqual({ legalStatus: "active", expirationReviewRequired: true });
  });

  it("does not create a watch before the recorded expiry", () => {
    expect(assessEuRegimeStatus(
      new Date("2027-07-31T00:00:00Z"),
      new Date("2026-08-02T00:00:00Z"),
    )).toEqual({ legalStatus: "active", expirationReviewRequired: false });
  });

  it("can terminate an expired regime after it leaves the current inventory", () => {
    expect(assessEuRegimeStatus(
      new Date("2026-07-30T22:00:00Z"),
      new Date("2026-08-02T00:00:00Z"),
      false,
    )).toEqual({ legalStatus: "terminated", expirationReviewRequired: false });
  });
});
