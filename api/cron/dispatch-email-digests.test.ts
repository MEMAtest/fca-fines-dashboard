import { describe, expect, it } from "vitest";
import { isDigestDispatchWindow } from "./dispatch-email-digests.js";

describe("email digest dispatch window", () => {
  it("opens at 07:00 London in winter and summer", () => {
    expect(isDigestDispatchWindow(new Date("2026-01-12T07:15:00Z"))).toBe(true);
    expect(isDigestDispatchWindow(new Date("2026-08-12T06:45:00Z"))).toBe(true);
    expect(isDigestDispatchWindow(new Date("2026-08-12T07:00:00Z"))).toBe(false);
  });
});
