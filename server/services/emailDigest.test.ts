import { describe, expect, it } from "vitest";
import { buildConsolidatedDigest, cadenceIsDue, londonDate, londonHour } from "./emailDigest.js";

describe("central email digest", () => {
  it("uses Europe/London across GMT and BST", () => {
    expect(londonHour(new Date("2026-01-12T07:00:00Z"))).toBe(7);
    expect(londonHour(new Date("2026-08-12T06:00:00Z"))).toBe(7);
    expect(londonDate(new Date("2026-08-12T23:30:00Z"))).toBe("2026-08-13");
  });

  it("preserves weekly and monthly eligibility", () => {
    expect(cadenceIsDue("weekly", new Date("2026-08-10T06:00:00Z"))).toBe(true);
    expect(cadenceIsDue("weekly", new Date("2026-08-11T06:00:00Z"))).toBe(false);
    expect(cadenceIsDue("monthly", new Date("2026-08-01T06:00:00Z"))).toBe(true);
  });

  it("builds an internal all-clear when no items exist", () => {
    expect(buildConsolidatedDigest([]).subject).toContain("all-clear");
  });
});
