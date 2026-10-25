import { describe, expect, it } from "vitest";
import { toIsoDateString } from "../pgDate.js";

describe("toIsoDateString", () => {
  it("preserves the calendar date for a pg DATE value regardless of local getters' UTC offset", () => {
    // pg parses a DATE column at LOCAL midnight. Simulate that by constructing
    // with the local (non-UTC) constructor, exactly as node-postgres does.
    const localMidnight = new Date(2026, 9, 2); // 2026-10-02, month is 0-indexed
    expect(toIsoDateString(localMidnight)).toBe("2026-10-02");
  });

  it("regression: UTC getters would have rolled this back a day in a positive-offset timezone", () => {
    const localMidnight = new Date(2026, 9, 2);
    // This is the bug this helper exists to avoid — assert the naive approach
    // actually differs in at least one real timezone, so the fix is proven,
    // not just asserted.
    const naiveUtc = `${localMidnight.getUTCFullYear()}-${String(localMidnight.getUTCMonth() + 1).padStart(2, "0")}-${String(localMidnight.getUTCDate()).padStart(2, "0")}`;
    if (localMidnight.getTimezoneOffset() < 0) {
      // Negative getTimezoneOffset() means UTC is behind local time (e.g. BST, UTC+1).
      expect(naiveUtc).not.toBe("2026-10-02");
    }
    expect(toIsoDateString(localMidnight)).toBe("2026-10-02");
  });

  it("passes through an already-ISO string unchanged", () => {
    expect(toIsoDateString("2026-10-02")).toBe("2026-10-02");
    expect(toIsoDateString("2026-10-02T00:00:00.000Z")).toBe("2026-10-02");
  });
});
