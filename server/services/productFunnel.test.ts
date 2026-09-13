import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../db.js";
import { buildProductFunnelEvent, parseProductFunnelEvent, PRODUCT_FUNNEL_EVENTS } from "../../src/utils/productAnalyticsContract.js";
import { buildProductFunnelReport, recordProductFunnelEvent } from "./productFunnel.js";

const eventId = "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0";

describe("privacy-safe product funnel events", () => {
  it("keeps only event-specific bounded dimensions", () => {
    const event = buildProductFunnelEvent("evidence_modal_opened", {
      regulator: "fca",
      surface: "regulator_workspace",
      source_status: "official_verified",
      email: "person@example.com",
      firmName: "Sensitive Firm",
      query: "person name",
      url: "https://example.com/private?q=value",
    }, eventId);
    expect(event).toEqual({
      eventId,
      eventName: "evidence_opened",
      eventVersion: 1,
      dimensions: {
        regulator: "FCA",
        surface: "regulator_workspace",
        source_status: "official_verified",
      },
    });
    expect(JSON.stringify(event)).not.toContain("person@example.com");
    expect(JSON.stringify(event)).not.toContain("Sensitive Firm");
  });

  it("rejects unknown events and invalid identifiers", () => {
    expect(buildProductFunnelEvent("page_loaded", {}, eventId)).toBeNull();
    expect(parseProductFunnelEvent({ eventId: "bad", eventName: "evidence_opened", eventVersion: 1 })).toBeNull();
  });

  it("allows workspace funnel dimensions without accepting free text", () => {
    const event = buildProductFunnelEvent("workspace_filter_changed", {
      surface: "fines_workspace",
      regulator: "fca",
      filter_dimension: "query",
      filter_action: "applied",
      filter_count: 2,
      query: "Private Firm",
      email: "person@example.com",
      url: "https://example.com/?q=private",
    }, eventId);
    expect(event).toEqual({
      eventId,
      eventName: "workspace_filter_changed",
      eventVersion: 1,
      dimensions: {
        surface: "fines_workspace",
        filter_dimension: "query",
        filter_action: "applied",
        filter_count: 2,
      },
    });
    expect(JSON.stringify(event)).not.toContain("Private Firm");
    expect(JSON.stringify(event)).not.toContain("person@example.com");
    expect(JSON.stringify(event)).not.toContain("example.com");
  });

  it("keeps the issue #20 event dictionary explicit", () => {
    const required = [
      "fines_workspace_opened",
      "regulator_workspace_opened",
      "workspace_filter_changed",
      "comparison_mode_entered",
      "comparison_selection_changed",
      "comparison_data_opened",
      "evidence_drawer_opened",
      "official_source_opened",
      "evidence_export_completed",
      "comparison_link_copied",
      "regulator_comparator_changed",
      "regulator_year_changed",
    ] as const;
    for (const eventName of required) {
      expect(PRODUCT_FUNNEL_EVENTS).toContain(eventName);
      expect(buildProductFunnelEvent(eventName, { query: "do not retain" }, eventId)).not.toBeNull();
    }
  });

  it("reduces seven-day events to separate workspace funnel stages", () => {
    expect(buildProductFunnelReport([
      { event_name: "fines_workspace_opened", surface: "fines_workspace", regulator_code: null, event_count: 4 },
      { event_name: "comparison_mode_entered", surface: "fines_workspace", regulator_code: null, event_count: 2 },
      { event_name: "evidence_opened", surface: "regulator_workspace", regulator_code: "FCA", event_count: 3 },
      { event_name: "official_source_opened", surface: "regulator_workspace", regulator_code: "FCA", event_count: 1 },
    ])).toEqual({
      days: 7,
      stages: [
        { surface: "fines_workspace", regulator: "ALL", visit: 4, comparison_or_drilldown: 2, evidence_open: 0, official_source_open: 0 },
        { surface: "regulator_workspace", regulator: "FCA", visit: 0, comparison_or_drilldown: 0, evidence_open: 3, official_source_open: 1 },
      ],
    });
  });

  it("persists only explicit columns and deduplicates by event id", async () => {
    const sql = vi.fn(async () => [{ id: 1 }]) as unknown as SqlClient;
    sql.end = vi.fn(async () => undefined);
    const event = buildProductFunnelEvent("board_pack_pdf_downloaded", {
      archetype: "retail_bank",
      access: "direct",
      organisation: "Private Bank",
    }, eventId)!;
    await expect(recordProductFunnelEvent(event, sql)).resolves.toEqual({ recorded: true, eventName: "board_pack_downloaded" });
    expect(sql).toHaveBeenCalledTimes(1);
    const parameters = (sql as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as unknown[];
    expect(parameters).toContain("retail_bank");
    expect(parameters).not.toContain("Private Bank");
  });
});
