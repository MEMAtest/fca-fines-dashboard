import { describe, expect, it } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import {
  FATF_CHANGE_LOG,
  FATF_RECENT_CHANGES,
  FATF_NEXT_PLENARY_START,
  fatfChangesByCycle,
} from "./fatfStatus.js";

describe("FATF plenary change-log (tracker Item 8)", () => {
  it("keeps FATF_RECENT_CHANGES scoped to the single latest cycle", () => {
    const dates = new Set(FATF_RECENT_CHANGES.map((c) => c.date));
    expect(dates.size).toBe(1);
  });

  it("includes the current cycle plus prior verified cycles in the full log", () => {
    const dates = new Set(FATF_CHANGE_LOG.map((c) => c.date));
    // June 2026 (current) + Feb 2026 + Oct 2025.
    expect(dates.size).toBeGreaterThanOrEqual(3);
    expect(dates.has("2026-06-19")).toBe(true);
    expect(dates.has("2026-02-13")).toBe(true);
    expect(dates.has("2025-10-24")).toBe(true);
  });

  it("resolves every change-log ISO2 against countries.ts", () => {
    for (const change of FATF_CHANGE_LOG) {
      expect(getCountryByIso2(change.iso2), change.iso2).toBeTruthy();
    }
  });

  it("groups cycles newest-first with human labels and split add/remove", () => {
    const cycles = fatfChangesByCycle();
    expect(cycles.length).toBeGreaterThanOrEqual(3);
    // Newest-first ordering.
    for (let i = 1; i < cycles.length; i += 1) {
      expect(cycles[i - 1].date >= cycles[i].date).toBe(true);
    }
    const june = cycles.find((c) => c.date === "2026-06-19");
    expect(june?.label).toBe("June 2026 plenary");
    expect(june?.added.map((c) => c.iso2).sort()).toEqual(["BA", "IQ"]);
    expect(june?.removed.map((c) => c.iso2).sort()).toEqual(["DZ", "NA"]);
  });

  it("carries a concrete next-plenary start date for the countdown", () => {
    expect(FATF_NEXT_PLENARY_START).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // October 2026 plenary (26-30 Oct 2026).
    expect(FATF_NEXT_PLENARY_START).toBe("2026-10-26");
  });
});
