import { describe, expect, it } from "vitest";
import { FATF_CHANGE_LOG } from "../../../../src/data/fatfStatus.js";
import { buildFatfChangeLogRows } from "../seedFatfChangeLog.js";

describe("buildFatfChangeLogRows", () => {
  it("produces one dated, sourced row per FATF_CHANGE_LOG entry", () => {
    const rows = buildFatfChangeLogRows();
    expect(rows).toHaveLength(FATF_CHANGE_LOG.length);
    for (const row of rows) {
      expect(row.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.sourceUrl).toMatch(/^https:\/\/www\.fatf-gafi\.org\//);
      expect(row.summary).toContain("FATF:");
    }
  });

  it("includes the known June 2026 plenary addition of Iraq to the grey list", () => {
    const rows = buildFatfChangeLogRows();
    const iraq = rows.find((r: (typeof rows)[number]) => r.iso2 === "IQ" && r.eventDate === "2026-06-19");
    expect(iraq).toBeDefined();
    expect(iraq?.summary).toContain("Added to the grey list");
    expect(iraq?.sourceUrl).toContain("outcomes-fatf-plenary-june-2026");
  });

  it("earliest event is the October 2025 plenary", () => {
    const rows = buildFatfChangeLogRows();
    const dates = rows.map((r: (typeof rows)[number]) => r.eventDate).sort();
    expect(dates[0]).toBe("2025-10-24");
  });
});
