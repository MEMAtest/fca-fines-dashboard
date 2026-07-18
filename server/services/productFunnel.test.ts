import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "../db.js";
import { buildProductFunnelEvent, parseProductFunnelEvent } from "../../src/utils/productAnalyticsContract.js";
import { recordProductFunnelEvent } from "./productFunnel.js";

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
